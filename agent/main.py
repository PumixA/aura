# main.py
import signal
import sys
import time
import yaml
import socketio
import requests
from utils import leds, music, state as dev_state

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
        # tu peux enrichir body avec des métriques si tu veux
        body = {"status": "ok"}
        resp = requests.post(url, json=body, headers=_auth_headers(), timeout=5)
        if resp.status_code >= 400:
            print(f"⚠️ Heartbeat HTTP non-200: {resp.status_code} {resp.text}")
        else:
            # pas de body (204 attendu), mais on log soft pour debug
            print("💓 Heartbeat OK")
    except Exception as e:
        print("⚠️ Heartbeat HTTP échec:", e)

def emit_state():
    """
    Récupère le snapshot local et l’envoie au hub WS.
    Format attendu: { deviceId, leds?, music?, widgets? } (aplati)
    """
    snap = dev_state.snapshot()  # doit retourner un dict: {"leds": {...}, "music": {...}, "widgets": [...]?}
    if not isinstance(snap, dict):
        print("⚠️ snapshot() n’a pas retourné un dict, ignoré:", snap)
        return

    # Aplatir: pas de clé "state"
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

# ---------- Handlers WS ----------
@sio.event(namespace=NS)
def connect():
    print(f"✅ Connecté au hub {NS}")
    try:
        # compat: certains serveurs l'attendent; côté serveur on gère aussi l'auto-join
        sio.emit("agent:register", {"deviceId": DEVICE_ID}, namespace=NS)
    except Exception as e:
        print("⚠️ agent:register erreur:", e)
    # on envoie un premier heartbeat HTTP et un state
    post_heartbeat()
    emit_state()

@sio.event(namespace=NS)
def disconnect():
    print("❌ Déconnecté du hub")

@sio.on("leds:update", namespace=NS)
def on_leds(payload):
    if payload.get("deviceId") not in (None, DEVICE_ID):
        return
    try:
        leds.apply(payload)  # applique { leds: {...} } ou champs utiles dedans
        sio.emit("ack", {"deviceId": DEVICE_ID, "type": "leds", "status": "ok"}, namespace=NS)
    except Exception as e:
        print("⚠️ LEDs apply error:", e)
        sio.emit("nack", {"deviceId": DEVICE_ID, "type": "leds", "reason": str(e)}, namespace=NS)

@sio.on("music:cmd", namespace=NS)
def on_music(payload):
    if payload.get("deviceId") not in (None, DEVICE_ID):
        return
    try:
        music.apply(payload)  # applique la commande (play/pause/next/prev/volume)
        sio.emit("ack", {"deviceId": DEVICE_ID, "type": "music", "status": "ok"}, namespace=NS)
    except Exception as e:
        print("⚠️ Music apply error:", e)
        sio.emit("nack", {"deviceId": DEVICE_ID, "type": "music", "reason": str(e)}, namespace=NS)

@sio.on("widgets:update", namespace=NS)
def on_widgets(payload):
    if payload.get("deviceId") not in (None, DEVICE_ID):
        return
    print("[Widgets] update reçu:", payload)
    # si ton agent doit faire quelque chose localement, ajoute la logique ici

# (optionnel) si tu veux log les acks venant du serveur/uis
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
