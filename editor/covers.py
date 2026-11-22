"""Issue cover storage, independent of article conversions."""
import base64
import json
import re
import uuid
from datetime import date
from http import HTTPStatus
from urllib.parse import urlsplit


class CoverStoreMixin:
    def cover_paths(self):
        return (self.root / 'library/data/issue-covers.json',
                self.drafts / 'covers/state.json')

    def cover_state(self):
        from server import digest, json_bytes
        public, draft = self.cover_paths()
        raw = public.read_bytes() if public.exists() else json_bytes({'version': 1, 'issues': {}})
        private = draft.read_bytes() if draft.exists() else b'{}'
        library, library_hash = self.library()
        return {'issues': json.loads(raw)['issues'], 'drafts': json.loads(private),
                'revision': digest(raw + private), 'libraryHash': library_hash,
                'articles': [{k: a.get(k) for k in ('id', 'title', 'date_start', 'source')}
                             for a in library['articles']]}

    def cover_action(self, action, payload):
        from server import EditorError, atomic_write, json_bytes, MAX_IMAGE, _image_kind
        with self._publish_lock:
            state = self.cover_state()
            if payload.get('revision') != state['revision']:
                raise EditorError('封面配置已改变，请重新读取后再操作。', HTTPStatus.CONFLICT)
            week = payload.get('week', '')
            try:
                if date.fromisoformat(week).isoformat() != week:
                    raise ValueError()
            except (TypeError, ValueError):
                raise EditorError('请选择有效的期次起始日期') from None
            if week < '2026-08-23':
                raise EditorError('封面从 2026-08-23 这一周开始')
            public, private = self.cover_paths()
            if action == 'image':
                try:
                    raw = base64.b64decode(payload.get('data', ''), validate=True)
                except (ValueError, TypeError):
                    raise EditorError('图片数据无效') from None
                if not raw or len(raw) > MAX_IMAGE:
                    raise EditorError('图片大小须在 20 MB 以内')
                name = uuid.uuid4().hex + '.' + _image_kind(raw)
                src = 'library/editor-drafts/covers/assets/' + name
                atomic_write(self.root / src, raw)
                return {'src': src}
            if action == 'save':
                if payload.get('libraryHash') != state['libraryHash']:
                    raise EditorError('图书馆文章已改变，请重新读取后核对。', HTTPStatus.CONFLICT)
                value = payload.get('draft') or {}
                if not isinstance(value, dict):
                    raise EditorError('草稿格式无效')
                ids = value.get('article_ids', [])
                if not isinstance(ids, list) or len(ids) > 2 or any(not isinstance(i, str) for i in ids):
                    raise EditorError('请选择最多两篇文章')
                cover, url = value.get('cover', ''), value.get('video_url', '')
                if not isinstance(cover, str) or not isinstance(url, str) or len(url) > 4000:
                    raise EditorError('封面或链接格式无效')
                state['drafts'][week] = {'week': week, 'cover': cover,
                                         'video_url': url.strip(), 'article_ids': list(dict.fromkeys(ids))}
                if self.cover_state()['revision'] != payload['revision']:
                    raise EditorError('封面配置刚刚发生变化，请重新读取。', HTTPStatus.CONFLICT)
                atomic_write(private, json_bytes(state['drafts']))
            elif action == 'delete-draft':
                if week in state['drafts']:
                    backup = self.backups / ('cover-drafts-' + date.today().isoformat() + '-' + uuid.uuid4().hex) / 'state.json'
                    atomic_write(backup, private.read_bytes())
                    removed = state['drafts'].pop(week)
                    src = removed.get('cover', '')
                    used = {item.get('cover') for item in [*state['drafts'].values(), *state['issues'].values()]}
                    asset = None
                    if isinstance(src, str) and re.fullmatch(r'library/editor-drafts/covers/assets/[0-9a-f]{32}\.(?:png|jpg|webp|gif)', src) and src not in used:
                        candidate = self.root / src
                        asset_root = (self.drafts / 'covers/assets').resolve()
                        if candidate.resolve().parent != asset_root or candidate.is_symlink():
                            raise EditorError('草稿封面路径无效')
                        if candidate.is_file():
                            asset = candidate
                            atomic_write(backup.parent / candidate.name, candidate.read_bytes())
                    if self.cover_state()['revision'] != payload['revision']:
                        raise EditorError('封面配置刚刚发生变化，请重新读取。', HTTPStatus.CONFLICT)
                    atomic_write(private, json_bytes(state['drafts']))
                    if asset is not None:
                        try:
                            asset.unlink()
                        except OSError:
                            atomic_write(private, backup.read_bytes())
                            raise
            elif action in ('publish', 'withdraw'):
                if payload.get('libraryHash') != state['libraryHash']:
                    raise EditorError('图书馆文章已改变，请重新读取后核对。', HTTPStatus.CONFLICT)
                if action == 'publish':
                    value = dict(state['drafts'].get(week) or {})
                    ids = value.get('article_ids', [])
                    eligible = {a['id'] for a in state['articles'] if a['date_start'] == week and a['source'] != 'easter'}
                    if not 1 <= len(ids) <= 2 or not set(ids) <= eligible:
                        raise EditorError('请勾选本周的 1—2 篇现有文章')
                    url = urlsplit(value.get('video_url', ''))
                    if url.scheme not in ('http', 'https') or not url.hostname or url.username or url.password:
                        raise EditorError('请填写有效的 HTTP/HTTPS 视频地址')
                    src = value.get('cover', '')
                    if not re.fullmatch(r'library/(?:editor-drafts/covers/assets|covers)/[0-9a-f]{32}\.(?:png|jpg|webp|gif)', src):
                        raise EditorError('请上传封面图片')
                    source = self.root / src
                    if not source.is_file():
                        raise EditorError('封面图片不存在，请重新上传')
                    target = 'library/covers/' + source.name
                    atomic_write(self.root / target, source.read_bytes())
                    value['cover'] = target
                    state['issues'][week] = value
                else:
                    state['issues'].pop(week, None)
                if public.exists():
                    backup = self.backups / ('covers-' + date.today().isoformat() + '-' + uuid.uuid4().hex) / 'issue-covers.json'
                    atomic_write(backup, public.read_bytes())
                fresh = self.cover_state()
                if fresh['revision'] != payload['revision'] or fresh['libraryHash'] != payload['libraryHash']:
                    raise EditorError('数据刚刚发生变化，请重新读取后核对。', HTTPStatus.CONFLICT)
                atomic_write(public, json_bytes({'version': 1, 'issues': state['issues']}))
            else:
                raise EditorError('封面接口不存在', HTTPStatus.NOT_FOUND)
            return self.cover_state()
