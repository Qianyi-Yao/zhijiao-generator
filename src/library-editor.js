import { Editor, Node } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { Image } from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import { FontFamily } from '@tiptap/extension-font-family';
import { Highlight } from '@tiptap/extension-highlight';

const $ = id => document.getElementById(id);
const token = new URLSearchParams(location.search).get('token') || '';
const emptyDoc = () => ({ type: 'doc', content: [{ type: 'paragraph' }] });
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
let state = { drafts: [], articles: [], characters: [], libraryHash: '' };
let draft = null;
let libraryCss = '';
let suppress = false;
let dirty = false;
let saveTimer;
let previewTimer;
let writeChain = Promise.resolve();
let previewSequence = 0;
let imageRequest = null;

const MediaRow = Node.create({
  name: 'mediaRow',
  group: 'block',
  content: '(paragraph|blockquote)+',
  defining: true,
  addAttributes() { return { images: { default: [] } }; },
  parseHTML() { return [{ tag: 'div[data-editor-media-row]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', { ...HTMLAttributes, 'data-editor-media-row': '' }, ['div', { 'data-media-text': '' }, 0]]; },
  addNodeView() {
    return ({ node, getPos, editor: viewEditor }) => {
      const dom = document.createElement('div');
      dom.className = 'editor-media-row';
      const imageColumn = document.createElement('div');
      imageColumn.className = 'editor-media-imgs';
      imageColumn.contentEditable = 'false';
      const contentDOM = document.createElement('div');
      contentDOM.className = 'editor-media-text';
      dom.append(imageColumn, contentDOM);
      const modify = images => {
        const pos = getPos();
        if (typeof pos !== 'number') return;
        viewEditor.commands.command(({ tr, state }) => {
          const current = state.doc.nodeAt(pos);
          if (current?.type.name !== 'mediaRow') return false;
          tr.setNodeMarkup(pos, undefined, { ...current.attrs, images });
          return true;
        });
      };
      const button = (label, action, disabled = false) => {
        const control = document.createElement('button');
        control.type = 'button';
        control.textContent = label;
        control.disabled = disabled;
        control.addEventListener('mousedown', event => event.preventDefault());
        control.addEventListener('click', event => { event.preventDefault(); action(); });
        return control;
      };
      const paint = current => {
        imageColumn.replaceChildren();
        const images = Array.isArray(current.attrs.images) ? current.attrs.images : [];
        images.forEach((item, index) => {
          const slot = document.createElement('div');
          slot.className = 'editor-media-image';
          const img = document.createElement('img');
          img.src = item.src;
          img.alt = item.alt || '考据配图';
          const controls = document.createElement('div');
          controls.className = 'editor-media-image-actions';
          controls.append(
            button('上移', () => { const next = [...images]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; modify(next); }, index === 0),
            button('下移', () => { const next = [...images]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; modify(next); }, index === images.length - 1),
            button('移除', () => images.length === 1
              ? convertMediaToImages(getPos(), true)
              : modify(images.filter((_, i) => i !== index)))
          );
          slot.append(img, controls);
          imageColumn.append(slot);
        });
        const actions = document.createElement('div');
        actions.className = 'editor-media-actions';
        actions.append(
          button('添加图片', () => chooseImages('appendMedia', getPos())),
          button('转为独立图片', () => convertMediaToImages(getPos()))
        );
        imageColumn.append(actions);
      };
      paint(node);
      return { dom, contentDOM, update(updated) {
        if (updated.type.name !== 'mediaRow') return false;
        if (updated.attrs.images !== node.attrs.images) paint(updated);
        node = updated;
        return true;
      }, stopEvent(event) { return imageColumn.contains(event.target); } };
    };
  }
});

function message(text, error = false) {
  $('message').textContent = text;
  $('message').style.color = error ? '#a04036' : '#2e6a67';
}
function status(text) { $('saveStatus').textContent = text; }
function currentWeek(dateValue) {
  if (!dateValue) return '';
  const date = new Date(dateValue + 'T12:00:00');
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() - date.getDay());
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-${String(date.getDate()).padStart(2, '0')}`;
}
function tagsFromInput() {
  return [...new Set($('characters').value.split(/[、,，;；]/).map(x => x.trim()).filter(Boolean))];
}
function payload() {
  return { id: draft.id, date_start: $('dateStart').value, title: $('title').value,
    source: $('source').value, characters: tagsFromInput(),
    doc: editor.getJSON(), published_hash: draft.published_hash || null };
}
async function api(path, body) {
  const response = await fetch(path, body === undefined ? { cache: 'no-store' } : {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Editor-Token': token },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `请求失败 (${response.status})`);
  return data;
}

const editor = new Editor({
  element: $('editor'),
  extensions: [
    StarterKit.configure({ code: false, codeBlock: false, underline: false,
      heading: { levels: [5, 6] },
      link: { openOnClick: false, autolink: false, linkOnPaste: false } }),
    Image.configure({ inline: false, allowBase64: false }),
    MediaRow,
    TableKit.configure({ table: { resizable: true } }),
    TextStyle, Color, FontFamily, Highlight.configure({ multicolor: true })
  ],
  content: emptyDoc(),
  editorProps: {
    transformPastedHTML(html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.body.querySelectorAll('*').forEach(node => {
        if (node.tagName === 'IMG') { node.remove(); return; }
        if (node.tagName === 'A') { node.replaceWith(...node.childNodes); return; }
        const span = node.getAttribute('rowspan');
        const colspan = node.getAttribute('colspan');
        [...node.attributes].forEach(attribute => node.removeAttribute(attribute.name));
        if (node.tagName === 'TD' || node.tagName === 'TH') {
          if (span && /^\d+$/.test(span)) node.setAttribute('rowspan', span);
          if (colspan && /^\d+$/.test(colspan)) node.setAttribute('colspan', colspan);
        }
      });
      return doc.body.innerHTML;
    },
    handlePaste(_view, event) {
      if ([...(event.clipboardData?.files || [])].some(file => file.type.startsWith('image/'))) {
        event.preventDefault();
        message('图片请使用“插入图片”选择本地文件。', true);
        return true;
      }
      return false;
    }
  },
  onUpdate() { if (!suppress && draft) changed(); }
});

const topToolbar = $('topToolbar');
const bottomToolbar = topToolbar.cloneNode(true);
bottomToolbar.id = 'bottomToolbar';
bottomToolbar.classList.add('toolbar-bottom');
bottomToolbar.setAttribute('aria-label', '正文格式（下方）');
bottomToolbar.querySelectorAll('[id]').forEach(element => { element.id += 'Bottom'; });
bottomToolbar.querySelectorAll('[for]').forEach(element => {
  element.htmlFor += 'Bottom';
});
bottomToolbar.querySelectorAll('[aria-controls]').forEach(element => {
  element.setAttribute('aria-controls', element.getAttribute('aria-controls') + 'Bottom');
});
$('bottomToolbarMount').replaceChildren(bottomToolbar);
const toolbars = [topToolbar, bottomToolbar];
const toolbarControl = (toolbar, id) => toolbar.querySelector(`#${id}${toolbar === bottomToolbar ? 'Bottom' : ''}`);

function changed() {
  dirty = true;
  status('未保存…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveNow().catch(error => message(error.message, true)), 700);
  schedulePreview();
}
async function saveNow() {
  if (!draft) return;
  clearTimeout(saveTimer);
  const snapshot = payload();
  dirty = false;
  status('正在保存…');
  writeChain = writeChain.catch(() => {}).then(() => api('/api/draft', snapshot));
  try {
    const saved = await writeChain;
    if (draft && draft.id === saved.id) {
      draft = saved;
      if (!dirty) status('草稿已保存');
    }
    return saved;
  } catch (error) {
    dirty = true;
    status('保存失败');
    throw error;
  }
}
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => updatePreview().catch(error => message(error.message, true)), 350);
}
async function updatePreview() {
  if (!draft) return;
  const sequence = ++previewSequence;
  const current = payload();
  const result = await api('/api/preview', current);
  if (sequence !== previewSequence) return;
  renderPreview(current, result.paragraphs);
}

