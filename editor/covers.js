/* Independent issue metadata: does not touch article drafts. */
(() => {
  const dialog = document.getElementById('coverManager');
  const week = document.getElementById('coverWeek');
  const issueSelect = document.getElementById('coverIssueSelect');
  const video = document.getElementById('coverVideo');
  const image = document.getElementById('coverPreview');
  const choices = document.getElementById('coverArticles');
  const status = document.getElementById('coverStatus');
  const file = document.getElementById('coverFile');
  const token = new URLSearchParams(location.search).get('token') || '';
  let state, activeWeek = '', cover = '', dirty = false, busy = false;
  const say = text => { status.textContent = text; };
  const selected = () => [...choices.querySelectorAll('input:checked')].map(input => input.value);
  function preview() {
    image.hidden = !cover;
    if (cover) image.src = '/' + cover;
    else image.removeAttribute('src');
  }
  function showWeek(value) {
    activeWeek = value;
    week.value = value;
    renderIssueOptions();
    const draft = state.drafts[value] || state.issues[value] || {};
    cover = draft.cover || '';
    video.value = draft.video_url || '';
    preview();
    choices.replaceChildren();
    for (const article of state.articles.filter(a => a.date_start === value && a.source !== 'easter')) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox'; input.value = article.id;
      input.checked = (draft.article_ids || []).includes(article.id);
      label.append(input, document.createTextNode(`${article.source === 'extra' ? '番外' : '正篇'} · ${article.title}`));
      choices.append(label);
    }
    if (!choices.children.length) choices.textContent = '本周暂无已发布篇目，请先发布文章。';
    dirty = false;
    say(state.issues[value] ? '本期已发布；保存草稿不会改变网页，重新发布后生效。' : '本期尚未发布，可先保存不完整草稿。');
    document.getElementById('coverWithdraw').disabled = !state.issues[value];
  }
  async function request(action, extra = {}) {
    const response = await fetch('/api/covers/' + action, {
      method: 'POST', headers: {'Content-Type': 'application/json', 'X-Editor-Token': token},
      body: JSON.stringify({week: activeWeek, revision: state.revision, libraryHash: state.libraryHash, ...extra})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '操作失败');
    return result;
  }
  async function save() {
    state = await request('save', {draft: {cover, video_url: video.value, article_ids: selected()}});
    renderIssueOptions();
    dirty = false;
  }
  async function run(action) {
    if (busy) return;
    busy = true;
    const controls = [...dialog.querySelectorAll('button,input,select')];
    const prior = controls.map(el => el.disabled);
    controls.forEach(el => { el.disabled = true; });
    try { await action(); }
    catch (error) { say(error.message); }
    finally {
      busy = false;
      controls.forEach((el, i) => { el.disabled = prior[i]; });
      document.getElementById('coverWithdraw').disabled = !state?.issues[activeWeek];
    }
  }
  function renderIssueOptions() {
    const weeks = [...new Set([activeWeek, ...state.articles.map(a => a.date_start), ...Object.keys(state.drafts), ...Object.keys(state.issues)])]
      .filter(value => value && value >= '2026-08-23').sort().reverse();
    const list = document.getElementById('coverWeeks');
    list.replaceChildren();
    issueSelect.replaceChildren();
    for (const value of weeks) {
      const option = document.createElement('option'); option.value = value;
      option.label = state.issues[value] ? '已发布' : state.drafts[value] ? '有草稿' : '待补';
      list.append(option);
      const choice = document.createElement('option'); choice.value = value;
      choice.textContent = `${value} · ${option.label}`; issueSelect.append(choice);
    }
    issueSelect.value = activeWeek;
    return weeks;
  }
  async function load() {
    const response = await fetch('/api/covers', {cache: 'no-store'});
    if (!response.ok) throw new Error('读取封面配置失败');
    state = await response.json();
    const weeks = renderIssueOptions();
    showWeek(activeWeek || weeks[0] || '2026-08-23');
  }
  document.getElementById('coverManagerOpen').onclick = () => {
    dialog.showModal();
    run(load);
  };
  document.getElementById('coverRefresh').onclick = () => {
    if (dirty && !confirm('重新读取会丢弃尚未保存的封面修改，继续吗？')) return;
    run(load);
  };
  week.onchange = () => run(async () => {
    const next = week.value;
    week.value = activeWeek;
    if (!next || next < '2026-08-23') throw new Error('请选择 2026-08-23 或之后的日期');
    if (dirty) await save();
    showWeek(next);
  });
  issueSelect.onchange = () => { week.value = issueSelect.value; issueSelect.value = activeWeek; week.onchange(); };
  video.oninput = () => { dirty = true; say('尚未保存'); };
  choices.onchange = event => {
    if (selected().length > 2) { event.target.checked = false; say('每期最多选择两篇'); return; }
    dirty = true; say('尚未保存');
  };
  file.onchange = () => run(async () => {
    const selectedFile = file.files[0]; file.value = '';
    if (!selectedFile) return;
    if (selectedFile.size > 20 * 1024 * 1024) throw new Error('图片大小须在 20 MB 以内');
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(selectedFile);
    });
    cover = (await request('image', {data})).src; preview(); dirty = true;
    await save(); say('封面已上传并保存为草稿，发布后网页才会显示。');
  });
  document.getElementById('coverSave').onclick = () => run(async () => { await save(); say('草稿已保存'); });
  document.getElementById('coverDeleteDraft').onclick = () => run(async () => {
    state = await request('delete-draft');
    showWeek(activeWeek);
    say(state.issues[activeWeek] ? '草稿已删除，已恢复为当前发布内容；网页上的封面与精选保留。' : '草稿已删除，本期待补。');
  });
  document.getElementById('coverPublish').onclick = () => run(async () => {
    await save(); state = await request('publish'); showWeek(activeWeek); say('本期封面与精选已发布。');
  });
  document.getElementById('coverWithdraw').onclick = () => run(async () => {
    if (dirty) await save();
    state = await request('withdraw'); showWeek(activeWeek); say('已撤下，草稿保留，可修改后重新发布。');
  });
  function close() {
    if (busy) return;
    if (dirty) run(async () => { await save(); dialog.close(); });
    else dialog.close();
  }
  document.getElementById('coverClose').onclick = close;
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
})();
