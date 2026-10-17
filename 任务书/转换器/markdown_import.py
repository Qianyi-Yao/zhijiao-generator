# -*- coding: utf-8 -*-
"""Markdown 番外文档解析器。输出图书馆可序列化的文章块与待复制图片。"""
from __future__ import annotations

import hashlib
import re
import unicodedata
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import unquote, urlsplit


EMPTY_RUN = {
    "text": "", "bold": False, "italic": False, "strike": False,
    "color": None, "font": None,
}
DATE_POINT = re.compile(
    r"(?:(?P<year>[0-9]{4})[./年])?"
    r"(?P<month>[0-9]{1,2})[./月](?P<day>[0-9]{1,2})日?"
)
DATE_RANGE_SEPARATOR = re.compile(r"\s*(?:~|～|〜|至|—|–)\s*")
IMAGE_LINE = re.compile(r"!\[[^\]]*\]\((.*?)\)")


class MarkdownImportError(ValueError):
    """带有源文档位置的 Markdown 输入错误。"""


def _plain_text(tokens):
    parts = []
    for token in tokens or []:
        kind = token.get("type")
        if kind == "text":
            parts.append(token.get("raw", ""))
        elif kind in ("softbreak", "linebreak"):
            parts.append("\n")
        elif kind in ("inline_html", "block_html", "codespan", "block_code"):
            parts.append(token.get("raw", ""))
        elif kind == "image":
            parts.append(_plain_text(token.get("children", [])))
        else:
            parts.append(_plain_text(token.get("children", [])))
    return "".join(parts)


def _heading_line(lines, level, title, start_at):
    """在原文中定位标题，Mistune AST 本身不携带行号。"""
    for index in range(start_at, len(lines)):
        match = re.match(r"^\s*(#{1,6})\s+(.*?)\s*#*\s*$", lines[index])
        if not match or len(match.group(1)) != level:
            continue
        raw = match.group(2).strip()
        if raw == title or _strip_heading_markup(raw) == title:
            return index + 1, index + 1
    return start_at + 1, start_at


def _strip_heading_markup(value):
    value = re.sub(r"(?<!\\)[*_~`]+", "", value)
    value = re.sub(r"\\([\\`*_{}\[\]()#+.!|>~-])", r"\1", value)
    return value.strip()


def _looks_like_date_heading(value):
    return bool(re.search(r"(?:[0-9]{4}[./年])?[0-9]{1,2}[./月][0-9]{1,2}", value))


def _parse_date_point(text, default_year, path, line):
    match = DATE_POINT.fullmatch(text.strip())
    if not match:
        raise MarkdownImportError(f"{path.name}:{line}: 日期标题格式无法识别：{text}")
    year = int(match.group("year")) if match.group("year") else default_year
    try:
        value = date(year, int(match.group("month")), int(match.group("day")))
    except ValueError as error:
        raise MarkdownImportError(f"{path.name}:{line}: 无效日期标题 {text}：{error}") from error
    return value, match.group("year") is not None


def _parse_date_heading(text, inherited_year, path, line):
    """返回周范围/单日上下文，以及本标题中的明确年份（若有）。"""
    parts = DATE_RANGE_SEPARATOR.split(text.strip(), maxsplit=1)
    if len(parts) == 2:
        start, start_explicit = _parse_date_point(parts[0], inherited_year, path, line)
        end_year_match = DATE_POINT.fullmatch(parts[1].strip())
        if not end_year_match:
            raise MarkdownImportError(f"{path.name}:{line}: 日期范围结束日期格式无法识别：{text}")
        end_year = int(end_year_match.group("year")) if end_year_match.group("year") else start.year
        end, end_explicit = _parse_date_point(parts[1], end_year, path, line)
        if end < start and not end_explicit:
            # 允许跨年周，例如 12.27~1.2；只在跨年后恰为七天时接受。
            try:
                next_year_end = date(end.year + 1, end.month, end.day)
            except ValueError:
                next_year_end = end
            if (next_year_end - start).days == 6:
                end = next_year_end
        if (end - start).days != 6:
            raise MarkdownImportError(
                f"{path.name}:{line}: 周范围必须首尾相隔 6 天（共 7 天）：{text}"
            )
        explicit_year = end.year if end_explicit else (start.year if start_explicit else None)
        return {"week": (start, end), "day": None}, explicit_year

    point_match = DATE_POINT.fullmatch(text.strip())
    if point_match:
        value, explicit = _parse_date_point(text, inherited_year, path, line)
        return {"week": None, "day": value}, value.year if explicit else None

    if _looks_like_date_heading(text):
        raise MarkdownImportError(f"{path.name}:{line}: 日期标题格式无效：{text}")
    return None, None


