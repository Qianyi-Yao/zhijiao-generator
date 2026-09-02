# -*- coding: utf-8 -*-
"""
知交圈微考据 PPT 转换器
把考据 PPT 转为网页数据（JSON + 图片），输出到工作区 library/。

用法：
  1) 双击 运行.bat：处理工作区根目录（及 输入PPT/ 文件夹）里的【全部】pptx，合并为一个数据文件；
  2) 把单个 pptx 拖到 运行.bat 上（等效 python converter.py <ppt路径>）：仅处理该文件。

规则（与遣月确认）：
  - 每页第一段文本 = 标题"关于XXX"；标题含水印文字的页（封面/装饰页）跳过；
  - 每页包含"忘川风华录知交圈微考据"的段落为水印页脚，剔除；
  - 相邻页标题相同 = 同一篇（合并）；正文忠实保留（不去重）；
  - 新 PPT 右上角"核心人物：xxx"识别为标签（逗号/顿号分隔多值）；没有则留空；
  - 文件名数字 = 开始日期（月日连写，优先两位月；89=8.9，816=8.16），年份固定见 YEAR；
  - 日期解析失败、标题非"关于"开头等异常，写进 library/待确认清单.txt。

富文本：runs 保留粗体/斜体/删除线/颜色/字体名；页面映射：正文宋体、带字体 run 楷体。
"""
import sys, re, json
from datetime import date, timedelta
from pathlib import Path
from pptx import Presentation
from pptx.oxml.ns import qn

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


def parse_month_day(num):
    """文件名数字 -> (月, 日)；无法解析返回 None（进待确认清单）"""
    s = str(num)
    if len(s) >= 2:
        two = int(s[:2])
        if 10 <= two <= 12:
            rest = s[2:]
            if rest and 1 <= int(rest) <= 31:
                return two, int(rest)
    if s:
        day_s = s[1:]
        if day_s and 1 <= int(s[0]) <= 9 and 1 <= int(day_s) <= 31:
            return int(s[0]), int(day_s)
    return None


def extract_episode(name):
    m = re.search(r"(\d+)(?:\.pptx)?$", name)
    return int(m.group(1)) if m else None


def parse_person(s):
    """解析人物标注：兼容 '核心人物：xxx' 前缀或直接人物名（逗号/顿号/斜杠分隔）"""
    s = s.strip()
    if s.startswith(CHARACTER_MARK):
        s = s[len(CHARACTER_MARK):].lstrip("：:")
    return [c.strip() for c in re.split(r"[，,、/]", s) if c.strip()]


def read_paragraph(para):
    """读取一个段落，返回 (runs列表, 纯文本)。
    runs 保留 run 级格式（粗体/斜体/删除线/颜色/字体）与段内软换行（<a:br/> -> \\n）。"""
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
                strike = rPr.get('strikethrough') in ('sngStrike', 'dblStrike')
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
            runs.append({"text": text, "bold": bold, "italic": italic, "strike": strike, "color": color, "font": font})
            plain.append(text)
    return runs, "".join(plain)


def iter_page_content(slide):
    """返回 (texts, paras, images)，按视觉位置（top, left）排序。"""
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
            items.append((top, left, "img", img))
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
    return texts, paras, images, lefts


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


def write_images(images, episode, page_no):
    """写出普通 PPT 图片，返回 library.json 使用的相对路径。"""
    image_names = []

    for index, image in enumerate(images, 1):
        ext = (image.ext or "png").lower()
        name = f"{episode}_p{page_no}_{index}.{ext}"
        (IMAGES_DIR / name).write_bytes(image.blob)
        image_names.append(f"images/{name}")

    return image_names


