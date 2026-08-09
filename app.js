/* =========================
   02. 默认工程与空白工程
   ========================= */
const defaultState = () => ({
  version:1,authorId:'yuanhong',content:'山河辽阔，四时各有意趣。今日偶得半日清闲，便与诸君共记眼前风物。',collapsed:false,topic:'故人闲话',time:'刚刚',location:'平城',likes:128,imageData:'',imageFit:'contain',comments:[
    {id:uid(),authorId:'jieyougongzhu',replyTo:'',text:'如此清景，确宜与故人同赏。',time:'1分钟前'},
    {id:uid(),authorId:'yuefei',replyTo:'yuanhong',text:'他日若有闲暇，也愿亲往一观。',time:'刚刚'}
  ]
});

const blankState = () => ({
    version: 1,
    authorId: 'yuanhong',
    content: '',
    collapsed: false,
    topic: '',
    time: '',
    location: '',
    likes: 0,
    imageData: '',
    imageFit: 'contain',
    comments: []
 });


/* =========================
   03. 运行状态与通用工具
   ========================= */
let state = defaultState();
let dragIndex = null;
let characterQuery = '';
const CUSTOM_CHARACTER_LIMIT = 10;
const CUSTOM_IMAGE_MAX_SIZE = 8 * 1024 * 1024;
const CUSTOM_CHARACTER_DB_NAME =
  'zhijiao-custom-characters-v1';
const CUSTOM_CHARACTER_STORE_NAME = 'characters';

let customCharacters = [];
let editingCustomCharacterId = '';
let pendingCustomCharacterData = null;

const CUSTOM_CROP_STAGE_SIZE = 600;
const CUSTOM_AVATAR_SIZE = 116;
const CUSTOM_PORTRAIT_SIZE = 508;

const customCropState = {
  sourceImage: null,
  step: 'avatar',
  zoom: 1,
  baseScale: 1,
  offsetX: 0,
  offsetY: 0,
  dragging: false,
  pointerId: null,
  lastX: 0,
  lastY: 0,
  avatarData: '',
  portraitData: ''
};