def _date_context(stack):
    week = day = None
    for node in reversed(stack):
        if week is None and node.get("date") and node["date"].get("week"):
            week = node["date"]["week"]
        if day is None and node.get("date") and node["date"].get("day"):
            day = node["date"]["day"]
    return week, day


def _week_for_article(stack, path, line, warnings, title):
    week, day = _date_context(stack)
    if week:
        start, end = week
        if day is None or start <= day <= end:
            return start, end
        if any((candidate.month, candidate.day) == (day.month, day.day)
               for candidate in (start + timedelta(days=i) for i in range(7))):
            warning = (
                f"{path.name}:{line}: 标题日期 {day.isoformat()} 与所属周年份冲突；"
                f"按周标题 {start.isoformat()} 至 {end.isoformat()} 入库：{title}"
            )
            warnings.append(warning)
            return start, end

    if day is None:
        if week:
            return week
        raise MarkdownImportError(f"{path.name}:{line}: 条目上方没有可用的日期或周范围：{title}")

    # Sunday through Saturday; Python Monday=0, Sunday=6.
    start = day - timedelta(days=(day.weekday() + 1) % 7)
    return start, start + timedelta(days=6)


def _append_run(runs, text, style):
    if not text:
        return
    run = {**EMPTY_RUN, "text": text, **style}
    # Compare both sets of style keys: a missing background means no highlight.
    if runs and all(
        runs[-1].get(key) == run.get(key)
        for key in (runs[-1].keys() | run.keys()) - {"text"}
    ):
        runs[-1]["text"] += text
    else:
        runs.append(run)


def _inline_events(tokens, style=None):
    style = style or {"bold": False, "italic": False, "strike": False}
    for token in tokens or []:
        kind = token.get("type")
        if kind == "image":
            yield ("image", token)
        elif kind in ("strong", "emphasis", "strikethrough"):
            child_style = dict(style)
            child_style[{"strong": "bold", "emphasis": "italic", "strikethrough": "strike"}[kind]] = True
            yield from _inline_events(token.get("children", []), child_style)
        elif kind == "softbreak":
            yield ("text", "\n", style)
        elif kind == "linebreak":
            yield ("text", "\n", style)
        elif kind == "link":
            yield from _inline_events(token.get("children", []), style)
        elif kind == "inline_html":
            # Raw HTML remains text and is escaped by the webpage renderer.
            yield ("text", token.get("raw", ""), style)
        elif kind in ("text", "codespan"):
            yield ("text", token.get("raw", ""), style)
        elif token.get("children"):
            yield from _inline_events(token["children"], style)
        elif token.get("raw"):
            yield ("text", token["raw"], style)


def _image_reference(token, path, line, article_id, block_index, image_index, assets, source_lines, end_line):
    attrs = token.get("attrs") or {}
    url = attrs.get("url") or ""
    source_line = _line_for_image(source_lines, url, line, end_line)
    parts = urlsplit(url)
    if parts.scheme or parts.netloc or not parts.path:
        raise MarkdownImportError(f"{path.name}:{source_line}: 只支持本地相对图片路径：{url}")
    relative = unquote(parts.path)
    if Path(relative).is_absolute() or re.match(r"^[A-Za-z]:[\\/]", relative):
        raise MarkdownImportError(f"{path.name}:{source_line}: 图片路径必须相对 Markdown 文件：{url}")
    source_image = (path.parent / relative).resolve()
    if not source_image.is_file():
        raise MarkdownImportError(f"{path.name}:{source_line}: 图片文件不存在：{url}")

    extension = source_image.suffix.lower()
    if not re.fullmatch(r"\.[a-z0-9]{1,8}", extension):
        extension = ".png"
    doc_hash = hashlib.sha256(unicodedata.normalize("NFC", path.stem).encode("utf-8")).hexdigest()[:12]
    article_hash = article_id.removeprefix("extra-")[:20]
    filename = f"extra_{doc_hash}_{article_hash}_b{block_index:03d}_{image_index:02d}{extension}"
    target_rel = f"images/{filename}"
    assets[target_rel] = source_image.read_bytes()
    alt = _plain_text(token.get("children", []))
    return {"type": "image", "images": [target_rel], "alt": alt}