function renderRuns(runs) {
  const parts = [];
  const items = runs || [];
  for (let i = 0; i < items.length;) {
    const id = items[i].linkId;
    let end = i + 1;
    if (id) while (end < items.length && items[end].linkId === id) end++;
    const text = items.slice(i, end).map(run => {
      let content = esc(run.text || '');
      if (run.bold) content = `<strong>${content}</strong>`;
      if (run.italic) content = `<em>${content}</em>`;
      if (run.strike) content = `<s>${content}</s>`;
      const style = [];
      if (run.color && !id) style.push(`color:${esc(run.color)}`);
      if (run.background) style.push(`background-color:${esc(run.background)}`);
      if (run.font) style.push('font-family:LXGWWenKai,KaiTi,serif');
      return style.length ? `<span style="${style.join(';')}">${content}</span>` : content;
    }).join('');
    parts.push(id ? `<a class="article-link" href="#article=${encodeURIComponent(id)}">${text}</a>` : text);
    i = end;
  }
  return parts.join('');
}
function imageHtml(path, alt = '考据配图') {
  const src = path.startsWith('/') ? path : `/library/${path}`;
  return `<img src="${esc(src)}" alt="${esc(alt)}">`;
}
function renderBlock(block) {
  const type = block.type;
  if (type === 'image') return `<div class="img-only">${(block.images || []).map(x => imageHtml(x, block.alt)).join('')}</div>`;
  if (type === 'quote') return `<blockquote class="markdown-quote">${(block.blocks || []).map(renderBlock).join('')}</blockquote>`;
  if (type === 'list') {
    const tag = block.ordered ? 'ol' : 'ul';
    return `<${tag} class="markdown-list">${(block.items || []).map(item => `<li>${item.map(renderBlock).join('')}</li>`).join('')}</${tag}>`;
  }
  if (type === 'table') return `<div class="markdown-table-wrap"><table class="markdown-table"><tbody>${(block.rows || []).map(row =>
    `<tr>${row.map(cell => cell ? `<td${cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : ''}${cell.colspan > 1 ? ` colspan="${cell.colspan}"` : ''}><span class="rich-text">${renderRuns(cell.runs)}</span>${(cell.images || []).map(x => imageHtml(x, '表格配图')).join('')}</td>` : '').join('')}</tr>`).join('')}</tbody></table></div>`;
  if (type === 'heading') return `<h${block.level} class="markdown-heading">${renderRuns(block.runs)}</h${block.level}>`;
  if (type === 'rule') return '<hr class="markdown-rule">';
  if ((block.images || []).length) {
    const pictures = block.images.map(x => imageHtml(x)).join('');
    if (block.mediaBlocks || (block.runs || []).some(run => (run.text || '').trim())) {
      const body = block.mediaBlocks
        ? block.mediaBlocks.map(renderBlock).join('')
        : `<span class="rich-text">${renderRuns(block.runs)}</span>`;
      return `<div class="media-row"><div class="media-imgs">${pictures}</div><div class="media-text">${body}</div></div>`;
    }
    return `<div class="img-only">${pictures}</div>`;
  }
  return `<p><span class="rich-text">${renderRuns(block.runs)}</span></p>`;
}
function renderPreview(current, blocks) {
  const frame = $('preview');
  const doc = frame.contentDocument;
  if (!doc?.body) return;
  const start = current.date_start || '未选择日期';
  let end = '';
  if (current.date_start) {
    const date = new Date(current.date_start + 'T12:00:00');
    date.setDate(date.getDate() + 6);
    end = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }
  const episode = current.source === 'main' && current.date_start
    ? ' · ' + current.date_start.replaceAll('-', '').slice(2) + '期' : '';
  doc.body.innerHTML = `<div class="library-wrap"><article class="article-card editor-article open"><div class="article-head">
    <div class="article-heading-row">
    <span class="article-title">${esc(current.title || '未命名篇目')}</span>
    ${current.source === 'extra' ? '<span class="source-badge">番外</span>' : ''}
    <span class="article-tags">${current.characters.map(x => `<span class="tag">${esc(x)}</span>`).join('')}</span>
    </div><div class="article-detail-row"><span class="article-meta">${esc(start)} 至 ${esc(end)}${esc(episode)}</span></div>
    </div><div class="article-body">${blocks.map(renderBlock).join('')}</div></article></div>`;
}
async function preparePreview() {
  const html = await fetch('/library.html', { cache: 'no-store' }).then(response => response.text());
  const page = new DOMParser().parseFromString(html, 'text/html');
  libraryCss = [...page.querySelectorAll('style')].map(style => style.textContent).join('\n');
  $('preview').srcdoc = `<!doctype html><html lang="zh-CN"><head><base href="/"><meta charset="utf-8"><style>${libraryCss}</style></head><body></body></html>`;
  $('preview').addEventListener('load', () => {
    $('preview').contentDocument.addEventListener('click', event => {
      if (event.target.closest('a')) event.preventDefault();
    });
    schedulePreview();
  });
}