const $ = id => document.getElementById(id);
const character = id => characters.find(item=>item.id===id) || characters[0];
function uid(){return 'c_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7)}
function esc(text){return String(text??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
function showToast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(showToast.t);showToast.t=setTimeout(()=>el.classList.remove('show'),1800)}
function optionList(selected, allowEmpty, label) {
  return (
    allowEmpty
      ? `<option value="">${esc(label)}</option>`
      : ''
  ) + characters.map(c => `
    <option
      value="${c.id}"
      ${c.id === selected ? 'selected' : ''}
    >
      ${esc(c.name)} · ${esc(c.dynasty)}
    </option>
  `).join('');
}

function getReplyCandidates() {
    const ids = [...new Set(
        state.comments.map(item => item.authorId)
    )].filter(id => id && id !== state.authorId);

    return ids.map(id => character(id));
}

function replyOptionList(selected) {
    const candidates = getReplyCandidates();

    return `
        <option value="">不回复任何人</option>
        ${candidates.map(c => `
            <option
                value="${c.id}"
                ${c.id === selected ? 'selected' : ''}
            >
                ${esc(c.name)}
            </option>
        `).join('')}
    `;
}

function normalizeReplyTargets() {
    const validIds = new Set(
        getReplyCandidates().map(c => c.id)
    );

    state.comments.forEach(item => {
        if (item.replyTo && !validIds.has(item.replyTo)) {
            item.replyTo = '';
        }
    });
}

function filteredOptionList(selected,allowEmpty,label,query){
  const keyword=query.trim().toLowerCase();
  const filtered=characters.filter(c=>{
    const searchableText=[
      c.id,
      c.name,
      c.dynasty,
      c.rarity,
      c.role
    ].join(' ').toLowerCase();

    return !keyword||searchableText.includes(keyword)||c.id===selected;
  });

  return (allowEmpty?`<option value="">${label}</option>`:'')
    +filtered.map(c=>`
      <option value="${c.id}" ${c.id===selected?'selected':''}>
        ${esc(c.name)} · ${esc(c.dynasty)}
      </option>
    `).join('');
}

/* =========================
   04. 人物选择区渲染
   ========================= */
function renderAuthorCards() {
  const query = characterQuery.trim().toLowerCase();

  const filteredCharacters = characters.filter(c => {
    const searchableText = [
      c.name,
      c.dynasty,
      c.rarity,
      c.role
    ].join(' ').toLowerCase();

    return searchableText.includes(query);
  });

  $('authorCards').innerHTML = filteredCharacters.length
    ? filteredCharacters.map(c => `
      <div class="character-card-shell">
        <button
          type="button"
          class="character-card ${
            c.id === state.authorId ? 'selected' : ''
          }"
          data-author="${c.id}"
        >
          <img
            src="${c.avatar}"
            alt="${esc(c.name)}"
            loading="lazy"
            decoding="async"
          >
          <span>${esc(c.name)}</span>
          <small>
            ${esc(c.rarity)} ·
            ${esc(c.dynasty)} ·
            ${esc(c.role)}
          </small>
        </button>

        ${c.isCustom ? `
          <button
            type="button"
            class="manage-custom-character"
            data-manage-custom="${c.id}"
            aria-label="编辑${esc(c.name)}的档案"
            title="编辑人物档案"
          >📁</button>
        ` : ''}
      </div>
    `).join('')
    : '<div class="empty-editor">没有符合条件的人物。</div>';

  document.querySelectorAll('[data-author]').forEach(btn => {
    btn.onclick = () => {
      state.authorId = btn.dataset.author;

      document.querySelectorAll('[data-author]').forEach(card => {
        card.classList.toggle(
          'selected',
          card.dataset.author === state.authorId
        );
      });

      renderCommentEditors();
      renderPreview();
    };
  });

  document
    .querySelectorAll('[data-manage-custom]')
    .forEach(btn => {
      btn.onclick = () => {
        openCustomCharacterEditor(
          btn.dataset.manageCustom
        );
      };
    });
}


/* =========================
   05. 评论编辑器与回复
   ========================= */
function renderCommentEditors(){
  normalizeReplyTargets();
  const list=$('commentEditorList');
  $('commentSectionCount').textContent=`03 · ${state.comments.length}条`;
  if(!state.comments.length){list.innerHTML='<div class="empty-editor">还没有评论。点击下方按钮添加第一条互动。</div>';return}
  list.innerHTML=state.comments.map((item,index)=>`<div class="comment-card" draggable="true" data-index="${index}">
    <div class="comment-head"><span class="drag-handle" title="拖拽排序">⠿</span><span class="comment-number">评论 ${index+1}</span><div class="comment-actions"><button type="button" data-copy="${index}">复制</button><button type="button" data-reply="${index}">回复</button><button type="button" data-delete="${index}">删除</button></div></div>
    <input
      type="search"
      class="comment-character-search"
      data-comment-character-search="${index}"
      placeholder="搜索人物姓名、朝代、稀有度或定位……"
    />
    <div class="comment-fields">
      <select aria-label="评论者" data-comment-author="${index}">
        ${optionList(item.authorId,false,'')}
      </select>
      <select aria-label="回复对象" data-comment-reply="${index}">${replyOptionList(item.replyTo)}</select>
      </select>
    </div>
    <textarea aria-label="评论正文" data-comment-text="${index}" placeholder="输入评论内容……">${esc(item.text)}</textarea>
    <div class="field" style="margin-top:7px"><input type="text" aria-label="评论时间" data-comment-time="${index}" value="${esc(item.time||'')}" placeholder="刚刚" /></div>
  </div>`).join('');
  list.querySelectorAll('[data-comment-character-search]').forEach(el=>{
    el.oninput=()=>{
      // 这里保留刚才写好的搜索筛选代码
    };

    el.onkeydown=event=>{
      if(event.key!=='Enter') return;

      event.preventDefault();

      const index=+el.dataset.commentCharacterSearch;
      const authorSelect=list.querySelector(
        `[data-comment-author="${index}"]`
      );

      // 等待中文输入法完成上屏，再读取搜索框中的完整内容
      setTimeout(()=>{
        const keyword=el.value.trim();
        if(!keyword) return;

        // 按照当前搜索内容重新生成匹配项
        authorSelect.innerHTML=
          `<option value="" selected disabled>请选择评论者</option>`
          +filteredOptionList('',false,'',keyword);

        authorSelect.focus();

        if(typeof authorSelect.showPicker==='function'){
          try{
            authorSelect.showPicker();
          }catch(error){
            authorSelect.click();
          }
        }else{
          authorSelect.click();
        }
      },0);
    };
  });
  list.querySelectorAll('[data-comment-author]').forEach(el => {
      el.onchange = () => {
          state.comments[+el.dataset.commentAuthor].authorId = el.value;
          renderCommentEditors();
          renderPreview();
      };
  });
  list.querySelectorAll('[data-comment-reply]').forEach(el=>el.onchange=()=>{state.comments[+el.dataset.commentReply].replyTo=el.value;renderPreview()});
  list.querySelectorAll('[data-comment-text]').forEach(el=>el.oninput=()=>{state.comments[+el.dataset.commentText].text=el.value;renderPreview()});
  list.querySelectorAll('[data-comment-time]').forEach(el=>el.oninput=()=>{state.comments[+el.dataset.commentTime].time=el.value;renderPreview()});
  list.querySelectorAll('[data-delete]').forEach(el=>el.onclick=()=>{state.comments.splice(+el.dataset.delete,1);renderAll()});
  list.querySelectorAll('[data-copy]').forEach(el=>el.onclick=()=>{const old=state.comments[+el.dataset.copy];state.comments.splice(+el.dataset.copy+1,0,{...old,id:uid()});renderAll()});
  list.querySelectorAll('[data-reply]').forEach(el=>{el.onclick=()=>addReply(+el.dataset.reply)});
  list.querySelectorAll('.comment-card').forEach(card=>{
    card.ondragstart=()=>{dragIndex=+card.dataset.index;card.classList.add('dragging')};
    card.ondragend=()=>{dragIndex=null;card.classList.remove('dragging')};
    card.ondragover=e=>e.preventDefault();
    card.ondrop=e=>{e.preventDefault();const target=+card.dataset.index;if(dragIndex===null||dragIndex===target)return;const [moved]=state.comments.splice(dragIndex,1);state.comments.splice(target,0,moved);renderAll()};
  });
}

function addReply(index){
  const target=state.comments[index];
  state.comments.splice(index+1,0,{id:uid(),authorId:state.authorId,replyTo:target.authorId,text:'',time:'刚刚'});
  renderAll();
  setTimeout(()=>{const field=document.querySelector(`[data-comment-text="${index+1}"]`);field?.focus()},0);
}

function addComment() {
  state.comments.push({
    id: uid(),
    authorId: characters[0].id,
    replyTo: '',
    text: '',
    time: '刚刚'
  });
  renderAll();
  setTimeout(() => {
    const index = state.comments.length - 1;
    document.querySelector(`[data-comment-text="${index}"]`)?.focus();
  }, 0);
}


/* =========================
   06. PNG 成图预览
   ========================= */
function renderPreview(){
  const c=character(state.authorId);
  $('portrait').src=c.portrait;$('previewAuthor').textContent=c.name;
  $('previewContent').textContent = state.content;
  $('previewContent').classList.toggle('collapsed',!!state.collapsed);
  $('expandLink').classList.toggle('hidden',!state.collapsed||!state.content);$('expandLink').textContent='全文';
  $('previewTopic').textContent=state.topic?`# ${state.topic} #`:'';$('previewTopic').classList.toggle('hidden',!state.topic);
  $('previewTime').textContent=state.time||'刚刚';$('previewLocation').textContent=state.location;
  $('locationDot').classList.toggle('hidden',!state.location);$('locationIcon').classList.toggle('hidden',!state.location);$('previewLocation').classList.toggle('hidden',!state.location);
  $('previewLikes').textContent=Math.max(0,Math.min(10000,Number(state.likes)||0));$('previewCommentCount').textContent=state.comments.length;
  const imageWrap=$('postImageWrap');imageWrap.classList.toggle('hidden',!state.imageData);imageWrap.classList.toggle('cover',state.imageFit==='cover');if(state.imageData)$('postImage').src=state.imageData;
  const comments=$('previewComments');
  if(!state.comments.length){ comments.innerHTML = '' }
  else comments.innerHTML=state.comments.map((item,index)=>{const a=character(item.authorId);const r=item.replyTo?character(item.replyTo):null;return `<article class="comment-item" data-preview-comment="${index}" title="点击回复 ${a.name}"><div class="avatar-ring"><img src="${a.avatar}" alt="${a.name}"></div><div><div class="comment-author"><span>${a.name}</span>${r?`<span class="reply-label">回复 ${r.name}</span>`:''}</div><div class="comment-time">${esc(item.time||'刚刚')}</div><div class="comment-body">${esc(item.text||'（尚未填写评论）')}</div></div></article>`}).join('');
  comments.querySelectorAll('[data-preview-comment]').forEach(el=>el.onclick=()=>addReply(+el.dataset.previewComment));
  requestAnimationFrame(()=>$('canvasSize').textContent=`512 × ${$('capture').offsetHeight}px`);
}


/* =========================
   07. 编辑器状态同步
   ========================= */
function syncInputs(){
  $('content').value=state.content;$('topic').value=state.topic;$('time').value=state.time;$('location').value=state.location;$('likes').value=state.likes;
  document.querySelectorAll('#collapseMode button').forEach(btn=>btn.classList.toggle('active',btn.dataset.value===String(!!state.collapsed)));
  document.querySelectorAll('#imageFit button').forEach(btn=>btn.classList.toggle('active',btn.dataset.value===state.imageFit));
  const has=!!state.imageData;$('uploadBox').classList.toggle('has-image',has);$('uploadPreview').classList.toggle('hidden',!has);$('uploadHint').textContent=has?'点击以替换图片':'点击或拖入图片';$('imageControls').classList.toggle('hidden',!has);if(has)$('uploadPreview').src=state.imageData;
}

function renderAll(){
  renderAuthorCards();
  syncInputs();
  renderCommentEditors();
  renderPreview()
}

function renderCustomCharacterEntry() {
  const count = customCharacters.length;
  const reachedLimit = count >= CUSTOM_CHARACTER_LIMIT;
  const button = $('openCustomCharacterDialog');

  $('customCharacterCount').textContent =
    `${count}/${CUSTOM_CHARACTER_LIMIT}`;

  button.disabled = reachedLimit;
  button.textContent = reachedLimit
    ? '已达上限'
    : '＋ 创建人物';

  button.title = reachedLimit
    ? '删除一位自定义人物后即可继续创建'
    : '';
}

function openCustomCharacterDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      CUSTOM_CHARACTER_DB_NAME,
      1
    );

    request.onupgradeneeded = () => {
      const database = request.result;

      if (
        !database.objectStoreNames.contains(
          CUSTOM_CHARACTER_STORE_NAME
        )
      ) {
        database.createObjectStore(
          CUSTOM_CHARACTER_STORE_NAME,
          { keyPath: 'id' }
        );
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

async function loadCustomCharacters() {
  const database = await openCustomCharacterDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      CUSTOM_CHARACTER_STORE_NAME,
      'readonly'
    );

    const request = transaction
      .objectStore(CUSTOM_CHARACTER_STORE_NAME)
      .getAll();

    request.onsuccess = () => {
      database.close();
      resolve(request.result);
    };

    request.onerror = () => {
      database.close();
      reject(request.error);
    };
  });
}

