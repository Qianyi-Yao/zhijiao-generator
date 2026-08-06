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
const $ = id => document.getElementById(id);
const character = id => characters.find(item=>item.id===id) || characters[0];
function uid(){return 'c_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7)}
function esc(text){return String(text??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
function showToast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(showToast.t);showToast.t=setTimeout(()=>el.classList.remove('show'),1800)}
function optionList(selected,allowEmpty,label){return (allowEmpty?`<option value="">${label}</option>`:'')+characters.map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${c.name} · ${c.dynasty}</option>`).join('')}

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
        ${c.name} · ${c.dynasty}
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
    <button
      type="button"
      class="character-card ${c.id === state.authorId ? 'selected' : ''}"
      data-author="${c.id}"
    >
      <img
        src="${c.avatar}"
        alt="${c.name}"
        loading="lazy"
        decoding="async"
      >
      <span>${c.name}</span>
      <small>${c.rarity} · ${c.dynasty} · ${c.role}</small>
    </button>
  `).join('')
          : '<div class="empty-editor">没有符合条件的人物。</div>';

      document.querySelectorAll('[data-author]').forEach(btn => {
          btn.onclick = () => {
              state.authorId = btn.dataset.author;
              renderAll();
          };
      });
  }  


/* =========================
   05. 评论编辑器与回复
   ========================= */
function renderCommentEditors(){
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
      <select aria-label="回复对象" data-comment-reply="${index}">
        ${optionList(item.replyTo,true,'不回复任何人')}
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
  list.querySelectorAll('[data-comment-author]').forEach(el=>el.onchange=()=>{state.comments[+el.dataset.commentAuthor].authorId=el.value;renderPreview()});
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
function renderAll(){renderAuthorCards();syncInputs();renderCommentEditors();renderPreview()}


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
$('addComment').onclick=()=>{state.comments.push({id:uid(),authorId:characters[0].id,replyTo:'',text:'',time:'刚刚'});renderAll();setTimeout(()=>document.querySelector(`[data-comment-text="${state.comments.length-1}"]`)?.focus(),0)};
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

/* =========================
   10. 快捷键、草稿恢复与初始化
   ========================= */
window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();$('saveDraft').click()}});
try{const saved=localStorage.getItem('zhijiao-draft-v1');if(saved)state=safeState(JSON.parse(saved))}catch(e){}
renderAll();
