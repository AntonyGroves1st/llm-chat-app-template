# Tsunami Red Alerts APK builder

This repo includes a full Android package and a one-command APK builder. The APK wraps the dashboard in a WebView and talks to NWS, USGS, and tsunami.gov directly, so you do not need Cloudflare Workers to get live alerts.

## One-command build

### Windows

```bat
Build-Tsunami-APK.bat
```

The builder looks for **JDK 21** first, including the `Java\latest\jdk-21` folder (the one that contains `bin\`, `lib\`, and `javac.exe`). That is the folder to use.

Do **not** set `JAVA_HOME` to the nested `jdk-25.0.2.10-hotspot` directory. Gradle 8.7 in this project runs on JDK 17–22. If detection fails:

```bat
set JAVA_HOME=C:\Program Files\Java\latest\jdk-21
Build-Tsunami-APK.bat
```

Use your real path if `Java\latest\jdk-21` lives on another drive.

### Linux / macOS / this repo

```bash
npm run apk
```

or:

```bash
bash scripts/build-apk.sh
```

Release build (unsigned unless you add a keystore):

```bash
bash scripts/build-apk.sh --release
```

The finished file is copied to:

```
artifacts/TsunamiRedAlerts-debug.apk
```

The builder will:

1. Use JDK 17–22, preferring `Java\latest\jdk-21`
2. Download Android command-line tools into `android/.sdk` if no SDK is installed
3. Accept SDK licenses and install `android-34` + build-tools
4. Copy `public/` into the Android assets folder
5. Run Gradle `assembleDebug`

## Android Studio

1. Open the `android/` folder
2. Let Gradle sync
3. Run the `app` configuration on an emulator or device

If Studio asks for an SDK, point it at your existing Android SDK or the generated `android/.sdk` directory.

## Signing a release APK

Create `android/keystore/release.jks` and set these environment variables before `scripts/build-apk.sh --release`:

- `TSUNAMI_STORE_PASSWORD`
- `TSUNAMI_KEY_ALIAS`
- `TSUNAMI_KEY_PASSWORD`

Without a keystore, the release task still produces an unsigned APK for sideload testing after you sign it yourself.

## What the APK includes

- Red-alert overlay with close tab
- Live `/api/alerts`, `/api/earthquakes`, `/api/news`, `/api/updates`, `/api/feed`
- Preview red-alert mode
- Safety-chat fallback message (full LLM chat stays on the Workers deploy)
