# main.py
import signal
import sys
import time
import requests
import socketio
from typing import Any, Dict, Optional

# ---------- Config (PyYAML optionnel, fallback parser maison) ----------
def _parse_simple_kv_yaml(path: str) -> Dict[str, Any]:
    cfg: Dict[str, Any] = {}
    def _unq(s: str) -> str:
        s = s.strip()
        if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
            return s[1:-1]
        return s
    with open(path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or ":" not in line:
                continue
            k, v = line.split(":", 1)
            key = k.strip()
            val = _unq(v.strip())
            if val.lower() in ("true", "false"):
                cfg[key] = (val.lower() == "true")
            else:
                try:
                    if val.isdigit() or (val.startswith("-") and val[1:].isdigit()):
                        cfg[key] = int(val)
                    else:
                        cfg[key] = val
                except Exception:
                    cfg[key] = val
    return cfg

def load_config() -> Dict[str, Any]:
    try:
        import yaml  # facultatif
        with open("config.yaml", "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except Exception:
        return _parse_simple_kv_yaml("config.yaml")

cfg = load_config()

API_URL   = str(cfg["api_url"]).rstrip("/")         # ex: http://192.168.1.96:3000
API_BASE  = f"{API_URL}/api/v1"
WS_PATH   = str(cfg.get("ws_path", "/socket.io"))
NS        = str(cfg.get("namespace", "/agent"))
DEVICE_ID = str(cfg["device_id"])
API_KEY   = str(cfg["api_key"])
HEARTBEAT = int(cfg.get("heartbeat_sec", 20))

# ---------- Utils ----------
def _auth_headers():
    return {
        "Authorization": f"ApiKey {API_KEY}",
        "x-device-id": DEVICE_ID,
        "Content-Type": "application/json",
    }

# Modules locaux (LEDs = driver WS2812B, Music = à ta convenance)
from utils import leds, music, state as dev_state

# ---------- Socket.IO client ----------
sio = socketio.Client(
    reconnection=True,
    reconnection_attempts=0,
    logger=False,
    engineio_logger=False,
)

# ---------- State helpers ----------
def emit_state():
    """Remonte l’instantané local au hub."""
    snap = dev_state.snapshot()
    if not isinstance(snap, dict):
        print("⚠️ snapshot() invalide:", snap)
        return
    payload = {"deviceId": DEVICE_ID}
    if "leds" in snap:   payload["leds"] = snap["leds"]
    if "music" in snap:  payload["music"] = snap["music"]
    if "widgets" in snap and snap["widgets"] is not None:
        payload["widgets"] = snap["widgets"]
    print("📤 state:report →", payload)
    try:
        sio.emit("state:report", payload, namespace=NS)
    except Exception as e:
        print("⚠️ state:report erreur:", e)

def apply_snapshot(snapshot: Dict[str, Any]):
    """Applique un snapshot complet {leds?, music?, widgets?} puis reporte l’état."""
    print("⬇️  state:apply reçu →", snapshot)
    try:
        if "leds" in snapshot and isinstance(snapshot["leds"], dict):
            _apply_leds(_coerce_leds_payload(snapshot["leds"]))
        if "music" in snapshot and snapshot["music"] is not None:
            try:
                music.apply({"music": snapshot["music"]})
            except Exception as me:
                print("⚠️ music.apply:", me)
        emit_state()
    except Exception as e:
        print("⚠️ apply_snapshot:", e)

def pull_snapshot_rest() -> bool:
    """
    Tente de lire l'état DB via REST (si autorisé à l'agent).
    GET /api/v1/devices/:id/state avec ApiKey + x-device-id
    """
    url = f"{API_BASE}/devices/{DEVICE_ID}/state"
    try:
        r = requests.get(url, headers=_auth_headers(), timeout=5)
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, dict):
                apply_snapshot(data)
                print("✅ Snapshot REST appliqué.")
                return True
            else:
                print("⚠️ Réponse snapshot non-dict:", type(data))
        else:
            print(f"ℹ️ Snapshot REST non autorisé/indispo ({r.status_code}).")
    except Exception as e:
        print("ℹ️ Snapshot REST échec:", e)
    return False

# ---------- LED helpers ----------
def _coerce_leds_payload(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Normalise {on?, color?, brightness?, preset?} à partir d'un dict quelconque."""
    p = dict(raw)
    out: Dict[str, Any] = {}
    if "on" in p:          out["on"] = bool(p["on"])
    if "color" in p:       out["color"] = str(p["color"])
    if "brightness" in p:  out["brightness"] = int(p["brightness"])
    if "preset" in p and p["preset"] not in (None, ""):
        out["preset"] = str(p["preset"])
    return out

def _apply_leds(norm: Dict[str, Any]):
    # Compat apply()
    if hasattr(leds, "apply") and callable(getattr(leds, "apply")):
        try:
            leds.apply({"leds": norm})
            return
        except Exception as e:
            print("⚠️ utils.leds.apply a échoué, fallback granular:", e)
    # Granular
    if "on" in norm and hasattr(leds, "set_on"): leds.set_on(bool(norm["on"]))
    if "color" in norm and hasattr(leds, "set_color"): leds.set_color(str(norm["color"]))
    if "brightness" in norm and hasattr(leds, "set_brightness"): leds.set_brightness(int(norm["brightness"]))
    if "preset" in norm and hasattr(leds, "set_preset"): leds.set_preset(str(norm["preset"]))

def _ack_ok(evt_type: str, data: Optional[Dict[str, Any]] = None):
    sio.emit("ack", {"deviceId": DEVICE_ID, "type": evt_type, "status": "ok", "data": data or {}}, namespace=NS)

def _ack_err(evt_type: str, msg: str):
    sio.emit("nack", {"deviceId": DEVICE_ID, "type": evt_type, "reason": msg}, namespace=NS)

# ---------- Boot helpers ----------
def _apply_local_boot_state():
    """
    Prend le snapshot local (utils/state.py) et l'applique AUX DRIVERS,
    pour que le hardware reflète l'état dès le start (utile tant que la DB n'est pas ouverte à l'agent).
    """
    try:
        snap = dev_state.snapshot() or {}
        leds_cfg = snap.get("leds")
        if isinstance(leds_cfg, dict):
            _apply_leds(_coerce_leds_payload(leds_cfg))
            print("✅ Boot LEDs appliqué:", leds_cfg)
        # Décommente si tu veux appliquer aussi la musique au boot
        # music_cfg = snap.get("music")
        # if isinstance(music_cfg, dict):
        #     music.apply({"music": music_cfg})
    except Exception as e:
        print("⚠️ Boot apply error:", e)

def _pull_or_request_server_state():
    """
    Essaie de tirer le snapshot depuis l'API (si autorisée). Sinon, demande au hub de pousser 'state:apply'.
    """
    ok = pull_snapshot_rest()
    if not ok:
        try:
            sio.emit("state:pull", {"deviceId": DEVICE_ID}, namespace=NS)
        except Exception as e:
            print("ℹ️ state:pull échec:", e)

# ---------- Heartbeat ----------
def post_heartbeat():
    url = f"{API_BASE}/devices/{DEVICE_ID}/heartbeat"
    try:
        resp = requests.post(url, json={"status": "ok"}, headers=_auth_headers(), timeout=5)
        if resp.status_code >= 400:
            print(f"⚠️ HB non-200: {resp.status_code} {resp.text}")
        else:
            print("💓 Heartbeat OK")
    except Exception as e:
        print("⚠️ Heartbeat HTTP échec:", e)

# ---------- WS Handlers ----------
@sio.event(namespace=NS)
def connect():
    print(f"✅ Connecté au hub {NS}")
    try:
        sio.emit("agent:register", {"deviceId": DEVICE_ID}, namespace=NS)
    except Exception as e:
        print("⚠️ agent:register erreur:", e)

    # 1) appliquer l'état local AU HARDWARE (important pour allumer dès le boot)
    _apply_local_boot_state()

    # 2) remonter l'état effectif
    emit_state()

    # 3) Heartbeat
    post_heartbeat()

    # 4) tenter de se resynchroniser avec la DB (quand tu ouvriras la route REST)
    _pull_or_request_server_state()

@sio.event(namespace=NS)
def disconnect():
    print("❌ Déconnecté du hub")

# Échos/debug
@sio.on("agent:ack", namespace=NS)
def on_agent_ack(payload):
    if payload.get("deviceId") not in (None, DEVICE_ID): return
    print("✅ ACK serveur:", payload)

@sio.on("presence", namespace=NS)
def on_presence(payload):
    if payload.get("deviceId") not in (None, DEVICE_ID): return
    print("👀 Presence:", payload)

# ---- State push depuis le serveur
@sio.on("state:apply", namespace=NS)
def on_state_apply(payload):
    # payload: { deviceId, leds?, music?, widgets? }
    if payload.get("deviceId") not in (None, DEVICE_ID): return
    apply_snapshot({k: v for k, v in payload.items() if k in ("leds", "music", "widgets")})

# ---- LEDs
@sio.on("leds:update", namespace=NS)
def on_leds_update(payload):
    if payload.get("deviceId") not in (None, DEVICE_ID): return
    try:
        norm = _coerce_leds_payload(payload.get("leds", payload))
        _apply_leds(norm)
        _ack_ok("leds")
        emit_state()
    except Exception as e:
        print("⚠️ LEDs update:", e)
        _ack_err("leds", str(e))

@sio.on("leds:state", namespace=NS)
def on_leds_state(payload):
    if payload.get("deviceId") not in (None, DEVICE_ID): return
    try:
        norm = _coerce_leds_payload(payload)
        if "on" not in norm: raise ValueError("Missing 'on'")
        _apply_leds({"on": norm["on"]})
        _ack_ok("leds:state", {"on": norm["on"]})
        emit_state()
    except Exception as e:
        print("⚠️ LEDs state:", e)
        _ack_err("leds:state", str(e))

@sio.on("leds:style", namespace=NS)
def on_leds_style(payload):
    if payload.get("deviceId") not in (None, DEVICE_ID): return
    try:
        norm = _coerce_leds_payload(payload)
        if not any(k in norm for k in ("color", "brightness", "preset")):
            raise ValueError("Provide one of color|brightness|preset")
        _apply_leds({k: v for k, v in norm.items() if k in ("color", "brightness", "preset")})
        _ack_ok("leds:style", {"applied": True})
        emit_state()
    except Exception as e:
        print("⚠️ LEDs style:", e)
        _ack_err("leds:style", str(e))

# ---- Music (si présent)
@sio.on("music:cmd", namespace=NS)
def on_music(payload):
    if payload.get("deviceId") not in (None, DEVICE_ID): return
    try:
        music.apply(payload)   # à implémenter côté utils/music.py
        _ack_ok("music")
        emit_state()
    except Exception as e:
        print("⚠️ Music cmd:", e)
        _ack_err("music", str(e))

# ---------- Main loop ----------
_running = True
def sigterm(*_):
    global _running
    print("↩️ Stop…")
    _running = False
    try: sio.disconnect()
    except: pass
    sys.exit(0)

signal.signal(signal.SIGINT, sigterm)
signal.signal(signal.SIGTERM, sigterm)

def loop():
    last = 0.0
    while _running:
        now = time.time()
        if sio.connected and (now - last) >= HEARTBEAT:
            last = now
            post_heartbeat()
            emit_state()
        time.sleep(0.2)

def connect_forever():
    while _running:
        try:
            sio.connect(
                API_URL,
                headers={"Authorization": f"ApiKey {API_KEY}", "x-device-id": DEVICE_ID},
                socketio_path=WS_PATH,
                namespaces=[NS],
                transports=["websocket"],
            )
            loop()
        except Exception as e:
            print("⚠️ Connexion échouée, retry 5s:", e)
            time.sleep(5)

if __name__ == "__main__":
    print(f"Agent Aura • device={DEVICE_ID} • url={API_URL}{WS_PATH} ns={NS} • HB={HEARTBEAT}s")
    connect_forever()
