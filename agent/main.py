import signal
import sys
import time
import requests
import socketio
from typing import Any, Dict, Optional

# ---------- Config ----------
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
        import yaml
        with open("config.yaml", "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except Exception:
        return _parse_simple_kv_yaml("config.yaml")

cfg = load_config()

API_URL   = str(cfg["api_url"]).rstrip("/")
API_BASE  = f"{API_URL}/api/v1"
WS_PATH   = str(cfg.get("ws_path", "/socket.io"))
NS        = str(cfg.get("namespace", "/agent"))
DEVICE_ID = str(cfg["device_id"])
API_KEY   = str(cfg["api_key"])

HEARTBEAT = int(cfg.get("heartbeat_sec", 10))
FALLBACK_LOCAL_ON_BOOT = bool(cfg.get("fallback_local_on_boot", False))
MUSIC_POLL_SEC = float(cfg.get("music_poll_sec", 1.0))   # plus nerveux
SINK_WATCH_SEC = float(cfg.get("sink_watch_sec", 0.3))

def _auth_headers():
    return {"Authorization": f"ApiKey {API_KEY}", "x-device-id": DEVICE_ID, "Content-Type": "application/json"}

from utils import leds, music, state as dev_state

sio = socketio.Client(reconnection=True, reconnection_attempts=0, logger=False, engineio_logger=False)

_last_report: Optional[Dict[str, Any]] = None
_last_emit_ts: float = 0.0
EMIT_THROTTLE_SEC = 0.2

_last_sink_check: float = 0.0
_last_music_poll: float = -1e9  # poll immédiat au boot
_last_sink_volume: Optional[int] = None
_last_db_music_seen: Optional[Dict[str, Any]] = None

# ---------- API helpers ----------
def _fetch_api_state_raw() -> Optional[str]:
    url = f"{API_BASE}/devices/{DEVICE_ID}/state"
    try:
        r = requests.get(url, headers=_auth_headers(), timeout=5)
        print(f"🟦 RAW GET {url} → {r.status_code}")
        print("🟦 BODY:", r.text)
        if r.status_code == 200:
            return r.text
    except Exception as e:
        print("ℹ️ API GET state échec:", e)
    return None

def _fetch_api_state() -> Optional[Dict[str, Any]]:
    url = f"{API_BASE}/devices/{DEVICE_ID}/state"
    try:
        r = requests.get(url, headers=_auth_headers(), timeout=5)
        print(f"🟦 RAW GET {url} → {r.status_code}")
        print("🟦 BODY:", r.text)
        if r.status_code == 200:
            return r.json()
        else:
            print(f"ℹ️ API GET state non-200: {r.status_code} {r.text[:300]}")
    except Exception as e:
        print("ℹ️ API GET state échec:", e)
    return None

# ---------- State helpers ----------
def _refresh_runtime_music_into_state() -> None:
    """
    Ne pousse dans state que si on a une vraie lecture volume.
    Évite de re-forcer un 40% par défaut au boot.
    """
    try:
        m = music.get_state()
        if m.get("volume") is not None:
            dev_state.set_music(m)
        else:
            print("ℹ️ get_state volume=None → on n'écrase pas l'état actuel")
    except Exception as e:
        print("ℹ️ refresh music state fail:", e)

def _current_snapshot() -> Dict[str, Any]:
    _refresh_runtime_music_into_state()
    snap = dev_state.snapshot()
    if not isinstance(snap, dict): return {}
    out = {"deviceId": DEVICE_ID}
    if "leds" in snap:   out["leds"] = snap["leds"]
    if "music" in snap:  out["music"] = snap["music"]
    if "widgets" in snap and snap["widgets"] is not None: out["widgets"] = snap["widgets"]
    return out

def emit_state(force: bool = False, *, tag_for_api_log: Optional[str] = None):
    global _last_report, _last_emit_ts
    now = time.time()
    if not force and (now - _last_emit_ts) < EMIT_THROTTLE_SEC:
        return
    payload = _current_snapshot()
    if not payload: return
    if (not force) and (_last_report == payload): return
    _last_report = payload
    _last_emit_ts = now
    print("📤 state:report →", payload)
    try:
        sio.emit("state:report", payload, namespace=NS)
    except Exception as e:
        print("⚠️ state:report erreur:", e)
    if tag_for_api_log:
        _fetch_api_state_raw()

# ---------- LEDs ----------
def _coerce_leds_payload(raw: Dict[str, Any]) -> Dict[str, Any]:
    p = dict(raw)
    out: Dict[str, Any] = {}
    if "on" in p:          out["on"] = bool(p["on"])
    if "color" in p:
        out["color"] = str(p["color"]).strip()
        if out["color"].startswith("#"):
            out["color"] = "#" + out["color"][1:].upper()
    if "brightness" in p:  out["brightness"] = max(0, min(100, int(p["brightness"])))
    if "preset" in p and p["preset"] not in (None, ""):
        out["preset"] = str(p["preset"])
    return out

def _apply_leds(norm: Dict[str, Any]):
    try:
        if hasattr(leds, "apply") and callable(getattr(leds, "apply")):
            leds.apply({"leds": norm})
            dev_state.merge_leds(norm)
            return
    except Exception as e:
        print("⚠️ utils.leds.apply a échoué, fallback granular:", e)
    if "on" in norm and hasattr(leds, "set_on"): leds.set_on(bool(norm["on"]))
    if "color" in norm and hasattr(leds, "set_color"): leds.set_color(str(norm["color"]))
    if "brightness" in norm and hasattr(leds, "set_brightness"): leds.set_brightness(int(norm["brightness"]))
    if "preset" in norm and hasattr(leds, "set_preset"): leds.set_preset(str(norm["preset"]))
    dev_state.merge_leds(norm)

# ---------- Music (DB→SYS + handlers) ----------
def _coerce_db_volume(v) -> Optional[int]:
    if v is None:
        return None
    try:
        return max(0, min(100, int(v)))
    except Exception:
        try:
            return max(0, min(100, int(float(str(v).strip()))))
        except Exception:
            return None

def _apply_music_from_snapshot(mraw: Dict[str, Any], *, source: str):
    try:
        # Normalise
        norm: Dict[str, Any] = {}
        if "volume" in mraw:
            cv = _coerce_db_volume(mraw["volume"])
            if cv is not None:
                norm["volume"] = cv
        if "status" in mraw:
            st = str(mraw["status"]).lower().strip()
            if st in ("play", "pause"):
                norm["status"] = st

        before = music.get_state().get("volume")

        print(f"🎯 [{source}] MUSIC snapshot norm: {norm}")

        if "volume" in norm:
            want = norm["volume"]
            print(f"🧭 DECIDE: set volume → {want}% (before sink={before}%)")
            st = music.set_volume(want)              # APPLY
            after = st.get("volume")
            print(f"✅ VERIFY: sink volume={after}% (wanted={want}%)")

        if norm.get("status") == "play":
            print("🧭 DECIDE: status → play")
            music.play()
        elif norm.get("status") == "pause":
            print("🧭 DECIDE: status → pause")
            music.pause()

        dev_state.set_music(music.get_state())
    except Exception as e:
        print("⚠️ apply music snapshot:", e)

def _handle_volume_payload(payload: Dict[str, Any], *, source: str):
    data = payload.get("music", payload)
    cv = _coerce_db_volume(data.get("value", data.get("volume", None)))
    if cv is None:
        raise ValueError("Missing/invalid volume/value (expected 0..100)")
    before = music.get_state().get("volume")
    print(f"🧭 [{source}] DECIDE: set volume {cv}% (before sink={before}%)")
    st = music.set_volume(cv)
    after = st.get("volume")
    print(f"✅ [{source}] VERIFY: sink volume={after}% (wanted={cv}%)")
    dev_state.set_music(st)

# ---------- Apply snapshot / REST ----------
def apply_snapshot(snapshot: Dict[str, Any], *, reason: str = "unknown"):
    print(f"⬇️  state:apply ({reason}) →", snapshot)
    try:
        if "leds" in snapshot and isinstance(snapshot["leds"], dict):
            _apply_leds(_coerce_leds_payload(snapshot["leds"]))
        if "music" in snapshot and isinstance(snapshot["music"], dict):
            _apply_music_from_snapshot(snapshot["music"], source=f"{reason}/state:apply")
        emit_state(force=True, tag_for_api_log=f"{reason}/state:apply")
    except Exception as e:
        print("⚠️ apply_snapshot:", e)

def pull_snapshot_rest() -> bool:
    data = _fetch_api_state()
    if isinstance(data, dict):
        apply_snapshot(data, reason="REST")
        print("✅ Snapshot REST appliqué.")
        return True
    return False

# ---------- WS guards ----------
def _accept_for_me(payload: Dict[str, Any]) -> bool:
    did = payload.get("deviceId")
    return (did is None) or (did == DEVICE_ID)

# ---------- WS ----------
def _ack_ok(evt_type: str, data: Optional[Dict[str, Any]] = None):
    sio.emit("ack", {"deviceId": DEVICE_ID, "type": evt_type, "status": "ok", "data": data or {}}, namespace=NS)

def _ack_err(evt_type: str, msg: str):
    sio.emit("nack", {"deviceId": DEVICE_ID, "type": evt_type, "reason": msg}, namespace=NS)

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

@sio.event(namespace=NS)
def connect():
    print(f"✅ Connecté au hub {NS}")
    try:
        sio.emit("agent:register", {"deviceId": DEVICE_ID}, namespace=NS)
    except Exception as e:
        print("⚠️ agent:register erreur:", e)

    pulled = pull_snapshot_rest()

    if (not pulled) and FALLBACK_LOCAL_ON_BOOT:
        try:
            snap = dev_state.snapshot() or {}
            leds_cfg = snap.get("leds")
            if isinstance(leds_cfg, dict):
                _apply_leds(_coerce_leds_payload(leds_cfg))
                print("✅ Boot LEDs (fallback local) appliqué:", leds_cfg)
                emit_state(force=True, tag_for_api_log="boot-local")
        except Exception as e:
            print("⚠️ Boot fallback error:", e)

    # Poll immédiat juste après connexion pour forcer l'alignement musique
    try:
        print("⏳ First music DB poll right after connect() …")
        _poll_music_from_db()
    except Exception as e:
        print("ℹ️ initial poll music fail:", e)

    post_heartbeat()

    if not pulled:
        try:
            sio.emit("state:pull", {"deviceId": DEVICE_ID}, namespace=NS)
        except Exception as e:
            print("ℹ️ state:pull échec:", e)

@sio.event(namespace=NS)
def disconnect():
    print("❌ Déconnecté du hub — blackout LEDs")
    try:
        leds.blackout()
    except Exception as e:
        print("⚠️ blackout error:", e)

@sio.on("agent:ack", namespace=NS)
def on_agent_ack(payload):
    if not _accept_for_me(payload): return
    print("✅ ACK serveur:", payload)

@sio.on("presence", namespace=NS)
def on_presence(payload):
    if not _accept_for_me(payload): return
    print("👀 Presence:", payload)

@sio.on("state:apply", namespace=NS)
def on_state_apply(payload):
    if not _accept_for_me(payload): return
    apply_snapshot({k: v for k, v in payload.items() if k in ("leds", "music", "widgets")}, reason="WS")

# ---------- LEDs events ----------
@sio.on("leds:update", namespace=NS)
def on_leds_update(payload):
    if not _accept_for_me(payload): return
    try:
        norm = _coerce_leds_payload(payload.get("leds", payload))
        _apply_leds(norm)
        _ack_ok("leds")
        emit_state(tag_for_api_log="leds:update")
    except Exception as e:
        print("⚠️ LEDs update:", e)
        _ack_err("leds", str(e))

@sio.on("leds:state", namespace=NS)
def on_leds_state(payload):
    if not _accept_for_me(payload): return
    try:
        norm = _coerce_leds_payload(payload)
        if "on" not in norm: raise ValueError("Missing 'on'")
        _apply_leds({"on": norm["on"]})
        _ack_ok("leds:state", {"on": norm["on"]})
        emit_state(tag_for_api_log="leds:state")
    except Exception as e:
        print("⚠️ LEDs state:", e)
        _ack_err("leds:state", str(e))

@sio.on("leds:style", namespace=NS)
def on_leds_style(payload):
    if not _accept_for_me(payload): return
    try:
        norm = _coerce_leds_payload(payload)
        if not any(k in norm for k in ("color", "brightness", "preset")):
            raise ValueError("Provide one of color|brightness|preset")
        _apply_leds({k: v for k, v in norm.items() if k in ("color", "brightness", "preset")})
        _ack_ok("leds:style", {"applied": True})
        emit_state(tag_for_api_log="leds:style")
    except Exception as e:
        print("⚠️ LEDs style:", e)
        _ack_err("leds:style", str(e))

# ---------- Music events ----------
@sio.on("music:volume", namespace=NS)
def on_music_volume(payload):
    if not _accept_for_me(payload): return
    try:
        _handle_volume_payload(payload, source="music:volume")
        _ack_ok("music:volume")
        emit_state(tag_for_api_log="music:volume")
    except Exception as e:
        print("⚠️ Music volume:", e)
        _ack_err("music:volume", str(e))

@sio.on("music:cmd", namespace=NS)
def on_music_cmd(payload):
    if not _accept_for_me(payload): return
    try:
        data = payload.get("music", payload)
        if "volume" in data or "value" in data:
            _handle_volume_payload(data, source="music:cmd")
        if "action" in data:
            before = music.get_state().get("volume")
            st = music.apply({"action": data["action"]})
            after = st.get("volume")
            print(f"🎵 [music:cmd] action={data['action']} (sink {after}% ; was {before}%)")
            dev_state.set_music(st)
        _ack_ok("music")
        emit_state(tag_for_api_log="music:cmd")
    except Exception as e:
        print("⚠️ Music cmd:", e)
        _ack_err("music", str(e))

@sio.on("music:update", namespace=NS)
def on_music_update(payload):
    if not _accept_for_me(payload): return
    try:
        data = payload.get("music", payload)
        if "volume" in data or "value" in data:
            _handle_volume_payload(data, source="music:update")
        if "action" in data:
            before = music.get_state().get("volume")
            st = music.apply({"action": data["action"]})
            after = st.get("volume")
            print(f"🎵 [music:update] action={data['action']} (sink {after}% ; was {before}%)")
            dev_state.set_music(st)
        _ack_ok("music:update")
        emit_state(tag_for_api_log="music:update")
    except Exception as e:
        print("⚠️ music:update:", e)
        _ack_err("music:update", str(e))

@sio.on("music", namespace=NS)
def on_music_generic(payload):
    if not _accept_for_me(payload): return
    try:
        data = payload.get("music", payload)
        if "volume" in data or "value" in data:
            _handle_volume_payload(data, source="music(generic)")
        if "action" in data:
            st = music.apply({"action": data["action"]})
            dev_state.set_music(st)
        _ack_ok("music(generic)")
        emit_state(tag_for_api_log="music(generic)")
    except Exception as e:
        print("⚠️ music(generic):", e)
        _ack_err("music(generic)", str(e))

@sio.on("control:volume", namespace=NS)
def on_control_volume(payload):
    if not _accept_for_me(payload): return
    try:
        _handle_volume_payload(payload, source="control:volume")
        _ack_ok("control:volume")
        emit_state(tag_for_api_log="control:volume")
    except Exception as e:
        print("⚠️ control:volume:", e)
        _ack_err("control:volume", str(e))

# ---------- Main loop ----------
_running = True
def sigterm(*_):
    global _running
    print("↩️ Stop… blackout LEDs")
    _running = False
    try: leds.blackout()
    except: pass
    try: sio.disconnect()
    except: pass
    sys.exit(0)

signal.signal(signal.SIGINT, sigterm)
signal.signal(signal.SIGTERM, sigterm)

def _poll_music_from_db():
    """
    Pipeline: DETECT → FETCH(DB) → DECIDE → APPLY(pactl/playerctl) → VERIFY → REPORT
    """
    global _last_db_music_seen

    data = _fetch_api_state()
    if not isinstance(data, dict):
        print("🔎 POLL → pas de JSON dict (skip)")
        return

    db_music = data.get("music") or {}
    if not isinstance(db_music, dict):
        print("🔎 POLL → pas de music dict (skip)")
        return

    # DETECT changements DB
    if _last_db_music_seen is None or any(db_music.get(k) != (_last_db_music_seen or {}).get(k) for k in ("status", "volume")):
        print(f"🆕 DB changed → {db_music}")
        _last_db_music_seen = dict(db_music)
    else:
        print(f"🔁 DB unchanged → {db_music}")

    # FETCH sink
    sink_state = music.get_state()
    sink_vol   = sink_state.get("volume")
    sink_st    = (sink_state.get("status") or "").lower()
    wanted_vol = _coerce_db_volume(db_music.get("volume"))
    wanted_st  = (str(db_music.get("status") or "").lower())

    print(f"🔎 COMPARE DB{{status:{wanted_st}, volume:{wanted_vol}}} vs SINK{{status:{sink_st}, volume:{sink_vol}}}")

    # DECIDE/APPLY volume
    if wanted_vol is not None and sink_vol != wanted_vol:
        print(f"🧭 DECIDE volume: {sink_vol}% → {wanted_vol}%")
        st = music.set_volume(wanted_vol)     # APPLY
        after = st.get("volume")
        print(f"✅ VERIFY volume: sink={after}% (wanted={wanted_vol}%)")
        dev_state.set_music(st)
        emit_state(tag_for_api_log="poll/music")

    # DECIDE/APPLY status
    if wanted_st in ("play", "pause") and wanted_st != sink_st:
        print(f"🧭 DECIDE status: {sink_st} → {wanted_st}")
        if wanted_st == "play":
            music.play()
        else:
            music.pause()
        dev_state.set_music(music.get_state())
        emit_state(tag_for_api_log="poll/music")

def _watch_sink_volume():
    """Détecte les changements locaux et réémet l'état immédiatement."""
    global _last_sink_volume
    st = music.get_state()
    v = st.get("volume")
    if v is None:
        return
    if _last_sink_volume is None:
        _last_sink_volume = v
        return
    if v != _last_sink_volume:
        print(f"👂 SINK change detected: { _last_sink_volume }% → { v }% (local)")
        dev_state.set_music(st)
        _last_sink_volume = v
        emit_state(tag_for_api_log="sink/watch")

def loop():
    global _last_music_poll, _last_sink_check
    last_hb = 0.0
    while _running:
        now = time.time()

        if sio.connected and (now - last_hb) >= HEARTBEAT:
            last_hb = now
            post_heartbeat()

        if (now - _last_music_poll) >= MUSIC_POLL_SEC:
            _last_music_poll = now
            try:
                print(f"🕑 POLL tick (every {MUSIC_POLL_SEC}s)")
                _poll_music_from_db()
            except Exception as e:
                print("ℹ️ poll music fail:", e)

        if (now - _last_sink_check) >= SINK_WATCH_SEC:
            _last_sink_check = now
            try:
                _watch_sink_volume()
            except Exception as e:
                print("ℹ️ sink watch fail:", e)

        time.sleep(0.15)

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
            try: leds.blackout()
            except: pass
            time.sleep(5)

if __name__ == "__main__":
    print(f"Agent Aura • device={DEVICE_ID} • url={API_URL}{WS_PATH} ns={NS} • HB={HEARTBEAT}s • DB<->SYS • RGB")
    connect_forever()
