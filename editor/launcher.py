"""Windows-only, isolated Edge app window and local server lifetime."""
from __future__ import annotations

import ctypes
from ctypes import wintypes as w
import contextlib
import json
import logging
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from urllib.request import build_opener, ProxyHandler
import uuid
import webbrowser

import server
from browser_session import BrowserSession


def find_edge():
    for base in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles"),
                 os.environ.get("LOCALAPPDATA")):
        if base:
            path = Path(base) / "Microsoft/Edge/Application/msedge.exe"
            if path.is_file():
                return path
    raise RuntimeError("未找到 Microsoft Edge，请安装 Edge 后重试。")


class EdgeProcess:
    """A kill-on-close Windows Job; browser starts suspended to avoid child races."""
    def __init__(self, args):
        k = self.k = ctypes.WinDLL("kernel32", use_last_error=True)
        size = ctypes.c_size_t

        class Basic(ctypes.Structure):
            _fields_ = [("process_time", ctypes.c_int64), ("job_time", ctypes.c_int64),
                        ("flags", w.DWORD), ("min_ws", size), ("max_ws", size),
                        ("active", w.DWORD), ("affinity", size),
                        ("priority", w.DWORD), ("scheduling", w.DWORD)]

        class Limits(ctypes.Structure):
            _fields_ = [("basic", Basic), ("io", ctypes.c_uint64 * 6),
                        ("process_memory", size), ("job_memory", size),
                        ("peak_process", size), ("peak_job", size)]

        class Startup(ctypes.Structure):
            _fields_ = [("cb", w.DWORD), ("reserved", w.LPWSTR),
                        ("desktop", w.LPWSTR), ("title", w.LPWSTR),
                        ("x", w.DWORD), ("y", w.DWORD), ("width", w.DWORD),
                        ("height", w.DWORD), ("chars_x", w.DWORD),
                        ("chars_y", w.DWORD), ("fill", w.DWORD), ("flags", w.DWORD),
                        ("show", w.WORD), ("reserved_size", w.WORD),
                        ("reserved_bytes", ctypes.POINTER(w.BYTE)),
                        ("stdin", w.HANDLE), ("stdout", w.HANDLE), ("stderr", w.HANDLE)]

        class ProcessInfo(ctypes.Structure):
            _fields_ = [("process", w.HANDLE), ("thread", w.HANDLE),
                        ("pid", w.DWORD), ("tid", w.DWORD)]

        signatures = {
            "CreateJobObjectW": ([w.LPVOID, w.LPCWSTR], w.HANDLE),
            "SetInformationJobObject": ([w.HANDLE, ctypes.c_int, w.LPVOID, w.DWORD], w.BOOL),
            "AssignProcessToJobObject": ([w.HANDLE, w.HANDLE], w.BOOL),
            "CreateProcessW": ([w.LPCWSTR, w.LPWSTR, w.LPVOID, w.LPVOID, w.BOOL,
                                w.DWORD, w.LPVOID, w.LPCWSTR,
                                ctypes.POINTER(Startup), ctypes.POINTER(ProcessInfo)], w.BOOL),
            "ResumeThread": ([w.HANDLE], w.DWORD),
            "WaitForSingleObject": ([w.HANDLE, w.DWORD], w.DWORD),
            "TerminateProcess": ([w.HANDLE, w.UINT], w.BOOL),
            "CloseHandle": ([w.HANDLE], w.BOOL),
        }
        for name, (argspec, result) in signatures.items():
            func = getattr(k, name)
            func.argtypes, func.restype = argspec, result
        self.job = self.process = None
        info = ProcessInfo()
        try:
            self.job = k.CreateJobObjectW(None, None)
            if not self.job:
                raise ctypes.WinError(ctypes.get_last_error())
            limits = Limits()
            limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            if not k.SetInformationJobObject(self.job, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
                raise ctypes.WinError(ctypes.get_last_error())
            startup = Startup()
            startup.cb = ctypes.sizeof(startup)
            command = ctypes.create_unicode_buffer(subprocess.list2cmdline([str(a) for a in args]))
            if not k.CreateProcessW(str(args[0]), command, None, None, False,
                                    0x4, None, None, ctypes.byref(startup), ctypes.byref(info)):
                raise ctypes.WinError(ctypes.get_last_error())
            self.process = info.process
            self.pid = info.pid
            if not k.AssignProcessToJobObject(self.job, self.process):
                raise ctypes.WinError(ctypes.get_last_error())
            if k.ResumeThread(info.thread) == 0xFFFFFFFF:
                raise ctypes.WinError(ctypes.get_last_error())
        except Exception:
            if self.process:
                k.TerminateProcess(self.process, 1)
            self.close()
            raise
        finally:
            if info.thread:
                k.CloseHandle(info.thread)

    def alive(self):
        return bool(self.process) and self.k.WaitForSingleObject(self.process, 0) == 258

    def close(self):
        if self.job:
            self.k.CloseHandle(self.job)
            self.job = None
        if self.process:
            self.k.WaitForSingleObject(self.process, 5000)
            self.k.CloseHandle(self.process)
            self.process = None


class TargetMonitor:
    def __init__(self, url, started=None):
        self.url = url
        self.target = None
        self.started = time.monotonic() if started is None else started
        self.missing_since = None
        self.failed_since = None

    def observe(self, targets, now):
        self.failed_since = None
        if self.target is None:
            self.target = next((t['id'] for t in targets
                                if t.get('type') == 'page' and t.get('url') == self.url), None)
            if self.target is None and now - self.started > 45:
                raise RuntimeError("编辑器窗口未能正常打开，请重试。")
            return False
        if any(t.get('id') == self.target for t in targets):
            self.missing_since = None
            return False
        if self.missing_since is None:
            self.missing_since = now
        return now - self.missing_since >= 2

    def failed(self, now):
        self.missing_since = None
        if self.failed_since is None:
            self.failed_since = now
        if now - self.failed_since > 30:
            raise RuntimeError("无法连接编辑器窗口，本次会话已退出，请重新打开。")


def monitor(browser, profile, url):
    opener = build_opener(ProxyHandler({}))
    state = TargetMonitor(url)
    while browser.alive():
        try:
            port = int((profile / 'DevToolsActivePort').read_text().splitlines()[0])
            if not 0 < port < 65536:
                raise ValueError("Invalid debugging port")
            with opener.open(f'http://127.0.0.1:{port}/json/list', timeout=2) as response:
                targets = json.load(response)
        except (OSError, ValueError):
            state.failed(time.monotonic())
        else:
            if state.observe(targets, time.monotonic()):
                return
        time.sleep(0.5)
    if state.target is None:
        raise RuntimeError("Edge 在编辑器打开前退出，请检查 Edge 是否能够正常启动。")


def run_isolated():
    edge = find_edge()
    profile = Path(tempfile.mkdtemp(prefix='zhijiao-editor-'))
    browser = httpd = worker = None
    try:
        store = server.LibraryEditorStore()
        try:
            store.cleanup_backups()
        except OSError:
            logging.exception('Backup cleanup failed')
        token = uuid.uuid4().hex
        httpd = server.EditorServer(('127.0.0.1', 0), server.handler_for(store, token))
        url = f'http://127.0.0.1:{httpd.server_port}/editor/?token={token}'
        worker = threading.Thread(target=httpd.serve_forever, daemon=True)
        worker.start()
        browser = EdgeProcess([edge, f'--user-data-dir={profile}', f'--app={url}',
                               '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
                               '--no-first-run', '--no-default-browser-check',
                               '--disable-background-mode', '--disable-extensions'])
        monitor(browser, profile, url)
    finally:
        if browser:
            browser.close()
        if httpd:
            if worker and worker.is_alive():
                httpd.shutdown()
                worker.join()
            httpd.server_close()  # Join in-flight request handlers before exiting.
        for attempt in range(10):
            try:
                if (profile.is_symlink() or profile.resolve().parent != Path(tempfile.gettempdir()).resolve()
                        or not profile.name.startswith('zhijiao-editor-')):
                    raise OSError('Refusing to remove an unexpected profile path')
                shutil.rmtree(profile)
                break
            except OSError:
                if attempt == 9:
                    logging.exception('Could not remove temporary Edge profile: %s', profile)
                else:
                    time.sleep(0.5)


def run():
    session = BrowserSession()
    httpd = worker = None
    try:
        store = server.LibraryEditorStore()
        try:
            store.cleanup_backups()
        except OSError:
            logging.exception('Backup cleanup failed')
        token = uuid.uuid4().hex
        httpd = server.EditorServer(('127.0.0.1', 0), server.handler_for(store, token, session))
        worker = threading.Thread(target=httpd.serve_forever, daemon=True)
        worker.start()
        url = f'http://127.0.0.1:{httpd.server_port}/editor/?token={token}'
        if not webbrowser.open(url, new=2):
            raise RuntimeError('无法打开默认浏览器，请检查系统默认浏览器设置。')
        while not session.closed.wait(0.25):
            if session.tick():
                raise RuntimeError('编辑器页面未能连接，请重新启动编辑器。')
        # Give connected previews time to receive their close event before stopping HTTP.
        time.sleep(1)
    finally:
        session.closed.set()
        if httpd:
            if worker and worker.is_alive():
                httpd.shutdown()
                worker.join()
            httpd.server_close()


def main():
    log_dir = Path(os.environ.get('LOCALAPPDATA', tempfile.gettempdir())) / 'ZhijiaoGenerator/logs'
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f'editor-{time.strftime("%Y%m%d-%H%M%S")}-{os.getpid()}.log'
    with log_path.open('a', encoding='utf-8', buffering=1) as log, \
            contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
        logging.basicConfig(stream=log, level=logging.INFO)
        try:
            run()
        except Exception:
            logging.exception('Editor session failed')
            ctypes.windll.user32.MessageBoxW(None,
                f'编辑器启动或运行失败。\n请查看日志：{log_path}\n\n{sys.exc_info()[1]}',
                '本地图书馆编辑器', 0x10)
            return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
