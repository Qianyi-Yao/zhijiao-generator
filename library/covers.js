window.LibraryCovers = (() => {
  const byArticle = new Map();
  const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let dialog, opener;
  async function load(articles) {
    byArticle.clear();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('library/data/issue-covers.json', {cache: 'no-store', signal: controller.signal});
      if (!response.ok) return;
      const data = await response.json();
      for (const [week, issue] of Object.entries(data.issues || {})) {
        if (!issue || !Array.isArray(issue.article_ids) || !/^library\/covers\/[0-9a-f]{32}\.(png|jpg|webp|gif)$/.test(issue.cover)) continue;
        let url;
        try { url = new URL(issue.video_url); } catch { continue; }
        if (!['https:', 'http:'].includes(url.protocol)) continue;
        for (const id of issue.article_ids) {
          if (articles.some(a => a.id === id && a.date_start === week && a.source !== 'easter')) byArticle.set(id, {...issue, week});
        }
      }
    } catch { /* Optional metadata must not prevent article reading. */ }
    finally { clearTimeout(timeout); }
  }
  function badge(id) { return byArticle.has(id) ? '<button type="button" class="featured-badge" data-featured-filter title="查看所有精选篇目">精选</button>' : ''; }
  function bubble(id) {
    const issue = byArticle.get(id);
    return issue ? `<button type="button" class="cover-bubble" data-cover-article="${esc(id)}" aria-label="查看本期封面及视频" aria-haspopup="dialog"><img src="${esc(issue.cover)}" alt="本期封面" loading="lazy"></button>` : '';
  }
  function open(button) {
    const issue = byArticle.get(button.dataset.coverArticle);
    if (!issue) return;
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.className = 'issue-cover-dialog';
      dialog.setAttribute('aria-labelledby', 'issueCoverTitle');
      dialog.innerHTML = '<section class="issue-cover-panel"><header class="issue-cover-header"><h2 id="issueCoverTitle"></h2><button type="button" class="issue-cover-close" autofocus>关闭</button></header><img class="issue-cover-image" alt="本期完整封面"><p class="issue-cover-error" hidden>封面暂时无法加载，仍可通过下方链接观看视频。</p><a class="issue-cover-video" target="_blank" rel="noopener noreferrer">观看视频 ↗</a></section>';
      document.body.append(dialog);
      dialog.querySelector('button').onclick = () => dialog.close();
      dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
      dialog.addEventListener('close', () => opener?.isConnected && opener.focus());
      dialog.querySelector('img').onerror = () => { dialog.querySelector('.issue-cover-error').hidden = false; };
    }
    opener = button;
    dialog.querySelector('h2').textContent = issue.week + ' 本期封面';
    dialog.querySelector('.issue-cover-error').hidden = true;
    dialog.querySelector('img').src = issue.cover;
    dialog.querySelector('a').href = issue.video_url;
    dialog.showModal();
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('.cover-bubble');
    if (button) { event.preventDefault(); event.stopImmediatePropagation(); open(button); }
  }, true);
  // Align the external cover bubble with the body below wrapped headings.
  const observer = new ResizeObserver(entries => {
    for (const {target} of entries) {
      const card = target.closest('.article-card');
      if (!card) continue;
      const head = card.querySelector('.article-head');
      card.style.setProperty('--cover-top', (head.offsetHeight + 18) + 'px');
    }
  });
  function observe() {
    observer.disconnect();
    document.querySelectorAll('.article-card.has-cover').forEach(card => {
      if (!card.querySelector('.cover-bubble')) return;
      observer.observe(card.querySelector('.article-head'));
      observer.observe(card.querySelector('.cover-bubble'));
    });
  }
  new MutationObserver(observe).observe(document.body, {childList: true, subtree: true});
  return {load, badge, bubble, has: id => byArticle.has(id)};
})();