def _inline_blocks(tokens, path, line, article_id, block_index, assets, source_lines, end_line):
    blocks, runs = [], []
    image_index = 0
    for event in _inline_events(tokens):
        if event[0] == "text":
            _append_run(runs, event[1], event[2])
            continue
        if runs:
            blocks.append({"runs": runs})
            runs = []
        image_index += 1
        blocks.append(_image_reference(
            event[1], path, line, article_id, block_index, image_index, assets,
            source_lines, end_line
        ))
    if runs:
        blocks.append({"runs": runs})
    return blocks


def _table_cell_runs(token):
    runs = []
    for event in _inline_events(token.get("children", [])):
        if event[0] == "text":
            _append_run(runs, event[1], event[2])
        else:
            # The current source tables contain text only; keep an image's alt text if one is added.
            _append_run(runs, _plain_text(event[1].get("children", [])), event[2] if len(event) > 2 else {})
    return runs


def _serialize_blocks(tokens, path, line, article_id, assets, source_lines, end_line, counter=None):
    if counter is None:
        counter = [0]
    blocks = []
    for token in tokens or []:
        kind = token.get("type")
        counter[0] += 1
        block_index = counter[0]
        if kind in ("paragraph", "block_text"):
            blocks.extend(_inline_blocks(
                token.get("children", []), path, line, article_id, block_index,
                assets, source_lines, end_line
            ))
        elif kind == "block_quote":
            children = _serialize_blocks(
                token.get("children", []), path, line, article_id, assets,
                source_lines, end_line, counter
            )
            if children:
                blocks.append({"type": "quote", "blocks": children})
        elif kind == "list":
            attrs = token.get("attrs") or {}
            items = []
            for item in token.get("children", []):
                if item.get("type") == "list_item":
                    item_blocks = _serialize_blocks(
                        item.get("children", []), path, line, article_id, assets,
                        source_lines, end_line, counter
                    )
                    items.append(item_blocks)
            blocks.append({"type": "list", "ordered": bool(attrs.get("ordered")), "items": items})
        elif kind == "table":
            rows = []
            align = []
            for part in token.get("children", []):
                if part.get("type") == "table_head":
                    cells = part.get("children", [])
                    rows.append([_table_cell_runs(cell) for cell in cells])
                    align = [(cell.get("attrs") or {}).get("align") for cell in cells]
                elif part.get("type") == "table_body":
                    for row in part.get("children", []):
                        rows.append([_table_cell_runs(cell) for cell in row.get("children", [])])
            blocks.append({"type": "table", "rows": rows, "align": align})
        elif kind == "heading":
            level = (token.get("attrs") or {}).get("level", 5)
            runs = []
            for event in _inline_events(token.get("children", [])):
                if event[0] == "text":
                    _append_run(runs, event[1], event[2])
            blocks.append({"type": "heading", "level": int(level), "runs": runs})
        elif kind == "thematic_break":
            blocks.append({"type": "rule"})
        elif kind in ("block_html", "block_error", "block_code"):
            raw = token.get("raw", "")
            if raw:
                blocks.append({"runs": [{**EMPTY_RUN, "text": raw}]})
        elif kind in ("blank_line",):
            continue
        elif token.get("children"):
            blocks.extend(_serialize_blocks(
                token["children"], path, line, article_id, assets,
                source_lines, end_line, counter
            ))
        elif token.get("raw"):
            blocks.append({"runs": [{**EMPTY_RUN, "text": token["raw"]}]})
    return blocks


def _person_tags(title):
    match = re.search(r"\s*\[([^\[\]]+)\]\s*$", title)
    if not match:
        return title.strip(), []
    tags = [item.strip() for item in re.split(r"[、，,]", match.group(1)) if item.strip()]
    return title[:match.start()].rstrip(), tags


