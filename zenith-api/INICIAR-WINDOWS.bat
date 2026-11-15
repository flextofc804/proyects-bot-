@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ================================================
echo   ZENITH API - arrancando...
echo ================================================
set "NODE_EXE="
where node >nul 2>nul
if not errorlevel 1 set "NODE_EXE=node"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE_EXE=%LocalAppData%\Programs\nodejs\node.exe"
if not defined NODE_EXE (
  echo.
  echo  FALTA NODE.JS: instalalo desde https://nodejs.org
  echo  (boton verde "Download", siguiente-siguiente-terminar)
  echo  y despues abri este archivo de nuevo.
  echo.
  pause
  exit /b
)
"%NODE_EXE%" api.mjs
echo.
echo  La API se cerro. Si fue un error, mandale ese texto a quien te ayuda.
pause
