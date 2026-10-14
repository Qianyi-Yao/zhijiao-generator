# -*- coding: utf-8 -*-
"""
知交圈微考据 PPT 转换器
把考据 PPT 或番外 Markdown 转为网页数据（JSON + 图片），输出到工作区 library/。

用法：
  1) 双击 运行.bat：处理工作区根目录（及 输入PPT/ 文件夹）里的【全部】pptx，合并为一个数据文件；
  2) 把单个 .pptx 或 .md 拖到 运行.bat 上（等效 python converter.py <文件路径>）：仅处理该文件。

规则（与遣月确认）：
  - 每页第一段文本 = 标题"关于XXX"；标题含水印文字的页（封面/装饰页）跳过；
  - 每页包含"忘川风华录知交圈微考据"的段落为水印页脚，剔除；
  - 相邻页标题相同 = 同一篇（合并）；正文忠实保留（不去重）；
  - 新 PPT 右上角"核心人物：xxx"识别为标签（逗号/顿号分隔多值）；没有则留空；
  - 文件名末尾数字 = 开始日期（月不补零、日固定两位；709=7月9日，1004=10月4日），年份固定见 YEAR；
  - 日期解析失败、标题非"关于"开头等异常，写进 library/待确认清单.txt。

富文本：runs 保留粗体/斜体/删除线/颜色/字体名；页面映射：正文宋体、带字体 run 楷体。
番外 Markdown：只导入四级标题中以“关于”开头的条目，图片路径相对 Markdown 文件所在目录。
"""
import sys, re, json
import tempfile
import shutil
from datetime import date, timedelta
from pathlib import Path
from pptx import Presentation
from pptx.oxml.ns import qn
from markdown_import import MarkdownImportError, parse_markdown

# ===== 配置 =====
YEAR = 2026                      # 年份（跨年改这里）
WATERMARK = "忘川风华录知交圈微考据"   # 水印页脚
TITLE_PREFIX = "关于"            # 标题前缀
CHARACTER_MARK = "核心人物"      # 新 PPT 右上角标注前缀

EMPTY_RUN = {"text": "", "bold": False, "italic": False, "strike": False, "color": None, "font": None}

BASE_DIR = Path(__file__).resolve().parents[2]   # 工作区
LIBRARY_DIR = BASE_DIR / "library"               # 输出目录
DATA_DIR = LIBRARY_DIR / "data"
IMAGES_DIR = LIBRARY_DIR / "images"


def ppt_replaces(article, updated_issues):
    """PPT 重转只替换来自 PPT 的同一期正文，不碰编辑器文章。"""
    return (article.get("source") != "extra" and
            article.get("origin") != "editor" and
            article.get("date_start") in updated_issues)


def parse_month_day(num):
    """解析新格式的原始文件名后缀（月不补零、日两位）；无效时返回 None。"""
    s = str(num)
    if not re.fullmatch(r"(?:[1-9]|1[0-2])[0-9]{2}", s):
        return None

    month, day = int(s[:-2]), int(s[-2:])
    try:
        date(YEAR, month, day)
    except ValueError:
        return None
    return month, day


def extract_episode_suffix(name):
    """提取文件名末尾的原始数字，保留前导零供格式校验。"""
    m = re.search(r"([0-9]+)(?:\.pptx)?$", name)
    return m.group(1) if m else None


def extract_episode(name):
    suffix = extract_episode_suffix(name)
    return int(suffix) if suffix is not None else None


def parse_person(s):
    """解析人物标注：兼容 '核心人物：xxx' 前缀或直接人物名（逗号/顿号/斜杠分隔）"""
    s = s.strip()
    if s.startswith(CHARACTER_MARK):
        s = s[len(CHARACTER_MARK):].lstrip("：:")
    return [c.strip() for c in re.split(r"[，,、/]", s) if c.strip()]