function renderDrafts() {
  const groups = new Map();
  for (const item of state.drafts) {
    const date = item.date_start || '未选择日期';
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(item);
  }
  $('draftList').innerHTML = [...groups].map(([date, items]) =>
    `<h3>${esc(date)} 期</h3>${items.map(item => `<button type="button" data-draft="${esc(item.id)}" class="${draft?.id === item.id ? 'active' : ''}">${esc(item.title || '未命名篇目')}<small>${item.source === 'extra' ? '番外' : '正篇'} · ${item.published_hash ? '已发布，可修改' : '草稿'}</small></button>`).join('')}`
  ).join('') || '<p class="sidebar-note">还没有草稿。</p>';
}
function renderLinks(toolbar) {
  if (!toolbar) {
    toolbars.forEach(renderLinks);
    $('knownCharacters').innerHTML = state.characters.map(x => `<option value="${esc(x)}"></option>`).join('');
    return;
  }
  const search = toolbarControl(toolbar, 'linkSearch');
  const target = toolbarControl(toolbar, 'linkTarget');
  const query = search.value.trim().toLocaleLowerCase();
  const selected = target.value;
  const matches = query ? state.articles.filter(article =>
    String(article.title || '').toLocaleLowerCase().includes(query) ||
    String(article.date_start || '').includes(query)) : [];
  matches.sort((a, b) => {
    const rank = article => {
      const title = String(article.title || '').toLocaleLowerCase();
      return title === query ? 0 : title.startsWith(query) ? 1 : 2;
    };
    return rank(a) - rank(b) || String(b.date_start || '').localeCompare(String(a.date_start || ''));
  });
  const shown = matches.slice(0, 50);
  target.innerHTML = '<option value="">请选择搜索结果…</option>' + shown.map(a =>
    `<option value="${esc(a.id)}">${esc(a.title)} · ${esc(a.date_start)}</option>`).join('');
  target.value = shown.some(a => a.id === selected) ? selected : '';
  toolbarControl(toolbar, 'linkCount').textContent = query
    ? matches.length ? `找到 ${matches.length} 篇${matches.length > shown.length ? '，显示前 50 篇，请继续缩小范围' : ''}` : '没有匹配的篇目'
    : '输入关键词后显示结果';
}
async function refreshState() {
  state = await api('/api/state');
  renderDrafts();
  renderLinks();
  status(dirty ? '未保存…' : '图书馆状态已更新');
}
async function openDraft(id) {
  if (draft && dirty) await saveNow();
  previewSequence++;
  const loaded = await api(`/api/draft?id=${encodeURIComponent(id)}`);
  draft = loaded;
  suppress = true;
  $('title').value = loaded.title || '';
  $('source').value = loaded.source || 'main';
  $('dateStart').value = loaded.date_start || '';
  $('issueDate').value = loaded.date_start || '';
  $('characters').value = (loaded.characters || []).join('、');
  editor.commands.setContent(loaded.doc || emptyDoc());
  suppress = false;
  dirty = false;
  $('emptyState').hidden = true;
  $('editing').hidden = false;
  $('deleteDraft').hidden = Boolean(loaded.published_hash);
  message(loaded.published_hash ? '这篇已发布；修改后可再次发布，原文章 ID 会保留。' : '草稿仅保存在本机，确认后再发布。');
  status('草稿已载入');
  renderDrafts();
  schedulePreview();
}
async function newArticle() {
  const date = currentWeek($('issueDate').value);
  if (!date) { message('请先选择一期的日期。', true); $('issueDate').focus(); return; }
  if (draft && dirty) await saveNow();
  const id = crypto.randomUUID().replaceAll('-', '');
  const created = await api('/api/draft', { id, date_start: date, title: '',
    source: 'main', characters: [], doc: emptyDoc(), published_hash: null });
  await refreshState();
  await openDraft(created.id);
  $('title').focus();
}

