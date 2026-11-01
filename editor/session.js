/* Only served by the local editor; public library pages remain unchanged. */
(() => {
  const script = document.currentScript;
  const preview = script?.dataset.preview === 'true';
  const token = script?.dataset.token || new URLSearchParams(location.search).get('token');
  if (!token) return;
  let events;
  let documentId;
  function connect() {
    if (events) return;
    documentId = crypto.randomUUID().replaceAll('-', '');
    events = new EventSource(`/api/browser-session?token=${encodeURIComponent(token)}&role=${preview ? 'preview' : 'editor'}&document=${documentId}`);
    events.addEventListener('close', () => {
      events.close();
      if (preview) window.close();
    });
  }
  connect();
  window.addEventListener('pagehide', () => {
    if (!preview) fetch('/api/browser-close', {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-Editor-Token': token },
      body: JSON.stringify({ document: documentId })
    }).catch(() => {});
    events?.close(); events = null;
  });
  window.addEventListener('pageshow', connect);
  // Script-opened previews can close themselves without touching unrelated tabs.
  function openPreview(event) {
    if (event.type === 'auxclick' && event.button !== 1) return;
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin || url.pathname !== '/library.html') return;
    if (anchor.target !== '_blank' && !event.ctrlKey && !event.metaKey && event.button !== 1) return;
    event.preventDefault();
    const child = window.open(url.href, '_blank');
    if (child) child.opener = null;
  }
  document.addEventListener('click', openPreview);
  document.addEventListener('auxclick', openPreview);
})();