def read_paragraph(para):
    """读取一个段落，返回 (runs列表, 纯文本)。
    runs 保留 run 级格式、连续明黄高亮片段与段内软换行。"""
    runs = []
    plain = []
    for child in para._p.iterchildren():
        if child.tag == qn('a:br'):
            runs.append({**EMPTY_RUN, "text": "\n"})
            plain.append("\n")
        elif child.tag == qn('a:r'):
            t = child.find(qn('a:t'))
            text = t.text if t is not None and t.text else ""
            if not text:
                continue
            rPr = child.find(qn('a:rPr'))
            bold = italic = strike = False
            color = font = None
            if rPr is not None:
                bold = rPr.get('b') == '1'
                italic = rPr.get('i') == '1'
                strike = rPr.get('strike') in ('sngStrike', 'dblStrike')
                sf = rPr.find(qn('a:solidFill'))
                if sf is not None:
                    srgb = sf.find(qn('a:srgbClr'))
                    if srgb is not None:
                        val = srgb.get('val', '')
                        # 黑名单：816/823 的普通文字自定义色 #002060，丢弃后统一黑色
                        color = "#" + val if val.upper() != "002060" else None
                latin = rPr.find(qn('a:latin'))
                if latin is not None:
                    font = latin.get('typeface')
            highlight = rPr.find(qn('a:highlight')) if rPr is not None else None
            highlight_color = highlight.find(qn('a:srgbClr')) if highlight is not None else None
            yellow = (highlight_color is not None and
                      (highlight_color.get('val') or '').upper() == 'FFFF00')
            runs.append({"text": text, "bold": bold, "italic": italic,
                         "strike": strike, "color": color, "font": font,
                         "_yellow": yellow})
            plain.append(text)
    group_start = None
    for index in range(len(runs) + 1):
        yellow = index < len(runs) and runs[index].pop("_yellow", False)
        if yellow and group_start is None:
            group_start = index
        elif not yellow and group_start is not None:
            group = "".join(run["text"] for run in runs[group_start:index])
            for run in runs[group_start:index]:
                run["highlightGroup"] = group
            group_start = None
    return runs, "".join(plain)


def read_table(shape):
    """保留表格的富文本、合并格和 PPT 页面坐标。"""
    table = shape.table
    rows = []
    for row in table.rows:
        cells = []
        for cell in row.cells:
            if cell.is_spanned:
                cells.append(None)
                continue
            runs = []
            for para in cell.text_frame.paragraphs:
                if runs:
                    runs.append({**EMPTY_RUN, "text": "\n"})
                para_runs, _ = read_paragraph(para)
                runs.extend(para_runs)
            first_para = cell.text_frame.paragraphs[0]
            alignment = {1: "left", 2: "center", 3: "right"}.get(
                first_para.alignment)
            cells.append({
                "runs": runs,
                "rowspan": cell.span_height if cell.is_merge_origin else 1,
                "colspan": cell.span_width if cell.is_merge_origin else 1,
                "align": alignment,
                "images": []
            })
        rows.append(cells)
    return {"type": "table", "rows": rows, "align": [],
            "_shape": shape}


def table_cell_at(table_block, image_shape):
    """图片中心落入表格时，返回所在的可见单元格。"""
    shape = table_block["_shape"]
    x = image_shape.left + image_shape.width / 2
    y = image_shape.top + image_shape.height / 2
    if not (shape.left <= x < shape.left + shape.width and
            shape.top <= y < shape.top + shape.height):
        return None
    table = shape.table
    col = row = 0
    edge = shape.left
    for index, column in enumerate(table.columns):
        edge += column.width
        if x < edge:
            col = index
            break
    edge = shape.top
    for index, table_row in enumerate(table.rows):
        edge += table_row.height
        if y < edge:
            row = index
            break
    cell = table.cell(row, col)
    if cell.is_spanned:
        for ri in range(row, -1, -1):
            for ci in range(col, -1, -1):
                origin = table.cell(ri, ci)
                if (origin.is_merge_origin and
                        ri + origin.span_height > row and
                        ci + origin.span_width > col):
                    return table_block["rows"][ri][ci]
        return None
    return table_block["rows"][row][col]


