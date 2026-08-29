# Tsunami Red Alerts

**New app folder:** [`Tsunami-Red-Alerts/`](Tsunami-Red-Alerts/). Put it on the G: drive root as `G:\Tsunami-Red-Alerts` (not inside `race1`). Then run `Start-App.bat` or `Build-Tsunami-APK.bat`.

Live tsunami warning dashboard on Cloudflare Workers. The app watches official NWS, USGS, and tsunami.gov feeds, opens a full red-alert screen when a warning is in effect, and keeps a closeable tab so you can dismiss the overlay without losing the alert.

## Features

- Red-alert overlay with a close tab and a reopen strip
- `/api/alerts` — NWS tsunami products plus PTWC/NTWC bulletins
- `/api/earthquakes` — USGS magnitude 4.5+ and significant quakes
- `/api/news` — tsunami and coastal earthquake news
- `/api/updates` — combined chronological feed
- `/api/status` and `/api/feed` — threat level and full snapshot
- Safety chat via Workers AI (`/api/chat`)

This app is **not** a substitute for local emergency alerts. Official sources remain [tsunami.gov](https://www.tsunami.gov/), [NWS alerts](https://api.weather.gov/alerts/active?event=Tsunami), and [USGS earthquakes](https://earthquake.usgs.gov/).

## Development

```bash
npm install
npm test
npm run dev
```

Local server: http://localhost:8787

Preview the red-alert screen even when no warning is active:

- UI: **Preview red alert**
- API: `/api/feed?preview=1`

## API

| Endpoint | Description |
| --- | --- |
| `GET /api/status` | Current threat level and red-alert flag |
| `GET /api/alerts` | Normalized tsunami products |
| `GET /api/earthquakes` | Recent USGS events |
| `GET /api/news` | Tsunami-related news |
| `GET /api/updates` | Combined news, alerts, and quake updates |
| `GET /api/feed` | Full snapshot used by the dashboard |
| `POST /api/chat` | Streaming safety assistant |

## Android APK

Full APK builder (downloads the Android SDK if needed):

```bash
npm run apk
```

On Windows, use your JDK 21 folder (`Java\latest\jdk-21`, the one with `bin\javac.exe`) and run:

```bat
Build-Tsunami-APK.bat
```

Do not point Java at the nested `jdk-25.0.2.10-hotspot` folder. The builder prefers JDK 21 automatically.

The APK is written to `artifacts/TsunamiRedAlerts-debug.apk`. See [ANDROID.md](ANDROID.md) for Android Studio, signing, and release builds.

## Deploy

```bash
npm run deploy
```