const commands = {
  bold: () => editor.chain().focus().toggleBold().run(),
  italic: () => editor.chain().focus().toggleItalic().run(),
  strike: () => editor.chain().focus().toggleStrike().run(),
  quoteFont: () => editor.chain().focus().setFontFamily('LXGWWenKai').run(),
  bodyFont: () => editor.chain().focus().unsetFontFamily().run(),
  clearColor: () => editor.chain().focus().unsetColor().run(),
  clearHighlight: () => editor.chain().focus().unsetHighlight().run(),
  quote: () => editor.chain().focus().toggleBlockquote().run(),
  bullet: () => editor.chain().focus().toggleBulletList().run(),
  ordered: () => editor.chain().focus().toggleOrderedList().run(),
  heading5: () => editor.chain().focus().toggleHeading({ level: 5 }).run(),
  rule: () => editor.chain().focus().setHorizontalRule().run(),
  rowBefore: () => editor.chain().focus().addRowBefore().run(),
  rowAfter: () => editor.chain().focus().addRowAfter().run(),
  columnBefore: () => editor.chain().focus().addColumnBefore().run(),
  columnAfter: () => editor.chain().focus().addColumnAfter().run(),
  deleteRow: () => editor.chain().focus().deleteRow().run(),
  deleteColumn: () => editor.chain().focus().deleteColumn().run(),
  merge: () => editor.chain().focus().mergeCells().run(),
  split: () => editor.chain().focus().splitCell().run(),
  deleteTable: () => editor.chain().focus().deleteTable().run(),
  unlink: () => editor.chain().focus().unsetLink().run(),
  undo: () => editor.chain().focus().undo().run(),
  redo: () => editor.chain().focus().redo().run()
};
document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click', () => {
  if (!draft || button.disabled) return;
  commands[button.dataset.command]();
  schedulePreview();
}));
document.querySelectorAll('.context-toolbar button').forEach(button =>
  button.addEventListener('mousedown', event => event.preventDefault()));