async function putCustomCharacter(customCharacter) {
  const database = await openCustomCharacterDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      CUSTOM_CHARACTER_STORE_NAME,
      'readwrite'
    );

    transaction
      .objectStore(CUSTOM_CHARACTER_STORE_NAME)
      .put(customCharacter);

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };

    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

async function removeCustomCharacterFromDatabase(id) {
  const database = await openCustomCharacterDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      CUSTOM_CHARACTER_STORE_NAME,
      'readwrite'
    );

    transaction
      .objectStore(CUSTOM_CHARACTER_STORE_NAME)
      .delete(id);

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };

    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

function syncCustomCharactersIntoCharacterList() {
  for (
    let index = characters.length - 1;
    index >= 0;
    index -= 1
  ) {
    if (characters[index].isCustom) {
      characters.splice(index, 1);
    }
  }

  characters.unshift(...customCharacters);
}

function createCustomCharacterId() {
  if (crypto.randomUUID) {
    return `custom_${crypto.randomUUID()}`;
  }

  return (
    `custom_${Date.now()}_` +
    Math.random().toString(36).slice(2, 9)
  );
}

function readCustomCharacterForm() {
  return {
    name: $('customCharacterName').value.trim(),
    dynasty:
      $('customCharacterDynasty').value.trim() || '不详',
    rarity:
      $('customCharacterRarity').value || '不详',
    role:
      $('customCharacterRole').value || '不详'
  };
}

