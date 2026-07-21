# Deploy Flick Chat (Render + Vercel)

Follow these steps in order. Replace placeholder URLs with your real deployment URLs.

## 0. Prerequisites

- GitHub account
- [Render](https://render.com) account
- [Vercel](https://vercel.com) account

Push this project to GitHub first:

```powershell
cd "c:\Users\User\OneDrive\Zenara Jaya\Flick-chat"
git init
git add .
git commit -m "Prepare Flick Chat for deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USER/flick-chat.git
git push -u origin main
```

## 1. Deploy backend on Render

### Option A — Blueprint (recommended)

1. Open [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**
2. Connect your GitHub repo
3. Render reads `render.yaml` and creates:
   - Web service: `flick-chat-api`
   - Postgres database: `flick-chat-db`
4. After deploy starts, set these **Environment** variables on the web service:

| Variable | Example value |
|----------|---------------|
| `ALLOWED_HOSTS` | `flick-chat-api.onrender.com` |
| `SITE_URL` | `https://flick-chat-api.onrender.com` |
| `CSRF_TRUSTED_ORIGINS` | `https://flick-chat.vercel.app` |
| `CORS_ALLOWED_ORIGINS` | `https://flick-chat.vercel.app,http://localhost:5173` |

5. Optional: add a Render Redis instance and set `REDIS_URL` for multi-instance WebSockets.

6. Wait for deploy to finish. Test: `https://YOUR-API.onrender.com/admin/login/`

### Option B — Manual

| Setting | Value |
|---------|-------|
| Runtime | Python 3 |
| Build Command | `chmod +x build.sh && ./build.sh` |
| Start Command | `daphne -b 0.0.0.0 -p $PORT config.asgi:application` |
| Environment | `DJANGO_SETTINGS_MODULE=config.settings.prod` |

Attach a Postgres database and set `DATABASE_URL` (Render provides this automatically).

## 2. Deploy web app on Vercel

**Status:** Web app should be deployed at **https://flick-chat.vercel.app**

### Vercel project name (clean URL)

1. Open [Vercel Dashboard](https://vercel.com/dashboard) → your Flick Chat project
2. **Settings → General → Project Name** → set to `flick-chat`
3. **Settings → Domains** → confirm `flick-chat.vercel.app` is the **Production** domain

If `flick-chat.vercel.app` is already used by another Vercel project, delete or rename that project first, then assign the name to this repo.

If redeploying or setting env vars:

1. Open your project in the Vercel dashboard
2. **Settings → Environment Variables** — add:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://YOUR-API.onrender.com` |
| `VITE_WS_URL` | `wss://YOUR-API.onrender.com` |

6. Deploy

7. Copy your Vercel URL (e.g. `https://flick-chat.vercel.app`) and update Render env vars:
   - `CSRF_TRUSTED_ORIGINS=https://flick-chat.vercel.app`
   - `CORS_ALLOWED_ORIGINS=https://flick-chat.vercel.app`

8. Redeploy the Render service after updating CORS/CSRF.

## 3. Deploy via CLI (optional)

**Vercel**

```powershell
cd web
$env:NODE_OPTIONS="--use-system-ca"
npx vercel login
npx vercel --prod
```

Set `VITE_API_URL` and `VITE_WS_URL` in the Vercel project settings before deploying.

## 4. Flutter APK (production API)

Point the mobile app at your Render backend:

```powershell
cd flick_chat\client
flutter build apk --dart-define=API_BASE_URL=https://YOUR-API.onrender.com
```

## 5. Push notifications (optional)

1. Create a Firebase project → add Android app
2. Place `google-services.json` in `flick_chat/client/android/app/`
3. Set `FCM_SERVER_KEY` on Render
4. Rebuild the APK

## 6. Verify deployment

- [ ] Register a user on the Vercel web app
- [ ] Start a direct chat and send a message
- [ ] Create a group (3+ people)
- [ ] Confirm typing indicator and read receipts
- [ ] Upload an image or file
- [ ] Check notifications bell
- [ ] Test WebSocket: messages appear without refresh

## Notes

- Render free tier spins down after inactivity; first request may take ~30s.
- Uploaded files on Render use ephemeral disk and may be lost on redeploy. For production, use S3/Cloudinary later.
- Without `REDIS_URL`, WebSockets work on a single Render instance (fine for demos).
