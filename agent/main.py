import signal, sys, time, yaml, socketio
from utils import leds, music, state as dev_state

def load_config():
    with open("config.yaml") as f:
        return yaml.safe_load(f)

cfg = load_config()
API_URL   = cfg["api_url"].rstrip("/")          # ex: http://127.0.0.1:3000
WS_PATH   = cfg.get("ws_path", "/socket.io")    # ex: /socket.io
NS        = cfg.get("namespace", "/agent")
DEVICE_ID = cfg["device_id"]
API_KEY   = cfg["api_key"]
HEARTBEAT = int(cfg.get("heartbeat_sec", 20))

sio = socketio.Client(
    reconnection=True,
    reconnection_attempts=0,
    logger=False,
    engineio_logger=True  # <- activer les logs pour voir le handshake
)

# ---------- Handlers ----------
@sio.event(namespace=NS)
def connect():
    print(f"✅ Connecté au hub {NS}")
    # envoie l'enregistrement (certaines implémentations s'en servent)
    sio.emit("agent:register", {"deviceId": DEVICE_ID, "apiKey": API_KEY}, namespace=NS)

@sio.event(namespace=NS)
def connect_error(data):
    print("❌ connect_error namespace:", data)

@sio.event
def connect_error(data):
    # fallback si le connect_error n'est pas namespace-scoped
    print("❌ connect_error global:", data)

@sio.event(namespace=NS)
def disconnect():
    print("❌ Déconnecté")

@sio.on("leds:update", namespace=NS)
def on_leds(payload):
    if payload.get("deviceId") not in (None, DEVICE_ID):
        return
    print("💡 LEDs update:", payload)
    leds.apply(payload)
    sio.emit("ack", {"deviceId": DEVICE_ID, "type": "leds", "status": "ok"}, namespace=NS)

@sio.on("music:cmd", namespace=NS)
def on_music(payload):
    if payload.get("deviceId") not in (None, DEVICE_ID):
        return
    print("🎵 Music cmd:", payload)
    music.apply(payload)
    sio.emit("ack", {"deviceId": DEVICE_ID, "type": "music", "status": "ok"}, namespace=NS)

@sio.on("widgets:update", namespace=NS)
def on_widgets(payload):
    if payload.get("deviceId") not in (None, DEVICE_ID):
        return
    print("🧩 Widgets update:", payload)

# ---------- Heartbeat ----------
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
    last_hb = 0
    while _running:
        now = time.time()
        if sio.connected and now - last_hb >= HEARTBEAT:
            last_hb = now
            snap = dev_state.snapshot()  # doit être { leds, music, widgets }
            sio.emit("state:report", {"deviceId": DEVICE_ID, **snap}, namespace=NS)
            print("📤 State envoyé:", snap)
        time.sleep(0.2)

def connect_forever():
    while _running:
        try:
            # IMPORTANT :
            # 1) headers pour l'auth agent (Authorization + x-device-id)
            # 2) auth pour le handshake (au cas où le serveur lit handshake.auth.*)
            sio.connect(
                API_URL,
                headers={
                    "Authorization": f"ApiKey {API_KEY}",
                    "x-device-id": DEVICE_ID
                },
                auth={
                    "token": f"ApiKey {API_KEY}",
                    "deviceId": DEVICE_ID
                },
                socketio_path=WS_PATH,
                namespaces=[NS],
                # transports=["websocket"]  # on laisse la négociation par défaut
            )
            loop()
        except Exception as e:
            print("⚠️ Connexion échouée, retry 5s:", e)
            time.sleep(5)

if __name__ == "__main__":
    print(f"Agent Aura • device={DEVICE_ID} • url={API_URL}{WS_PATH} ns={NS}")
    connect_forever()
