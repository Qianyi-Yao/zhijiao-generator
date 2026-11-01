"""Window monitor and graceful HTTP shutdown regression checks."""
import threading
import unittest
from http.server import BaseHTTPRequestHandler
from urllib.request import build_opener, ProxyHandler

from launcher import TargetMonitor
from server import EditorServer


class MonitorTests(unittest.TestCase):
    def setUp(self):
        self.monitor = TargetMonitor('http://local/editor', started=0)
        self.main = {'id': 'main', 'type': 'page', 'url': 'http://local/editor'}
        self.preview = {'id': 'preview', 'type': 'page', 'url': 'http://local/library'}
        self.monitor.observe([self.main], 1)

    def test_refresh_and_preview_close_do_not_exit(self):
        refreshed = dict(self.main, url='')
        self.assertFalse(self.monitor.observe([refreshed, self.preview], 3))
        self.assertFalse(self.monitor.observe([self.main], 6))

    def test_main_close_exits_even_with_preview(self):
        self.assertFalse(self.monitor.observe([self.preview], 3))
        self.assertTrue(self.monitor.observe([self.preview], 5))

    def test_transient_failure_does_not_confirm_close(self):
        self.monitor.observe([], 3)
        self.monitor.failed(4)
        self.assertFalse(self.monitor.observe([], 5))
        self.assertFalse(self.monitor.observe([self.main], 6))

    def test_startup_and_persistent_failure_are_bounded(self):
        with self.assertRaises(RuntimeError):
            TargetMonitor('missing', started=0).observe([], 46)
        self.monitor.failed(5)
        with self.assertRaises(RuntimeError):
            self.monitor.failed(36)


class ShutdownTests(unittest.TestCase):
    def test_close_waits_for_accepted_write(self):
        entered, release, written, closed = [threading.Event() for _ in range(4)]

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                entered.set()
                release.wait(5)
                written.set()
                self.send_response(200)
                self.end_headers()

            def log_message(self, *args):
                pass

        httpd = EditorServer(('127.0.0.1', 0), Handler)
        worker = threading.Thread(target=httpd.serve_forever)
        worker.start()
        self.addCleanup(httpd.server_close)
        self.addCleanup(httpd.shutdown)
        self.addCleanup(release.set)
        errors = []

        def request():
            try:
                with build_opener(ProxyHandler({})).open(
                        f'http://127.0.0.1:{httpd.server_port}', data=b'{}', timeout=10):
                    pass
            except Exception as error:
                errors.append(error)

        client = threading.Thread(target=request)
        client.start()
        self.assertTrue(entered.wait(3))
        httpd.shutdown()

        def close():
            httpd.server_close()
            closed.set()

        closer = threading.Thread(target=close)
        closer.start()
        try:
            self.assertFalse(closed.wait(0.15))
        finally:
            release.set()
            client.join(5)
            closer.join(5)
            worker.join(5)
        self.assertTrue(written.is_set())
        self.assertTrue(closed.is_set())
        self.assertEqual(errors, [])


if __name__ == '__main__':
    unittest.main()
