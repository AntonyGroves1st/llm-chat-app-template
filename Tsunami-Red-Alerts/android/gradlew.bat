@echo off
set DIRNAME=%~dp0
if "%DIRNAME%"=="" set DIRNAME=.
set APP_BASE_NAME=%~n0
set APP_HOME=%DIRNAME%

if defined JAVA_HOME (
  set JAVA_EXE=%JAVA_HOME%\bin\java.exe
) else (
  set JAVA_EXE=java.exe
)

if not exist "%JAVA_EXE%" (
  echo JAVA_HOME is not set to a JDK. Use Java\latest\jdk-21 so that this file exists:
  echo   %%JAVA_HOME%%\bin\java.exe
  exit /b 1
)

set CLASSPATH=%APP_HOME%\gradle\wrapper\gradle-wrapper.jar

"%JAVA_EXE%" -Xmx64m -Xms64m %DEFAULT_JVM_OPTS% %JAVA_OPTS% %GRADLE_OPTS% "-Dorg.gradle.appname=%APP_BASE_NAME%" -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %*
