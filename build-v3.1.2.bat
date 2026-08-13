@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo      BeiCai v3.1.2 APK Build Script
echo ==========================================
echo.

cd /d "%~dp0"

REM --------------------------------------------------------
REM Auto Detect JAVA_HOME
REM --------------------------------------------------------
if not defined JAVA_HOME (
    echo [Check] JAVA_HOME is not set. Searching for installed JDK/JBR...
    
    if exist "C:\Program Files\Android\Android Studio\jbr" (
        set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
    ) else if exist "C:\Program Files\Android\Android Studio\jre" (
        set "JAVA_HOME=C:\Program Files\Android\Android Studio\jre"
    ) else if exist "%LOCALAPPDATA%\Programs\Android Studio\jbr" (
        set "JAVA_HOME=%LOCALAPPDATA%\Programs\Android Studio\jbr"
    ) else (
        for /d %%D in ("C:\Program Files\Java\jdk*") do (
            if exist "%%D\bin\java.exe" set "JAVA_HOME=%%D"
        )
    )

    if "!JAVA_HOME!" neq "" (
        echo [Check] Found Java at: !JAVA_HOME!
    ) else (
        echo.
        echo [ERROR] Could not auto-detect JDK or Android Studio JBR.
        echo Please make sure Android Studio or Java JDK 17+ is installed.
        echo.
        pause
        exit /b 1
    )
)

set "PATH=!JAVA_HOME!\bin;%PATH%"

REM --------------------------------------------------------
REM Auto Detect ANDROID_HOME & local.properties
REM --------------------------------------------------------
if not defined ANDROID_HOME (
    if exist "%LOCALAPPDATA%\Android\Sdk" (
        set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
        set "ANDROID_SDK_ROOT=%LOCALAPPDATA%\Android\Sdk"
        echo [Check] Found Android SDK at: !ANDROID_HOME!
    )
)

if not exist "android\local.properties" (
    if exist "%LOCALAPPDATA%\Android\Sdk" (
        echo sdk.dir=%LOCALAPPDATA:\=\\%\\Android\\Sdk > "android\local.properties"
    )
)

REM --------------------------------------------------------
REM Step 1: Copy Web Assets to www
REM --------------------------------------------------------
echo.
echo [1/5] Copying web assets to www...
if not exist "www" mkdir "www"
copy /Y "index.html" "www" >nul
copy /Y "style.css" "www" >nul
copy /Y "appico.png" "www" >nul
xcopy /E /I /Y "js" "www\js" >nul
xcopy /E /I /Y "picture" "www\picture" >nul

REM --------------------------------------------------------
REM Step 2: Install node_modules if missing
REM --------------------------------------------------------
echo.
echo [2/5] Checking Node dependencies...
if not exist "node_modules\@capacitor\cli" (
    echo Installing npm dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] npm install failed. Please check Node.js installation.
        pause
        exit /b 1
    )
)

REM --------------------------------------------------------
REM Step 3: Capacitor Sync
REM --------------------------------------------------------
echo.
echo [3/5] Syncing Capacitor Android assets...
call npx @capacitor/cli sync android
if %ERRORLEVEL% neq 0 (
    call npm run cap:sync
)

REM --------------------------------------------------------
REM Step 4: Gradle Build
REM --------------------------------------------------------
echo.
echo [4/5] Building APK with Gradle...
cd android
call gradlew.bat assembleRelease

if %ERRORLEVEL% neq 0 (
    echo.
    echo [WARNING] Release build failed, trying Debug build...
    call gradlew.bat assembleDebug
    if %ERRORLEVEL% neq 0 (
        echo.
        echo [ERROR] Gradle build failed. Please check JDK and Android SDK.
        pause
        exit /b 1
    )
    set "APK_REL_PATH=app\build\outputs\apk\debug\app-debug.apk"
) else (
    set "APK_REL_PATH=app\build\outputs\apk\release\app-release.apk"
)

REM --------------------------------------------------------
REM Step 5: Export APK
REM --------------------------------------------------------
echo.
echo [5/5] Copying APK to root directory...
cd /d "%~dp0"

if exist "android\!APK_REL_PATH!" (
    copy /Y "android\!APK_REL_PATH!" "beicai-apk-v3.1.2.apk"
    echo.
    echo ==========================================
    echo [SUCCESS] Built successfully: beicai-apk-v3.1.2.apk
    echo ==========================================
) else (
    echo [ERROR] APK file not found at android\!APK_REL_PATH!
)

echo.
