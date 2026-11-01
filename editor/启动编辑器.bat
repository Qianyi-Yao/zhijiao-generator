@echo off
cd /d "%~dp0\.."
python -c "import pathlib,subprocess,sys; p=pathlib.Path(sys.executable).with_name('pythonw.exe'); subprocess.Popen([str(p), 'editor/launcher.py'], creationflags=0x08000000)"
if errorlevel 1 pause
