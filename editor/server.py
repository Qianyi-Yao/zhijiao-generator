"""Offline library editor. Run from the repository with Python 3.10+."""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import shutil
import tempfile
import threading
import time
import uuid
import webbrowser
from datetime import date, datetime, timedelta
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
TAG_ALIASES = json.loads((ROOT / "library" / "data" / "tag_aliases.json").read_text(encoding="utf-8"))
MAX_JSON = 8 * 1024 * 1024
MAX_IMAGE = 20 * 1024 * 1024
ID_RE = re.compile(r"^[0-9a-f]{32}$")
IMAGE_RE = re.compile(r"^[0-9a-f]{32}\.(png|jpg|webp|gif)$")
BACKUP_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})_[0-9a-f]{32}_[0-9a-f]{8}$")
BACKUP_RETENTION_DAYS = 30


class EditorError(Exception):
    def __init__(self, message, status=HTTPStatus.BAD_REQUEST):
        super().__init__(message)
        self.status = status


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".editor-", delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    try:
        for attempt in range(4):
            try:
                os.replace(temporary, path)
                break
            except PermissionError:
                if attempt == 3:
                    raise
                time.sleep(0.05 * (attempt + 1))
    finally:
        temporary.unlink(missing_ok=True)


def _id(value):
    if not isinstance(value, str) or not ID_RE.fullmatch(value):
        raise EditorError("草稿 ID 无效")
    return value


def _image_kind(data):
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "webp"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "gif"
    raise EditorError("仅支持 PNG、JPEG、WebP 或 GIF 图片")


