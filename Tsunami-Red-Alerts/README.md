# Tsunami Red Alerts

Complete standalone app. Copy this whole folder to:

`G:\race1\Tsunami-Red-Alerts`

It does not need Cloudflare or the old chat-template repo.

## What you get

- Red-alert overlay with a **close tab** and a reopen strip
- Live APIs for alerts, earthquakes, news, and updates
- Local web server (`Start-App.bat` or `npm start`)
- Full Android APK builder (`Build-Tsunami-APK.bat`)

Official sources: [tsunami.gov](https://www.tsunami.gov/), NWS, USGS. This app is not a substitute for local emergency alerts.

## Run the app (Windows)

1. Install [Node.js](https://nodejs.org/) if `node` is not on PATH
2. Double-click `Start-App.bat`
3. Browser opens `http://127.0.0.1:8787`
4. Click **Preview red alert** to test the close tab

## Build the APK (Windows)

Use JDK 21 from `Java\latest\jdk-21` (the folder that contains `bin\javac.exe`). Do not use nested `jdk-25`.

Double-click:

```
Build-Tsunami-APK.bat
```

APK output:

```
artifacts\TsunamiRedAlerts-debug.apk
```

## Linux / macOS

```bash
npm start
npm run apk
```

## APIs

| Endpoint | What it returns |
| --- | --- |
| `GET /api/status` | Threat level and red-alert flag |
| `GET /api/alerts` | NWS + PTWC/NTWC tsunami products |
| `GET /api/earthquakes` | USGS 4.5+ and significant quakes |
| `GET /api/news` | Tsunami hazard news |
| `GET /api/updates` | Combined timeline |
| `GET /api/feed` | Full dashboard snapshot |

Add `?preview=1` to force the red-alert overlay.
