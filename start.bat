@echo off
REM ==========================================
REM BeiCai Money Manager Launcher
REM ==========================================

echo [STEP 1] Opening browser...
start "" "http://127.0.0.1:8000/"

echo [STEP 2] Starting Python server...
echo (If this window closes immediately, please check if port 8000 is occupied)
echo.

python -m http.server 8000

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Failed to start server. 
    echo Please make sure Python is installed and added to PATH.
    pause
)