def process_one(ppt_path, confirm_lines):
    """处理单个 PPT，返回该期文章列表。"""
    episode = extract_episode(ppt_path.stem)
    md = parse_month_day(episode) if episode is not None else None
    date_start = date_end = None
    if md is None:
        confirm_lines.append(f"⚠️ 文件名 {ppt_path.name} 的日期数字无法解析（数字={episode}），请人工确认")
    else:
        date_start = date(YEAR, md[0], md[1])
        date_end = date_start + timedelta(days=6)

    print(f"  处理: {ppt_path.name}  (期数={episode}, 日期={date_start} ~ {date_end})")

    prs = Presentation(str(ppt_path))
    right_x = prs.slide_width * 0.9  # 页面右侧 90% 起为人物标注区（823 起的新布局）
    pages = []
    for idx, slide in enumerate(prs.slides, 1):
        texts, paras, images, lefts = iter_page_content(slide)
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
                "images": images, "page_no": idx}
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
            img_names = write_images(p["images"], ep, p["page_no"])
            all_runs = []
            for ri, pr in enumerate(p["body"]):
                if ri > 0:
                    all_runs.append({**EMPTY_RUN, "text": "\n\n"})  # 段间空行
                all_runs.extend(pr)
            pages_out.append({"runs": all_runs, "images": img_names})
        out_articles.append({
            "id": aid,
            "title": a["title"],
            "date_start": date_start.isoformat() if date_start else "",
            "date_end": date_end.isoformat() if date_end else "",
            "episode": episode,
            "characters": a["chars"],
            "paragraphs": pages_out
        })
    return out_articles


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    if len(sys.argv) > 1 and sys.argv[1]:
        paths = [Path(sys.argv[1])]
    else:
        candidates = list(BASE_DIR.glob("*.pptx"))
        in_dir = BASE_DIR / "输入PPT"
        if in_dir.exists():
            candidates += list(in_dir.glob("*.pptx"))
        task_dir = BASE_DIR / "任务书"
        if task_dir.exists():
            candidates += list(task_dir.glob("*.pptx"))
        if not candidates:
            print("没有找到 PPT 文件。请把 PPT 拖到 运行.bat 上，或放到工作区根目录/输入PPT 文件夹。")
            input("按回车退出...")
            return
        # 按开始日期排序（文件名数字≠日期顺序，如 531 是 5月31日）
        def date_key(p):
            ep = extract_episode(p.stem)
            md = parse_month_day(ep) if ep is not None else None
            if md is None:
                return (1, 0, p.name)
            return (0, date(YEAR, md[0], md[1]).toordinal(), p.name)
        paths = sorted(candidates, key=date_key)

    # 先读旧数据中的手工人物（Excel 回填等），避免重跑丢失（必须在清空目录之前）
    old_chars = {}
    old_json = DATA_DIR / "library.json"
    if old_json.exists():
        try:
            old = json.loads(old_json.read_text(encoding="utf-8"))
            old_chars = {(str(a.get("episode")), a.get("title")): a.get("characters", [])
                         for a in old.get("articles", []) if a.get("characters")}
        except Exception:
            old_chars = {}

    # 全量重建输出目录（避免旧数据残留）
    for d in (IMAGES_DIR, DATA_DIR):
        if d.exists():
            for f in d.iterdir():
                if f.is_file():
                    f.unlink()
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    confirm_lines = []
    all_articles = []
    for p in paths:
        try:
            all_articles.extend(process_one(p, confirm_lines))
        except Exception as e:
            confirm_lines.append(f"⚠️ {p.name} 处理失败: {e}")

    # 合并旧数据中的手工人物（Excel 回填等），避免重跑丢失
    for a in all_articles:
        key = (str(a.get("episode")), a.get("title"))
        if key in old_chars and old_chars[key]:
            a["characters"] = list(dict.fromkeys(old_chars[key] + a.get("characters", [])))

    data = {"version": 2, "articles": all_articles}
    with open(DATA_DIR / "library.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    if confirm_lines:
        with open(LIBRARY_DIR / "待确认清单.txt", "w", encoding="utf-8") as f:
            f.write("\n".join(confirm_lines) + "\n")
        print(f"⚠️ 有 {len(confirm_lines)} 条待确认，见 library/待确认清单.txt")
    else:
        (LIBRARY_DIR / "待确认清单.txt").unlink(missing_ok=True)

    img_count = len(list(IMAGES_DIR.glob("*")))
    print(f"完成！{len(paths)} 个 PPT → {len(all_articles)} 篇 → library/data/library.json（图片 {img_count} 张）")
    input("按回车退出...")


if __name__ == "__main__":
    main()
