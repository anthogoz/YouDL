@echo off
REM --------------------------------------------------
REM YouDL - Register Native Messaging Host
REM --------------------------------------------------

echo.
echo ================================================
echo    YouDL - Host Registration
echo ================================================
echo.

REM 1. Check Python
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python is not installed or not in your PATH.
    echo Please install Python 3.10+ and try again.
    pause
    exit /b
)
echo [OK] Python found.

REM 2. Check FFmpeg
ffmpeg -version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] FFmpeg was not found.
    echo           It is required for MP3 conversion.
    echo           Please install it, for example using: winget install ffmpeg
) else (
    echo [OK] FFmpeg found.
)
echo.

REM 3. Install/Update yt-dlp
echo [INFO] Installing or updating yt-dlp...
python -m pip install -q -U yt-dlp
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Failed to update yt-dlp.
) else (
    echo [OK] yt-dlp is up to date.
)
echo.

REM 4. Ask for Extension ID
echo To allow the extension, we need its ID.
echo Go to chrome://extensions, find "YouDL",
echo and copy its ID.
echo.
set /p EXT_ID="Paste Extension ID here: "

if "%EXT_ID%"=="" (
    echo [ERROR] ID cannot be empty.
    pause
    exit /b
)

REM 5. Generate host.json
set "HOST_DIR=%~dp0"
set "HOST_DIR_ESC=%HOST_DIR:\=\\%"

echo {> "%~dp0host.json"
echo   "name": "com.typebeat.downloader",>> "%~dp0host.json"
echo   "description": "YouDL - Native Messaging Host",>> "%~dp0host.json"
echo   "path": "%HOST_DIR_ESC%run_host.bat",>> "%~dp0host.json"
echo   "type": "stdio",>> "%~dp0host.json"
echo   "allowed_origins": [>> "%~dp0host.json"
echo     "chrome-extension://%EXT_ID%/">> "%~dp0host.json"
echo   ]>> "%~dp0host.json"
echo }>> "%~dp0host.json"

echo [OK] host.json generated.

REM 6. Register Native Messaging Host
set HOST_NAME=com.typebeat.downloader
set HOST_JSON_PATH=%~dp0host.json

reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%HOST_JSON_PATH%" /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%HOST_JSON_PATH%" /f >nul 2>&1
reg add "HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%HOST_JSON_PATH%" /f >nul 2>&1

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [OK] Native host registered successfully!
    echo      Name: %HOST_NAME%
    echo      Path: %HOST_JSON_PATH%
) else (
    echo.
    echo [ERROR] Failed to register registry keys.
)

echo.
pause
