# ==========================================
# 贝才 3.1.4 APK 一键编译 PowerShell 脚本
# ==========================================

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "     BeiCai v3.1.4 APK Build Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# --------------------------------------------------------
# 自动识别 JAVA_HOME
# --------------------------------------------------------
if (-not $env:JAVA_HOME) {
    Write-Host "[Check] JAVA_HOME is not set. Searching for installed JDK/JBR..." -ForegroundColor Yellow
    if (Test-Path "C:\Program Files\Android\Android Studio\jbr") {
        $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
    } elseif (Test-Path "C:\Program Files\Android\Android Studio\jre") {
        $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jre"
    } elseif (Test-Path "$env:LOCALAPPDATA\Programs\Android Studio\jbr") {
        $env:JAVA_HOME = "$env:LOCALAPPDATA\Programs\Android Studio\jbr"
    } else {
        $jdkDirs = Get-Item "C:\Program Files\Java\jdk*" -ErrorAction SilentlyContinue
        if ($jdkDirs) {
            $env:JAVA_HOME = $jdkDirs[0].FullName
        }
    }

    if ($env:JAVA_HOME) {
        Write-Host "[Check] Found Java at: $env:JAVA_HOME" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] JAVA_HOME is not set and could not find Java automatically." -ForegroundColor Red
        Write-Host "Please set JAVA_HOME environment variable to your Java JDK folder." -ForegroundColor Red
        pause
        exit 1
    }
}

$env:PATH = "$env:JAVA_HOME\bin;" + $env:PATH

# 1. 拷贝 Web 资源
Write-Host "[1/5] Copying web assets to www..." -ForegroundColor Green
if (-not (Test-Path "www")) { New-Item -ItemType Directory -Path "www" | Out-Null }
Copy-Item -Path "index.html", "style.css", "appico.png" -Destination "www/" -Force
Copy-Item -Path "js", "picture" -Destination "www/" -Recurse -Force

# 2. 检查依赖
Write-Host "[2/5] Checking Node dependencies..." -ForegroundColor Green
if (-not (Test-Path "node_modules\@capacitor\cli")) {
    Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
    npm install
}

# 3. 同步 Capacitor
Write-Host "[3/5] Syncing Capacitor Android assets..." -ForegroundColor Green
npx @capacitor/cli sync android

# 4. 编译 Android
Write-Host "[4/5] Building APK with Gradle..." -ForegroundColor Green
Set-Location "$ScriptDir\android"
.\gradlew.bat assembleRelease

if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARNING] assembleRelease failed, trying assembleDebug..." -ForegroundColor Yellow
    .\gradlew.bat assembleDebug
    $ApkPath = "$ScriptDir\android\app\build\outputs\apk\debug\app-debug.apk"
} else {
    $ApkPath = "$ScriptDir\android\app\build\outputs\apk\release\app-release.apk"
}

# 5. 导出 APK
Set-Location $ScriptDir
if (Test-Path $ApkPath) {
    Copy-Item -Path $ApkPath -Destination "$ScriptDir\beicai-apk-v3.1.4.apk" -Force
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "[SUCCESS] Built successfully: beicai-apk-v3.1.4.apk" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
} else {
    Write-Host "[ERROR] APK file not found at $ApkPath" -ForegroundColor Red
}
