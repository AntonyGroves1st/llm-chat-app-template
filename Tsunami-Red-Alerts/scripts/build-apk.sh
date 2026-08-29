#!/usr/bin/env bash
# Full Tsunami Red Alerts APK builder.
# Installs a local Android SDK if needed, syncs the web UI, and builds an APK.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SDK_DIR="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$ROOT/android/.sdk}}"
BUILD_TYPE="debug"
while [[ $# -gt 0 ]]; do
	case "$1" in
		--release) BUILD_TYPE="release"; shift ;;
		--sdk-dir) SDK_DIR="$2"; shift 2 ;;
		*) echo "Unknown option: $1" >&2; exit 1 ;;
	esac
done

if ! command -v java >/dev/null 2>&1; then
	echo "Java is required. Install a JDK 17+ and retry." >&2
	exit 1
fi

mkdir -p "$SDK_DIR"
export ANDROID_SDK_ROOT="$SDK_DIR"
export ANDROID_HOME="$SDK_DIR"

SDKMANAGER=""
if [[ -x "$SDK_DIR/cmdline-tools/latest/bin/sdkmanager" ]]; then
	SDKMANAGER="$SDK_DIR/cmdline-tools/latest/bin/sdkmanager"
elif command -v sdkmanager >/dev/null 2>&1; then
	SDKMANAGER="$(command -v sdkmanager)"
fi

if [[ -z "$SDKMANAGER" ]]; then
	echo "Installing Android command-line tools into $SDK_DIR"
	TMP_ZIP="$(mktemp -t commandlinetools.XXXXXX.zip)"
	curl -L --fail --retry 3 -o "$TMP_ZIP" \
		"https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
	TMP_DIR="$(mktemp -d)"
	unzip -q "$TMP_ZIP" -d "$TMP_DIR"
	mkdir -p "$SDK_DIR/cmdline-tools"
	rm -rf "$SDK_DIR/cmdline-tools/latest"
	mv "$TMP_DIR/cmdline-tools" "$SDK_DIR/cmdline-tools/latest"
	rm -rf "$TMP_DIR" "$TMP_ZIP"
	SDKMANAGER="$SDK_DIR/cmdline-tools/latest/bin/sdkmanager"
fi

yes | "$SDKMANAGER" --sdk_root="$SDK_DIR" --licenses >/dev/null || true
"$SDKMANAGER" --sdk_root="$SDK_DIR" \
	"platform-tools" \
	"platforms;android-34" \
	"build-tools;34.0.0"

printf 'sdk.dir=%s\n' "$SDK_DIR" > "$ROOT/android/local.properties"

WRAPPER_JAR="$ROOT/android/gradle/wrapper/gradle-wrapper.jar"
if [[ ! -f "$WRAPPER_JAR" ]]; then
	echo "Downloading Gradle wrapper jar"
	curl -L --fail --retry 3 -o "$WRAPPER_JAR" \
		"https://raw.githubusercontent.com/gradle/gradle/v8.7.0/gradle/wrapper/gradle-wrapper.jar"
fi

bash "$ROOT/scripts/sync-android-assets.sh"
chmod +x "$ROOT/android/gradlew"

TASK="assembleDebug"
OUTPUT_APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
ARTIFACT="$ROOT/artifacts/TsunamiRedAlerts-debug.apk"
if [[ "$BUILD_TYPE" == "release" ]]; then
	TASK="assembleRelease"
	OUTPUT_APK="$ROOT/android/app/build/outputs/apk/release/app-release-unsigned.apk"
	if [[ -f "$ROOT/android/keystore/release.jks" ]]; then
		OUTPUT_APK="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
	fi
	ARTIFACT="$ROOT/artifacts/TsunamiRedAlerts-release.apk"
fi

(
	cd "$ROOT/android"
	./gradlew --no-daemon "$TASK"
)

mkdir -p "$ROOT/artifacts"
if [[ ! -f "$OUTPUT_APK" ]]; then
	echo "Gradle finished but APK was not found at $OUTPUT_APK" >&2
	exit 1
fi
cp "$OUTPUT_APK" "$ARTIFACT"
echo "APK ready: $ARTIFACT"
ls -lh "$ARTIFACT"