function openNewCustomCharacterForm() {
  editingCustomCharacterId = '';
  pendingCustomCharacterData = null;
  resetCustomCharacterForm();

  $('customCharacterDialogEyebrow').textContent =
    'Custom Character';

  $('customCharacterDialogTitle').textContent =
    '创建自定义人物';

  $('customCharacterDialogNote').textContent =
    '每个浏览器最多同时保存 10 位自定义人物；删除已有自定义人物后可继续创建。';

  $('customCharacterImageRequired')
    .classList.remove('hidden');

  $('customCharacterImage')
    .setAttribute('aria-required', 'true');

  $('customCharacterImageHint').textContent =
    '上传一张人物图片，随后将分别裁切头像和立绘。';

  $('startCustomCrop').textContent =
    '下一步：裁切图片';

  $('deleteCustomCharacter')
    .classList.add('hidden');

  $('customCharacterDialog').showModal();
}

function openCustomCharacterEditor(id) {
  const customCharacter = customCharacters.find(
    item => item.id === id
  );

  if (!customCharacter) {
    return;
  }

  editingCustomCharacterId = id;
  pendingCustomCharacterData = null;
  resetCustomCharacterForm();

  $('customCharacterName').value =
    customCharacter.name;

  $('customCharacterDynasty').value =
    customCharacter.dynasty === '不详'
      ? ''
      : customCharacter.dynasty;

  $('customCharacterRarity').value =
    customCharacter.rarity === '不详'
      ? ''
      : customCharacter.rarity;

  $('customCharacterRole').value =
    customCharacter.role === '不详'
      ? ''
      : customCharacter.role;

  $('customCharacterDialogEyebrow').textContent =
    'Character Archive';

  $('customCharacterDialogTitle').textContent =
    '编辑人物档案';

  $('customCharacterDialogNote').textContent =
    '可以修改人物资料；如需更换头像与立绘，请重新上传一张图片。';

  $('customCharacterImageRequired')
    .classList.add('hidden');

  $('customCharacterImage')
    .setAttribute('aria-required', 'false');

  $('customCharacterImageHint').textContent =
    '不上传则保留现有头像与立绘；上传后将重新裁切两次。';

  $('startCustomCrop').textContent =
    '保存档案';

  $('deleteCustomCharacter')
    .classList.remove('hidden');

  $('customCharacterDialog').showModal();
}

