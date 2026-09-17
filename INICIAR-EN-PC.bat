@echo off
title Control de Placas - Servidor SQLite
cd /d "%~dp0"
echo ================================================
echo   CONTROL DE PLACAS - Servidor con SQLite
echo ================================================
echo.
start "" http://localhost:3000
node server\server.js
echo.
echo El servidor se detuvo.
pause
