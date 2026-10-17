"""Notion HTML importer, sharing Markdown article identity and date rules."""
import hashlib
import re
import unicodedata
from pathlib import Path
from datetime import date, timedelta

from markdown_import import (
    MarkdownImportError, _append_run, _image_reference,
    _parse_date_heading, _person_tags, _week_for_article,
)


def parse_html(path, default_year):
    from bs4 import BeautifulSoup, NavigableString, Comment

    path = Path(path)
    soup = BeautifulSoup(path.read_text(encoding="utf-8-sig"), "html.parser")
    body = soup.select_one(".page-body") or soup.body
    if body is None:
        raise MarkdownImportError("HTML 中没有正文")
    css = "\n".join(s.get_text() for s in soup.find_all("style"))
    classes = {}

    def declarations(value):
        result = {}
        for key, val in re.findall(r"([\w-]+)\s*:\s*([^;{}]+)", value):
            val = val.strip()
            if key in ("color", "background", "background-color") and re.fullmatch(
                r"(?:#[0-9a-fA-F]{3,8}|rgba?\([0-9.,%\s]+\)|[a-zA-Z]+)", val
            ):
                result["color" if key == "color" else "background"] = val
            elif key == "font-weight" and (val in ("bold", "bolder") or val.isdigit() and int(val) >= 600):
                result["bold"] = True
            elif key == "font-style" and val == "italic":
                result["italic"] = True
            elif key in ("text-decoration", "text-decoration-line") and "line-through" in val:
                result["strike"] = True
        return result

    for name, rules in re.findall(r"\.([\w-]+)\s*\{([^{}]*)\}", css):
        classes[name] = declarations(rules)

    def style_for(node, inherited):
        result = dict(inherited)
        for name in node.get("class", []):
            result.update(classes.get(name, {}))
        result.update(declarations(node.get("style", "")))
        for tags, key in ((('strong', 'b'), 'bold'), (('em', 'i'), 'italic'), (('del', 's', 'strike'), 'strike')):
            if node.name in tags:
                result[key] = True
        return result

    assets, warnings, articles, stack = {}, [], [], []
    document_id = unicodedata.normalize("NFC", path.stem).strip()
    # Notion appends a page UUID to exported filenames; it is not part of the issue name.
    weekly_name = re.sub(r"\s+[0-9a-fA-F]{32}$", "", document_id).strip()
    weekly_match = re.fullmatch(r"忘川风华录知交圈微考据番外篇\s*\+?\s*([0-9]+)", weekly_name)
    filename_week = None
    if weekly_match:
        suffix = weekly_match.group(1)
        if not re.fullmatch(r"(?:[1-9]|1[0-2])[0-9]{2}", suffix):
            raise MarkdownImportError('番外日期后缀应为月份不补零、日期两位，例如 709、1011')
        try:
            start = date(default_year, int(suffix[:-2]), int(suffix[-2:]))
        except ValueError as error:
            raise MarkdownImportError(f'番外文件名日期无效：{suffix}') from error
        filename_week = (start, start + timedelta(days=6))
        document_id = f'忘川风华录知交圈微考据番外篇-{start.isoformat()}'
    year = default_year
    counter = [0]

    def blocks(nodes, article_id, inherited=None):
        result, runs = [], []
        inherited = inherited or {}

        def flush():
            if runs:
                if any(r['text'].strip() for r in runs):
                    result.append({"runs": list(runs)})
                runs.clear()

        def visit(node, style):
            if isinstance(node, Comment):
                return
            if isinstance(node, NavigableString):
                _append_run(runs, str(node), style)
                return
            tag = node.name
            if tag in ('script', 'style', 'header'):
                return
            current = style_for(node, style)
            if tag == 'br':
                _append_run(runs, '\n', current)
            elif tag == 'img':
                flush()
                counter[0] += 1
                result.append(_image_reference(
                    {'attrs': {'url': node.get('src', '')}, 'children': [{'type': 'text', 'raw': node.get('alt', '')}]},
                    path, node.sourceline or 1, article_id, counter[0], 1, assets, [], 0))
            elif tag == 'blockquote':
                flush()
                result.append({'type': 'quote', 'blocks': blocks(node.children, article_id, current)})
            elif tag in ('ul', 'ol'):
                flush()
                result.append({'type': 'list', 'ordered': tag == 'ol', 'items': [
                    blocks(item.children, article_id, style_for(item, current))
                    for item in node.find_all('li', recursive=False)]})
            elif tag == 'table':
                flush()
                rows = []
                for row in node.find_all('tr'):
                    cells = []
                    for cell in row.find_all(['th', 'td'], recursive=False):
                        pieces = blocks(cell.children, article_id, style_for(cell, style_for(row, current)))
                        cell_runs = []
                        for piece in pieces:
                            if cell_runs:
                                _append_run(cell_runs, '\n', {})
                            cell_runs.extend(piece.get('runs', []))
                        cells.append(cell_runs)
                    rows.append(cells)
                result.append({'type': 'table', 'rows': rows, 'align': []})
            elif tag == 'hr':
                flush()
                result.append({'type': 'rule'})
            else:
                is_block = tag in ('p', 'div', 'figure', 'figcaption', 'pre', 'h5', 'h6')
                if is_block:
                    flush()
                for child in node.children:
                    visit(child, current)
                if is_block:
                    flush()

        for node in nodes:
            visit(node, inherited)
        flush()
        return result

    nodes = list(body.children)
    index = 0
    seen = set()
    while index < len(nodes):
        node = nodes[index]
        tag = getattr(node, 'name', None)
        if tag not in ('h1', 'h2', 'h3', 'h4'):
            index += 1
            continue
        level = int(tag[1])
        title = node.get_text().strip()
        line = node.sourceline or 1
        while stack and stack[-1]['level'] >= level:
            stack.pop()
        if level <= 3:
            info, explicit = _parse_date_heading(title, year, path, line) if level in (2, 3) else (None, None)
            if explicit is not None:
                year = explicit
            stack.append({'level': level, 'date': info})
            index += 1
            continue
        end = index + 1
        while end < len(nodes) and getattr(nodes[end], 'name', None) not in ('h1', 'h2', 'h3', 'h4'):
            end += 1
        title, tags = _person_tags(title)
        if title.startswith('关于'):
            if filename_week:
                start, finish = filename_week
                # Explicit week headings must agree; single-day headings do not set the issue date.
                for context in stack:
                    explicit_week = (context.get('date') or {}).get('week')
                    if explicit_week and explicit_week != filename_week:
                        raise MarkdownImportError(f'{path.name}:{line}: 正文周范围与文件名日期不一致：{title}')
            else:
                start, finish = _week_for_article(stack, path, line, warnings, title)
            key = '\0'.join((document_id, start.isoformat(), title))
            if key in seen:
                raise MarkdownImportError(f'{path.name}:{line}: 同周标题重复：{title}')
            seen.add(key)
            aid = 'extra-' + hashlib.sha256(key.encode('utf-8')).hexdigest()[:24]
            counter[0] = 0
            articles.append({'id': aid, 'title': title, 'date_start': start.isoformat(),
                'date_end': finish.isoformat(), 'episode': None, 'characters': tags,
                'source': 'extra', 'source_document_id': document_id, '_source_line': line,
                'paragraphs': blocks(nodes[index + 1:end], aid)})
        index = end
    if not articles:
        raise MarkdownImportError('HTML 中没有标题以“关于”开头的四级标题条目')
    return articles, assets, warnings