def iter_page_content(slide):
    """返回正文、图片和表格；正文按视觉位置排序。"""
    items = []
    for shape in slide.shapes:
        top = shape.top if shape.top is not None else 0
        left = shape.left if shape.left is not None else 0
        img = None
        try:
            img = shape.image
        except Exception:
            img = None
        if img is not None:
            items.append((top, left, "img", shape))
        elif shape.has_table:
            items.append((top, left, "table", read_table(shape)))
        elif shape.has_text_frame:
            for para in shape.text_frame.paragraphs:
                runs, plain = read_paragraph(para)
                if plain.strip():
                    items.append((top, left, "para", runs, plain))
    items.sort(key=lambda x: (x[0], x[1]))
    texts = [it[4] for it in items if it[2] == "para"]
    lefts = [it[1] for it in items if it[2] == "para"]
    paras = [it[3] for it in items if it[2] == "para"]
    images = [it[3] for it in items if it[2] == "img"]
    tables = [it[3] for it in items if it[2] == "table"]
    return texts, paras, images, lefts, tables


def classify_page_content(texts, paras, lefts, right_x):
    """将标题后的文字分类为正文段落和核心人物。"""
    body_paras = []
    characters = []

    for index, text in enumerate(texts[1:], 1):
        if WATERMARK in text:
            continue

        if (
            lefts[index] > right_x or
            text.startswith(CHARACTER_MARK)
        ):
            characters += parse_person(text)
            continue

        body_paras.append(paras[index])

    return body_paras, characters


def write_images(images, episode, page_no, output_dir):
    """写出普通 PPT 图片，返回 library.json 使用的相对路径。"""
    image_names = []

    for index, shape in enumerate(images, 1):
        image = shape.image
        ext = (image.ext or "png").lower()
        name = f"{YEAR}_{episode}_p{page_no}_{index}.{ext}"
        (output_dir / name).write_bytes(image.blob)
        image_names.append(f"images/{name}")

    return image_names


def process_one(ppt_path, confirm_lines, image_output_dir):
    """处理单个 PPT，返回该期文章列表。"""
    episode_suffix = extract_episode_suffix(ppt_path.stem)
    episode = int(episode_suffix) if episode_suffix is not None else None
    md = parse_month_day(episode_suffix) if episode_suffix is not None else None
    date_start = date_end = None
    if md is None:
        confirm_lines.append(f"⚠️ 文件名 {ppt_path.name} 的日期数字无法解析（数字={episode}），请人工确认")
    else:
        date_start = date(YEAR, md[0], md[1])
        date_end = date_start + timedelta(days=6)

    print(f"  处理: {ppt_path.name}  (期数={episode}, 日期={date_start} 至 {date_end})")

    prs = Presentation(str(ppt_path))
    right_x = prs.slide_width * 0.9  # 页面右侧 90% 起为人物标注区（823 起的新布局）
    pages = []
    for idx, slide in enumerate(prs.slides, 1):
        texts, paras, images, lefts, tables = iter_page_content(slide)
        if not texts:
            if images:
                raise ValueError(
                    f"第{idx}页包含图片但没有标题，"
                    "请为该页补充与所属文章完全一致的“关于……”标题"
                )
            continue
        title = texts[0]
        body_paras, chars = classify_page_content(
            texts,
            paras,
            lefts,
            right_x
        )
        page = {"title": title, "body": body_paras, "chars": chars,
                "images": images, "tables": tables, "page_no": idx}
        pages.append(page)

    # 相邻页标题完全相同 = 同一篇；标题变化 = 开始新篇
    articles = []
    cur = None
    for p in pages:
        if cur is not None and p["title"] == cur["title"]:
            cur["pages"].append(p)
            for c in p["chars"]:
                if c not in cur["chars"]:
                    cur["chars"].append(c)
            continue

        if cur is not None:
            articles.append(cur)

        cur = {"title": p["title"], "pages": [p], "chars": list(p["chars"])}

    if cur is not None:
        articles.append(cur)

    for i, a in enumerate(articles, 1):
        if not a["title"].startswith(TITLE_PREFIX):
            confirm_lines.append(
                f"⚠️ {ppt_path.name} 第{i}篇标题未以"
                f"“{TITLE_PREFIX}”开头（独立保留）: {a['title']}"
            )

    ep = episode if episode is not None else "x"
    out_articles = []
    for ai, a in enumerate(articles, 1):
        aid = f"{date_start.isoformat() if date_start else 'unknown'}-{ai}"
        pages_out = []
        for p in a["pages"]:
            img_names = write_images(
                p["images"], ep, p["page_no"], image_output_dir
            )
            page_images = []
            for image_shape, image_name in zip(p["images"], img_names):
                destination = None
                for table in p["tables"]:
                    destination = table_cell_at(table, image_shape)
                    if destination is not None:
                        break
                if destination is None:
                    page_images.append(image_name)
                else:
                    destination["images"].append(image_name)
            all_runs = []
            for ri, pr in enumerate(p["body"]):
                if ri > 0:
                    all_runs.append({**EMPTY_RUN, "text": "\n\n"})  # 段间空行
                all_runs.extend(pr)
            pages_out.append({"runs": all_runs, "images": page_images})
            for table in p["tables"]:
                pages_out.append({key: value for key, value in table.items()
                                  if key != "_shape"})
        out_articles.append({
            "id": aid,
            "title": a["title"],
            "date_start": date_start.isoformat() if date_start else "",
            "date_end": date_end.isoformat() if date_end else "",
            "episode": episode,
            "characters": a["chars"],
            "source": "main",
            "paragraphs": pages_out
        })
    return out_articles


