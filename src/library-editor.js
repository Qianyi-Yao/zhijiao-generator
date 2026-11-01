import { Editor, Extension, Node } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { Image } from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import { FontFamily } from '@tiptap/extension-font-family';
import { Highlight } from '@tiptap/extension-highlight';
import { Plugin } from '@tiptap/pm/state';
import katex from 'katex';
import { buildRelationshipData, createRelationshipView } from './relationship-graph.js';

const $ = id => document.getElementById(id);
const token = new URLSearchParams(location.search).get('token') || '';
const emptyDoc = () => ({ type: 'doc', content: [{ type: 'paragraph' }] });
const characterById = new Map(characters.filter(item => Number.isInteger(item.cardId)).map(item => [item.cardId, item]));
const dynastyByName = new Map(characters.map(item => [item.name, item.dynasty || '未归类']));
let characterRoster = [];
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
let selectedWeek = '';
let calendar;
let scoreArticles = null;
let scoreMode = 'people';
let scoreExpanded = false;
let scoreLoadError = false;
let scoreReleaseDates = null;
let scoreRangePicker;
let scoreFrom = '';
let scoreTo = '';
let scoreSingleBound = 'from';
let relationshipData = null;
let relationshipView = null;

const MediaRow = Node.create({
  name: 'mediaRow',
  group: 'block',
  content: '(paragraph|blockquote|mathBlock|table)+',
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

const MediaRowTrailingParagraph = Extension.create({
  name: 'mediaRowTrailingParagraph',
  addProseMirrorPlugins() {
    return [new Plugin({
      appendTransaction(transactions, _oldState, state) {
        if (!transactions.some(transaction => transaction.docChanged)) return null;
        const positions = [];
        state.doc.descendants((node, pos) => {
          if (node.type.name === 'mediaRow' && node.lastChild?.type.name === 'table') {
            positions.push(pos + node.nodeSize - 1);
          }
        });
        if (!positions.length) return null;
        const tr = state.tr;
        for (const pos of positions.reverse()) {
          tr.insert(pos, state.schema.nodes.paragraph.create());
        }
        return tr;
      }
    })];
  }
});

function renderMath(root) {
  root.querySelectorAll('.markdown-math[data-latex]').forEach(element => {
    katex.render(element.dataset.latex, element, {
      displayMode: true, throwOnError: false, trust: false, strict: 'ignore'
    });
  });
}

const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  parseHTML() { return [{ tag: 'div[data-math-block]' }]; },
  renderHTML() { return ['div', { 'data-math-block': '' }, 0]; },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.className = 'editor-math-block';
      const source = document.createElement('div');
      source.className = 'editor-math-source';
      const preview = document.createElement('div');
      preview.className = 'markdown-math';
      preview.contentEditable = 'false';
      dom.append(source, preview);
      const paint = current => katex.render(current.textContent || '\\;', preview, {
        displayMode: true, throwOnError: false, trust: false, strict: 'ignore'
      });
      paint(node);
      return { dom, contentDOM: source, update(updated) {
        if (updated.type.name !== 'mathBlock') return false;
        paint(updated);
        return true;
      } };
    };
  }
});

