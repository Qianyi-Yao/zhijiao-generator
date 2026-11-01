"""Opt-in real Edge lifecycle test, without displaying desktop windows.

Set ZHIJIAO_TEST_EDGE=1 to include this integration check.
"""
import json
import os
from pathlib import Path
import queue
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from urllib.parse import quote
from urllib.request import build_opener, ProxyHandler, Request

import launcher
import server


@unittest.skipUnless(os.environ.get('ZHIJIAO_TEST_EDGE') == '1', 'Opt-in real Edge test')
class EdgeIntegrationTests(unittest.TestCase):
    def test_two_sessions_preview_close_and_failure_cleanup(self):
        launched = queue.Queue()
        errors = []
        processes, workers = [], []
        opener = build_opener(ProxyHandler({}))
        original_process = launcher.EdgeProcess

        def launch(args):
            browser = original_process([*args, '--headless=new', '--disable-gpu'])
            processes.append(browser)
            profile = Path(next(a.split('=', 1)[1] for a in args if str(a).startswith('--user-data-dir=')))
            url = next(a.split('=', 1)[1] for a in args if str(a).startswith('--app='))
            launched.put((browser, profile, url))
            return browser

        def run():
            try:
                launcher.run_isolated()
            except Exception as error:
                errors.append(error)

        def api(base, path, method='GET'):
            with opener.open(Request(base + path, method=method), timeout=3) as response:
                return response.read()

        def ready(profile, url):
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                try:
                    port = int((profile / 'DevToolsActivePort').read_text().splitlines()[0])
                    base = f'http://127.0.0.1:{port}'
                    targets = json.loads(api(base, '/json/list'))
                    main = next(t['id'] for t in targets if t.get('url') == url)
                    return base, main
                except (OSError, ValueError, StopIteration):
                    time.sleep(0.2)
            self.fail('Edge page did not open')

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'editor').mkdir()
            (root / 'editor/index.html').write_text('<h1>Editor lifecycle test</h1>')
            (root / 'library.html').write_text('<h1>Preview</h1>')
            store = server.LibraryEditorStore(root)
            with patch.object(launcher, 'EdgeProcess', side_effect=launch), \
                    patch.object(server, 'LibraryEditorStore', return_value=store):
                try:
                    for _ in range(2):
                        worker = threading.Thread(target=run)
                        workers.append(worker)
                        worker.start()
                    sessions = [launched.get(timeout=20) for _ in range(2)]
                    connections = [ready(profile, url) for _, profile, url in sessions]
                    time.sleep(1)  # Allow both monitors to register their main page.
                    first, second = sessions
                    base, main = connections[0]
                    origin = first[2].split('/editor/')[0]
                    preview = json.loads(api(base, '/json/new?' + quote(origin + '/library.html', safe=''), 'PUT'))
                    api(base, '/json/close/' + preview['id'])
                    time.sleep(3)
                    self.assertTrue(first[0].alive(), 'Preview close must not exit editor')
                    json.loads(api(base, '/json/new?' + quote(origin + '/library.html', safe=''), 'PUT'))
                    api(base, '/json/close/' + main)
                    deadline = time.monotonic() + 15
                    while first[1].exists() and time.monotonic() < deadline:
                        time.sleep(0.2)
                    self.assertFalse(first[1].exists(), 'First session profile must be cleaned')
                    self.assertFalse(first[0].alive())
                    self.assertTrue(second[0].alive(), 'Other session must remain open')
                    with self.assertRaises(OSError):
                        api(origin, '/editor/')
                    # Unexpected browser termination also exits and cleans the service.
                    second[0].close()
                    for worker in workers:
                        worker.join(15)
                        self.assertFalse(worker.is_alive())
                    self.assertFalse(second[1].exists())
                    self.assertEqual(errors, [])
                finally:
                    for browser in processes:
                        browser.close()
                    for worker in workers:
                        worker.join(35)

            created_profiles = []
            real_mkdtemp = tempfile.mkdtemp

            def temporary_profile(**kwargs):
                path = real_mkdtemp(**kwargs)
                created_profiles.append(Path(path))
                return path

            with patch.object(server, 'LibraryEditorStore', return_value=store), \
                    patch.object(launcher.tempfile, 'mkdtemp', side_effect=temporary_profile), \
                    patch.object(launcher, 'EdgeProcess', side_effect=OSError('simulated startup failure')):
                with self.assertRaises(OSError):
                    launcher.run_isolated()
            self.assertTrue(created_profiles)
            self.assertTrue(all(not p.exists() for p in created_profiles))


if __name__ == '__main__':
    unittest.main()
