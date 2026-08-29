@echo off
setlocal EnableExtensions
REM Full Tsunami Red Alerts APK builder for Windows.
REM Locates JDK 21 from Java\latest\jdk-21, then downloads the Android SDK if needed.

cd /d "%~dp0"

set "FOUND_JAVA="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\find-windows-jdk.ps1"`) do set "FOUND_JAVA=%%I"
if "%FOUND_JAVA%"=="" (
  echo.
  echo Could not find a JDK 17-22.
  echo Use the folder you opened: Java\latest\jdk-21
  echo That folder must contain bin\java.exe and bin\javac.exe.
  echo Do not point JAVA_HOME at the nested jdk-25.0.2.10-hotspot folder.
  echo.
  echo Example:
  echo   set JAVA_HOME=C:\Program Files\Java\latest\jdk-21
  echo   Build-Tsunami-APK.bat
  exit /b 1
)

set "JAVA_HOME=%FOUND_JAVA%"
set "PATH=%JAVA_HOME%\bin;%PATH%"
echo Using JAVA_HOME=%JAVA_HOME%
"%JAVA_HOME%\bin\java.exe" -version
if errorlevel 1 exit /b 1

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
  if errorlevel 1 exit /b 1
  powershell -NoProfile -Command ^
    "Expand-Archive -Force '%TEMP%\commandlinetools-win.zip' '%TEMP%\commandlinetools-win'"
  mkdir "%ANDROID_SDK_ROOT%\cmdline-tools" 2>nul
  if exist "%ANDROID_SDK_ROOT%\cmdline-tools\latest" rmdir /s /q "%ANDROID_SDK_ROOT%\cmdline-tools\latest"
  move "%TEMP%\commandlinetools-win\cmdline-tools" "%ANDROID_SDK_ROOT%\cmdline-tools\latest"
)

set "SDKMANAGER=%ANDROID_SDK_ROOT%\cmdline-tools\latest\bin\sdkmanager.bat"
echo y| "%SDKMANAGER%" --sdk_root="%ANDROID_SDK_ROOT%" --licenses
call "%SDKMANAGER%" --sdk_root="%ANDROID_SDK_ROOT%" platform-tools "platforms;android-34" "build-tools;34.0.0"

powershell -NoProfile -Command ^
  "$sdk = $env:ANDROID_SDK_ROOT -replace '\\','/'; Set-Content -LiteralPath (Join-Path '%cd%' 'android\local.properties') -Value ('sdk.dir=' + $sdk) -Encoding ASCII"

if not exist "%cd%\android\gradle\wrapper\gradle-wrapper.jar" (
  echo Downloading Gradle wrapper jar
  powershell -NoProfile -Command ^
    "Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/gradle/gradle/v8.7.0/gradle/wrapper/gradle-wrapper.jar' -OutFile '%cd%\android\gradle\wrapper\gradle-wrapper.jar'"
)

if not exist "%cd%\android\app\src\main\assets" mkdir "%cd%\android\app\src\main\assets"
for /d %%D in ("%cd%\android\app\src\main\assets\*") do if /i not "%%~nxD"==".gitkeep" rmdir /s /q "%%D"
for %%F in ("%cd%\android\app\src\main\assets\*") do if /i not "%%~nxF"==".gitkeep" del /q "%%F"
xcopy /e /i /y "%cd%\public\*" "%cd%\android\app\src\main\assets\" >nul

pushd android
set "JAVA_HOME=%FOUND_JAVA%"
call gradlew.bat --no-daemon assembleDebug
if errorlevel 1 (
  echo.
  echo Gradle failed. Confirm JAVA_HOME is the jdk-21 folder that contains bin\javac.exe.
  popd
  exit /b 1
)
popd

if not exist artifacts mkdir artifacts
copy /y "android\app\build\outputs\apk\debug\app-debug.apk" "artifacts\TsunamiRedAlerts-debug.apk"
echo APK ready: %cd%\artifacts\TsunamiRedAlerts-debug.apk
dir "artifacts\TsunamiRedAlerts-debug.apk"
endlocal