def _line_for_image(lines, ref, lower, upper):
    decoded = unquote(ref)
    for index in range(max(0, lower - 1), min(len(lines), upper)):
        match = IMAGE_LINE.search(lines[index])
        if match and (match.group(1) == ref or unquote(match.group(1)) == decoded):
            return index + 1
    return lower


def parse_markdown(path, default_year):
    """解析一个 Markdown 番外文档，不写正式文件；返回文章、图片字节、警告。"""
    try:
        import mistune
    except ImportError as error:
        raise MarkdownImportError(
            "缺少 Markdown 解析器 Mistune；请在转换器目录运行：python -m pip install -r requirements.txt"
        ) from error

    path = Path(path)
    text = path.read_text(encoding="utf-8-sig")
    lines = text.splitlines()
    parser = mistune.create_markdown(renderer="ast", plugins=["table", "strikethrough"])
    tokens = parser(text)
    source_document_id = unicodedata.normalize("NFC", path.stem).strip()
    if not source_document_id:
        raise MarkdownImportError(f"{path.name}: 文件名无法生成番外文档标识")

    articles, assets, warnings = [], {}, []
    stack = []
    inherited_year = default_year
    line_cursor = 0
    index = 0
    while index < len(tokens):
        token = tokens[index]
        if token.get("type") != "heading":
            index += 1
            continue

        attrs = token.get("attrs") or {}
        level = int(attrs.get("level", 1))
        title_text = _plain_text(token.get("children", [])).strip()
        line, line_cursor = _heading_line(lines, level, title_text, line_cursor)
        while stack and stack[-1]["level"] >= level:
            stack.pop()

        date_info = None
        explicit_year = None
        if level in (2, 3):
            date_info, explicit_year = _parse_date_heading(title_text, inherited_year, path, line)
            if explicit_year is not None:
                inherited_year = explicit_year

        if level <= 3:
            stack.append({"level": level, "date": date_info})

        if level != 4:
            index += 1
            continue

        clean_title, tags = _person_tags(title_text)
        if not clean_title.startswith("关于"):
            index += 1
            while index < len(tokens):
                current = tokens[index]
                if current.get("type") == "heading" and int((current.get("attrs") or {}).get("level", 1)) <= 4:
                    break
                index += 1
            continue

        week_start, week_end = _week_for_article(stack, path, line, warnings, clean_title)
        match_key = "\0".join((source_document_id, week_start.isoformat(), clean_title))
        article_id = "extra-" + hashlib.sha256(match_key.encode("utf-8")).hexdigest()[:24]
        body_tokens = []
        body_start_line = line
        end_line = len(lines) + 1
        end_index = index + 1
        while end_index < len(tokens):
            current = tokens[end_index]
            if current.get("type") == "heading" and int((current.get("attrs") or {}).get("level", 1)) <= 4:
                current_title = _plain_text(current.get("children", [])).strip()
                current_level = int((current.get("attrs") or {}).get("level", 1))
                end_line, _ = _heading_line(lines, current_level, current_title, line_cursor)
                break
            body_tokens.append(current)
            end_index += 1
        paragraphs = _serialize_blocks(
            body_tokens, path, body_start_line, article_id, assets, lines, end_line
        )

        articles.append({
            "id": article_id,
            "title": clean_title,
            "date_start": week_start.isoformat(),
            "date_end": week_end.isoformat(),
            "episode": None,
            "characters": tags,
            "source": "extra",
            "source_document_id": source_document_id,
            "_source_line": line,
            "paragraphs": paragraphs,
        })
        index = end_index

    if not articles:
        raise MarkdownImportError(f"{path.name}: 没有找到标题以“关于”开头的四级标题条目")

    seen = {}
    for article in articles:
        key = (article["source_document_id"], article["date_start"], article["title"])
        if key in seen:
            raise MarkdownImportError(
                f"{path.name}:{article['_source_line']}: 同一周和标题重复：{article['title']}"
                f"（另一个匹配条目位于第 {seen[key]} 行）"
            )
        seen[key] = article["_source_line"]

    return articles, assets, warnings