async function saveCustomCharacter(
  customCharacter,
  isNew
) {
  try {
    await putCustomCharacter(customCharacter);

    const oldIndex = customCharacters.findIndex(
      item => item.id === customCharacter.id
    );

    if (oldIndex === -1) {
      customCharacters.unshift(customCharacter);
    } else {
      customCharacters.splice(
        oldIndex,
        1,
        customCharacter
      );
    }

    syncCustomCharactersIntoCharacterList();

    if (isNew) {
      state.authorId = customCharacter.id;
    }

    editingCustomCharacterId = '';
    pendingCustomCharacterData = null;

    customCropState.sourceImage = null;
    customCropState.avatarData = '';
    customCropState.portraitData = '';

    if ($('customCharacterDialog').open) {
      $('customCharacterDialog').close();
    }

    if ($('customCropDialog').open) {
      $('customCropDialog').close();
    }

    resetCustomCharacterForm();
    renderCustomCharacterEntry();
    renderAll();

    showToast(
      isNew
        ? '自定义人物已创建'
        : '人物档案已保存'
    );
  } catch (error) {
    showToast(
      '人物保存失败，请检查浏览器存储权限'
    );
  }
}

async function deleteCurrentCustomCharacter() {
  const customCharacter = customCharacters.find(
    item => item.id === editingCustomCharacterId
  );

  if (!customCharacter) {
    return;
  }

  if (
    !confirm(
      `确定删除“${customCharacter.name}”吗？`
    )
  ) {
    return;
  }

  try {
    await removeCustomCharacterFromDatabase(
      customCharacter.id
    );

    customCharacters = customCharacters.filter(
      item => item.id !== customCharacter.id
    );

    syncCustomCharactersIntoCharacterList();

    state.comments = state.comments.filter(
      item => item.authorId !== customCharacter.id
    );

    state.comments.forEach(item => {
      if (item.replyTo === customCharacter.id) {
        item.replyTo = '';
      }
    });

    if (state.authorId === customCharacter.id) {
      const fallbackCharacter = characters.find(
        item => !item.isCustom
      );

      state.authorId = fallbackCharacter.id;
    }

    editingCustomCharacterId = '';
    pendingCustomCharacterData = null;

    $('customCharacterDialog').close();
    resetCustomCharacterForm();
    renderCustomCharacterEntry();
    renderAll();

    showToast('自定义人物已删除');
  } catch (error) {
    showToast('删除失败，请稍后重试');
  }
}

function setCustomFieldInvalid(input, invalid) {
  input.classList.toggle('is-invalid', invalid);
  input.setAttribute('aria-invalid', String(invalid));
}

function resetCustomCharacterForm() {
  $('customCharacterForm').reset();

  [
    $('customCharacterName'),
    $('customCharacterImage')
  ].forEach(input => setCustomFieldInvalid(input, false));
}

function validateCustomImage(input, label) {
  const file = input.files[0];

  if (!file) {
    return true;
  }

  if (file.size > CUSTOM_IMAGE_MAX_SIZE) {
    input.value = '';
    setCustomFieldInvalid(input, true);
    showToast(`${label}不能超过 8 MB`);
    return false;
  }

  setCustomFieldInvalid(input, false);
  return true;
}

function readCustomCropImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error('无法读取人物图片'));
    };

    reader.onload = () => {
      const image = new Image();

      image.onerror = () => {
        reject(new Error('无法解析人物图片'));
      };

      image.onload = () => {
        resolve(image);
      };

      image.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}

function constrainCustomCropOffset() {
  const image = customCropState.sourceImage;

  if (!image) {
    return;
  }

  const scale = customCropState.baseScale * customCropState.zoom;
  const scaledWidth = image.naturalWidth * scale;
  const scaledHeight = image.naturalHeight * scale;

  const maxOffsetX = Math.max(
    0,
    (scaledWidth - CUSTOM_CROP_STAGE_SIZE) / 2
  );

  const maxOffsetY = Math.max(
    0,
    (scaledHeight - CUSTOM_CROP_STAGE_SIZE) / 2
  );

  customCropState.offsetX = Math.max(
    -maxOffsetX,
    Math.min(maxOffsetX, customCropState.offsetX)
  );

  customCropState.offsetY = Math.max(
    -maxOffsetY,
    Math.min(maxOffsetY, customCropState.offsetY)
  );
}

function drawCustomCrop() {
  const image = customCropState.sourceImage;
  const canvas = $('customCropCanvas');
  const context = canvas.getContext('2d');

  context.clearRect(
    0,
    0,
    CUSTOM_CROP_STAGE_SIZE,
    CUSTOM_CROP_STAGE_SIZE
  );

  if (!image) {
    return;
  }

  constrainCustomCropOffset();

  const scale = customCropState.baseScale * customCropState.zoom;
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;

  const x =
    (CUSTOM_CROP_STAGE_SIZE - width) / 2 +
    customCropState.offsetX;

  const y =
    (CUSTOM_CROP_STAGE_SIZE - height) / 2 +
    customCropState.offsetY;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, x, y, width, height);
}

