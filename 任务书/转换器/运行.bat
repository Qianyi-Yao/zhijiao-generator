@echo off
chcp 65001 >nul
cd /d "%~dp0"
if "%~1"=="" (
  python converter.py
) else (
  python converter.py "%~1"
)
