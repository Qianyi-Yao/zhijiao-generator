@echo off
cd /d "%~dp0\.."
python editor\server.py
if errorlevel 1 pause
