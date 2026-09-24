@echo off
setlocal EnableDelayedExpansion
rem Neandertool - local test launcher
rem Starts a static server for this folder (if not already running) and opens it.

cd /d "%~dp0"
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
rem 8778 is reserved for the mascot generator
set "PORTS=8777 8779 8780 8781 8782"
set "MARKER=Neandertool - Retro Filter Design"

where curl >nul 2>&1 || (
    echo [ERROR] curl.exe not found ^(needs Windows 10 1803 or later^).
    goto :fail
)

rem 1) Already served somewhere? Just open it.
for %%P in (%PORTS%) do (
    call :is_ours %%P
    if !errorlevel! equ 0 (
        echo Server already running on port %%P.
        set "PORT=%%P"
        goto :open
    )
)

rem 2) Find a Python interpreter
set "PY="
for %%C in ("py -3" "python" "python3") do (
    if not defined PY (
        %%~C -c "import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)" >nul 2>&1 && set "PY=%%~C"
    )
)
if not defined PY (
    echo [ERROR] Python 3.7+ not found. Install it from https://www.python.org/ and retry.
    goto :fail
)

rem 3) Pick the first free port
set "PORT="
for %%P in (%PORTS%) do (
    if not defined PORT (
        netstat -ano -p TCP | findstr /r /c:":%%P  *[^ ]*  *LISTENING" >nul || set "PORT=%%P"
    )
)
if not defined PORT (
    echo [ERROR] All ports busy: %PORTS%
    goto :fail
)

rem 4) Start the server in its own minimized window (close it to stop the server)
echo Starting server on port %PORT% with "%PY%"...
start "Neandertool server :%PORT%" /min %PY% -m http.server %PORT% --bind 127.0.0.1 --directory "%ROOT%"

rem 5) Wait until it answers (up to ~15 s)
for /l %%I in (1,1,30) do (
    call :is_ours %PORT%
    if !errorlevel! equ 0 goto :open
    >nul ping -n 2 127.0.0.1
)
echo [ERROR] The server did not respond on port %PORT%. Check the server window for errors.
goto :fail

:open
set "URL=http://localhost:%PORT%/"
echo Opening %URL%
start "" "%URL%"
exit /b 0

rem Returns 0 if Neandertool is being served on port %1
:is_ours
curl -s -m 2 "http://127.0.0.1:%~1/index.html" 2>nul | findstr /c:"%MARKER%" >nul
exit /b %errorlevel%

:fail
echo.
pause
exit /b 1
