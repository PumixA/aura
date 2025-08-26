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
│  │     ├─ audit\_admin.ts   # audit & administration
│  │     ├─ health.ts
│  │     └─ public.ts        # config publique (feature flags)
│  └─ prisma/schema.prisma
│
├─ agent/                    # Daemon Python (Pi)
│  ├─ config.yaml            # api\_url, device\_id, api\_key, …
│  ├─ main.py                # client Socket.IO + heartbeat
│  └─ utils/
│     ├─ leds.py             # stub (remplacer par driver rpi\_ws281x)
│     ├─ music.py            # stub
│     └─ state.py            # snapshot d’état
│
└─ desktop/                  # UI Electron + React + Vite
├─ electron/
│  ├─ main.cjs            # process principal Electron
│  └─ preload.cjs         # API exposée au renderer
├─ src/
│  ├─ api/client.ts       # axios + JWT
│  ├─ socket.ts           # socket.io-client (auth via handshake.auth)
│  ├─ store/{auth,ui}.ts
│  ├─ components/{DevicePicker,LedPanel,MusicPanel}.tsx
│  ├─ pages/{Login,Dashboard}.tsx
│  ├─ App.tsx
│  └─ main.tsx
├─ .env.development       # VITE\_API\_URL=[http://127.0.0.1:3000](http://127.0.0.1:3000)
├─ package.json
└─ vite.config.ts

````

> L’app **mobile** (Expo) vit dans `mobile/` quand créée (non montrée ci-dessus).

---

## Prérequis

* **Node.js** 18+ (ou 20), **npm** 9+
* **Python** 3.10+ (Agent)
* **Docker** + **Docker Compose** (pour DB)
* **Git** (déploiement & versions)
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
````

### 2) API

```bash
cd aura/aura-api
cp .env.example .env  # crée-le si besoin, voir plus bas
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
# register (une fois)
curl -X POST http://127.0.0.1:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@aura.local","password":"Passw0rd!","firstName":"Admin","lastName":"Aura"}'

# login -> token
TOKEN=$(curl -s -X POST http://127.0.0.1:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@aura.local","password":"Passw0rd!"}' | sed -E 's/.*"accessToken":"([^"]+)".*/\1/')

# créer un device -> récupère apiKey (montrée UNE SEULE FOIS)
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
pip install "python-socketio[client]" websocket-client requests PyYAML

cat > config.yaml <<EOF
api_url: "http://127.0.0.1:3000"
ws_path: "/socket.io"
namespace: "/agent"
device_id: "$DEVICE_ID"
api_key: "$API_KEY"
heartbeat_sec: 20
EOF

python main.py
# ✅ attendu : "Connecté /agent"
```

### 5) Desktop

```bash
cd aura/desktop
npm i
npm run dev
# Fenêtre Electron plein écran -> Login -> Choisir device -> Piloter
```

> (Mobile) voir section dédiée plus bas.

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
npx prisma migrate dev      # migrations locales
npx prisma studio           # GUI si besoin
```

### Lancer

```bash
npm run dev   # tsx watch src/server.ts
```

### Routes principales (REST)

* **Health & Public**

    * `GET /api/v1/health` — statut API
    * `GET /api/v1/public/config` — config publique & feature flags

* **Auth & Sessions**

    * `POST /api/v1/auth/register`
    * `POST /api/v1/auth/login`
    * `POST /api/v1/auth/refresh`
    * `POST /api/v1/auth/logout`
    * `GET /api/v1/me`
    * `PUT /api/v1/me`
    * `GET /api/v1/me/sessions`
    * `DELETE /api/v1/me/sessions/:sessionId`

* **Devices (user)**

    * `GET /api/v1/devices` — mes devices
    * `POST /api/v1/devices/pair` — appairer un device avec token
    * `PUT /api/v1/devices/:deviceId` — rename
    * `DELETE /api/v1/devices/:deviceId` — suppression
    * `GET /api/v1/devices/:deviceId/state` — snapshot global (leds, music, widgets)

* **Pairing (agent)**

    * `POST /api/v1/devices/:deviceId/pairing-token` — générer/rafraîchir un token de pairing
    * `POST /api/v1/devices/:deviceId/heartbeat` — signal de vie (maj online/lastSeenAt)

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

* **Weather**

    * `GET /api/v1/weather?city=...`

* **Audits & Admin**

    * `GET /api/v1/audits?deviceId=&type=&limit=`
    * `GET /api/v1/admin/devices`
    * `GET /api/v1/admin/users`
    * `POST /api/v1/admin/devices/:id/revoke`

> Swagger complet : [http://127.0.0.1:3000/docs](http://127.0.0.1:3000/docs)

````
```markdown
---
## Temps réel (SocketIO)

* **Path** : `/socket.io`
* **Namespace** : `/agent`
* **Rooms** : `deviceId`
* **Authentification** :
  * **Agent** : header `Authorization: ApiKey <clé>` + `x-device-id: <deviceId>`
  * **UI (Desktop/Mobile)** : JWT via `handshake.auth.token = "Bearer <JWT>"` ou header

**Événements gérés** :