function setCustomCropZoom(value) {
  customCropState.zoom = Math.max(
    1,
    Math.min(6, Number(value) || 1)
  );

  $('customCropZoom').value = String(customCropState.zoom);
  $('customCropZoomValue').textContent =
    `${Math.round(customCropState.zoom * 100)}%`;

  constrainCustomCropOffset();
  drawCustomCrop();
}

function openCustomCrop(step) {
  const image = customCropState.sourceImage;

  if (!image) {
    return;
  }

  customCropState.step = step;
  customCropState.zoom = 1;
  customCropState.offsetX = 0;
  customCropState.offsetY = 0;

  customCropState.baseScale = Math.max(
    CUSTOM_CROP_STAGE_SIZE / image.naturalWidth,
    CUSTOM_CROP_STAGE_SIZE / image.naturalHeight
  );

  const isAvatar = step === 'avatar';

  $('customCropStep').textContent = isAvatar
    ? '第 1 步，共 2 步'
    : '第 2 步，共 2 步';

  $('customCropTitle').textContent = isAvatar
    ? '裁切头像'
    : '裁切立绘';

  $('customCropNote').textContent = isAvatar
    ? '拖动图片调整头像位置，并通过滑杆缩放。'
    : '请从同一张原图中重新选择立绘范围。';

  $('confirmCustomCrop').textContent = isAvatar
    ? '确认头像'
    : '完成裁切';

  setCustomCropZoom(1);

  if (!$('customCropDialog').open) {
    $('customCropDialog').showModal();
  }

  requestAnimationFrame(drawCustomCrop);
}

function exportCustomCrop(size) {
  const outputCanvas = document.createElement('canvas');
  const outputContext = outputCanvas.getContext('2d');

  outputCanvas.width = size;
  outputCanvas.height = size;

  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = 'high';

  outputContext.drawImage(
    $('customCropCanvas'),
    0,
    0,
    CUSTOM_CROP_STAGE_SIZE,
    CUSTOM_CROP_STAGE_SIZE,
    0,
    0,
    size,
    size
  );

  return outputCanvas.toDataURL('image/png');
}

function cancelCustomCrop() {
  customCropState.avatarData = '';
  customCropState.portraitData = '';
  customCropState.sourceImage = null;
  pendingCustomCharacterData = null;

  $('customCropDialog').close();
  $('customCharacterDialog').showModal();
}


/* =========================
   08. 图片、工程校验与下载
   ========================= */
function readImage(file){
  if(!file||!file.type.startsWith('image/'))return;
  if(file.size>12*1024*1024){showToast('图片请控制在 12MB 以内');return}
  const reader=new FileReader();reader.onload=()=>{state.imageData=reader.result;renderAll();showToast('配图已载入')};reader.readAsDataURL(file);
}
function safeState(raw){
  if(!raw||typeof raw!=='object')throw new Error('工程数据格式不正确');
  const base=defaultState();
  const authorId=characters.some(c=>c.id===raw.authorId)?raw.authorId:base.authorId;
  const comments=Array.isArray(raw.comments)?raw.comments.slice(0,100).map(item=>({id:String(item.id||uid()),authorId:characters.some(c=>c.id===item.authorId)?item.authorId:characters[0].id,replyTo:characters.some(c=>c.id===item.replyTo)?item.replyTo:'',text:String(item.text||'').slice(0,3000),time:String(item.time||'刚刚').slice(0,30)})):[];
  return {...base,...raw,authorId,content:String(raw.content||'').slice(0,3000),topic:String(raw.topic||'').slice(0,40),time:String(raw.time||'刚刚').slice(0,30),location:String(raw.location||'').slice(0,40),likes:Math.max(0,Math.min(10000,Number(raw.likes)||0)),collapsed:!!raw.collapsed,imageFit:raw.imageFit==='cover'?'cover':'contain',imageData:typeof raw.imageData==='string'?raw.imageData:'',comments};
}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200)}


/* =========================
   09. 控件事件绑定
   ========================= */
