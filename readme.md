Voici le **README.md** complet, mis à jour avec tout ce qu’on a implémenté côté **Mobile** (Expo), la config, le flux d’auth, le gradient/aurora, le temps-réel, et quelques tips de debug.

---

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
│  ├─ main.py                # client Socket.IO + heartbeat
│  └─ utils/
│     ├─ leds.py             # stub (remplacer par driver rpi_ws281x)
│     ├─ music.py            # stub
│     └─ state.py            # snapshot d’état
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
└─ mobile/                   # App Expo/React Native (ce dépôt)
   ├─ app/…                  # routeur expo-router
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
```

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

* **Weather**

    * `GET /api/v1/weather?city=...`

* **Audits & Admin**

    * `GET /api/v1/audits?deviceId=&type=&limit=`
    * `GET /api/v1/admin/devices`
    * `GET /api/v1/admin/users`
    * `POST /api/v1/admin/devices/:id/revoke`

> Swagger complet : [http://127.0.0.1:3000/docs](http://127.0.0.1:3000/docs)

---

## Temps réel (SocketIO)

* **Path** : `/socket.io`
* **Namespace** : `/agent`
* **Rooms** : `deviceId`
* **Authentification** :

    * **Agent** : header `Authorization: ApiKey <clé>` + `x-device-id: <deviceId>`
    * **UI (Desktop/Mobile)** : JWT via `handshake.auth.token = "Bearer <JWT>"`

**Événements gérés** :

* `agent:register` — agent s’identifie
* `ui:join` — UI rejoint un deviceId
* `agent:ack` / `agent:nack` — retours d’exécution
* `state:report` (agent → serveur)
* `state:update` (serveur → UIs)
* `leds:update` (serveur → agent)
* `music:cmd` (serveur → agent)
* `widgets:update` (serveur → agent)
* `presence` (serveur → UIs) — online/offline

---

## Agent Matériel (Python)

**But** : tourner en tâche de fond, recevoir commandes, piloter matériel, renvoyer l’état.

### Installation (Pi/PC)

```bash
cd aura/agent
python3 -m venv .venv && source .venv/bin/activate
pip install "python-socketio[client]" websocket-client requests PyYAML
```

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
cp .env.development.example .env.development   # VITE_API_URL=http://127.0.0.1:3000
npm i
npm run dev
```

* Login (JWT)
* Choisir un **device**
* Contrôles LEDs/Musique/Widgets
* Reçoit `state:update` et `agent:ack/nack` en temps réel

---

## App Mobile (Expo)

**Stack** : Expo (React Native + TS), `expo-router`, Zustand, axios, socket.io-client.

### État fonctionnel actuel

* **Auth complète** : `register`, `login`, **refresh automatique** (interceptor axios), `logout` (révocation côté API si refresh token dispo + purge locale).
* **Tokens persistés** via **expo-secure-store**.
* **Navigation** : layout tabs `(Home, Profile)` avec **fond gradient Aurora** cohérent (dégradés + blobs) sur toutes les pages (Home, Device, Profile, Login, Register).
* **Home** : liste des devices (`GET /devices`), badge **online/offline**, skeletons, bouton flottant **+** (pairing à venir).
* **Device detail** : snapshot initial (`/devices/:id/state`), **WebSocket /agent** avec auth JWT dans `handshake.auth.token`, ACK/heartbeat/presence gérés, LEDs/Music/Widgets intégrés.
* **Profile** : affichage user, **édition prénom/nom** (PUT `/me`), **overlay bloquant** lors de la déconnexion.
* **Styles** : **GlassCard** + **PrimaryButton** + palette violets/cyans, overlay modal lisible (fond `rgba(0,0,0,0.8)`), contenus ne passent pas sous le header.

> Prochaines bribes (non bloquantes pour la démo) : sessions utilisateur, pairing QR, audits timeline, reorder widgets “propre”.

### Arbo mobile (résumé)

```
mobile/
├─ app/
│  ├─ _layout.tsx                 # boot + SafeAreas + Root stack
│  ├─ (auth)/{login,register}.tsx # écrans auth stylés Aurora
│  ├─ (tabs)/
│  │  ├─ _layout.tsx              # Tabs + TabBar custom + fond transparent
│  │  ├─ index.tsx                # Home (devices)
│  │  └─ profile.tsx              # Profil (édition, logout)
│  └─ device/[id].tsx             # Détail device (LEDs/Music/Widgets + WS)
├─ src/
│  ├─ api/{client.ts,socket.ts}
│  ├─ lib/{env.ts,token.ts,types.ts}
│  └─ store/{auth.ts,devices.ts,deviceState.ts}
├─ components/{ui.tsx, AuroraTabBar.tsx, ...}
└─ constants/Colors.ts
```

### Environnement & configuration

**.env.development** (ex.) :

```
EXPO_PUBLIC_API_URL=http://192.168.1.96:3000
EXPO_PUBLIC_WEB_URL=http://192.168.1.96:3000
EXPO_PUBLIC_ENV=development
```

**`src/lib/env.ts`** construit `API_BASE = ${API_URL}/api/v1`.

**Android** (`app.json`) :

```json
{
  "expo": {
    "android": {
      "edgeToEdgeEnabled": true,
      "adaptiveIcon": {
        "backgroundColor": "#ffffff"
      }
    }
  }
}
```

### Lancer

```bash
cd mobile
npm i
npx expo install expo-secure-store expo-barcode-scanner expo-haptics expo-blur expo-linear-gradient
npm run start  # expo start -c
```

* Ouvrir dans **Expo Go** (Android/iOS).
* Assurez-vous que le **téléphone voit l’IP LAN** de l’API (éviter 127.0.0.1).
* **Sockets** : le client calcule l’origin WS depuis `API_BASE` (retire `/api/vX`) et se connecte à `ws://<origin>/agent` avec `auth.token = "Bearer <JWT>"`.

### Auth côté mobile (détails)

* `src/api/client.ts` : axios + interceptors

    * injecte `Authorization: Bearer <accessToken>` sur chaque requête
    * si `401`, tente `/auth/refresh` avec `refreshToken` (SecureStore)
    * en cas d’échec → purge tokens + rejet
* `src/lib/token.ts` : persistance **access/refresh** en SecureStore (mémoire + disque)
* `src/store/auth.ts` :

    * `init()` charge les tokens puis tente `/me` (si OK → user en mémoire)
    * `login()` / `register()` stockent `tokens`, puis `fetchMe()`
    * `logout()` appelle `/auth/logout` (best effort) puis purge locale

### Tips & debug

* **Require cycle** `auth.ts -> client.ts -> auth.ts` : **sans impact** (nous avons supprimé la dépendance réciproque critique en exposant `useAuth().accessToken` uniquement côté socket).
* **Android & LAN** : utiliser l’IP **du PC en Wi-Fi** (ex. `192.168.1.x`), même réseau que le téléphone.
* **CORS / WS** : côté API, vérifier `cors` & `allowRequest`/`origins` pour Socket.IO si vous serrez la prod.

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
* [ ] **Clés API devices** : jamais stockées en clair (hash/bcrypt côté DB si conservées)
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
* L’UI (Mobile/Desktop) transmet le JWT via `handshake.auth.token`.
