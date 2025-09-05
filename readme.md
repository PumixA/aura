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
│  │  ├─ server.ts           # Boot Fastify + Swagger + Prisma + Realtime
│  │  ├─ realtime.ts         # Socket.IO (/agent), auth ApiKey/JWT
│  │  ├─ plugins/prisma.ts
│  │  └─ routes/
│  │     ├─ auth.ts
│  │     ├─ me.ts
│  │     ├─ devices.ts       # CRUD, state, owner, unpair (nouveau)
│  │     ├─ control.ts
│  │     ├─ pairing.ts       # pairing-token & heartbeat
│  │     ├─ weather.ts
│  │     ├─ audit_admin.ts
│  │     ├─ health.ts
│  │     └─ public.ts
│  └─ prisma/schema.prisma
│
├─ agent/                    # Daemon Python (Pi)
│  ├─ config.yaml
│  ├─ main.py
│  └─ utils/{leds.py,music.py,state.py}
│
├─ desktop/                  # UI Electron + React + Vite
│  ├─ electron/{main.cjs,preload.cjs}
│  └─ src/
│     ├─ api/{client.ts,device.ts}
│     ├─ components/{LedPanel.tsx,MusicPanel.tsx,OwnerPanel.tsx}
│     ├─ pages/{Dashboard.tsx,Home.tsx}
│     ├─ App.tsx
│     ├─ main.tsx
│     ├─ index.css           # styles globaux (importé par main.tsx)
│     └─ App.css
│
└─ mobile/                   # App Expo/React Native
   ├─ app/
   │  ├─ (auth)/{_layout.tsx,login.tsx,register.tsx}
   │  ├─ (tabs)/{_layout.tsx,index.tsx,profile.tsx}
   │  ├─ device/[id].tsx
   │  ├─ index.tsx
   │  ├─ _layout.tsx
   │  ├─ +not-found.tsx
   │  └─ pair-qr.tsx         # Scan QR only (nouveau visuel)
   ├─ src/api/{client.ts,socket.ts,authBridge.ts}
   ├─ src/store/{auth.ts,devices.ts,deviceState.ts}
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
pip install -r requirements.txt

cat > config.yaml <<EOF
api_url: "http://192.168.1.96:3000"   # ⚠️ IP/host du serveur API réel
ws_path: "/socket.io"
namespace: "/agent"
device_id: "$DEVICE_ID"
api_key: "$API_KEY"
heartbeat_sec: 10
music_poll_sec: 1.0
sink_watch_sec: 0.3
EOF