const MathShortcut = Extension.create({
  name: 'mathShortcut',
  priority: 1000,
  addKeyboardShortcuts() {
    return { Enter: () => {
      const { state, view } = this.editor;
      const { $from, empty } = state.selection;
      if (!empty) return false;
      const parent = $from.parent;
      if (parent.type.name === 'paragraph' && parent.textContent === '$$' &&
          $from.parentOffset === parent.content.size) {
        // Keep table cells in their existing text-only publication format.
        for (let depth = $from.depth - 1; depth > 0; depth--) {
          if (['tableCell', 'tableHeader'].includes($from.node(depth).type.name)) return false;
        }
        const start = $from.before();
        const tr = state.tr.setNodeMarkup(start, state.schema.nodes.mathBlock);
        tr.delete(start + 1, start + 3);
        view.dispatch(tr.setSelection(state.selection.constructor.near(tr.doc.resolve(start + 1))));
        return true;
      }
      if (parent.type.name !== 'mathBlock') return false;
      const text = parent.textContent;
      if ($from.parentOffset === parent.content.size && text.endsWith('\n$$')) {
        const tr = state.tr.delete($from.pos - 3, $from.pos);
        const end = tr.mapping.map($from.after());
        tr.insert(end, state.schema.nodes.paragraph.create());
        view.dispatch(tr.setSelection(state.selection.constructor.near(tr.doc.resolve(end + 1))));
      } else {
        view.dispatch(state.tr.insertText('\n'));
      }
      return true;
    } };
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
function todayWeek() {
  const today = new Date();
  return currentWeek(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
}
function weekEnd(start) {
  const end = new Date(start + 'T12:00:00');
  end.setDate(end.getDate() + 6);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
}
function selectWeek(start) {
  selectedWeek = start;
  calendar.setDate(start, false);
  calendar.redraw();
  renderDrafts();
}
function initCalendar() {
  calendar = flatpickr($('weekPicker'), {
    locale: { ...flatpickr.l10ns.zh, firstDayOfWeek: 0 },
    dateFormat: 'Y-m-d', disableMobile: true,
    onChange(dates) {
      if (!dates.length) return;
      const day = dates[0];
      selectedWeek = currentWeek(`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`);
      calendar.redraw();
      renderDrafts();
    },
    onDayCreate(_dates, _value, _instance, day) {
      const date = day.dateObj;
      const week = currentWeek(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
      if (week === selectedWeek) day.classList.add('library-week');
    }
  });
  selectWeek(todayWeek());
}
function tagsFromInput() {
  return [...new Set($('characters').value.split(/[、,，;；]/).map(x => x.trim()).filter(Boolean))];
}
function sourceValue() { return draft?.source === 'easter' ? 'easter' : $('source').value; }
function payload() {
  const pair = [$('pairFirst').value, $('pairSecond').value].filter(Boolean).map(Number);
  return { id: draft.id, date_start: $('dateStart').value, title: $('title').value,
    source: sourceValue(), characters: sourceValue() === 'easter' ? [] : tagsFromInput(),
    pair_card_ids: sourceValue() === 'easter' ? pair : [],
    doc: editor.getJSON(), published_hash: draft.published_hash || null };
}
function updateSourceFields() {
  const easter = sourceValue() === 'easter';
  $('regularSourceField').hidden = easter;
  $('easterSourceField').hidden = !easter;
  $('dateField').hidden = easter;
  $('pairFields').hidden = !easter;
  $('charactersField').hidden = easter;
  if (easter) $('dateStart').value = '';
  else {
    for (const key of ['pairFirst', 'pairSecond']) {
      $(key).value = '';
      $(key + 'Search').value = '';
      closePairResults(key);
    }
  }
}
const pairSearchState = {
  pairFirst: { matches: [], active: 0 },
  pairSecond: { matches: [], active: 0 }
};
function pairLabel(id) {
  const person = characterById.get(Number(id));
  return person ? `${person.name} · ${person.cardId}` : '';
}
function closePairResults(key) {
  $(key + 'Results').hidden = true;
  $(key + 'Search').setAttribute('aria-expanded', 'false');
  $(key + 'Search').removeAttribute('aria-activedescendant');
}
function renderPairResults(key) {
  const input = $(key + 'Search');
  const results = $(key + 'Results');
  const query = input.value.trim().toLocaleLowerCase();
  const state = pairSearchState[key];
  const selected = characterRoster.find(person => person.cardId === Number($(key).value));
  state.matches = (query === pairLabel($(key).value).toLocaleLowerCase() && selected
    ? [selected]
    : characterRoster.filter(person => !query || person.name.toLocaleLowerCase().includes(query) ||
      String(person.cardId).includes(query))).slice(0, 30);
  state.active = Math.min(state.active, Math.max(0, state.matches.length - 1));
  results.innerHTML = state.matches.length ? state.matches.map((person, index) =>
    `<button id="${key}Option${index}" type="button" role="option" data-pair-option="${person.cardId}" class="${index === state.active ? 'active' : ''}" aria-selected="${index === state.active}">${person.cardId} · ${esc(person.name)}</button>`).join('')
    : '<p>没有找到人物，请换个姓名或编号。</p>';
  results.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  if (state.matches.length) input.setAttribute('aria-activedescendant', `${key}Option${state.active}`);
  else input.removeAttribute('aria-activedescendant');
  results.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
}
function selectPair(key, id) {
  const other = key === 'pairFirst' ? 'pairSecond' : 'pairFirst';
  if ($(other).value === String(id)) {
    message('两个人物不能相同，请选择另一位。', true);
    return;
  }
  $(key).value = String(id);
  $(key + 'Search').value = pairLabel(id);
  closePairResults(key);
  changed();
}
for (const key of ['pairFirst', 'pairSecond']) {
  const input = $(key + 'Search');
  const results = $(key + 'Results');
  input.addEventListener('focus', () => { input.select(); pairSearchState[key].active = 0; renderPairResults(key); });
  input.addEventListener('input', () => {
    $(key).value = '';
    pairSearchState[key].active = 0;
    renderPairResults(key);
    changed();
  });
  input.addEventListener('keydown', event => {
    const state = pairSearchState[key];
    if (event.key === 'Escape') { closePairResults(key); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (results.hidden) renderPairResults(key);
      if (state.matches.length) {
        state.active = (state.active + (event.key === 'ArrowDown' ? 1 : -1) + state.matches.length) % state.matches.length;
        renderPairResults(key);
      }
    } else if (event.key === 'Enter' && !results.hidden && state.matches.length) {
      event.preventDefault();
      selectPair(key, state.matches[state.active].cardId);
    }
  });
  results.addEventListener('pointerdown', event => { if (event.target.closest('button')) event.preventDefault(); });
  results.addEventListener('click', event => {
    const option = event.target.closest('[data-pair-option]');
    if (option) selectPair(key, option.dataset.pairOption);
  });
}
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('.pair-search')) {
    closePairResults('pairFirst');
    closePairResults('pairSecond');
  }
});
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
    MathBlock, MathShortcut, MediaRow, MediaRowTrailingParagraph,
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
    syncDraftSummary(saved);
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
  if (type === 'math') return `<div class="markdown-math" data-latex="${esc(block.latex || '')}"></div>`;
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
  const isEaster = current.source === 'easter';
  const start = current.date_start || '未选择日期';
  let end = '';
  if (current.date_start) {
    const date = new Date(current.date_start + 'T12:00:00');
    date.setDate(date.getDate() + 6);
    end = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }
  const episode = current.source === 'main' && current.date_start
    ? ' · ' + current.date_start.replaceAll('-', '').slice(2) + '期' : '';
  const previewTags = current.source === 'easter'
    ? (current.pair_card_ids || []).map(id => characterById.get(id)?.name).filter(Boolean)
    : current.characters;
  doc.body.innerHTML = `<div class="library-wrap"><article class="article-card editor-article open"><div class="article-head">
    <div class="article-heading-row">
    <span class="article-title">${esc(current.title || '未命名篇目')}</span>
    ${current.source === 'extra' ? '<span class="source-badge">番外</span>' : isEaster ? '<span class="source-badge">奇遇</span>' : ''}
    <span class="article-tags">${previewTags.map(x => `<span class="tag">${esc(x)}</span>`).join('')}</span>
    </div><div class="article-detail-row"><span class="article-meta">${isEaster ? '隐藏彩蛋' : `${esc(start)} 至 ${esc(end)}${esc(episode)}`}</span></div>
    </div><div class="article-body">${blocks.map(renderBlock).join('')}</div></article></div>`;
  renderMath(doc.body);
}
async function preparePreview() {
  const html = await fetch('/library.html', { cache: 'no-store' }).then(response => response.text());
  const page = new DOMParser().parseFromString(html, 'text/html');
  libraryCss = [...page.querySelectorAll('style')].map(style => style.textContent).join('\n');
  $('preview').srcdoc = `<!doctype html><html lang="zh-CN"><head><base href="/"><meta charset="utf-8"><link rel="stylesheet" href="/vendor/katex/katex.min.css"><style>${libraryCss}</style><style>.media-row{flex-direction:row}.media-imgs{flex:0 0 min(180px,35%);width:min(180px,35%)}</style></head><body></body></html>`;
  $('preview').addEventListener('load', () => {
    $('preview').contentDocument.addEventListener('click', event => {
      if (event.target.closest('a')) event.preventDefault();
    });
    schedulePreview();
  });
}

function draftButton(item) {
  return `<button type="button" data-draft="${esc(item.id)}" class="${draft?.id === item.id ? 'active' : ''}">${esc(item.title || '未命名篇目')}<small>${item.source === 'easter' ? '奇遇' : item.source === 'extra' ? '番外' : '正篇'} · ${item.published_hash ? '已发布，可修改' : '草稿'}</small></button>`;
}
function renderDrafts() {
  const regular = state.drafts.filter(item => item.source !== 'easter' && item.date_start === selectedWeek);
  const easter = state.drafts.filter(item => item.source === 'easter');
  $('weekPicker').value = selectedWeek + ' 至 ' + weekEnd(selectedWeek);
  $('newArticle').textContent = '＋ 新建篇目';
  $('weekLabel').textContent = selectedWeek === todayWeek() ? '本周 · 日至六' : '所选周 · 日至六';
  $('currentWeek').disabled = selectedWeek === todayWeek();
  $('draftList').innerHTML = regular.length
    ? regular.map(draftButton).join('')
    : '<p class="draft-empty">这一周还没有编辑器篇目。</p>';
  $('easterCount').textContent = `(${easter.length})`;
  $('easterDraftList').innerHTML = easter.length
    ? easter.map(draftButton).join('')
    : '<p class="draft-empty">还没有奇遇草稿。</p>';
}
function syncDraftSummary(saved) {
  const summary = { id: saved.id, title: saved.title, date_start: saved.date_start,
    source: saved.source, characters: saved.characters,
    published_hash: saved.published_hash, updated_at: saved.updated_at };
  const index = state.drafts.findIndex(item => item.id === saved.id);
  if (index < 0) state.drafts.unshift(summary);
  else state.drafts[index] = summary;
  state.drafts.sort((a, b) => String(b.date_start || '').localeCompare(String(a.date_start || '')) ||
    String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  renderDrafts();
}
function updateScoreRange(dates) {
  const days = dates.map(day => flatpickr.formatDate(day, 'Y-m-d'));
  scoreFrom = days.length > 1 || scoreSingleBound === 'from' ? days[0] || '' : '';
  scoreTo = days.length > 1 ? days[1] : scoreSingleBound === 'to' ? days[0] || '' : '';
  $('scoreRange').value = days.length > 1 ? `${days[0]}  —  ${days[1]}`
    : days.length ? `${scoreSingleBound === 'to' ? '截至' : '从'} ${days[0]}` : '全时间';
  $('scoreRangeHint').textContent = days.length > 1 ? '起止日期均计入统计' : days.length ? '再选一天可组成时间段' : '点击日历，选起始日和结束日';
  $('scoreRangeClear').hidden = !days.length;
  $('scoreOneDay').hidden = days.length !== 1;
  for (const button of document.querySelectorAll('[data-score-bound]')) {
    button.setAttribute('aria-pressed', String(button.dataset.scoreBound === scoreSingleBound));
  }
  scoreExpanded = false;
  renderScores();
}
function initScoreCalendar() {
  scoreRangePicker = flatpickr($('scoreRange'), {
    locale: { ...flatpickr.l10ns.zh, firstDayOfWeek: 0 },
    mode: 'range', dateFormat: 'Y-m-d', disableMobile: true,
    position: 'auto right',
    onReady(_dates, _value, instance) { instance.calendarContainer.classList.add('score-range-calendar'); },
    onChange(dates) { updateScoreRange(dates); }
  });
  updateScoreRange([]);
}
function renderScores() {
  if (!scoreArticles) return;
  const from = scoreFrom;
  const to = scoreTo;
  for (const tab of document.querySelectorAll('[data-score-tab]')) {
    const active = tab.dataset.scoreTab === scoreMode;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  $('scoreList').setAttribute('aria-labelledby', scoreMode === 'people' ? 'scorePeopleTab' : 'scoreDynastyTab');
  $('scoreList').classList.toggle('expanded', scoreExpanded);
  const people = new Map();
  const dynasties = new Map();
  let articleCount = 0;
  for (const article of scoreArticles) {
    const start = article.date_start || '';
    const end = article.date_end || start;
    if ((from || to) && (!start || (from && end < from) || (to && start > to))) continue;
    articleCount++;
    const points = article.source === 'extra' || article.source === 'easter' ? 1 : 10;
    const tags = new Set((article.characters || []).filter(tag => typeof tag === 'string').map(tag => tag.trim()).filter(Boolean));
    for (const name of tags) {
      people.set(name, (people.get(name) || 0) + points);
      const dynasty = dynastyByName.get(name) || '未归类';
      dynasties.set(dynasty, (dynasties.get(dynasty) || 0) + points);
    }
  }
  const scores = scoreMode === 'people' ? people : dynasties;
  const ranked = [...scores].map(([name, points]) => ({ name, points }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'zh-CN'));
  $('scoreStatus').textContent = `${scoreLoadError ? '更新失败，显示上次数据 · ' : ''}${scoreReleaseDates ? '' : '实装时间读取失败 · '}${articleCount} 篇 · ${ranked.length} ${scoreMode === 'people' ? '人' : '朝代'}`;
  if (!ranked.length) {
    $('scoreList').innerHTML = '<p class="score-empty">此时间范围没有可计分的标签。</p>';
    $('scoreExpand').hidden = true;
    return;
  }
  const highest = ranked[0].points;
  const shown = scoreExpanded ? ranked : ranked.slice(0, 10);
  $('scoreList').innerHTML = '<ol>' + shown.map((item, index) => {
    const release = scoreReleaseDates?.get(item.name);
    const releaseLabel = !scoreReleaseDates ? '读取失败' : !release ? '待补' : release.date || '未实装';
    const releaseMark = scoreMode === 'people'
      ? `<span class="score-person"><span class="score-name">${esc(item.name)}</span><span class="score-release${release && !release.date ? ' unreleased' : ''}" title="实装时间${release?.note ? ` · ${esc(release.note)}` : ''}">${esc(releaseLabel)}</span></span>`
      : `<span class="score-name">${esc(item.name)}</span>`;
    return `<li><div class="score-row"><span class="score-position">${index + 1}</span>${releaseMark}<span class="score-points">${item.points} 分</span></div><div class="score-track" aria-hidden="true"><div class="score-bar" style="width:${Math.max(4, item.points / highest * 100)}%"></div></div></li>`;
  }).join('') + '</ol>';
  $('scoreExpand').hidden = ranked.length <= 10;
  $('scoreExpand').textContent = scoreExpanded ? '收起至前 10 名' : `展开全部 ${ranked.length} 名`;
}
function renderRelationshipMonitor() {
  if (!scoreArticles) return;
  relationshipData = buildRelationshipData(characterRoster, scoreArticles);
  const { nodes, edges, articleCount, unmatched } = relationshipData;
  $('relationshipSummary').textContent = `${scoreLoadError ? '更新失败，显示上次数据 · ' : ''}${nodes.length} 位名士 · ${edges.length} 组关系 · ${articleCount} 篇奇遇${unmatched ? ` · ${unmatched} 篇配对资料不完整` : ''}`;
  $('relationshipOpen').disabled = false;
  $('relationshipNames').innerHTML = nodes.map(person => `<option value="${esc(person.name)}"></option>`).join('');
  if (!$('relationshipDialog').hidden) showRelationshipGraph();
}
function relationshipDetails(item) {
  if (!item) return '<p>点击头像查看人物奇遇，或点击连线查看两人的篇目。</p>';
  const person = id => relationshipData.nodes.find(node => node.id === Number(id));
  const edge = item.source && item.target ? relationshipData.edges.find(pair => pair.id === item.id.replace(/^pair-/, '')) : null;
  const links = articles => articles.map(article => `<li><a href="/library.html#article=${encodeURIComponent(article.id)}" target="_blank" rel="noopener">${esc(article.title)} ↗</a></li>`).join('');
  if (edge) return `<h3>${esc(person(edge.source)?.name)}与${esc(person(edge.target)?.name)}</h3><p>${edge.articles.length} 篇已发布奇遇</p><ul>${links(edge.articles)}</ul>`;
  const node = person(item.id);
  if (!node) return '<p>人物资料暂不可用。</p>';
  const related = relationshipData.edges.filter(pair => pair.source === node.id || pair.target === node.id);
  return `<h3>${esc(node.name)}</h3>${related.length ? `<p>${related.length} 组关系</p><ul>${related.map(pair => {
    const other = person(pair.source === node.id ? pair.target : pair.source);
    return `<li><strong>${esc(other?.name)}</strong><ul>${links(pair.articles)}</ul></li>`;
  }).join('')}</ul>` : '<p>尚无已发布奇遇。</p>'}`;
}
function showRelationshipGraph() {
  relationshipView?.destroy();
  $('relationshipDetail').innerHTML = relationshipDetails(null);
  relationshipView = createRelationshipView($('relationshipCanvas'), relationshipData, {
    onSelect(item) { $('relationshipDetail').innerHTML = relationshipDetails(item); },
    onHover(item, pointer) {
      const tooltip = $('relationshipTooltip');
      if (!item || !Number.isFinite(pointer?.clientX) || !Number.isFinite(pointer?.clientY)) { tooltip.hidden = true; return; }
      const rect = $('relationshipCanvas').getBoundingClientRect();
      const edge = item.source && item.target ? relationshipData.edges.find(pair => pair.id === item.id.replace(/^pair-/, '')) : null;
      tooltip.textContent = edge
        ? `${relationshipData.nodes.find(node => node.id === edge.source)?.name} · ${relationshipData.nodes.find(node => node.id === edge.target)?.name}（${edge.articles.length} 篇）`
        : item.name;
      tooltip.hidden = false;
      tooltip.style.left = `${Math.max(8, Math.min(pointer.clientX - rect.left + 14, rect.width - tooltip.offsetWidth - 8))}px`;
      tooltip.style.top = `${Math.max(8, pointer.clientY - rect.top - 34)}px`;
    }
  });
}
function closeRelationshipGraph() {
  $('relationshipDialog').hidden = true;
  document.body.classList.remove('relationship-open');
  $('relationshipTooltip').hidden = true;
  relationshipView?.destroy();
  relationshipView = null;
  $('relationshipOpen').focus();
}
async function loadScores() {
  const releaseRequest = fetch('/library/data/character_release_dates.json', { cache: 'no-store' })
    .then(async response => {
      if (!response.ok) throw new Error(`读取实装时间失败 (${response.status})`);
      const table = await response.json();
      if (!Array.isArray(table.rows)) throw new Error('实装时间表格式无效');
      return new Map(table.rows.map(row => [row[2], { date: row[3], note: row[4] }]));
    }).catch(() => null);
  try {
    const response = await fetch('/library/data/library.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`读取图书馆失败 (${response.status})`);
    const data = await response.json();
    if (!Array.isArray(data.articles)) throw new Error('图书馆文章格式无效');
    scoreArticles = data.articles;
    scoreReleaseDates = await releaseRequest;
    scoreLoadError = false;
    renderScores();
    renderRelationshipMonitor();
  } catch (error) {
    scoreLoadError = true;
    if (scoreArticles) { renderScores(); renderRelationshipMonitor(); }
    else {
      $('scoreStatus').textContent = '读取失败';
      $('scoreList').innerHTML = `<p class="score-empty">${esc(error.message)}</p>`;
      $('relationshipSummary').textContent = `读取失败：${error.message}`;
    }
  }
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
  $('source').value = loaded.source === 'extra' ? 'extra' : 'main';
  $('dateStart').value = loaded.date_start || '';
  $('pairFirst').value = String(loaded.pair_card_ids?.[0] || '');
  $('pairSecond').value = String(loaded.pair_card_ids?.[1] || '');
  $('pairFirstSearch').value = pairLabel($('pairFirst').value);
  $('pairSecondSearch').value = pairLabel($('pairSecond').value);
  updateSourceFields();
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
  const date = selectedWeek || todayWeek();
  if (draft && dirty) await saveNow();
  const id = crypto.randomUUID().replaceAll('-', '');
  const created = await api('/api/draft', { id, date_start: date, title: '',
    source: 'main', characters: [], doc: emptyDoc(), published_hash: null });
  selectWeek(date);
  await refreshState();
  await openDraft(created.id);
  $('title').focus();
}
async function newEaster() {
  if (draft && dirty) await saveNow();
  const id = crypto.randomUUID().replaceAll('-', '');
  const created = await api('/api/draft', { id, date_start: '', title: '',
    source: 'easter', characters: [], pair_card_ids: [], doc: emptyDoc(), published_hash: null });
  $('easterDetails').open = true;
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
function closeLinkInsert(toolbar) {
  toolbarControl(toolbar, 'linkInsert').hidden = true;
  toolbarControl(toolbar, 'toggleLinkInsert').setAttribute('aria-expanded', 'false');
}
function moveLinkChoice(target, direction) {
  const choices = [...target.options].filter(option => option.value);
  if (!choices.length) return;
  const current = choices.findIndex(option => option.value === target.value);
  const next = current < 0
    ? (direction > 0 ? 0 : choices.length - 1)
    : Math.max(0, Math.min(choices.length - 1, current + direction));
  target.value = choices[next].value;
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
  control('linkSearch').addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveLinkChoice(control('linkTarget'), event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (control('linkTarget').value) control('insertLink').click();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeLinkInsert(toolbar);
      control('toggleLinkInsert').focus();
    }
  });
  control('linkTarget').addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveLinkChoice(control('linkTarget'), event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      control('insertLink').click();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeLinkInsert(toolbar);
      control('toggleLinkInsert').focus();
    }
  });
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
document.addEventListener('pointerdown', event => {
  for (const toolbar of toolbars) {
    const panel = toolbarControl(toolbar, 'linkInsert');
    const trigger = toolbarControl(toolbar, 'toggleLinkInsert');
    if (!panel.hidden && !panel.contains(event.target) && !trigger.contains(event.target)) {
      closeLinkInsert(toolbar);
    }
  }
});
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
function normalizeHexColor(value) {
  const raw = value.trim().replace(/^#/, '');
  if (!/^(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)) return null;
  const expanded = raw.length === 3 ? [...raw].map(char => char + char).join('') : raw;
  return '#' + expanded.toUpperCase();
}
function bindHexColor(input, button, label, applyColor) {
  const swatch = input.closest('label').querySelector('.color-swatch');
  const updateSwatch = () => {
    const color = normalizeHexColor(input.value);
    swatch.classList.toggle('invalid', !color);
    swatch.style.backgroundColor = color || '';
  };
  updateSwatch();
  input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    updateSwatch();
  });
  button.addEventListener('mousedown', event => event.preventDefault());
  button.addEventListener('click', () => {
    if (!draft) return;
    const color = normalizeHexColor(input.value);
    if (!color) {
      input.setAttribute('aria-invalid', 'true');
      message(`${label}请输入 3 位或 6 位十六进制颜色，例如 #fff2a8。`, true);
      return;
    }
    input.value = color;
    input.removeAttribute('aria-invalid');
    updateSwatch();
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
    closeLinkInsert(toolbar);
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
['title', 'dateStart', 'characters'].forEach(id => $(id).addEventListener('input', changed));
$('source').addEventListener('change', () => { updateSourceFields(); changed(); });
$('dateStart').addEventListener('change', () => {
  const normalized = currentWeek($('dateStart').value);
  if (normalized && normalized !== $('dateStart').value) {
    $('dateStart').value = normalized;
    message('所属期已调整为当周周日。');
    changed();
  }
});
$('newArticle').addEventListener('click', () => newArticle().catch(error => message(error.message, true)));
$('newEaster').addEventListener('click', () => newEaster().catch(error => message(error.message, true)));
$('currentWeek').addEventListener('click', () => selectWeek(todayWeek()));
$('scoreRangeClear').addEventListener('click', () => {
  scoreRangePicker.clear(false);
  scoreSingleBound = 'from';
  updateScoreRange([]);
});
for (const button of document.querySelectorAll('[data-score-bound]')) {
  button.addEventListener('click', () => {
    scoreSingleBound = button.dataset.scoreBound;
    updateScoreRange(scoreRangePicker.selectedDates);
  });
}
for (const tab of document.querySelectorAll('[data-score-tab]')) {
  tab.addEventListener('click', () => { scoreMode = tab.dataset.scoreTab; scoreExpanded = false; renderScores(); });
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    scoreMode = event.key === 'ArrowLeft' || event.key === 'Home' ? 'people' : 'dynasties';
    scoreExpanded = false;
    renderScores();
    $(scoreMode === 'people' ? 'scorePeopleTab' : 'scoreDynastyTab').focus();
  });
}
$('scoreExpand').addEventListener('click', () => {
  scoreExpanded = !scoreExpanded;
  renderScores();
  if (!scoreExpanded) $('scoreList').scrollTop = 0;
});
$('relationshipOpen').addEventListener('click', () => {
  if (!relationshipData) return;
  $('relationshipDialog').hidden = false;
  document.body.classList.add('relationship-open');
  showRelationshipGraph();
  $('relationshipSearch').focus();
});
$('relationshipClose').addEventListener('click', closeRelationshipGraph);
$('relationshipDialog').addEventListener('click', event => {
  if (event.target === $('relationshipDialog')) closeRelationshipGraph();
});
$('relationshipReset').addEventListener('click', () => {
  $('relationshipSearch').value = '';
  $('relationshipSearchStatus').textContent = '';
  relationshipView?.reset();
});
$('relationshipSearchForm').addEventListener('submit', event => {
  event.preventDefault();
  const query = $('relationshipSearch').value.trim();
  if (!query) { $('relationshipSearchStatus').textContent = '请输入姓名。'; return; }
  const match = relationshipData.nodes.find(node => node.name === query) ||
    relationshipData.nodes.find(node => node.name.includes(query));
  $('relationshipSearchStatus').textContent = match ? `已找到：${match.name}` : '没有找到这位名士。';
  if (match) relationshipView?.selectPerson(match.id);
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's') {
    event.preventDefault();
    if (!event.repeat) $('saveDraft').click();
    return;
  }
  if ($('relationshipDialog').hidden) return;
  if (event.key === 'Escape') { closeRelationshipGraph(); return; }
  if (event.key !== 'Tab') return;
  const focusable = [...$('relationshipDialog').querySelectorAll('button, input, a[href]')].filter(element => !element.disabled);
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
for (const list of [$('draftList'), $('easterDraftList')]) {
  list.addEventListener('click', event => {
    const button = event.target.closest('[data-draft]');
    if (button) openDraft(button.dataset.draft).catch(error => message(error.message, true));
  });
}
$('saveDraft').addEventListener('click', () => saveNow().then(() => {
  message('草稿已保存。');
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
$('refreshLibrary').addEventListener('click', () => refreshState().then(loadScores).then(() => {
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
    await loadScores();
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
  const rosterResponse = await fetch('/library/data/抽选人物名单.csv', { cache: 'no-store' });
  if (!rosterResponse.ok) throw new Error('无法读取抽选人物名单，请确认 CSV 文件存在。');
  const rosterCsv = (await rosterResponse.text()).replace(/^\uFEFF/, '');
  const rosterIds = new Set(rosterCsv.split(/\r?\n/).slice(1)
    .map(line => Number(line.split(',')[0])).filter(Number.isInteger));
  characterRoster = characters.filter(person => rosterIds.has(person.cardId));
  if (characterRoster.length < 2) throw new Error('抽选人物名单不足两人，请检查 CSV 文件。');
  for (const toolbar of toolbars) {
    const input = toolbarControl(toolbar, 'textColor');
    input.value = '#2E6A67';
    input.dispatchEvent(new Event('input'));
  }
  await preparePreview();
  initCalendar();
  initScoreCalendar();
  await refreshState();
  await loadScores();
  status('就绪');
}
start().catch(error => { status('启动失败'); message(error.message, true); });