$('content').oninput=e=>{state.content=e.target.value;renderPreview()};
$('topic').oninput=e=>{state.topic=e.target.value.replace(/^#+|#+$/g,'').trim();renderPreview()};
$('time').oninput=e=>{state.time=e.target.value;renderPreview()};
$('location').oninput=e=>{state.location=e.target.value;renderPreview()};
$('likes').oninput=e=>{state.likes=Math.max(0,Math.min(10000,Number(e.target.value)||0));renderPreview()};
$('collapseMode').onclick=e=>{if(!e.target.dataset.value)return;state.collapsed=e.target.dataset.value==='true';syncInputs();renderPreview()};
$('imageFit').onclick=e=>{if(!e.target.dataset.value)return;state.imageFit=e.target.dataset.value;syncInputs();renderPreview()};
$('imageInput').onchange=e=>readImage(e.target.files[0]);
$('removeImage').onclick=()=>{state.imageData='';$('imageInput').value='';renderAll()};
$('addComment').onclick = addComment;
document.querySelector('.post').onclick = e => {
  if (e.target.closest('#expandLink')) return;
  addComment();
};
$('expandLink').onclick=()=>{state.collapsed=false;syncInputs();renderPreview()};
$('saveDraft').onclick=()=>{try{localStorage.setItem('zhijiao-draft-v1',JSON.stringify(state));showToast('草稿已保存')}catch(e){showToast('图片过大，浏览器无法保存草稿')}};
$('exportProject').onclick=()=>{downloadBlob(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),`知交圈工程-${character(state.authorId).name}.zhijiao`);showToast('工程文件已导出')};
$('importProject').onclick=()=>$('projectFile').click();
$('projectFile').onchange=e=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{state=safeState(JSON.parse(reader.result));renderAll();showToast('工程已恢复')}catch(err){showToast(err.message||'无法读取工程文件')}};reader.readAsText(file,'utf-8');e.target.value=''};
$('newProject').onclick = () => { if (!confirm('确定清空当前内容并新建吗？已保存的浏览器草稿不会被删除。')) return; state = blankState();renderAll();showToast('已新建空白作品')};
$('exportPng').onclick=async()=>{
  const button=$('exportPng');const old=button.textContent;button.disabled=true;button.textContent='正在生成…';
  try{await document.fonts.ready;const canvas=await html2canvas($('capture'),{scale:3,useCORS:true,backgroundColor:null,logging:false,imageTimeout:0});canvas.toBlob(blob=>{if(blob){downloadBlob(blob,`知交圈-${character(state.authorId).name}.png`);showToast('高清 PNG 已导出')}},'image/png')}
  catch(e){showToast('导出失败，请用浏览器方式打开后重试')}
  finally{button.disabled=false;button.textContent=old}
};
$('characterSearch').oninput = e => {
      characterQuery = e.target.value;
      renderAuthorCards();
};

$('openCustomCharacterDialog').onclick = () => {
  if (
    customCharacters.length >=
    CUSTOM_CHARACTER_LIMIT
  ) {
    showToast(
      '最多同时保存 10 位自定义人物'
    );
    return;
  }

  openNewCustomCharacterForm();
};

$('closeCustomCharacterDialog').onclick = () => {
  editingCustomCharacterId = '';
  pendingCustomCharacterData = null;
  resetCustomCharacterForm();
  $('customCharacterDialog').close();
};

$('customCharacterDialog').onclick = e => {
  if (e.target === $('customCharacterDialog')) {
    editingCustomCharacterId = '';
    pendingCustomCharacterData = null;
    resetCustomCharacterForm();
    $('customCharacterDialog').close();
  }
};

$('cancelCustomCharacter').onclick = () => {
  editingCustomCharacterId = '';
  pendingCustomCharacterData = null;
  resetCustomCharacterForm();
  $('customCharacterDialog').close();
};

$('deleteCustomCharacter').onclick =
  deleteCurrentCustomCharacter;

$('customCharacterName').oninput = e => {
  if (e.target.value.trim()) {
    setCustomFieldInvalid(e.target, false);
  }
};

$('customCharacterImage').onchange = e => {
  validateCustomImage(e.target, '人物图片');
};

$('customCharacterForm').onsubmit = async e => {
  e.preventDefault();

  const imageFile =
    $('customCharacterImage').files[0];

  const isNew = !editingCustomCharacterId;

  const requiredFields = [
    {
      input: $('customCharacterName'),
      label: '姓名',
      filled:
        !!$('customCharacterName').value.trim()
    }
  ];

  if (isNew) {
    requiredFields.push({
      input: $('customCharacterImage'),
      label: '人物图片',
      filled: !!imageFile
    });
  }

  requiredFields.forEach(field => {
    setCustomFieldInvalid(
      field.input,
      !field.filled
    );
  });

  const missingFields = requiredFields.filter(
    field => !field.filled
  );

  if (missingFields.length) {
    showToast(
      `请先填写：${
        missingFields
          .map(field => field.label)
          .join('、')
      }`
    );

    missingFields[0].input.focus();
    return;
  }

  if (
    imageFile &&
    !validateCustomImage(
      $('customCharacterImage'),
      '人物图片'
    )
  ) {
    return;
  }

  const existingCharacter =
    customCharacters.find(
      item =>
        item.id === editingCustomCharacterId
    );

  const formData = readCustomCharacterForm();

  pendingCustomCharacterData = {
    id:
      existingCharacter?.id ||
      createCustomCharacterId(),

    cardId:
      existingCharacter?.cardId || null,

    ...formData,

    avatar:
      existingCharacter?.avatar || '',

    portrait:
      existingCharacter?.portrait || '',

    isCustom: true,

    createdAt:
      existingCharacter?.createdAt ||
      Date.now(),

    updatedAt: Date.now()
  };

  /*
   * 编辑档案时没有上传新图片：
   * 直接保留原头像和立绘，只保存文字资料。
   */
  if (!imageFile) {
    await saveCustomCharacter(
      pendingCustomCharacterData,
      false
    );
    return;
  }

  const submitButton =
    e.submitter ||
    $('customCharacterForm')
      .querySelector('button[type="submit"]');

  const oldText = submitButton.textContent;

  submitButton.disabled = true;
  submitButton.textContent =
    '正在读取图片…';

  try {
    customCropState.sourceImage =
      await readCustomCropImage(imageFile);

    customCropState.avatarData = '';
    customCropState.portraitData = '';

    $('customCharacterDialog').close();
    openCustomCrop('avatar');
  } catch (error) {
    showToast(
      error.message || '无法读取人物图片'
    );
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = oldText;
  }
};