sudo -E AURA_DEBUG=1 .venv/bin/python main.py
```

### 5) Desktop

```bash
cd aura/desktop
cp .env.development.example .env.development
# .env.development → VITE_API_URL=http://<API_HOST>:3000
#                    VITE_DEVICE_ID=<DEVICE_ID>
#                    VITE_API_KEY=<API_KEY>
npm i
npm run dev
```

---

## Backend API

**Stack** : Fastify (TS), Prisma (Postgres), JWT, Swagger (OpenAPI 3.0).

### Changements récents (importants)

* **Music volume** : le backend attend **`{ value: number }`** (et non `{ volume }`) sur `POST /devices/:id/music/volume`.
* **Pairing token étendu** : `POST /devices/:deviceId/pairing-token` (auth **ApiKey + x-device-id**) accepte en **body** `{ transfer?: boolean }`. Si `transfer=true`, le token autorise la **réassignation de propriétaire** lors de `/devices/pair`.
* **Owner (nouveau)** :
  `GET /devices/:deviceId/owner` — retourne `{ owner: { id,email,firstName,lastName } | null }`
  Auth **ApiKey+x-device-id** (agent/desktop) **ou** **JWT** du propriétaire.
* **Unpair (nouveau)** :
  `POST /devices/:deviceId/unpair` — met `ownerId=null, pairedAt=null` + audit `DEVICE_UNPAIRED`.
  Auth **ApiKey+x-device-id** (agent/desktop) **ou** **JWT** du propriétaire.

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
    * `POST /api/v1/devices/pair` (accepte tokens **transfer**)
    * `PUT /api/v1/devices/:deviceId`
    * `DELETE /api/v1/devices/:deviceId`
    * `GET /api/v1/devices/:deviceId/state`
    * `GET /api/v1/devices/:deviceId/owner` **(nouveau)**

* **Pairing (agent)**

    * `POST /api/v1/devices/:deviceId/pairing-token` (**transfer** optionnel)
    * `POST /api/v1/devices/:deviceId/heartbeat`
    * `POST /api/v1/devices/:deviceId/unpair` **(nouveau)**

* **LEDs**

    * `GET /api/v1/devices/:deviceId/leds`
    * `POST /api/v1/devices/:deviceId/leds/state`
    * `POST /api/v1/devices/:deviceId/leds/style`

* **Music**

    * `GET /api/v1/devices/:deviceId/music`
    * `POST /api/v1/devices/:deviceId/music/cmd`
    * `POST /api/v1/devices/:deviceId/music/volume` (**`{ value }`**)

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

Voir section d’origine : poll REST musique + watch local `pactl`, drivers LEDs, etc.
`requirements.txt` minimal :

```
python-socketio==5.11.3
websocket-client==1.8.0
requests==2.32.3
PyYAML==6.0.2
rpi_ws281x==4.3.4
```

---

## UI Desktop (Electron)

**Stack** : Electron (main), React + Vite (renderer), Zustand, axios.

### Environnement

`desktop/.env.development` :

```
VITE_API_URL=http://192.168.1.96:3000
VITE_DEVICE_ID=<DEVICE_ID>
VITE_API_KEY=<API_KEY>
VITE_MUSIC_POLL_SEC=1
```

### Dépendances

```bash
cd aura/desktop
npm i
npm run dev
```

### Points importants & changements

* **API client** (`src/api/client.ts`)

    * En-têtes par défaut **ApiKey + x-device-id** (mode agent/desktop).
* **Music volume** (`src/api/device.ts`)

    * `musicSetVolume(value: number)` envoie **`{ value }`** (conforme API).
* **Owner/Propriétaire** (`src/components/OwnerPanel.tsx`)

    * Affiche l’**owner** via `GET /devices/:id/owner`.
    * Bouton **Dissocier** → `POST /devices/:id/unpair` (ApiKey ou JWT propriétaire).
    * Bouton **Associer** → génère un **pairing-token** `transfer=true`, affiche un **QR** (texte `aura://pair?deviceId=...&token=...`) à scanner depuis le **mobile**.
* **Statut en ligne** (Dashboard)

    * Bandeau « En ligne / Hors ligne (vu il y a X) » calculé depuis `lastSeenAt` lorsque disponible via `/devices` côté mobile ou via heartbeat côté API (Desktop affiche online en header si `state` arrive régulièrement; ping manuel via refresh).
* **Styles/CSS**

    * Vérifie que `src/main.tsx` importe **`./index.css`** (sinon aucun style ne s’applique).
    * Palette simple, cartes, header lisible.

### Fichiers touchés côté Desktop

* `src/api/client.ts` (OK, version fournie)
* `src/api/device.ts` (OK, version fournie – **`{ value }`**)
* `src/components/OwnerPanel.tsx` (panel propriétaire / dissocier / QR)
* `src/components/MusicPanel.tsx` (inchangé côté API, envoie `{ value }` via `musicSetVolume`)
* `src/pages/Dashboard.tsx` (affichage online + OwnerPanel + petites améliorations UI)
* `src/index.css` + `src/App.css` (styles globaux)
* `src/main.tsx` (assure `import './index.css'`)

---

## App Mobile (Expo)

**Stack** : Expo (React Native + TS), `expo-router`, Zustand, axios, socket.io-client.

### Dépendances ajoutées pour le scan

```bash
cd aura/mobile
npm i
npx expo install expo-camera expo-haptics expo-linear-gradient @expo/vector-icons
```