* `agent:register` — agent s’identifie
* `ui:join` — UI rejoint un deviceId
* `ack` / `nack` — retour d’exécution
* `state:report` (agent → serveur) → état actuel
* `state:update` (serveur → UIs) — broadcast état vers clients
* `leds:update` (serveur → agent) — commande LEDs
* `music:cmd` (serveur → agent) — commande musique
* `widgets:update` (serveur → agent) — maj widgets

---

## Agent Matériel (Python)

**But** : tourner en tâche de fond, recevoir commandes, piloter matériel, renvoyer l’état.

### Installation (Pi/PC)

```bash
cd aura/agent
python3 -m venv .venv && source .venv/bin/activate
pip install "python-socketio[client]" websocket-client requests PyYAML
````

`config.yaml` :

```yaml
api_url: "http://192.168.1.xxx:3000"
ws_path: "/socket.io"
namespace: "/agent"
device_id: "ID_DEVICE"
api_key: "CLE_API"
heartbeat_sec: 20
```

Lancer :

```bash
python main.py
```

### Service systemd (prod Pi)

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

> Pour LEDs réelles : remplacer `utils/leds.py` par un driver `rpi_ws281x`.

---

## UI Desktop (Electron)

**Stack** : Electron (main), React + Vite (renderer), Zustand, axios, socket.io-client.

### En dev

```bash
cd aura/desktop
cp .env.development.example .env.development   # ou crée-le
# VITE_API_URL=http://127.0.0.1:3000
npm i
npm run dev
```

* Login (JWT)
* Choisir un **device**
* Contrôles LEDs/Musique/Widgets
* Reçoit `state:update` et `agent:ack/nack` en temps réel

---

## App Mobile (Expo)

**Stack** : Expo (React Native + TS), `expo-router`, Zustand, axios.

### Setup

```bash
cd aura/mobile
npm i
# env
echo 'EXPO_PUBLIC_API_URL=http://192.168.1.xxx:3000' > .env.development
echo 'EXPO_PUBLIC_ENV=development' >> .env.development

# dépendances clés
npx expo install expo-secure-store
npx expo install expo-barcode-scanner
```

**Démarrer** :

```bash
npm run start   # expo start -c
```

* Scanner le QR avec **Expo Go** (Android) ou ouvrir sur iOS
* Si web : prévoir un adaptateur SecureStore (fallback mémoire)

**Écrans visés** :

* Auth (login/register)
* Dashboard (devices)
* Device detail (LEDs, musique, widgets, météo)
* Profil/Préférences

---

## Docker & déploiement

### DB + Adminer

Voir `docker-compose.yml` plus haut.

### Dockeriser l’API (optionnel)

`aura-api/Dockerfile` :

```dockerfile
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
docker run --rm -p 3000:3000 --env-file .env --network host aura-api:latest
```

> En prod, placer l’API derrière un reverse proxy (Nginx/Caddy) avec **WebSocket** autorisé (`Upgrade: websocket`), HTTPS, et CORS limité.

### Desktop en prod

* Builder l’UI (`npm run build:ui`) puis lancer `electron .` en mode prod
* Mode kiosk au boot : service systemd qui lance `npm run start`

### Agent en prod

* Voir **systemd** ci-dessus
* Variables réseau stables (IP statique ou mDNS)

---

## Tests manuels utiles

* Santé API :

  ```bash
  curl http://127.0.0.1:3000/api/v1/health
  ```

* Lister mes devices :

  ```bash
  curl -H "Authorization: Bearer $TOKEN" \
    http://127.0.0.1:3000/api/v1/devices
  ```

* Rotation clé API :

  ```bash
  curl -X POST http://127.0.0.1:3000/api/v1/devices/$DEVICE_ID/apikey/rotate \
    -H "Authorization: Bearer $TOKEN"
  ```

* Émettre une commande LED (dev only) :

  ```bash
  curl -X POST http://127.0.0.1:3000/__debug/emit \
    -H 'Content-Type: application/json' \
    -d '{"deviceId":"'"$DEVICE_ID"'","event":"leds:update","payload":{"on":true,"color":"#00ff88","brightness":60}}'
  ```

---

## Sécurité & prod checklist

* [ ] **JWT\_SECRET** fort et stocké en secret
* [ ] **CORS** et **origins Socket.IO** limités
* [ ] **/\_\_debug/emit** désactivé en prod
* [ ] \*\*Clés API


devices\*\* : jamais stockées en clair (hash bcrypt)

* [ ] **TLS** (HTTPS) via proxy
* [ ] **Backups** réguliers de Postgres
* [ ] **Logs** + monitoring
* [ ] **Prisma migrate deploy** au déploiement
* [ ] **Firewall** strict
* [ ] **Rate limiting** et **headers sécurité**

---

## Licence

Aura | Delorme Melvin.

---

### Notes

* `realtime.ts` gère les WS.
* `devices.ts` gère ApiKey par device.
* `control.ts` sert de relais REST → WS.
* L’agent authentifie via **`Authorization: ApiKey <clé>`** + header `x-device-id`.
* L’UI transmet le JWT via `handshake.auth.token`.
