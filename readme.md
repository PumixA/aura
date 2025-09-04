# Aura – Miroir connecté

Système modulaire pour miroir connecté, composé de :

* **API Backend** (Node + Fastify + Prisma + JWT + Swagger)
* **Agent Matériel** (Python) — tourne sur Raspberry Pi (ou PC) et pilote LEDs/audio/BT
* **UI Desktop** (Electron + React + Vite) — interface plein écran du miroir
* **App Mobile** (Expo/React Native) — gestion du compte/appareils & pilotage
* **Infra Docker** (PostgreSQL + Adminer, conteneur API optionnel)

> Objectif examen : API + Mobile en priorité. Desktop et Agent finalisent la démo.

---

## Sommaire

* [Architecture](#architecture)
* [Structure du dépôt](#structure-du-dépôt)
* [Prérequis](#prérequis)
* [Démarrage rapide (TL;DR)](#démarrage-rapide-tldr)
* [Backend API](#backend-api)
* [Temps réel (SocketIO)](#temps-réel-socketio)
* [Agent Matériel (Python)](#agent-matériel-python)
* [UI Desktop (Electron)](#ui-desktop-electron)
* [App Mobile (Expo)](#app-mobile-expo)
* [Docker & déploiement](#docker--déploiement)
* [Tests manuels utiles](#tests-manuels-utiles)
* [Sécurité & prod checklist](#sécurité--prod-checklist)
* [Licence](#licence)

---

## Architecture

```
Mobile (Expo) ──► REST API ─┬─► Socket.IO /agent ► Agent (Pi)
Desktop (Electron) ─────────┘
└─► DB Postgres (Prisma)
```

* **Mobile & Desktop** : appellent l’API REST (auth JWT) et écoutent les états via WebSocket.
* **API** : expose routes REST (auth, devices, leds/music, widgets, audits…), et un hub **Socket.IO** (`/agent`).
* **Agent** : daemon Python (Pi) qui s’auth via **ApiKey de device**, reçoit commandes (`leds:update`, `music:cmd`, `widgets:update`), exécute localement et renvoie `state:report`.
* **Base** : PostgreSQL, modèle Prisma.

---

## Structure du dépôt

```
aura/
├─ aura-api/                 # Backend Node/Fastify/Prisma
│  ├─ src/
│  │  ├─ server.ts           # boot Fastify + Swagger + Prisma + Realtime
│  │  ├─ realtime.ts         # Socket.IO (/agent), auth ApiKey/JWT
│  │  ├─ plugins/prisma.ts
│  │  └─ routes/
│  │     ├─ auth.ts          # register/login/refresh/logout
│  │     ├─ me.ts            # profil utilisateur + sessions
│  │     ├─ devices.ts       # CRUD device + state global
│  │     ├─ control.ts       # relais REST → Socket.IO (leds/music)
│  │     ├─ pairing.ts       # pairing token & heartbeat agent
│  │     ├─ weather.ts       # météo publique
│  │     ├─ audit_admin.ts   # audit & administration
│  │     ├─ health.ts
│  │     └─ public.ts        # config publique (feature flags)
│  └─ prisma/schema.prisma
│
├─ agent/                    # Daemon Python (Pi)
│  ├─ config.yaml            # api_url, device_id, api_key, …
│  ├─ main.py                # client Socket.IO + poll REST + heartbeat
│  └─ utils/
│     ├─ leds.py             # driver WS2812B (ou mock)
│     ├─ music.py            # pactl/playerctl (session utilisateur)
│     └─ state.py            # snapshot d’état local
│
├─ desktop/                  # UI Electron + React + Vite
│  ├─ electron/
│  │  ├─ main.cjs
│  │  └─ preload.cjs
│  └─ src/
│     ├─ api/client.ts
│     ├─ socket.ts
│     ├─ store/{auth,ui}.ts
│     ├─ components/{DevicePicker,LedPanel,MusicPanel}.tsx
│     ├─ pages/{Login,Dashboard}.tsx
│     ├─ App.tsx
│     └─ main.tsx
│
└─ mobile/                   # App Expo/React Native
   ├─ app/…
   ├─ src/api/{client,socket}.ts
   ├─ src/store/{auth,devices,deviceState}.ts
   ├─ constants/Colors.ts
   └─ components/ui.tsx
```

---

## Prérequis

* **Node.js** 18+ (ou 20), **npm** 9+
* **Python** 3.10+ (Agent)
* **Docker** + **Docker Compose** (pour DB)
* **Git**
* (Mobile) **Expo CLI** / Expo Go (Android/iOS)

---

## Démarrage rapide (TL;DR)

### 1) DB Postgres (Docker)

```bash
cd aura/aura-api
cat > docker-compose.yml <<'YML'
version: "3.9"
services:
  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: aura
    ports: ["5432:5432"]
    volumes: [db_data:/var/lib/postgresql/data]
  adminer:
    image: adminer
    ports: ["8080:8080"]
volumes:
  db_data:
YML

docker compose up -d
```

### 2) API

```bash
cd aura/aura-api
cp .env.example .env
npm i
npx prisma migrate dev
npm run dev
# http://127.0.0.1:3000/api/v1/health → {"status":"ok",...}
# Swagger: http://127.0.0.1:3000/docs
```

`.env` minimal :

```
PORT=3000
JWT_SECRET=changeme-super-secret
DATABASE_URL=postgresql://app:app@localhost:5432/aura?schema=public
```

### 3) Créer un utilisateur + device + récupérer la clé API

```bash
# register
curl -X POST http://127.0.0.1:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@aura.local","password":"Passw0rd!","firstName":"Admin","lastName":"Aura"}'

# login -> token
TOKEN=$(curl -s -X POST http://127.0.0.1:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@aura.local","password":"Passw0rd!"}' | sed -E 's/.*"accessToken":"([^"]+)".*/\1/')

# créer un device -> récupère apiKey (affichée UNE SEULE FOIS)
RESP=$(curl -s -X POST http://127.0.0.1:3000/api/v1/devices \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Miroir Salon"}')
echo "$RESP"
DEVICE_ID=$(echo "$RESP" | sed -E 's/.*"device":\{"id":"([^"]+)".*/\1/')
API_KEY=$(echo "$RESP"   | sed -E 's/.*"apiKey":"([^"]+)".*/\1/')
```

### 4) Agent (dev PC ou Pi)

```bash
cd aura/agent
python3 -m venv .venv && source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt  # voir fichier ci-dessous

cat > config.yaml <<EOF
api_url: "http://192.168.1.96:3000"   # ⚠️ mettre l'IP/host du serveur API (pas 127.0.0.1 si distant)
ws_path: "/socket.io"
namespace: "/agent"
device_id: "$DEVICE_ID"
api_key: "$API_KEY"
heartbeat_sec: 10
music_poll_sec: 1.0
sink_watch_sec: 0.3
EOF

sudo -E AURA_DEBUG=1 .venv/bin/python main.py
# ✅ attendu : "Connecté au hub /agent", puis logs POLL + SINK
```

### 5) Desktop

```bash
cd aura/desktop
npm i
npm run dev
```

---

## Backend API

**Stack** : Fastify (TS), Prisma (Postgres), JWT, Swagger (OpenAPI 3.0).

### Env (`aura-api/.env`)

```
PORT=3000
JWT_SECRET=changeme-super-secret
DATABASE_URL=postgresql://app:app@localhost:5432/aura?schema=public
```

### Prisma

```bash
cd aura/aura-api
npx prisma migrate dev
npx prisma studio
```

### Lancer

```bash
npm run dev   # tsx watch src/server.ts
```

### Routes principales (REST)

* **Health & Public**

    * `GET /api/v1/health`
    * `GET /api/v1/public/config`

* **Auth & Sessions**

    * `POST /api/v1/auth/register`
    * `POST /api/v1/auth/login`
    * `POST /api/v1/auth/refresh`
    * `POST /api/v1/auth/logout`
    * `GET /api/v1/me` / `PUT /api/v1/me`
    * `GET /api/v1/me/sessions` / `DELETE /api/v1/me/sessions/:id`

* **Devices (user)**

    * `GET /api/v1/devices`
    * `POST /api/v1/devices/pair`
    * `PUT /api/v1/devices/:deviceId`
    * `DELETE /api/v1/devices/:deviceId`
    * `GET /api/v1/devices/:deviceId/state` — snapshot global (leds, music, widgets)

* **Pairing (agent)**

    * `POST /api/v1/devices/:deviceId/pairing-token`
    * `POST /api/v1/devices/:deviceId/heartbeat`

* **LEDs**

    * `GET /api/v1/devices/:deviceId/leds`
    * `POST /api/v1/devices/:deviceId/leds/state`
    * `POST /api/v1/devices/:deviceId/leds/style`

* **Music**

    * `GET /api/v1/devices/:deviceId/music`
    * `POST /api/v1/devices/:deviceId/music/cmd`
    * `POST /api/v1/devices/:deviceId/music/volume`

* **Widgets**

    * `GET /api/v1/devices/:deviceId/widgets`
    * `PUT /api/v1/devices/:deviceId/widgets`

* **Audits & Admin**

    * `GET /api/v1/audits?...`
    * `GET /api/v1/admin/devices`
    * `GET /api/v1/admin/users`
    * `POST /api/v1/admin/devices/:id/revoke`

> Swagger : `http://<API_HOST>:3000/docs`

---

## Temps réel (SocketIO)

* **Path** : `/socket.io`
* **Namespace** : `/agent`
* **Rooms** : `deviceId`
* **Authentification**

    * **Agent** : headers `Authorization: ApiKey <clé>` + `x-device-id: <deviceId>`
    * **UI (Desktop/Mobile)** : JWT via `handshake.auth.token = "Bearer <JWT>"`

**Événements** :
`agent:register`, `agent:ack/nack`, `presence`,
`state:report` (agent→serveur),
`state:update` (serveur→UIs),
`leds:update`, `leds:state`, `leds:style`,
`music:cmd`, `music:update`, `music:volume`,
`widgets:update`, `state:apply`.

---

## Agent Matériel (Python)

### C’est quoi ?

Un **daemon** Python qui tourne sur le **Raspberry Pi** (ou un PC), s’authentifie auprès de l’API avec l’**ApiKey du device**, et **synchronise en continu** l’état **matériel** avec l’état **BDD** :

* **LEDs** : synchro immédiate via WS (`leds:*` & `state:apply`) + snapshot au boot.
* **Musique** : **double verrou** :

    * **POLL REST** périodique de la route `GET /devices/:id/state` (lit `music.status` & `music.volume` en BDD), puis applique si différent.
    * **WATCH local** du **sink** (via `pactl`), pour remonter tout changement de volume côté OS/boutons.

Chaque action est **loguée** : détection → récupération JSON → application (pactl/playerctl) → émission `state:report`.

### À quoi ça sert ?

* Assurer que **l’appareil reflète exactement la BDD** au démarrage **et** lors de toute modification (qu’elle vienne du mobile/desktop ou de l’OS local).
* Éviter les désynchronisations : même si un événement WS se perd, le **poll REST** rattrape; si l’utilisateur change le volume localement, le **watch** remonte l’info.

### Installation

Dans `agent/requirements.txt` :

```
python-socketio==5.11.3
websocket-client==1.8.0
requests==2.32.3
PyYAML==6.0.2
# LEDs réelles (optionnel si mock) :
rpi_ws281x==4.3.4
```

Installation :

```bash
cd aura/agent
python3 -m venv .venv && source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
```

### Configuration

`agent/config.yaml` :

```yaml
api_url: "http://192.168.1.96:3000"  # ⚠️ mettre l'IP/hostname réel de l'API (pas 127.0.0.1 si le hub est ailleurs)
ws_path: "/socket.io"
namespace: "/agent"
device_id: "<DEVICE_ID>"
api_key: "<API_KEY>"
heartbeat_sec: 10

# Musique
music_poll_sec: 1.0      # fréquence du poll REST musique (plus bas = plus réactif)
sink_watch_sec: 0.3      # fréquence du watch volume local (pactl)

# Boot
fallback_local_on_boot: false  # si vrai : applique l’état LEDs local si l’API est indisponible au boot
```

Variables d’environnement utiles :

* `AURA_DEBUG=1` : logs détaillés des commandes `pactl`/`playerctl` (RUN/OUT/ERR).
* `AURA_PULSE_SINK=<sink_name>` : force un sink spécifique (`pactl list short sinks`).
* LEDs : `AURA_LED_COUNT`, `AURA_MAX_HW_BRIGHTNESS`, etc.

### Lancement (dev)

```bash
cd aura/agent
sudo -E AURA_DEBUG=1 .venv/bin/python main.py
```

Attendu dans les logs :

* `✅ Connecté au hub /agent`
* À intervalle régulier : `🕑 POLL tick (every Xs)`, `🟦 RAW GET ... → 200`, `🔎 POLL tick → DB {...} • SINK {...}`
* En cas d’écart : `🔁 POLL APPLY volume DB X% → SINK Y%` puis `✅ POLL done: sink now X%`
* Si changement local : `👂 SINK change detected: ...`

### Spécificités de fonctionnement

**LEDs (référence côté serveur)**

1. Au boot : `GET /devices/:id/state` → `_apply_leds(...)` → `state:report`.
2. En temps réel : événements WS `leds:update/state/style` **ou** `state:apply` partiel → application immédiate + `state:report`.
3. Brightness : valeur **logique 0..100** plafonnée matériellement par `AURA_MAX_HW_BRIGHTNESS`.

**Musique (volume + status)**

1. Au boot : `GET /devices/:id/state` → applique `music.status` + `music.volume`.
2. **Poll REST** permanent (toutes `music_poll_sec` s) :

    * Compare `DB.music` avec l’état réel du **sink** (`pactl get-sink-volume` via `utils/music.py`).
    * Si différence de **volume** → `pactl set-sink-volume <db>%` → relecture réelle → `state:report`.
    * Si différence de **status** → `playerctl play/pause` → `state:report`.
3. **Watch local** (toutes `sink_watch_sec` s) :

    * Relit le **volume réel** ; si ça bouge (boutons, mixer…) → maj état + `state:report`.
4. Tous les chemins d’exécution sont **logués** (détection de la modif, récupération JSON, adaptation système).

**Exécution utilisateur (crucial)**

* `utils/music.py` exécute `pactl`/`playerctl` **dans la session utilisateur** (ex. `melvin`) :

    * Si root : `runuser -u melvin -- <cmd>` + `XDG_RUNTIME_DIR=/run/user/1000`.
    * Sinon : commande directe avec l’environnement courant.
* `get_state()` relit **toujours** le volume réel avant de renvoyer l’état.

### Service systemd (prod)

`/etc/systemd/system/aura-agent.service` :

```ini
[Unit]
Description=Aura Agent (hardware daemon)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/aura/agent
ExecStart=/opt/aura/agent/.venv/bin/python /opt/aura/agent/main.py
Restart=always
RestartSec=3
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
```

Déploiement :

```bash
sudo mkdir -p /opt/aura
sudo rsync -a ~/aura/agent/ /opt/aura/agent/
sudo systemctl daemon-reload
sudo systemctl enable --now aura-agent
journalctl -u aura-agent -f
```

### Tests & debug (agent)

**Vérifier la route BDD** :

```bash
curl -v \
  -H "Authorization: ApiKey <API_KEY>" \
  -H "x-device-id: <DEVICE_ID>" \
  http://<API_HOST>:3000/api/v1/devices/<DEVICE_ID>/state
```

**Watch du JSON `music`** :

```bash
watch -n 1 "curl -sS \
  -H 'Authorization: ApiKey <API_KEY>' \
  -H 'x-device-id: <DEVICE_ID>' \
  http://<API_HOST>:3000/api/v1/devices/<DEVICE_ID>/state | jq .music"
```

**Checklist si ça ne bouge pas** :

* `api_url` pointe bien vers l’**IP/host réel** (pas `127.0.0.1` si le hub est sur une autre machine).
* Logs de poll : `🟦 RAW GET ... → 200`.
* `AURA_DEBUG=1` montre `🟪 RUN: pactl ... ENV.XDG_RUNTIME_DIR=/run/user/1000`.
* Forcer le sink avec `AURA_PULSE_SINK`.

---

## UI Desktop (Electron)

**Stack** : Electron (main), React + Vite (renderer), Zustand, axios, socket.io-client.

En dev :

```bash
cd aura/desktop
cp .env.development.example .env.development   # VITE_API_URL=http://<API_HOST>:3000
npm i
npm run dev
```

---

## App Mobile (Expo)

**Stack** : Expo (React Native + TS), `expo-router`, Zustand, axios, socket.io-client.

**État** :

* Auth complète (register/login/refresh/logout), tokens persistés en **SecureStore**.
* Pages stylées (gradient Aurora), Home (devices), Device (LEDs/Music/Widgets + WS), Profile (édition).
* Sockets : `auth.token = "Bearer <JWT>"`, origin dérivé de `EXPO_PUBLIC_API_URL`.

Lancer :

```bash
cd mobile
npm i
npx expo install expo-secure-store expo-barcode-scanner expo-haptics expo-blur expo-linear-gradient
npm run start
```

---

## Docker & déploiement

### DB + Adminer

Voir docker-compose plus haut.

### Dockeriser l’API (optionnel)

```dockerfile
# aura-api/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

Build & run :

```bash
cd aura/aura-api
npm run build
docker build -t aura-api:latest .
docker run --rm -p 3000:3000 --env-file .env aura-api:latest
```

---

## Tests manuels utiles

* Santé API :

  ```bash
  curl http://<API_HOST>:3000/api/v1/health
  ```

* Mes devices :

  ```bash
  curl -H "Authorization: Bearer $TOKEN" \
    http://<API_HOST>:3000/api/v1/devices
  ```

* Émettre une commande LED (debug) :

  ```bash
  curl -X POST http://<API_HOST>:3000/__debug/emit \
    -H 'Content-Type: application/json' \
    -d '{"deviceId":"<DEVICE_ID>","event":"leds:update","payload":{"on":true,"color":"#00ff88","brightness":60}}'
  ```

---

## Sécurité & prod checklist

* [ ] **JWT\_SECRET** fort, secrets en variables d’env sécurisées
* [ ] **CORS** & **origins Socket.IO** limités
* [ ] **/\_\_debug/emit** désactivé en prod
* [ ] **Clés API devices** protégées (pas de logs en clair)
* [ ] **TLS** via reverse proxy
* [ ] **Backups** Postgres
* [ ] **Logs** + monitoring
* [ ] `prisma migrate deploy` au déploiement
* [ ] Firewall/rate limiting/headers sécurité

---

## Licence

Aura | Delorme Melvin.

---

### Notes complémentaires

* `utils/leds.py` : mapping **RGB** + plafond **matériel** de brightness.
* `utils/music.py` : `pactl`/`playerctl` en **session utilisateur** (via `runuser` si root), lecture **réelle** du volume.
* `main.py` : **poll REST musique** + **watch local** + **handlers WS** + **throttling** des `state:report`.
