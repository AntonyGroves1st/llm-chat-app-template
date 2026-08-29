@echo off
setlocal EnableExtensions
REM Full Tsunami Red Alerts APK builder for Windows.
REM Requires JDK 17+. Downloads Android SDK command-line tools if missing.

cd /d "%~dp0"

where java >nul 2>nul
if errorlevel 1 (
  echo Java is required. Install JDK 17+ and add it to PATH.
  exit /b 1
)

if "%ANDROID_SDK_ROOT%"=="" (
  if not "%ANDROID_HOME%"=="" (
    set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
  ) else (
    set "ANDROID_SDK_ROOT=%cd%\android\.sdk"
  )
)
set "ANDROID_HOME=%ANDROID_SDK_ROOT%"

if not exist "%ANDROID_SDK_ROOT%\cmdline-tools\latest\bin\sdkmanager.bat" (
  echo Installing Android command-line tools into %ANDROID_SDK_ROOT%
  mkdir "%ANDROID_SDK_ROOT%" 2>nul
  powershell -NoProfile -Command ^
    "Invoke-WebRequest -UseBasicParsing -Uri 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip' -OutFile '%TEMP%\commandlinetools-win.zip'"
  powershell -NoProfile -Command ^
    "Expand-Archive -Force '%TEMP%\commandlinetools-win.zip' '%TEMP%\commandlinetools-win'"
  mkdir "%ANDROID_SDK_ROOT%\cmdline-tools" 2>nul
  if exist "%ANDROID_SDK_ROOT%\cmdline-tools\latest" rmdir /s /q "%ANDROID_SDK_ROOT%\cmdline-tools\latest"
  move "%TEMP%\commandlinetools-win\cmdline-tools" "%ANDROID_SDK_ROOT%\cmdline-tools\latest"
)

set "SDKMANAGER=%ANDROID_SDK_ROOT%\cmdline-tools\latest\bin\sdkmanager.bat"
echo y| "%SDKMANAGER%" --sdk_root="%ANDROID_SDK_ROOT%" --licenses
call "%SDKMANAGER%" --sdk_root="%ANDROID_SDK_ROOT%" platform-tools "platforms;android-34" "build-tools;34.0.0"

> "%cd%\android\local.properties" echo sdk.dir=%ANDROID_SDK_ROOT:\=\\%

if not exist "%cd%\android\gradle\wrapper\gradle-wrapper.jar" (
  echo Downloading Gradle wrapper jar
  powershell -NoProfile -Command ^
    "Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/gradle/gradle/v8.7.0/gradle/wrapper/gradle-wrapper.jar' -OutFile '%cd%\android\gradle\wrapper\gradle-wrapper.jar'"
)

if exist "%cd%\android\app\src\main\assets" rmdir /s /q "%cd%\android\app\src\main\assets"
mkdir "%cd%\android\app\src\main\assets"
xcopy /e /i /y "%cd%\public\*" "%cd%\android\app\src\main\assets\" >nul

pushd android
call gradlew.bat --no-daemon assembleDebug
if errorlevel 1 (
  popd
  exit /b 1
)
popd

if not exist artifacts mkdir artifacts
copy /y "android\app\build\outputs\apk\debug\app-debug.apk" "artifacts\TsunamiRedAlerts-debug.apk"
echo APK ready: %cd%\artifacts\TsunamiRedAlerts-debug.apk
dir "artifacts\TsunamiRedAlerts-debug.apk"
endlocal