def import_markdown_file(md_path):
    """解析、合并并事务式发布一个番外 Markdown 文档。"""
    old_json = DATA_DIR / "library.json"
    old_articles = []
    try:
        # Parse and validate the complete source before reading the live library.
        from html_import import parse_html
        parser = parse_html if Path(md_path).suffix.lower() in (".html", ".htm") else parse_markdown
        new_articles, image_assets, warnings = parser(md_path, YEAR)

        if old_json.exists():
            old_data = json.loads(old_json.read_text(encoding="utf-8"))
            old_articles = old_data.get("articles", [])
            if not isinstance(old_articles, list):
                raise ValueError("articles 应该是一个文章列表")
            if any(not isinstance(article, dict) for article in old_articles):
                raise ValueError("articles 中包含无效记录")

        source_document_id = new_articles[0]["source_document_id"]
        incoming_by_key = {}
        for article in new_articles:
            key = (source_document_id, article["date_start"], article["title"])
            if key in incoming_by_key:
                raise ValueError(f"同一 Markdown 文档中存在重复条目：{article['title']}")
            incoming_by_key[key] = article

        old_matches = {}
        for index, article in enumerate(old_articles):
            if article.get("source") != "extra":
                continue
            if article.get("source_document_id") != source_document_id:
                continue
            key = (source_document_id, article.get("date_start"), article.get("title"))
            if key in incoming_by_key:
                old_matches.setdefault(key, []).append((index, article))

        for key, matches in old_matches.items():
            if len(matches) > 1:
                raise ValueError(
                    f"{Path(md_path).name}:{incoming_by_key[key].get('_source_line', '?')}: "
                    f"圖書館中同一番外匹配键有多条旧记录：{matches[0][1].get('title')}"
                )

        for article in new_articles:
            article.pop("_source_line", None)

        merged_by_key = {}
        for key, article in incoming_by_key.items():
            matches = old_matches.get(key, [])
            if matches:
                previous = matches[0][1]
                previous_characters = previous.get("characters") or []
                article["characters"] = list(dict.fromkeys(
                    list(previous_characters) + list(article.get("characters") or [])
                ))
                # Retain an existing ID if a prior importer version already assigned one.
                article["id"] = previous.get("id") or article["id"]
            merged_by_key[key] = article

        # Replace matched records in place, preserve all unmatched old records, then append new entries.
        merged_articles = []
        matched_keys = set()
        for old in old_articles:
            key = (source_document_id, old.get("date_start"), old.get("title"))
            if old.get("source") == "extra" and old.get("source_document_id") == source_document_id and key in merged_by_key:
                if key not in matched_keys:
                    merged_articles.append(merged_by_key[key])
                    matched_keys.add(key)
                continue
            merged_articles.append(old)
        merged_articles.extend(
            article for key, article in merged_by_key.items()
            if key not in matched_keys
        )

    except Exception as error:
        print(f"{Path(md_path).name} 解析或检查失败，正式数据未写入：{error}")
        return False

    data = {"version": 2, "articles": merged_articles}
    warning_path = LIBRARY_DIR / "番外待确认清单.txt"
    staging = None
    try:
        LIBRARY_DIR.mkdir(parents=True, exist_ok=True)
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        IMAGES_DIR.mkdir(parents=True, exist_ok=True)

        staging = tempfile.TemporaryDirectory(prefix="markdown-import-", dir=LIBRARY_DIR)
        staging_dir = Path(staging.name)
        staging_images = staging_dir / "images"
        staging_images.mkdir()

        for relative_path, content in image_assets.items():
            (staging_images / Path(relative_path).name).write_bytes(content)

        staged_json = staging_dir / "library.json"
        staged_json.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        staged_warning = None
        if warnings:
            staged_warning = staging_dir / "番外待确认清单.txt"
            staged_warning.write_text("\n".join(warnings) + "\n", encoding="utf-8")

        # Back up the current JSON, warning report and any image about to be replaced.
        backup_root = Path(__file__).resolve().parent / "备份"
        backup_root.mkdir(parents=True, exist_ok=True)
        backup_dir = Path(tempfile.mkdtemp(
            prefix=f"markdown_{source_document_id}_", dir=backup_root
        ))
        backup_images = backup_dir / "images"
        backup_images.mkdir()
        had_old_json = old_json.exists()
        if had_old_json:
            shutil.copy2(old_json, backup_dir / "library.json")
        had_old_warning = warning_path.exists()
        if had_old_warning:
            shutil.copy2(warning_path, backup_dir / warning_path.name)

        new_image_files = list(staging_images.iterdir())
        for source in new_image_files:
            target = IMAGES_DIR / source.name
            if target.exists():
                shutil.copy2(target, backup_images / target.name)

    except Exception as error:
        if staging is not None:
            staging.cleanup()
        print(f"準備番外輸出或備份失敗，正式数据未更新：{error}")
        return False

    changed_images = []
    json_update_started = False
    warning_update_started = False
    try:
        for source in new_image_files:
            target = IMAGES_DIR / source.name
            changed_images.append(target)
            shutil.copy2(source, target)

        json_update_started = True
        staged_json.replace(old_json)

        warning_update_started = True
        if staged_warning is not None:
            staged_warning.replace(warning_path)
        else:
            warning_path.unlink(missing_ok=True)

    except Exception as error:
        recovery_errors = []
        if warning_update_started:
            try:
                if had_old_warning:
                    restore_warning = staging_dir / "restore-warning.txt"
                    shutil.copy2(backup_dir / warning_path.name, restore_warning)
                    restore_warning.replace(warning_path)
                else:
                    warning_path.unlink(missing_ok=True)
            except Exception as restore_error:
                recovery_errors.append(f"恢復番外待確認清單失敗：{restore_error}")

        if json_update_started:
            try:
                if had_old_json:
                    restore_json = staging_dir / "restore-library.json"
                    shutil.copy2(backup_dir / "library.json", restore_json)
                    restore_json.replace(old_json)
                else:
                    old_json.unlink(missing_ok=True)
            except Exception as restore_error:
                recovery_errors.append(f"恢復 JSON 失敗：{restore_error}")

        for target in reversed(changed_images):
            try:
                saved_image = backup_images / target.name
                if saved_image.exists():
                    shutil.copy2(saved_image, target)
                else:
                    target.unlink(missing_ok=True)
            except Exception as restore_error:
                recovery_errors.append(f"恢復圖片 {target.name} 失敗：{restore_error}")

        staging.cleanup()
        print(f"番外正式更新失敗：{error}")
        if recovery_errors:
            print("自動恢復未全部成功，請保留備份並檢查：")
            for message in recovery_errors:
                print(message)
        else:
            print("已恢復到本次更新前的狀態。")
        print(f"備份位置：{backup_dir}")
        return False

    try:
        staging.cleanup()
    except Exception as error:
        print(f"臨時目錄清理失敗，不影響已保存的內容：{error}")

    if warnings:
        print(f"⚠️ 有 {len(warnings)} 條日期提醒，見 library/{warning_path.name}")
    is_update = bool(old_matches)
    action = "更新番外文檔" if is_update else "新增番外文檔"
    print(f"完成！{action}，本次 {len(new_articles)} 篇，圖書館共 {len(merged_articles)} 篇。")
    print(f"備份位置：{backup_dir}")
    return True


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    # 每次只接收一个PPT：支持拖入启动器，或启动后输入路径
    preserve_existing_images = "--preserve-existing-images" in sys.argv[1:]
    paths = [arg for arg in sys.argv[1:] if arg != "--preserve-existing-images"]
    if len(paths) > 1:
        print("每次只能处理一个文件，请只提供一个文件。")
        input("按回车退出...")
        return

    if paths:
        raw_path = paths[0]
    else:
        raw_path = input("请输入或拖入一个 PPT、Markdown 或 HTML 文件，然后按回车：")

    # 去掉路径两端的空白和双引号
    raw_path = raw_path.strip().strip('"')

    if not raw_path:
        print("没有提供文件，已退出。")
        input("按回车退出...")
        return

    ppt_path = Path(raw_path)

    if not ppt_path.is_file():
        print(f"找不到文件：{ppt_path}")
        input("按回车退出...")
        return

    if ppt_path.suffix.lower() in (".md", ".html", ".htm"):
        import_markdown_file(ppt_path)
        input("按回车退出...")
        return

    if ppt_path.suffix.lower() != ".pptx":
        print("请选择 .pptx、.md 或 .html 文件。")
        input("按回车退出...")
        return

    # 提前检查文件名中的日期，避免无法确定要更新哪一期
    try:
        episode_suffix = extract_episode_suffix(ppt_path.stem)
        if episode_suffix is None:
            raise ValueError("文件名末尾缺少日期数字，格式示例：709（7月9日）、1004（10月4日）")

        month_day = parse_month_day(episode_suffix)
        if month_day is None:
            raise ValueError(
                "文件名末尾日期格式无效；请使用月份不补零、日期两位的格式，"
                "例如 709（7月9日）或 1004（10月4日），并确保日期真实存在"
            )

        # 数据中的期数仍保存为文件名后缀对应的整数。
        episode = int(episode_suffix)

    except ValueError as e:
        print(f"日期检查失败，已停止转换：{e}")
        input("按回车退出...")
        return

    # 读取旧文章和人物标签，供后续增量更新使用
    old_articles = []
    old_by_key = {}
    old_json = DATA_DIR / "library.json"

    if old_json.exists():
        try:
            old = json.loads(old_json.read_text(encoding="utf-8"))
            old_articles = old["articles"]

            # 检查文章列表，避免把异常数据用于后续更新
            if not isinstance(old_articles, list):
                raise ValueError("articles 应该是一个文章列表")

            for article in old_articles:
                if article.get("source") == "extra" or article.get("origin") == "editor":
                    continue
                key = (article.get("date_start"), article.get("title"))
                if key in old_by_key:
                    raise ValueError(f"旧数据中存在重复文章：{key}")
                old_by_key[key] = article

        except Exception as e:
            print(f"读取旧数据失败，已停止转换：{e}")
            input("按回车退出...")
            return

    # 确保输出目录存在，保留已有文件
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    confirm_lines = []
    staging = None

    try:
        # 在 library 下面创建一个独立的临时工作目录
        staging = tempfile.TemporaryDirectory(
            prefix="ppt-import-",
            dir=LIBRARY_DIR
        )
        staging_dir = Path(staging.name)

        # 本次提取的图片先存放在这里
        staging_images = staging_dir / "images"
        staging_images.mkdir()

        all_articles = process_one(
            ppt_path, confirm_lines, staging_images
        )

        if not all_articles:
            raise ValueError("没有提取到任何文章，请检查 PPT 内容")

    except Exception as e:
        if staging is not None:
            staging.cleanup()

        print(f"{ppt_path.name} 转换失败，已停止：{e}")
        input("按回车退出...")
        return

    # 合并旧数据中的手工人物（Excel 回填等），避免重跑丢失
    for a in all_articles:
        key = (a.get("date_start"), a.get("title"))
        previous = old_by_key.get(key)
        if previous:
            a["characters"] = list(dict.fromkeys(
                list(previous.get("characters") or []) + a.get("characters", [])))
            a["id"] = previous.get("id") or a["id"]
            a["episode"] = previous.get("episode", a["episode"])
            if previous.get("source") is None:
                a.pop("source", None)
            if preserve_existing_images:
                # 人工替换过的图片可能改了扩展名（例如 PNG 改成 JPG）。
                old_images = {}
                for paragraph in previous.get("paragraphs", []):
                    image_paths = list(paragraph.get("images", []))
                    if paragraph.get("type") == "table":
                        for row in paragraph.get("rows", []):
                            for cell in row:
                                if isinstance(cell, dict):
                                    image_paths.extend(cell.get("images", []))
                    for image_path in image_paths:
                        if (LIBRARY_DIR / image_path).is_file():
                            old_images[Path(image_path).stem] = image_path
                for paragraph in a["paragraphs"]:
                    if "images" in paragraph:
                        paragraph["images"] = [
                            old_images.get(Path(path).stem, path)
                            for path in paragraph["images"]
                        ]
                    if paragraph.get("type") == "table":
                        for row in paragraph["rows"]:
                            for cell in row:
                                if isinstance(cell, dict):
                                    cell["images"] = [
                                        old_images.get(Path(path).stem, path)
                                        for path in cell.get("images", [])
                                    ]

    # 日期是期的稳定身份；旧库有 67/607 等不同格式的期号。
    def issue_key(article):
        return article["date_start"]

    # 本次转换涉及哪些期
    updated_issues = {
        issue_key(article)
        for article in all_articles
    }

    # 在旧期原有位置替换，避免重跑使其他文章的顺序变化。
    merged_articles = []
    inserted = False
    for article in old_articles:
        if ppt_replaces(article, updated_issues):
            if not inserted:
                merged_articles.extend(all_articles)
                inserted = True
            continue
        merged_articles.append(article)
    if not inserted:
        merged_articles.extend(all_articles)

    data = {"version": 2, "articles": merged_articles}

    try:
        # 先把合并后的数据完整写进临时文件
        staged_json = staging_dir / "library.json"
        with open(staged_json, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        # 备份放在转换器旁边，独立于临时目录
        backup_root = Path(__file__).resolve().parent / "备份"
        backup_root.mkdir(parents=True, exist_ok=True)

        backup_dir = Path(tempfile.mkdtemp(
            prefix=f"{YEAR}_{episode}_",
            dir=backup_root
        ))
        backup_images = backup_dir / "images"
        backup_images.mkdir()

        # 记录更新前是否已有总数据文件，并备份
        had_old_json = old_json.exists()
        if had_old_json:
            shutil.copy2(old_json, backup_dir / "library.json")

        # 列出本次准备发布的图片
        referenced_images = set()
        for article in all_articles:
            for paragraph in article["paragraphs"]:
                referenced_images.update(paragraph.get("images", []))
                if paragraph.get("type") == "table":
                    for row in paragraph["rows"]:
                        for cell in row:
                            if isinstance(cell, dict):
                                referenced_images.update(cell.get("images", []))
        new_image_files = [source for source in staging_images.iterdir()
                           if not (preserve_existing_images and
                                   ((IMAGES_DIR / source.name).exists() or
                                    f"images/{source.name}" not in referenced_images))]

        # 备份即将被同名覆盖的旧图片
        for source in new_image_files:
            target = IMAGES_DIR / source.name
            if target.exists():
                shutil.copy2(target, backup_images / target.name)

    except Exception as e:
        staging.cleanup()
        print(f"准备输出或备份失败，正式数据尚未更新：{e}")
        input("按回车退出...")
        return

    # 记录实际尝试更新的文件，失败时据此恢复
    changed_images = []
    json_update_started = False

    print(f"本次备份位置：{backup_dir}")

    try:
        # 先发布图片
        for source in new_image_files:
            target = IMAGES_DIR / source.name
            changed_images.append(target)
            shutil.copy2(source, target)

        # 图片就位后，再用完整的新 JSON 替换正式文件
        json_update_started = True
        staged_json.replace(old_json)

    except Exception as e:
        recovery_errors = []

        # 恢复更新前的 JSON 状态
        if json_update_started:
            try:
                if had_old_json:
                    recovery_json = staging_dir / "restore-library.json"
                    shutil.copy2(
                        backup_dir / "library.json",
                        recovery_json
                    )
                    recovery_json.replace(old_json)
                else:
                    old_json.unlink(missing_ok=True)
            except Exception as restore_error:
                recovery_errors.append(f"恢复 JSON 失败：{restore_error}")

        # 恢复被覆盖的图片，移除本次新增的图片
        for target in reversed(changed_images):
            try:
                saved_image = backup_images / target.name
                if saved_image.exists():
                    shutil.copy2(saved_image, target)
                else:
                    target.unlink(missing_ok=True)
            except Exception as restore_error:
                recovery_errors.append(
                    f"恢复图片 {target.name} 失败：{restore_error}"
                )

        # 临时文件不再用于发布，独立备份继续保留
        try:
            staging.cleanup()
        except Exception as cleanup_error:
            print(f"临时目录清理失败：{cleanup_error}")

        print(f"正式更新失败：{e}")

        if recovery_errors:
            print("自动恢复未全部成功，请保留备份并检查：")
            for message in recovery_errors:
                print(message)
        else:
            print("已恢复到本次更新前的状态。")

        print(f"备份位置：{backup_dir}")
        input("按回车退出...")
        return

    def paragraph_images(paragraph):
        paths = set(paragraph.get("images", []))
        if paragraph.get("type") == "table":
            for row in paragraph.get("rows", []):
                for cell in row:
                    if isinstance(cell, dict):
                        paths.update(cell.get("images", []))
        return paths

    # 找出被替换的旧文章引用过的图片
    old_image_paths = set()
    for article in old_articles:
        if ppt_replaces(article, updated_issues):
            for paragraph in article.get("paragraphs", []):
                old_image_paths.update(paragraph_images(paragraph))

    # 找出更新后的全部文章仍在引用的图片
    used_image_paths = set()
    for article in merged_articles:
        for paragraph in article.get("paragraphs", []):
            used_image_paths.update(paragraph_images(paragraph))

    # 只清理旧版本引用过、如今已无人引用的图片
    for image_path in (() if preserve_existing_images else
                       old_image_paths - used_image_paths):
        try:
            target = (LIBRARY_DIR / image_path).resolve()

            # 只允许处理正式图片目录里的直接子文件
            if target.parent != IMAGES_DIR.resolve():
                print(f"跳过目录范围外的图片路径：{image_path}")
                continue

            if target.is_file():
                saved_image = backup_images / target.name

                # 不覆盖前面已经保存的原始备份
                if not saved_image.exists():
                    shutil.copy2(target, saved_image)

                target.unlink()

        except Exception as e:
            print(f"旧图片清理未完成，文章更新已保存：{image_path}；{e}")

    if confirm_lines:
        with open(LIBRARY_DIR / "待确认清单.txt", "w", encoding="utf-8") as f:
            f.write("\n".join(confirm_lines) + "\n")
        print(f"⚠️ 有 {len(confirm_lines)} 条待确认，见 library/待确认清单.txt")
    else:
        (LIBRARY_DIR / "待确认清单.txt").unlink(missing_ok=True)

    # 正式输出已完成，可以清理本次临时文件
    try:
        staging.cleanup()
    except Exception as e:
        print(f"临时目录清理失败，不影响已保存的内容：{e}")

    is_update = any(
        ppt_replaces(article, updated_issues)
        for article in old_articles
    )
    action = "更新一期" if is_update else "新增一期"

    print(
        f"完成！{action}，本次 {len(all_articles)} 篇，"
        f"图书馆共 {len(merged_articles)} 篇。"
    )
    print(f"备份位置：{backup_dir}")
    input("按回车退出...")


if __name__ == "__main__":
    main()