function toggleInsert(panel, trigger, toolbar) {
  const opening = panel.hidden;
  toolbar.querySelectorAll('.insert-panel').forEach(item => { item.hidden = true; });
  toolbar.querySelectorAll('[aria-controls]').forEach(item => item.setAttribute('aria-expanded', 'false'));
  panel.hidden = !opening;
  trigger.setAttribute('aria-expanded', String(opening));
}
for (const toolbar of toolbars) {
  const control = id => toolbarControl(toolbar, id);
  control('toggleTableInsert').addEventListener('click', () =>
    toggleInsert(control('tableInsert'), control('toggleTableInsert'), toolbar));
  control('toggleLinkInsert').addEventListener('click', () => {
    toggleInsert(control('linkInsert'), control('toggleLinkInsert'), toolbar);
    if (!control('linkInsert').hidden) control('linkSearch').focus();
  });
  control('linkSearch').addEventListener('input', () => renderLinks(toolbar));
  control('insertTable').addEventListener('click', () => {
    if (!draft) return;
    const rows = Number(control('tableRows').value), cols = Number(control('tableCols').value);
    if (!Number.isInteger(rows) || rows < 1 || rows > 30 || !Number.isInteger(cols) || cols < 1 || cols > 20) {
      message('表格行数须为 1–30，列数须为 1–20。', true);
      return;
    }
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: false }).run();
    control('tableInsert').hidden = true;
    control('toggleTableInsert').setAttribute('aria-expanded', 'false');
  });
}
function updateContextToolbar() {
  const tableToolbar = $('tableToolbar'), imageToolbar = $('imageToolbar');
  const inTable = Boolean(draft && editor.isActive('table'));
  const imageSelected = Boolean(draft && editor.state.selection.node?.type.name === 'image');
  tableToolbar.hidden = !inTable;
  imageToolbar.hidden = !imageSelected;
  if (inTable) {
    const checks = {
      rowBefore: 'addRowBefore', rowAfter: 'addRowAfter', columnBefore: 'addColumnBefore',
      columnAfter: 'addColumnAfter', deleteRow: 'deleteRow', deleteColumn: 'deleteColumn',
      merge: 'mergeCells', split: 'splitCell', deleteTable: 'deleteTable'
    };
    for (const button of tableToolbar.querySelectorAll('[data-command]')) {
      button.disabled = !editor.can().chain().focus()[checks[button.dataset.command]]().run();
    }
  }
  const active = inTable ? tableToolbar : imageSelected ? imageToolbar : null;
  if (!active) return;
  const position = editor.state.selection.from;
  const located = editor.view.domAtPos(position).node;
  const element = located.nodeType === globalThis.Node.TEXT_NODE ? located.parentElement : located;
  const anchor = inTable ? element?.closest('table') : element?.closest('img');
  if (!anchor) { active.style.top = '0px'; return; }
  const container = $('editor').getBoundingClientRect(), rect = anchor.getBoundingClientRect();
  active.style.top = `${Math.max(0, rect.top - container.top + $('editor').scrollTop - active.offsetHeight - 5)}px`;
}
editor.on('selectionUpdate', updateContextToolbar);
editor.on('update', updateContextToolbar);
window.addEventListener('resize', updateContextToolbar);
function bindHexColor(input, button, label, applyColor) {
  input.addEventListener('input', () => input.removeAttribute('aria-invalid'));
  button.addEventListener('mousedown', event => event.preventDefault());
  button.addEventListener('click', () => {
    if (!draft) return;
    const raw = input.value.trim().replace(/^#/, '');
    if (!/^(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)) {
      input.setAttribute('aria-invalid', 'true');
      message(`${label}请输入 3 位或 6 位十六进制颜色，例如 #fff2a8。`, true);
      return;
    }
    const expanded = raw.length === 3 ? [...raw].map(char => char + char).join('') : raw;
    const color = '#' + expanded.toLowerCase();
    input.value = color;
    input.removeAttribute('aria-invalid');
    const { from, to } = editor.state.selection;
    applyColor(color, { from, to });
  });
}
for (const toolbar of toolbars) {
  const control = id => toolbarControl(toolbar, id);
  bindHexColor(control('textColor'), control('applyTextColor'), '字色', (color, selection) =>
    editor.chain().focus().setTextSelection(selection).setColor(color).run());
  bindHexColor(control('highlightColor'), control('applyHighlightColor'), '背景色', (color, selection) =>
    editor.chain().focus().setTextSelection(selection).setHighlight({ color }).run());
  control('insertLink').addEventListener('click', () => {
    const id = control('linkTarget').value;
    if (!id) return message('请先选择目标篇目。', true);
    if (editor.state.selection.empty) return message('请先在正文中选中要做链接的文字。', true);
    editor.chain().focus().setLink({ href: '#article=' + encodeURIComponent(id) }).run();
  });
}
function chooseImages(mode, position = null) {
  if (!draft) return;
  imageRequest = { mode, position, selection: { from: editor.state.selection.from, to: editor.state.selection.to } };
  $('imageFile').click();
}
function convertMediaToImages(position, dropImages = false) {
  const node = editor.state.doc.nodeAt(position);
  if (node?.type.name !== 'mediaRow') return;
  const images = dropImages ? [] : node.attrs.images.map(item => ({ type: 'image', attrs: item }));
  const content = node.content.toJSON();
  editor.commands.insertContentAt({ from: position, to: position + node.nodeSize },
    [...images, ...content]);
}
$('convertImage').addEventListener('click', () => {
  const selection = editor.state.selection;
  if (selection.node?.type.name !== 'image') return;
  const image = { src: selection.node.attrs.src, alt: selection.node.attrs.alt || '考据配图' };
  const following = editor.state.doc.nodeAt(selection.to);
  const hasFollowingText = following?.type.name === 'paragraph';
  const content = hasFollowingText ? [following.toJSON()] : [{ type: 'paragraph' }];
  const to = selection.to + (hasFollowingText ? following.nodeSize : 0);
  editor.commands.insertContentAt({ from: selection.from, to },
    { type: 'mediaRow', attrs: { images: [image] }, content });
  editor.commands.focus();
});
for (const toolbar of toolbars) {
  toolbarControl(toolbar, 'addImage').addEventListener('click', () => chooseImages('standalone'));
  toolbarControl(toolbar, 'addMediaRow').addEventListener('click', () => chooseImages('newMedia'));
}
$('imageFile').addEventListener('change', async event => {
  const files = [...(event.target.files || [])];
  const request = imageRequest;
  imageRequest = null;
  event.target.value = '';
  if (!files.length || !draft || !request) return;
  try {
    const images = [];
    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} 超过 20 MB。`);
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('读取图片失败'));
        reader.readAsDataURL(file);
      });
      const uploaded = await api('/api/image', { id: draft.id, data });
      images.push({ src: uploaded.src, alt: file.name });
    }
    if (request.mode === 'appendMedia') {
      const node = editor.state.doc.nodeAt(request.position);
      if (node?.type.name !== 'mediaRow') throw new Error('图文段位置已变化，请重新选择图片。');
      editor.commands.command(({ tr }) => {
        tr.setNodeMarkup(request.position, undefined, { ...node.attrs, images: [...node.attrs.images, ...images] });
        return true;
      });
    } else if (request.mode === 'newMedia') {
      editor.commands.insertContentAt(request.selection,
        { type: 'mediaRow', attrs: { images }, content: [{ type: 'paragraph' }] });
      editor.commands.focus();
    } else {
      editor.commands.insertContentAt(request.selection,
        images.map(item => ({ type: 'image', attrs: item })));
    }
    message(images.length > 1 ? `已加入 ${images.length} 张图片。` : '图片已放入草稿。');
  } catch (error) { message(error.message, true); }
});
['title', 'source', 'dateStart', 'characters'].forEach(id => $(id).addEventListener('input', changed));
$('dateStart').addEventListener('change', () => {
  const normalized = currentWeek($('dateStart').value);
  if (normalized && normalized !== $('dateStart').value) {
    $('dateStart').value = normalized;
    message('所属期已调整为当周周日。');
    changed();
  }
});
$('newArticle').addEventListener('click', () => newArticle().catch(error => message(error.message, true)));
$('draftList').addEventListener('click', event => {
  const button = event.target.closest('[data-draft]');
  if (button) openDraft(button.dataset.draft).catch(error => message(error.message, true));
});
$('saveDraft').addEventListener('click', () => saveNow().then(() => {
  refreshState(); message('草稿已保存。');
}).catch(error => message(error.message, true)));
$('deleteDraft').addEventListener('click', async () => {
  if (!draft || draft.published_hash) return;
  if (!confirm(`确定删除未发布草稿《${$('title').value || '未命名篇目'}》及其草稿图片吗？`)) return;
  clearTimeout(saveTimer);
  clearTimeout(previewTimer);
  await writeChain.catch(() => {});
  try {
    await api('/api/delete-draft', { id: draft.id });
    draft = null;
    dirty = false;
    $('editing').hidden = true;
    $('emptyState').hidden = false;
    $('preview').contentDocument.body.innerHTML = '';
    await refreshState();
  } catch (error) { message(error.message, true); }
});
$('refreshLibrary').addEventListener('click', () => refreshState().then(() => {
  message('已重新读取图书馆状态；请核对本篇内容后再发布。');
}).catch(error => message(error.message, true)));
$('publish').addEventListener('click', async () => {
  if (!draft) return;
  $('publish').disabled = true;
  try {
    await saveNow();
    const result = await api('/api/publish', { id: draft.id, libraryHash: state.libraryHash });
    draft = await api(`/api/draft?id=${encodeURIComponent(draft.id)}`);
    $('deleteDraft').hidden = true;
    await refreshState();
    message(`发布成功。已备份旧图书馆数据。`);
    const link = document.createElement('a');
    link.href = `/library.html#article=${encodeURIComponent(result.articleId)}`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = '在图书馆查看并生成长图 ↗';
    $('message').append(' ', link);
  } catch (error) { message(error.message, true); }
  finally { $('publish').disabled = false; }
});
window.addEventListener('beforeunload', event => {
  if (dirty) { event.preventDefault(); event.returnValue = ''; }
});

async function start() {
  if (!token) throw new Error('请通过“启动编辑器.bat”打开，不要直接打开 HTML 文件。');
  await preparePreview();
  await refreshState();
  const today = new Date();
  $('issueDate').value = currentWeek(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
  status('就绪');
}
start().catch(error => { status('启动失败'); message(error.message, true); });
