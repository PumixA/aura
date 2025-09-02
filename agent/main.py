# main.py
import signal
import sys
import time
import yaml
import socketio
import requests
from typing import Any, Dict

from utils import leds, music, state as dev_state


# --------- Chargement config ---------
def load_config():
    with open("config.yaml") as f:
        return yaml.safe_load(f)

cfg = load_config()

# --- Config de base
API_URL    = cfg["api_url"].rstrip("/")            # ex: http://192.168.1.96:3000
API_BASE   = f"{API_URL}/api/v1"                   # base REST
WS_PATH    = cfg.get("ws_path", "/socket.io")      # ex: /socket.io
NS         = cfg.get("namespace", "/agent")        # ex: /agent
DEVICE_ID  = cfg["device_id"]
API_KEY    = cfg["api_key"]
HEARTBEAT  = int(cfg.get("heartbeat_sec", 20))     # période (sec) HB + state

# --- Client Socket.IO
sio = socketio.Client(
    reconnection=True,
    reconnection_attempts=0,  # infini
    logger=False,
    engineio_logger=False
)


# ---------- Utils HTTP ----------
def _auth_headers():
    return {
        "Authorization": f"ApiKey {API_KEY}",
        "x-device-id": DEVICE_ID,
        "Content-Type": "application/json",
    }

def post_heartbeat():
    """
    Envoie un heartbeat HTTP:
    POST /api/v1/devices/:deviceId/heartbeat
    Headers: Authorization: ApiKey <...>, x-device-id: <DEVICE_ID>
    Body facultatif (status/metrics) — ici on envoie minimal.
    """
    url = f"{API_BASE}/devices/{DEVICE_ID}/heartbeat"
    try:
        body = {"status": "ok"}
        resp = requests.post(url, json=body, headers=_auth_headers(), timeout=5)
        if resp.status_code >= 400:
            print(f"⚠️ Heartbeat HTTP non-200: {resp.status_code} {resp.text}")
        else:
            print("💓 Heartbeat OK")
    except Exception as e:
        print("⚠️ Heartbeat HTTP échec:", e)


# ---------- State report ----------
def emit_state():
    """
    Récupère le snapshot local et l’envoie au hub WS.
    Format attendu: { deviceId, leds?, music?, widgets? } (aplati)
    """
    snap = dev_state.snapshot()  # doit retourner un dict
    if not isinstance(snap, dict):
        print("⚠️ snapshot() n’a pas retourné un dict, ignoré:", snap)
        return

    payload = {"deviceId": DEVICE_ID}
    if "leds" in snap:   payload["leds"] = snap["leds"]
    if "music" in snap:  payload["music"] = snap["music"]
    if "widgets" in snap and snap["widgets"] is not None:
        payload["widgets"] = snap["widgets"]

    print("📤 State envoyé:", payload)
    try:
        sio.emit("state:report", payload, namespace=NS)
    except Exception as e:
        print("⚠️ Émission state:report échouée:", e)


