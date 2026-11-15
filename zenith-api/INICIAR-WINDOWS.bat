@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ================================================
echo   ZENITH API - arrancando...
echo ================================================
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  FALTA NODE.JS: instalalo desde https://nodejs.org
  echo  (boton verde "Download", siguiente-siguiente-terminar)
  echo  y despues abri este archivo de nuevo.
  echo.
  pause
  exit /b
)
node api.mjs
echo.
echo  La API se cerro. Si fue un error, mandale ese texto a quien te ayuda.
pause