def _runs(nodes):
    runs = []

    def append(text, marks):
        if not text:
            return
        style = {"bold": False, "italic": False, "strike": False,
                 "color": None, "font": None}
        for mark in marks or []:
            kind, attrs = mark.get("type"), mark.get("attrs") or {}
            if kind in ("bold", "italic", "strike"):
                style[kind] = True
            elif kind == "textStyle":
                color = attrs.get("color")
                if isinstance(color, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", color):
                    style["color"] = color
                if attrs.get("fontFamily") == "LXGWWenKai":
                    style["font"] = "霞鹜文楷 轻便版"
            elif kind == "highlight":
                color = attrs.get("color")
                if isinstance(color, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", color):
                    style["background"] = color
            elif kind == "link":
                href = attrs.get("href", "")
                if isinstance(href, str) and href.startswith("#article="):
                    style["linkId"] = unquote(href[len("#article="):])
        if runs and all(runs[-1].get(k) == style.get(k) for k in runs[-1].keys() | style.keys() if k != "text"):
            runs[-1]["text"] += text
        else:
            runs.append({"text": text, **style})

    for node in nodes or []:
        if node.get("type") == "text":
            append(node.get("text", ""), node.get("marks"))
        elif node.get("type") == "hardBreak":
            append("\n", node.get("marks"))
        else:
            raise EditorError("正文中存在不支持的行内内容")
    return runs


def _asset_name(src, draft_id):
    prefix = f"/draft-assets/{draft_id}/"
    if not isinstance(src, str) or not src.startswith(prefix):
        raise EditorError("图片必须从本地编辑器添加")
    name = src[len(prefix):]
    if not IMAGE_RE.fullmatch(name):
        raise EditorError("图片引用无效")
    return name


def document_blocks(doc, draft_id, asset_path):
    """Convert the supported Tiptap document schema to library paragraphs."""
    if not isinstance(doc, dict) or doc.get("type") != "doc":
        raise EditorError("正文文档格式无效")

    figure_number = 0

    def figure_meta(attrs):
        nonlocal figure_number
        if attrs.get('numbered') is not True:
            return None
        caption = attrs.get('caption', '')
        if not isinstance(caption, str) or len(caption) > 500:
            raise EditorError('图片小标题须为 500 字以内的文字')
        figure_number += 1
        return {'number': figure_number, 'caption': caption}

    def convert(nodes):
        blocks = []
        for node in nodes or []:
            kind = node.get("type")
            children = node.get("content") or []
            if kind == "paragraph":
                blocks.append({"runs": _runs(children)})
            elif kind == "mathBlock":
                if any(item.get("type") != "text" for item in children):
                    raise EditorError("公式中只支持 LaTeX 文本")
                latex = "".join(item.get("text", "") for item in children)
                if not latex.strip() or len(latex) > 10000:
                    raise EditorError("公式内容须在 1 至 10000 字符之间")
                blocks.append({"type": "math", "latex": latex})
            elif kind == "heading":
                level = (node.get("attrs") or {}).get("level")
                if level not in (5, 6):
                    raise EditorError("仅支持五级和六级小标题")
                blocks.append({"type": "heading", "level": level, "runs": _runs(children)})
            elif kind == "blockquote":
                blocks.append({"type": "quote", "blocks": convert(children)})
            elif kind in ("bulletList", "orderedList"):
                items = []
                for item in children:
                    if item.get("type") != "listItem":
                        raise EditorError("列表格式无效")
                    items.append(convert(item.get("content")))
                blocks.append({"type": "list", "ordered": kind == "orderedList", "items": items})
            elif kind == "horizontalRule":
                blocks.append({"type": "rule"})
            elif kind == "image":
                attrs = node.get("attrs") or {}
                name = _asset_name(attrs.get("src"), draft_id)
                blocks.append({"type": "image", "images": [asset_path(name)],
                               "image_meta": [figure_meta(attrs)],
                               "alt": str(attrs.get("alt") or "考据配图")[:200]})
            elif kind == "mediaRow":
                images = (node.get("attrs") or {}).get("images")
                if not isinstance(images, list) or not 1 <= len(images) <= 50:
                    raise EditorError("图文段须包含 1 至 50 张图片")
                paths, metadata = [], []
                for image in images:
                    if not isinstance(image, dict):
                        raise EditorError("图文段图片格式无效")
                    paths.append(asset_path(_asset_name(image.get("src"), draft_id)))
                    metadata.append(figure_meta(image))
                media_blocks, plain_parts = [], []
                has_structured_content = False
                for part in children:
                    part_type = part.get("type")
                    if part_type == "paragraph":
                        part_runs = _runs(part.get("content"))
                        media_blocks.append({"runs": part_runs})
                        plain_parts.append(part_runs)
                    elif part_type == "blockquote":
                        quoted = part.get("content") or []
                        if not quoted or any(item.get("type") != "paragraph" for item in quoted):
                            raise EditorError("图文段引文中只支持普通段落")
                        quote_blocks = [{"runs": _runs(item.get("content"))} for item in quoted]
                        media_blocks.append({"type": "quote", "blocks": quote_blocks})
                        plain_parts.extend(item["runs"] for item in quote_blocks)
                        has_structured_content = True
                    elif part_type in ("mathBlock", "table", "horizontalRule", "bulletList", "orderedList"):
                        media_blocks.extend(convert([part]))
                        has_structured_content = True
                    else:
                        raise EditorError("图文段右侧只支持普通段落、引文、公式、表格、分隔线和列表")
                runs = []
                for index, part_runs in enumerate(plain_parts):
                    if index:
                        runs.append({"text": "\n\n"})
                    runs.extend(part_runs)
                block = {"runs": runs, "images": paths, "image_meta": metadata}
                if has_structured_content:
                    block["mediaBlocks"] = media_blocks
                blocks.append(block)
            elif kind == "table":
                occupied = set()
                rows = []
                for row_index, row in enumerate(children):
                    if row.get("type") != "tableRow":
                        raise EditorError("表格行格式无效")
                    result, column = [], 0
                    for cell in row.get("content") or []:
                        while (row_index, column) in occupied:
                            result.append(None)
                            column += 1
                        if cell.get("type") not in ("tableCell", "tableHeader"):
                            raise EditorError("表格单元格格式无效")
                        attrs = cell.get("attrs") or {}
                        rowspan = int(attrs.get("rowspan") or 1)
                        colspan = int(attrs.get("colspan") or 1)
                        if not (1 <= rowspan <= 50 and 1 <= colspan <= 50):
                            raise EditorError("表格合并范围过大")
                        parts, images, metadata = [], [], []
                        for part in cell.get("content") or []:
                            part_type = part.get("type")
                            if part_type == "paragraph":
                                if parts:
                                    parts.append({"text": "\n", "bold": False, "italic": False,
                                                  "strike": False, "color": None, "font": None})
                                parts.extend(_runs(part.get("content")))
                            elif part_type == "image":
                                name = _asset_name((part.get("attrs") or {}).get("src"), draft_id)
                                images.append(asset_path(name))
                                metadata.append(figure_meta(part.get('attrs') or {}))
                            else:
                                raise EditorError("表格中只支持文字与图片")
                        result.append({"runs": parts, "rowspan": rowspan,
                                       "colspan": colspan, "align": None, "images": images, "image_meta": metadata})
                        for ri in range(row_index, row_index + rowspan):
                            for ci in range(column, column + colspan):
                                if (ri, ci) != (row_index, column):
                                    occupied.add((ri, ci))
                        column += 1
                    while (row_index, column) in occupied:
                        result.append(None)
                        column += 1
                    rows.append(result)
                blocks.append({"type": "table", "rows": rows, "align": []})
            else:
                raise EditorError(f"不支持的正文内容：{kind}")
        return blocks

    return convert(doc.get("content"))


def iter_runs(blocks):
    for block in blocks:
        if "mediaBlocks" in block:
            yield from iter_runs(block["mediaBlocks"])
        elif block.get("type") == "quote":
            yield from iter_runs(block.get("blocks", []))
        elif block.get("type") == "list":
            for item in block.get("items", []):
                yield from iter_runs(item)
        elif block.get("type") == "table":
            for row in block.get("rows", []):
                for cell in row:
                    if isinstance(cell, dict):
                        yield from cell.get("runs", [])
        else:
            yield from block.get("runs", [])


from covers import CoverStoreMixin


class LibraryEditorStore(CoverStoreMixin):
    def __init__(self, root=ROOT):
        self.root = Path(root)
        self.data = self.root / "library" / "data" / "library.json"
        self.drafts = self.root / "library" / "editor-drafts"
        self.backups = self.root / "library" / "editor-backups"
        self.images = self.root / "library" / "images"
        self._publish_lock = threading.Lock()

    def cleanup_backups(self):
        """Remove only untouched editor-created backups after 30 full days."""
        if not self.backups.is_dir() or self.backups.is_symlink():
            return 0
        backup_root = self.backups.resolve()
        if backup_root != (self.root / "library").resolve() / "editor-backups":
            return 0
        cutoff_day = date.today() - timedelta(days=BACKUP_RETENTION_DAYS)
        cutoff_time = time.time() - BACKUP_RETENTION_DAYS * 24 * 60 * 60
        removed = 0
        for folder in self.backups.iterdir():
            match = BACKUP_RE.fullmatch(folder.name)
            if not match or not folder.is_dir() or folder.is_symlink():
                continue
            try:
                backup_day = date.fromisoformat(match.group(1))
                if backup_day > cutoff_day or folder.resolve().parent != backup_root:
                    continue
                contents = list(folder.iterdir())
                if len(contents) != 1 or contents[0].name != "library.json":
                    continue
                snapshot = contents[0]
                if snapshot.is_symlink() or not snapshot.is_file() or snapshot.resolve().parent != folder.resolve():
                    continue
                if max(folder.stat().st_mtime, snapshot.stat().st_mtime) >= cutoff_time:
                    continue
                shutil.rmtree(folder)
                removed += 1
            except (OSError, ValueError) as error:
                print(f"跳过无法清理的编辑器备份 {folder.name}：{error}", flush=True)
        if removed:
            print(f"已清理 {removed} 份超过 {BACKUP_RETENTION_DAYS} 天的编辑器备份。", flush=True)
        return removed

    def library(self):
        raw = self.data.read_bytes()
        value = json.loads(raw)
        if not isinstance(value.get("articles"), list):
            raise EditorError("图书馆数据格式无效")
        return value, digest(raw)

    def draft_path(self, draft_id):
        return self.drafts / (_id(draft_id) + ".json")

    def get_draft(self, draft_id):
        path = self.draft_path(draft_id)
        if not path.is_file():
            raise EditorError("找不到草稿", HTTPStatus.NOT_FOUND)
        return json.loads(path.read_text(encoding="utf-8"))

    def state(self):
        library, library_hash = self.library()
        drafts = []
        for path in self.drafts.glob("*.json") if self.drafts.exists() else []:
            draft = json.loads(path.read_text(encoding="utf-8"))
            drafts.append({key: draft.get(key) for key in
                           ("id", "title", "date_start", "source", "characters", "pair_card_ids", "published_hash", "updated_at")})
        drafts.sort(key=lambda item: (item.get("date_start") or "", item.get("updated_at") or ""), reverse=True)
        articles = [{"id": a.get("id"), "title": a.get("title"), "date_start": a.get("date_start"),
                     "source": a.get("source", "main"), "characters": a.get("characters", []),
                     "pair_card_ids": a.get("pair_card_ids", []), "editor_draft_id": a.get("editor_draft_id")}
                    for a in library["articles"]]
        tags = sorted({tag for a in library["articles"] for tag in a.get("characters", []) if isinstance(tag, str)})
        return {"libraryHash": library_hash, "drafts": drafts, "articles": articles, "characters": tags}

    def character_names(self):
        """Read the IDs from the same character registry used by the website."""
        source = (self.root / "characters.js").read_text(encoding="utf-8")
        return {int(card_id): name for card_id, name in re.findall(
            r'cardId:\s*(\d+),\s*name:\s*"([^"]+)"', source)}

    def save_draft(self, value):
        draft_id = _id(value.get("id"))
        existing = self.get_draft(draft_id) if self.draft_path(draft_id).exists() else None
        if existing and existing.get("published_hash") != value.get("published_hash"):
            raise EditorError("草稿发布状态已改变，请重新打开", HTTPStatus.CONFLICT)
        doc = value.get("doc")
        if len(json_bytes(doc)) > MAX_JSON:
            raise EditorError("文章草稿过大")
        document_blocks(doc, draft_id, lambda name: f"/draft-assets/{draft_id}/{name}")
        start = value.get("date_start") or ""
        if start:
            self._week(start)
        source = value.get("source")
        if source not in ("main", "extra", "easter"):
            raise EditorError("请选择正篇、番外或奇遇")
        if source == "easter" and start:
            raise EditorError("奇遇不属于某一期")
        pair = value.get("pair_card_ids") or []
        if not isinstance(pair, list) or len(pair) > 2 or any(type(item) is not int for item in pair):
            raise EditorError("人物配对格式无效")
        if pair and (len(pair) == 2 and pair[0] == pair[1] or
                     any(item not in self.character_names() for item in pair)):
            raise EditorError("请选择两个不同的现有人物编号")
        if source != "easter" and pair:
            raise EditorError("只有奇遇可以设置人物配对")
        characters = value.get("characters")
        if not isinstance(characters, list) or any(not isinstance(x, str) for x in characters):
            raise EditorError("人物标签格式无效")
        if type(value.get("has_errors", False)) is not bool:
            raise EditorError("谬误标记格式无效")
        draft = {"has_errors": value.get("has_errors", False), "id": draft_id, "date_start": start, "title": str(value.get("title") or "")[:200],
                 "source": source, "characters": [] if source == "easter" else
                 list(dict.fromkeys(TAG_ALIASES.get(x.strip(), x.strip()) for x in characters if x.strip())),
                 "pair_card_ids": sorted(pair),
                 "doc": doc, "published_hash": existing.get("published_hash") if existing else None,
                 "updated_at": datetime.now().isoformat(timespec="seconds")}
        for key in ('image_names', 'image_next', 'image_prefix'):
            if existing and key in existing:
                draft[key] = existing[key]
        atomic_write(self.draft_path(draft_id), json_bytes(draft))
        return draft

    @staticmethod
    def _week(value):
        try:
            start = date.fromisoformat(value)
        except (TypeError, ValueError):
            raise EditorError("请选择有效的期开始日期") from None
        return start, start + timedelta(days=6)

    def save_image(self, draft_id, encoded):
        self.get_draft(draft_id)
        try:
            raw = base64.b64decode(encoded, validate=True)
        except (ValueError, TypeError):
            raise EditorError("图片数据无效") from None
        if not raw or len(raw) > MAX_IMAGE:
            raise EditorError("图片大小须在 20 MB 以内")
        ext = _image_kind(raw)
        name = f"{uuid.uuid4().hex}.{ext}"
        path = self.drafts / "assets" / draft_id / name
        atomic_write(path, raw)
        return {"src": f"/draft-assets/{draft_id}/{name}"}

    def delete_draft(self, draft_id):
        draft = self.get_draft(draft_id)
        library, _ = self.library()
        if draft.get("published_hash") or any(
                a.get("id") == "editor-" + draft_id for a in library["articles"]):
            raise EditorError("已发布文章的草稿不能删除；请保留它用于后续修改。", HTTPStatus.CONFLICT)
        assets = self.drafts / "assets" / draft_id
        if assets.is_dir():
            if assets.is_symlink() or assets.resolve().parent != (self.drafts / "assets").resolve():
                raise EditorError("草稿图片目录无效")
            shutil.rmtree(assets)
        self.draft_path(draft_id).unlink()
        return {"deleted": draft_id}

    def preview(self, draft):
        draft_id = _id(draft.get("id"))
        blocks = document_blocks(draft.get("doc"), draft_id,
                                 lambda name: f"/draft-assets/{draft_id}/{name}")
        for src in self._image_paths(blocks):
            name = _asset_name(src, draft_id)
            if not (self.drafts / "assets" / draft_id / name).is_file():
                raise EditorError(f"图片不存在：{name}")
        return {"paragraphs": blocks}

    @staticmethod
    def _image_paths(blocks):
        for block in blocks:
            if "mediaBlocks" in block:
                yield from block.get("images", [])
                yield from LibraryEditorStore._image_paths(block["mediaBlocks"])
            elif block.get("type") == "quote":
                yield from LibraryEditorStore._image_paths(block.get("blocks", []))
            elif block.get("type") == "list":
                for item in block.get("items", []):
                    yield from LibraryEditorStore._image_paths(item)
            elif block.get("type") == "table":
                for row in block.get("rows", []):
                    for cell in row:
                        if isinstance(cell, dict):
                            yield from cell.get("images", [])
            else:
                yield from block.get("images", [])

    def publish(self, draft_id, expected_hash):
        with self._publish_lock:
            result = self._publish_locked(draft_id, expected_hash)
            try:
                self.cleanup_backups()
            except OSError as error:
                print(f"编辑器备份清理暂未完成：{error}", flush=True)
            return result

    def _publish_locked(self, draft_id, expected_hash):
        draft = self.get_draft(draft_id)
        library, library_hash = self.library()
        if expected_hash != library_hash:
            raise EditorError("图书馆数据已在编辑期间改变。请检查新内容并重新载入后发布。", HTTPStatus.CONFLICT)
        is_easter = draft.get("source") == "easter"
        start, end = (None, None) if is_easter else self._week(draft.get("date_start"))
        pair = draft.get("pair_card_ids") or []
        names = self.character_names()
        if is_easter and (len(pair) != 2 or pair[0] == pair[1] or
                          any(type(item) is not int or item not in names for item in pair)):
            raise EditorError("请为奇遇选择两个不同的人物")
        title = draft.get("title", "").strip()
        if not title:
            raise EditorError("请填写篇目标题")
        article_id = "editor-" + draft_id
        existing = next((a for a in library["articles"] if a.get("id") == article_id), None)
        if existing:
            if existing.get("origin") != "editor" or existing.get("editor_draft_id") != draft_id:
                raise EditorError("文章 ID 与已有数据冲突", HTTPStatus.CONFLICT)
            if digest(json_bytes(existing)) != draft.get("published_hash"):
                raise EditorError("已发布文章被外部修改，请先核对，避免覆盖。", HTTPStatus.CONFLICT)
        elif draft.get("published_hash"):
            raise EditorError("已发布文章已被移除，请先核对。", HTTPStatus.CONFLICT)
        if any(a.get("id") != article_id and a.get("date_start") == (start.isoformat() if start else None)
               and a.get("title") == title for a in library["articles"]):
            raise EditorError("本期已有同名文章，请换标题或检查图书馆。", HTTPStatus.CONFLICT)
        copied = {}
        numbered_assets = set()
        def collect_images(node):
            attrs = node.get('attrs') or {}
            entries = [attrs] if node.get('type') == 'image' else attrs.get('images', []) if node.get('type') == 'mediaRow' else []
            for item in entries:
                if item.get('numbered') is True:
                    numbered_assets.add(_asset_name(item.get('src'), draft_id))
            for child in node.get('content') or []:
                collect_images(child)
        collect_images(draft['doc'])
        image_names = dict(draft.get('image_names') or {})
        next_image = draft.get('image_next', 1)
        if 'image_prefix' not in draft:
            short = digest(article_id.encode())
            length = 8
            prefix = (start.strftime('%Y%m%d') if start else 'qiyu') + '-' + short[:length]
            while any(self.images.glob(prefix + '-img*')):
                length += 2
                if length > len(short):
                    raise EditorError('图片命名发生冲突')
                prefix = (start.strftime('%Y%m%d') if start else 'qiyu') + '-' + short[:length]
            draft['image_prefix'] = prefix

        def published_image(name):
            nonlocal next_image
            source = self.drafts / "assets" / draft_id / name
            if not source.is_file():
                raise EditorError(f"图片不存在：{name}")
            legacy = f"editor_{draft_id}_{name}"
            if name not in image_names:
                if name not in numbered_assets or (self.images / legacy).exists():
                    image_names[name] = legacy
                else:
                    filename = f"{draft['image_prefix']}-img{next_image:02d}{Path(name).suffix}"
                    while (self.images / filename).exists() or filename in image_names.values():
                        next_image += 1
                        filename = f"{draft['image_prefix']}-img{next_image:02d}{Path(name).suffix}"
                    image_names[name] = filename
                    next_image += 1
            filename = image_names[name]
            copied[filename] = source
            return "images/" + filename

        blocks = document_blocks(draft["doc"], draft_id, published_image)
        draft['image_names'] = image_names
        draft['image_next'] = next_image
        if not blocks or not any(block.get("type") != "paragraph" or block.get("runs") for block in blocks):
            raise EditorError("正文不能为空")
        target_ids = {a.get("id") for a in library["articles"]}
        for run in iter_runs(blocks):
            if run.get("linkId") and run["linkId"] not in target_ids:
                raise EditorError("篇目跳转目标已不存在，请重新选择。")
        article = {"id": article_id, "title": title,
                   "characters": [names[item] for item in pair] if is_easter else draft.get("characters", []),
                   "source": draft["source"], "has_errors": draft.get("has_errors", False),
                   "origin": "editor", "editor_draft_id": draft_id,
                   "paragraphs": blocks}
        if is_easter:
            article["pair_card_ids"] = sorted(pair)
        else:
            article["date_start"] = start.isoformat()
            article["date_end"] = end.isoformat()
        if draft["source"] == "main":
            article["episode"] = int(f"{start.month}{start.day:02d}")
        if existing and existing.get("date_start") == (start.isoformat() if start else None):
            library["articles"][library["articles"].index(existing)] = article
        else:
            if existing:
                library["articles"].remove(existing)
            # Keep existing manual ordering; place a new item after this issue's last item.
            same_issue = [i for i, a in enumerate(library["articles"])
                          if start and a.get("date_start") == start.isoformat()]
            insert_at = same_issue[-1] + 1 if same_issue else len(library["articles"])
            library["articles"].insert(insert_at, article)
        before = self.data.read_bytes()
        if digest(before) != expected_hash:
            raise EditorError("图书馆数据刚刚发生变化，请重新载入。", HTTPStatus.CONFLICT)
        self.backups.mkdir(parents=True, exist_ok=True)
        backup = self.backups / f"{date.today().isoformat()}_{draft_id}_{uuid.uuid4().hex[:8]}"
        backup.mkdir()
        atomic_write(backup / "library.json", before)
        draft_before = self.draft_path(draft_id).read_bytes()
        added = []
        json_written = False
        try:
            self.images.mkdir(parents=True, exist_ok=True)
            for filename, source in copied.items():
                target = self.images / filename
                if target.exists():
                    if target.read_bytes() != source.read_bytes():
                        raise EditorError(f"图片文件发生冲突：{filename}", HTTPStatus.CONFLICT)
                else:
                    shutil.copy2(source, target)
                    added.append(target)
            if digest(self.data.read_bytes()) != expected_hash:
                raise EditorError("图书馆数据刚刚发生变化，请重新载入。", HTTPStatus.CONFLICT)
            atomic_write(self.data, json_bytes(library))
            json_written = True
            draft["published_hash"] = digest(json_bytes(article))
            atomic_write(self.draft_path(draft_id), json_bytes(draft))
        except BaseException as error:
            recovery_errors = []
            if json_written:
                try:
                    atomic_write(self.data, before)
                except OSError as restore_error:
                    recovery_errors.append(f"恢复图书馆数据失败：{restore_error}")
            try:
                if self.draft_path(draft_id).read_bytes() != draft_before:
                    atomic_write(self.draft_path(draft_id), draft_before)
            except OSError as restore_error:
                recovery_errors.append(f"恢复草稿失败：{restore_error}")
            for target in added:
                try:
                    target.unlink(missing_ok=True)
                except OSError as restore_error:
                    recovery_errors.append(f"清理图片失败：{restore_error}")
            if recovery_errors:
                raise EditorError(
                    f"发布失败，自动恢复未完成；请检查备份 {backup}。" + "；".join(recovery_errors),
                    HTTPStatus.INTERNAL_SERVER_ERROR) from error
            raise
        return {"articleId": article_id, "libraryHash": digest(self.data.read_bytes()),
                "backup": str(backup.relative_to(self.root))}


def handler_for(store, token, session=None):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(store.root), **kwargs)

        def handle(self):
            try:
                super().handle()
            except (ConnectionResetError, BrokenPipeError):
                # Closing the app disconnects previews and speculative connections.
                pass

        def _json(self, value, status=HTTPStatus.OK):
            body = json_bytes(value)
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _error(self, error):
            self._json({"error": str(error)}, getattr(error, "status", HTTPStatus.INTERNAL_SERVER_ERROR))

        def do_GET(self):
            route = urlsplit(self.path)
            try:
                if route.path == "/api/browser-session":
                    query = parse_qs(route.query)
                    if session is None or query.get("token") != [token]:
                        raise EditorError("编辑器会话无效", HTTPStatus.FORBIDDEN)
                    role = query.get("role", [""])[0]
                    if role not in ("editor", "preview"):
                        raise EditorError("窗口类型无效")
                    document = _id(query.get("document", [""])[0])
                    if role == "editor" and not session.attach(document):
                        self.send_response(204)
                        self.end_headers()
                        return
                    try:
                        self.send_response(200)
                        self.send_header("Content-Type", "text/event-stream")
                        self.send_header("Cache-Control", "no-store")
                        self.send_header("Connection", "close")
                        self.end_headers()
                        while not session.closed.is_set():
                            self.wfile.write(b": connected\n\n")
                            self.wfile.flush()
                            session.closed.wait(0.5)
                        self.wfile.write(b"event: close\ndata: {}\n\n")
                        self.wfile.flush()
                    except (ConnectionError, OSError):
                        pass
                    return
                if route.path == "/library.html" and session is not None:
                    html = (store.root / "library.html").read_text(encoding="utf-8")
                    html = html.replace("</head>", '<script src="/editor/session.js" '
                        f'data-preview="true" data-token="{token}"></script></head>', 1)
                    body = html.encode("utf-8")
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.send_header("Content-Length", str(len(body)))
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    self.wfile.write(body)
                    return
                if route.path == "/api/covers":
                    return self._json(store.cover_state())
                if route.path == "/api/state":
                    return self._json(store.state())
                if route.path == "/api/draft":
                    draft_id = parse_qs(route.query).get("id", [""])[0]
                    return self._json(store.get_draft(draft_id))
                if route.path.startswith("/draft-assets/"):
                    parts = route.path.split("/")
                    if len(parts) != 4:
                        raise EditorError("图片路径无效")
                    draft_id = _id(parts[2])
                    name = parts[3]
                    if not IMAGE_RE.fullmatch(name):
                        raise EditorError("图片路径无效")
                    self.path = "/library/editor-drafts/assets/" + draft_id + "/" + name
                return super().do_GET()
            except (EditorError, OSError, ValueError) as error:
                self._error(error)

        def do_POST(self):
            try:
                origin = self.headers.get("Origin")
                if origin and origin != f"http://127.0.0.1:{self.server.server_port}":
                    raise EditorError("只接受本地编辑器请求", HTTPStatus.FORBIDDEN)
                if self.headers.get("X-Editor-Token") != token:
                    raise EditorError("编辑器会话无效", HTTPStatus.FORBIDDEN)
                if self.headers.get_content_type() != "application/json":
                    raise EditorError("请求格式无效")
                length = int(self.headers.get("Content-Length") or 0)
                if not 0 < length <= MAX_IMAGE * 2:
                    raise EditorError("请求过大或为空")
                payload = json.loads(self.rfile.read(length))
                route = urlsplit(self.path).path
                if route == "/api/browser-close" and session is not None:
                    session.leave(_id(payload.get("document")))
                    result = {"ok": True}
                elif route.startswith('/api/covers/'):
                    result = store.cover_action(route.rsplit('/', 1)[-1], payload)
                elif route == "/api/draft":
                    result = store.save_draft(payload)
                elif route == "/api/image":
                    result = store.save_image(_id(payload.get("id")), payload.get("data"))
                elif route == "/api/delete-draft":
                    result = store.delete_draft(_id(payload.get("id")))
                elif route == "/api/preview":
                    result = store.preview(payload)
                elif route == "/api/publish":
                    result = store.publish(_id(payload.get("id")), payload.get("libraryHash"))
                else:
                    raise EditorError("接口不存在", HTTPStatus.NOT_FOUND)
                self._json(result)
            except (EditorError, OSError, ValueError, TypeError, json.JSONDecodeError) as error:
                self._error(error)

    return Handler


class EditorServer(ThreadingHTTPServer):
    # Finish accepted writes before server_close returns, including window exit.
    daemon_threads = False
    block_on_close = True

    def get_request(self):
        connection, address = super().get_request()
        connection.settimeout(30)
        return connection, address


def main():
    store = LibraryEditorStore()
    try:
        store.cleanup_backups()
    except OSError as error:
        print(f"编辑器备份清理暂未完成：{error}", flush=True)
    token = uuid.uuid4().hex
    server = EditorServer(("127.0.0.1", 0), handler_for(store, token))
    url = f"http://127.0.0.1:{server.server_port}/editor/?token={token}"
    print("本地图书馆编辑器：" + url, flush=True)
    print("草稿保存在 library/editor-drafts；按 Ctrl+C 关闭。", flush=True)
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    import sys
    sys.modules['server'] = sys.modules[__name__]
    main()
