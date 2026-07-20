## Flick Chat

Real-time chat app with Django backend, Flutter mobile client, and React web client.

### Structure
- `config/`, `apps/`: Django backend (auth, chat, notifications, file uploads)
- `flick_chat/client/`: Flutter mobile app
- `web/`: React + Vite web app

### Local setup (Windows)

**Backend**

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
& ".\flick_chat\backend\venv\Scripts\python.exe" manage.py migrate
& ".\flick_chat\backend\venv\Scripts\python.exe" manage.py runserver
```

**Web app**

```powershell
cd web
$env:NODE_OPTIONS="--use-system-ca"
npm install
npm run dev
```

Open http://localhost:5173

**Flutter app**

```powershell
cd flick_chat\client
flutter pub get
flutter run
```

For Android emulator, the API defaults to `http://10.0.2.2:8000`.

### Features
- JWT auth (register, login, refresh, logout)
- 1:1 and group chat (min 3 people)
- Real-time messaging via WebSockets (typing, presence, read receipts)
- Image/file sharing (upload up to 10 MB)
- In-app notifications + browser/mobile local alerts
- Push notifications via FCM when `FCM_SERVER_KEY` is set and device tokens are registered

### Environment variables

| Variable | Description |
|----------|-------------|
| `SECRET_KEY` | Django secret |
| `DEBUG` | `True`/`False` |
| `ALLOWED_HOSTS` | Comma-separated hosts |
| `DATABASE_URL` | Postgres URL |
| `REDIS_URL` | Redis URL (required for multi-instance WebSockets on Render) |
| `CSRF_TRUSTED_ORIGINS` | HTTPS origins for CSRF |
| `CORS_ALLOWED_ORIGINS` | Allowed web app origins |
| `FCM_SERVER_KEY` | Firebase Cloud Messaging server key (optional) |

Web app env (`web/.env`):
- `VITE_API_URL` — backend URL
- `VITE_WS_URL` — WebSocket URL (optional, derived from API URL)

### Deployment

**Render (backend)** — use `render.yaml` or configure manually:
- Build: `./build.sh`
- Start: `daphne -b 0.0.0.0 -p $PORT config.asgi:application`
- Set `DJANGO_SETTINGS_MODULE=config.settings.prod`
- Add Redis and set `REDIS_URL` for production WebSockets

**Vercel (web)** — live at https://web-rust-chi-91.vercel.app

After Render backend is deployed, set in Vercel project settings:
- `VITE_API_URL` = your Render URL
- `VITE_WS_URL` = `wss://your-render-url`

See [DEPLOY.md](DEPLOY.md) for full step-by-step instructions.

**Push notifications (Flutter APK)**
1. Create a Firebase project and add an Android app
2. Download `google-services.json` into `flick_chat/client/android/app/`
3. Set `FCM_SERVER_KEY` on the backend
4. Device tokens are registered via `POST /api/v1/auth/device-token/`

WebSocket endpoint: `ws://127.0.0.1:8000/ws/chat/?token=<access_token>`