> iOS : ajoute `NSCameraUsageDescription` dans `app.json`.
> Android : la permission **CAMERA** est gérée automatiquement par Expo.

### Écran de scan QR (pairing)

* **`app/pair-qr.tsx`** lit uniquement un **QR** (via `expo-camera` / `CameraView`).
* Parsing :

    * JSON `{ deviceId, token }` **ou**
    * URL `aura://pair?deviceId=...&token=...`
* À la lecture valide → **POST `/devices/pair`** `{ deviceId, pairingToken: token }`, feedback haptique, **fetch** devices, **back**.
* Visuel aligné avec le reste (gradient Aurora, GlassCard, overlay de cadrage, torche, libellés).

### Fichiers touchés côté Mobile

* `app/pair-qr.tsx` (**refait** : scan only, visuel cohérent)
* `src/store/devices.ts` (aucune modif fonctionnelle si déjà `fetchDevices()`)
* `src/api/client.ts` (inchangé)
* `constants/Colors.ts`, `components/ui.tsx` (déjà existants pour le style)

### Lancement

```bash
cd aura/mobile
npm i
npm run start   # (ou npx expo start)
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

```bash
cd aura/aura-api
npm run build
docker build -t aura-api:latest .
docker run --rm -p 3000:3000 --env-file .env aura-api:latest
```

---

## Tests manuels utiles

**Santé API** :

```bash
curl http://<API_HOST>:3000/api/v1/health
```

**Mes devices (JWT)** :

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://<API_HOST>:3000/api/v1/devices
```

**Snapshot device (ApiKey + x-device-id)** :

```bash
curl -H "Authorization: ApiKey <API_KEY>" -H "x-device-id: <DEVICE_ID>" \
  http://<API_HOST>:3000/api/v1/devices/<DEVICE_ID>/state
```

**Owner (ApiKey ou JWT)** :

```bash
# ApiKey+x-device-id (desktop/agent)
curl -H "Authorization: ApiKey <API_KEY>" -H "x-device-id: <DEVICE_ID>" \
  http://<API_HOST>:3000/api/v1/devices/<DEVICE_ID>/owner

# JWT (propriétaire)
curl -H "Authorization: Bearer $TOKEN" \
  http://<API_HOST>:3000/api/v1/devices/<DEVICE_ID>/owner
```

**Unpair (ApiKey ou JWT propriétaire)** :

```bash
curl -X POST \
  -H "Authorization: ApiKey <API_KEY>" -H "x-device-id: <DEVICE_ID>" \
  http://<API_HOST>:3000/api/v1/devices/<DEVICE_ID>/unpair
```

**Pairing-token (transfer)** :

```bash
curl -X POST \
  -H "Authorization: ApiKey <API_KEY>" -H "x-device-id: <DEVICE_ID>" \
  -H "Content-Type: application/json" \
  -d '{"transfer":true}' \
  http://<API_HOST>:3000/api/v1/devices/<DEVICE_ID>/pairing-token
```

**Pair depuis Mobile (JWT)** :

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"deviceId":"<DEVICE_ID>", "pairingToken":"123456"}' \
  http://<API_HOST>:3000/api/v1/devices/pair
```

**Music volume** :

```bash
# ⚠️ payload = { "value": 35 } (pas "volume")
curl -X POST \
  -H "Authorization: ApiKey <API_KEY>" -H "x-device-id: <DEVICE_ID>" \
  -H "Content-Type: application/json" \
  -d '{"value":35}' \
  http://<API_HOST>:3000/api/v1/devices/<DEVICE_ID>/music/volume
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

* **Desktop** : si « aucun style », vérifier `import './index.css'` dans `src/main.tsx`.
* **Agent** : pour audio, exécuter `pactl`/`playerctl` dans la **session utilisateur** (voir variables `XDG_RUNTIME_DIR` et `runuser` si root).
* **Pairing via QR** : Desktop génère `aura://pair?deviceId=<id>&token=<token>` avec `transfer=true`; Mobile scanne et appelle `/devices/pair`.