$('customCropZoom').oninput = e => {
  setCustomCropZoom(e.target.value);
};

$('customCropZoomOut').onclick = () => {
  setCustomCropZoom(customCropState.zoom - 0.1);
};

$('customCropZoomIn').onclick = () => {
  setCustomCropZoom(customCropState.zoom + 0.1);
};

$('customCropCanvas').onpointerdown = e => {
  customCropState.dragging = true;
  customCropState.pointerId = e.pointerId;
  customCropState.lastX = e.clientX;
  customCropState.lastY = e.clientY;

  $('customCropCanvas').classList.add('is-dragging');
  $('customCropCanvas').setPointerCapture(e.pointerId);
};

$('customCropCanvas').onpointermove = e => {
  if (
    !customCropState.dragging ||
    e.pointerId !== customCropState.pointerId
  ) {
    return;
  }

  const canvas = $('customCropCanvas');
  const rect = canvas.getBoundingClientRect();
  const displayScale = CUSTOM_CROP_STAGE_SIZE / rect.width;

  const movementX =
    (e.clientX - customCropState.lastX) * displayScale;

  const movementY =
    (e.clientY - customCropState.lastY) * displayScale;

  customCropState.lastX = e.clientX;
  customCropState.lastY = e.clientY;
  customCropState.offsetX += movementX;
  customCropState.offsetY += movementY;

  constrainCustomCropOffset();
  drawCustomCrop();
};

function stopCustomCropDragging(e) {
  if (e.pointerId !== customCropState.pointerId) {
    return;
  }

  customCropState.dragging = false;
  customCropState.pointerId = null;
  $('customCropCanvas').classList.remove('is-dragging');

  if ($('customCropCanvas').hasPointerCapture(e.pointerId)) {
    $('customCropCanvas').releasePointerCapture(e.pointerId);
  }
}

$('customCropCanvas').onpointerup = stopCustomCropDragging;
$('customCropCanvas').onpointercancel = stopCustomCropDragging;

$('cancelCustomCrop').onclick = cancelCustomCrop;

$('customCropDialog').oncancel = e => {
  e.preventDefault();
  cancelCustomCrop();
};

$('confirmCustomCrop').onclick = async () => {
  if (customCropState.step === 'avatar') {
    customCropState.avatarData =
      exportCustomCrop(CUSTOM_AVATAR_SIZE);

    showToast(
      '头像裁切完成，请继续裁切立绘'
    );

    openCustomCrop('portrait');
    return;
  }

  customCropState.portraitData =
    exportCustomCrop(CUSTOM_PORTRAIT_SIZE);

  if (!pendingCustomCharacterData) {
    showToast(
      '人物资料已失效，请返回后重试'
    );
    return;
  }

  const isNew = !editingCustomCharacterId;

  pendingCustomCharacterData.avatar =
    customCropState.avatarData;

  pendingCustomCharacterData.portrait =
    customCropState.portraitData;

  await saveCustomCharacter(
    pendingCustomCharacterData,
    isNew
  );
};

/* =========================
   10. 快捷键、草稿恢复与初始化
   ========================= */
window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();$('saveDraft').click()}});

async function initializeApp() {
  try {
    customCharacters = (
      await loadCustomCharacters()
    )
      .filter(item => (
        item &&
        item.id &&
        item.name &&
        item.avatar &&
        item.portrait
      ))
      .sort(
        (a, b) =>
          (b.createdAt || 0) -
          (a.createdAt || 0)
      )
      .slice(0, CUSTOM_CHARACTER_LIMIT)
      .map(item => ({
        ...item,
        isCustom: true
      }));

    syncCustomCharactersIntoCharacterList();
  } catch (error) {
    showToast('自定义人物读取失败');
  }

  /*
   * 必须先读取自定义人物，再恢复草稿。
   * 否则草稿中的自定义人物 ID 会被误判为不存在。
   */
  try {
    const saved = localStorage.getItem(
      'zhijiao-draft-v1'
    );

    if (saved) {
      state = safeState(JSON.parse(saved));
    }
  } catch (error) {}

  renderCustomCharacterEntry();
  renderAll();
}

initializeApp();
