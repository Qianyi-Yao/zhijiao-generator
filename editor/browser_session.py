"""Track editor documents via live connections, not browser processes."""
import threading
import time


class BrowserSession:
    def __init__(self, grace=5, startup_timeout=90):
        self.grace = grace
        self.startup_timeout = startup_timeout
        self.started = time.monotonic()
        self.last_disconnect = None
        self.editors = set()
        self.departed = set()
        self.lock = threading.Lock()
        self.closed = threading.Event()

    def attach(self, document):
        with self.lock:
            if self.closed.is_set() or document in self.departed:
                return False
            self.editors.add(document)
            self.last_disconnect = None
            return True

    def leave(self, document):
        with self.lock:
            self.departed.add(document)
            self.editors.discard(document)
            if not self.editors:
                self.last_disconnect = time.monotonic()

    def tick(self):
        with self.lock:
            now = time.monotonic()
            expired = (not self.editors and self.last_disconnect is not None
                       and now - self.last_disconnect >= self.grace)
            unopened = self.last_disconnect is None and not self.editors and now - self.started >= self.startup_timeout
            if expired or unopened:
                self.closed.set()
            return unopened