# ---------- Helpers LEDs ----------
def _coerce_leds_payload(raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalise un payload LEDs provenant de 3 variantes:
      - leds:update   -> { leds: { on?, color?, brightness?, preset? } } OU { on?, color?, ... }
      - leds:state    -> { on: bool }
      - leds:style    -> { color?, brightness?, preset? }
    Retourne un dict normalisé: { on?, color?, brightness?, preset? }
    """
    if "leds" in raw and isinstance(raw["leds"], dict):
        p = dict(raw["leds"])
    else:
        p = dict(raw)

    norm = {}
    if "on" in p:          norm["on"] = bool(p["on"])
    if "color" in p:       norm["color"] = str(p["color"])
    if "brightness" in p:  norm["brightness"] = int(p["brightness"])
    if "preset" in p and p["preset"] not in (None, ""):
        norm["preset"] = str(p["preset"])
    return norm

def _apply_leds(norm: Dict[str, Any]):
    """
    Applique le payload LEDs normalisé sur le driver.
    Compatibilité:
      - Si utils.leds.apply existe -> on lui passe {leds: {...}} pour les anciens drivers
      - Sinon on tente des méthodes granulaire (set_on/set_color/set_brightness/set_preset)
    """
    # 1) Driver legacy (fonction apply(payload))
    if hasattr(leds, "apply") and callable(getattr(leds, "apply")):
        try:
            leds.apply({"leds": norm})   # compat ascendante
            return
        except Exception as e:
            print("⚠️ utils.leds.apply a échoué, tentative granulaire:", e)

    # 2) Driver moderne (méthodes explicites)
    if "on" in norm and hasattr(leds, "set_on"):
        leds.set_on(bool(norm["on"]))
    if "color" in norm and hasattr(leds, "set_color"):
        leds.set_color(str(norm["color"]))
    if "brightness" in norm and hasattr(leds, "set_brightness"):
        leds.set_brightness(int(norm["brightness"]))
    if "preset" in norm and hasattr(leds, "set_preset"):
        leds.set_preset(str(norm["preset"]))


def _ack_ok(evt_type: str, data: Dict[str, Any] | None = None):
    sio.emit("ack", {"deviceId": DEVICE_ID, "type": evt_type, "status": "ok", "data": data or {}}, namespace=NS)

def _ack_err(evt_type: str, message: str):
    sio.emit("nack", {"deviceId": DEVICE_ID, "type": evt_type, "reason": message}, namespace=NS)


# ---------- Handlers WS ----------
@sio.event(namespace=NS)
def connect():
    print(f"✅ Connecté au hub {NS}")
    try:
        # compat: certains serveurs l'attendent; côté serveur on gère aussi l'auto-join
        sio.emit("agent:register", {"deviceId": DEVICE_ID}, namespace=NS)
    except Exception as e:
        print("⚠️ agent:register erreur:", e)
    # premier heartbeat + état
    post_heartbeat()
    emit_state()

@sio.event(namespace=NS)
def disconnect():
    print("❌ Déconnecté du hub")

@sio.on("agent:ack", namespace=NS)
def on_agent_ack(payload):
    if payload.get("deviceId") not in (None, DEVICE_ID):
        return
    print("✅ ACK serveur:", payload)

@sio.on("presence", namespace=NS)
def on_presence(payload):
    if payload.get("deviceId") not in (None, DEVICE_ID):
        return
    print("👀 Presence:", payload)


# ----- LEDs: 3 variantes supportées -----
@sio.on("leds:update", namespace=NS)
def on_leds_update(payload):
    if payload.get("deviceId") not in (None, DEVICE_ID):
        return
    try:
        norm = _coerce_leds_payload(payload)
        _apply_leds(norm)
        _ack_ok("leds")
        emit_state()
    except Exception as e:
        print("⚠️ LEDs update error:", e)
        _ack_err("leds", str(e))

@sio.on("leds:state", namespace=NS)
def on_leds_state(payload):
    if payload.get("deviceId") not in (None, DEVICE_ID):
        return
    try:
        norm = _coerce_leds_payload(payload)  # attend { on: bool }
        if "on" not in norm:
            raise ValueError("Missing 'on' in payload")
        _apply_leds({"on": norm["on"]})
        _ack_ok("leds:state", {"on": norm["on"]})
        emit_state()
    except Exception as e:
        print("⚠️ LEDs state error:", e)
        _ack_err("leds:state", str(e))

@sio.on("leds:style", namespace=NS)
def on_leds_style(payload):
    if payload.get("deviceId") not in (None, DEVICE_ID):
        return
    try:
        norm = _coerce_leds_payload(payload)  # color/brightness/preset
        if not any(k in norm for k in ("color", "brightness", "preset")):
            raise ValueError("Provide at least one of: color, brightness, preset")
        _apply_leds({k: v for k, v in norm.items() if k in ("color", "brightness", "preset")})
        _ack_ok("leds:style", {"applied": True})
        emit_state()
    except Exception as e:
        print("⚠️ LEDs style error:", e)
        _ack_err("leds:style", str(e))


# ----- Music (inchangé) -----
@sio.on("music:cmd", namespace=NS)
def on_music(payload):
    if payload.get("deviceId") not in (None, DEVICE_ID):
        return
    try:
        music.apply(payload)  # applique la commande (play/pause/next/prev/volume)
        _ack_ok("music")
    except Exception as e:
        print("⚠️ Music apply error:", e)
        _ack_err("music", str(e))


@sio.on("widgets:update", namespace=NS)
def on_widgets(payload):
    if payload.get("deviceId") not in (None, DEVICE_ID):
        return
    print("[Widgets] update reçu:", payload)
    # si ton agent doit faire quelque chose localement, ajoute la logique ici


# ---------- Boucle principale ----------
_running = True
def sigterm(*_):
    global _running
    print("↩️ SIGTERM reçu, arrêt propre…")
    _running = False
    try:
        sio.disconnect()
    except:
        pass
    sys.exit(0)

signal.signal(signal.SIGINT, sigterm)
signal.signal(signal.SIGTERM, sigterm)

def loop():
    last_tick = 0.0
    while _running:
        now = time.time()
        # toutes les HEARTBEAT secondes: heartbeat HTTP + state WS
        if sio.connected and (now - last_tick) >= HEARTBEAT:
            last_tick = now
            post_heartbeat()
            emit_state()
        time.sleep(0.2)

def connect_forever():
    while _running:
        try:
            # On se connecte à la même origine que l'API (API_URL), le path WS et le namespace
            sio.connect(
                API_URL,  # ex: http://192.168.1.96:3000
                headers={"Authorization": f"ApiKey {API_KEY}", "x-device-id": DEVICE_ID},
                socketio_path=WS_PATH,          # ex: /socket.io
                namespaces=[NS],                # ex: /agent
                transports=["websocket"]        # évite le polling
            )
            loop()
        except Exception as e:
            print("⚠️ Connexion échouée, retry 5s:", e)
            time.sleep(5)

if __name__ == "__main__":
    print(f"Agent Aura • device={DEVICE_ID} • url={API_URL}{WS_PATH} ns={NS} • HB={HEARTBEAT}s")
    connect_forever()
