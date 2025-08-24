import signal, sys, time, yaml, socketio
from utils import leds, music, state as dev_state

def load_config():
    with open("config.yaml") as f: return yaml.safe_load(f)

cfg = load_config()
API_URL   = cfg["api_url"].rstrip("/")
WS_PATH   = cfg.get("ws_path", "/socket.io")
NS        = cfg.get("namespace", "/agent")
DEVICE_ID = cfg["device_id"]
API_KEY   = cfg["api_key"]
HEARTBEAT = int(cfg.get("heartbeat_sec", 20))

sio = socketio.Client(reconnection=True, reconnection_attempts=0, logger=False, engineio_logger=False)

# ---------- Handlers ----------
@sio.event(namespace=NS)
def connect():
    print(f"✅ Connecté au hub {NS}")
    sio.emit("agent:register", {"deviceId": DEVICE_ID}, namespace=NS)

@sio.event(namespace=NS)
def disconnect():
    print("❌ Déconnecté")

@sio.on("leds:update", namespace=NS)
def on_leds(payload):
    if payload.get("deviceId") not in (None, DEVICE_ID): return
    leds.apply(payload)
    sio.emit("ack", {"deviceId": DEVICE_ID, "type": "leds", "status": "ok"}, namespace=NS)

@sio.on("music:cmd", namespace=NS)
def on_music(payload):
    if payload.get("deviceId") not in (None, DEVICE_ID): return
    music.apply(payload)
    sio.emit("ack", {"deviceId": DEVICE_ID, "type": "music", "status": "ok"}, namespace=NS)

@sio.on("widgets:update", namespace=NS)
def on_widgets(payload):
    if payload.get("deviceId") not in (None, DEVICE_ID): return
    print("[Widgets]", payload)

# ---------- Heartbeat ----------
_running = True
def sigterm(*_):
    global _running
    print("↩️ SIGTERM reçu, arrêt propre…")
    _running = False
    try: sio.disconnect()
    except: pass
    sys.exit(0)

signal.signal(signal.SIGINT, sigterm)
signal.signal(signal.SIGTERM, sigterm)

def loop():
    last_hb = 0
    while _running:
        now = time.time()
        if sio.connected and now - last_hb >= HEARTBEAT:
            last_hb = now
            snap = dev_state.snapshot()
            sio.emit("state:report", {"deviceId": DEVICE_ID, "state": snap}, namespace=NS)
        time.sleep(0.2)

def connect_forever():
    while _running:
        try:
            sio.connect(API_URL,
                        headers={"Authorization": f"ApiKey {API_KEY}", "x-device-id": DEVICE_ID},
                        socketio_path=WS_PATH,
                        namespaces=[NS],
                        transports=["websocket"])
            loop()
        except Exception as e:
            print("⚠️ Connexion échouée, retry 5s:", e)
            time.sleep(5)

if __name__ == "__main__":
    print(f"Agent Aura • device={DEVICE_ID} • url={API_URL}{WS_PATH} ns={NS}")
    connect_forever()
