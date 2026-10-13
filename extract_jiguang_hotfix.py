"""One-shot, read-only extraction of the target story from the live game."""
import ctypes as C
import hashlib
import re
import struct
import sys
import time
from collections import defaultdict
from pathlib import Path
from ctypes import wintypes as W

PID = 10220
TARGET = "第一届忘川郡创新成果阶段性汇报展演"
ITEM_LABEL = "吉光片羽"
STORY_TITLE = "新花故吾"
DATA = Path(r"D:\fhlLauncher\wcfhl\wcfhl_Data\StreamingAssets\bundles\dataBin\data99.bytes")
TOOLS = Path(r"D:\pm03_files_new\tools")
OUT = Path(__file__).with_name("吉光片羽_新花故吾_热更剧情.md")
ITEM = "item_data"
GROUP = "story_dialog_group_data"
DIALOG = "story_dialog_data"
OPTION = "story_dialog_option_data"
KINDS = {"item": ITEM, "group": GROUP, "dialog": DIALOG, "option": OPTION}
MASK, STR, TAB, NIL = (1 << 47) - 1, 0x1FFFB, 0x1FFF4, (1 << 64) - 1
CHUNK = 4 * 1024 * 1024
DEADLINE_SECONDS = 240


class MBI(C.Structure):
    _fields_ = [("base", C.c_void_p), ("allocation", C.c_void_p),
                ("allocation_protect", W.DWORD), ("size", C.c_size_t),
                ("state", W.DWORD), ("protect", W.DWORD), ("type", W.DWORD)]


def main():
    if C.sizeof(C.c_void_p) != 8:
        raise SystemExit("64-bit Python required; no process access attempted.")
    kernel = C.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.argtypes = [W.DWORD, W.BOOL, W.DWORD]
    kernel.OpenProcess.restype = W.HANDLE
    kernel.GetProcessId.argtypes = [W.HANDLE]
    kernel.GetProcessId.restype = W.DWORD
    kernel.VirtualQueryEx.argtypes = [W.HANDLE, C.c_void_p, C.POINTER(MBI), C.c_size_t]
    kernel.VirtualQueryEx.restype = C.c_size_t
    kernel.ReadProcessMemory.argtypes = [W.HANDLE, C.c_void_p, C.c_void_p, C.c_size_t, C.POINTER(C.c_size_t)]
    kernel.ReadProcessMemory.restype = W.BOOL
    kernel.CloseHandle.argtypes = [W.HANDLE]
    kernel.CloseHandle.restype = W.BOOL

    process = kernel.OpenProcess(0x410, False, PID)
    if not process:
        err = C.get_last_error()
        print(f"PID requested={PID}; OpenProcess failed immediately (Windows error {err}).", flush=True)
        raise SystemExit("No scan or retry performed. Run once from Administrator PowerShell.")
    actual_pid = kernel.GetProcessId(process)
    print(f"PID requested={PID}; PID opened={actual_pid}; OpenProcess=OK (read/query only).", flush=True)
    if actual_pid != PID:
        kernel.CloseHandle(process)
        raise SystemExit("PID mismatch; stopped before reading process memory.")
    if OUT.exists():
        kernel.CloseHandle(process)
        raise SystemExit(f"Output already exists; refusing to overwrite: {OUT}")
    started = time.monotonic()
    deadline = started + DEADLINE_SECONDS

    def check_time():
        if time.monotonic() > deadline:
            raise TimeoutError("240-second work limit reached; no complete Markdown will be claimed.")

    def read(address, size):
        buf = C.create_string_buffer(size)
        done = C.c_size_t()
        kernel.ReadProcessMemory(process, C.c_void_p(address), buf, size, C.byref(done))
        if done.value != size:
            raise OSError(f"incomplete read at 0x{address:X}: {done.value}/{size}")
        return buf.raw[:size]

    try:
        sys.path.insert(0, str(TOOLS))
        from search_annotations import Reader, old

        raw = DATA.read_bytes()
        bdd = Reader(old.prepare_data(raw))
        print(f"Static data ready ({len(raw)} bytes; sha256 {hashlib.sha256(raw).hexdigest()[:12]}).", flush=True)

        def row_fields(handle, selected=None):
            result = {}
            info = bdd.table_items(handle)
            start = info["offset_start"]
            code = bdd.u8(start)
            fmt = "<" + Reader.formats[code]
            size = struct.calcsize(fmt)
            for i, (key, typ, off) in enumerate(zip(info["keys"], info["raw_types"], info["offsets"])):
                name = str(key)
                if selected is not None and name not in selected:
                    continue
                address = handle + off
                if typ >= 100:
                    base = typ - 100
                    address = start + 1 + size * i - off
                else:
                    base = typ
                if base in Reader.formats:
                    value = struct.unpack_from("<" + Reader.formats[base], bdd.data, address)[0]
                elif base == 7:
                    value = bdd.read_cstr(bdd.u32(address))
                elif base == 8:
                    value = bdd.u32(address)
                elif base == 9:
                    value = bool(bdd.u8(address))
                else:
                    continue
                result[name] = value
            return result

        def root_rows(name):
            _, root = bdd.find_table(name)
            if root is None:
                raise RuntimeError(f"Static table missing: {name}")
            rows = {}
            for key, typ, value in bdd.entries(root):
                if typ == 8 and isinstance(value, int):
                    try:
                        rows[int(key)] = value
                    except (TypeError, ValueError):
                        continue
            return root, rows

        item_handle, item_static = root_rows(ITEM)
        group_handle, group_static = root_rows(GROUP)
        dialog_handle, dialog_static = root_rows(DIALOG)
        option_handle, option_static = root_rows(OPTION)
        options_by_dialog = defaultdict(list)
        for option_id, option_row_handle in option_static.items():
            check_time()
            dialog_ref = row_fields(option_row_handle, {"dialogId"}).get("dialogId")
            if isinstance(dialog_ref, int): options_by_dialog[dialog_ref].append(option_id)

        # Item -> effectPara -> story group is the confirmed static relationship.
        # Inspect only the item name and use-config fields, not item descriptions or dialogue text.
        item_candidates = {}
        for item_id, handle in item_static.items():
            check_time()
            row = row_fields(handle, {"id", "name", "effectPara"})
            if ITEM_LABEL not in str(row.get("name", "")):
                continue
            para_handle = row.get("effectPara")
            para = ({str(k): v for k, t, v in bdd.entries(para_handle)}
                    if isinstance(para_handle, int) else {})
            linked_groups = {v for v in para.values() if isinstance(v, int) and v in group_static}
            if linked_groups:
                item_candidates[item_id] = {"handle": handle, "base": row, "groups": linked_groups}
        if not item_candidates:
            raise RuntimeError("No 吉光片羽 item record with an explicit effectPara -> story_dialog_group_data relation was found.")
        candidate_group_ids = set().union(*(item["groups"] for item in item_candidates.values()))
        print(f"Resolved item-use configuration to {len(candidate_group_ids)} candidate story group(s); checking only those groups.", flush=True)

        # One read-only memory pass: index only runtime story table-name objects and
        # adjacent Lua (table key, table value) references; no process strings are decoded.
        roots_by_name = defaultdict(set)
        object_addrs = defaultdict(set)
        candidate_pairs = set()
        regions = []
        address, mbi = 0, MBI()
        while kernel.VirtualQueryEx(process, C.c_void_p(address), C.byref(mbi), C.sizeof(mbi)):
            base = int(mbi.base or 0)
            end = base + int(mbi.size)
            if mbi.state == 0x1000 and not (mbi.protect & 0x101):
                regions.append((base, end))
            if end <= address:
                break
            address = end
        key_names = [name for table_name in KINDS.values() for name in (table_name, "data." + table_name)]
        for base, end in regions:
            cursor = base
            while cursor < end:
                check_time()
                amount = min(CHUNK + 128, end - cursor)
                block = read(cursor, amount)
                lower = block.lower()
                for key in key_names:
                    needle = key.lower().encode("ascii") + b"\0"
                    pos = 0
                    while True:
                        found = lower.find(needle, pos)
                        if found < 0:
                            break
                        pos = found + 1
                        off = found - 24
                        if off >= 0 and off + 24 + len(needle) <= len(block) and block[off + 9] == 4:
                            if struct.unpack_from("<I", block, off + 16)[0] == len(needle) - 1:
                                object_addrs[key].add(cursor + off)
                # Capture only Lua table entries with a string key and table value.
                limit = len(block) - 16
                for off in range(0, max(0, limit), 8):
                    raw_value, raw_key = struct.unpack_from("<QQ", block, off)
                    if raw_value >> 47 == TAB and raw_key >> 47 == STR:
                        candidate_pairs.add((raw_key & MASK, raw_value & MASK))
                cursor += CHUNK
        for key, addresses in object_addrs.items():
            kind = next(kind for kind, table_name in KINDS.items()
                        if key == table_name or key == "data." + table_name)
            for string_address, table_address in candidate_pairs:
                if string_address in addresses:
                    roots_by_name[kind].add(table_address)
        if any(len(roots_by_name[k]) != 1 for k in KINDS):
            raise RuntimeError("Could not uniquely locate runtime item, story-group and dialogue roots in the single scan.")

        strings = {}
        def runtime_string(raw_value):
            address = raw_value & MASK
            if address in strings:
                return strings[address]
            header = read(address, 24)
            if header[9] != 4:
                raise ValueError("Invalid runtime string header")
            length = struct.unpack_from("<I", header, 16)[0]
            if length > 4 * 1024 * 1024:
                raise ValueError("Runtime string exceeds safety limit")
            value = read(address + 24, length).decode("utf-8")
            strings[address] = value
            return value

        def runtime_value(raw_value):
            tag = raw_value >> 47
            if raw_value == NIL: return None
            if tag == STR: return runtime_string(raw_value)
            if tag == TAB: return {"table": raw_value & MASK}
            if tag == 0x1FFF2: return C.c_int32(raw_value & 0xffffffff).value
            if tag == 0x1FFFE: return False
            if tag == 0x1FFFD: return True
            if tag >= 0x1FFF0: return {"raw": hex(raw_value)}
            number = struct.unpack("<d", struct.pack("<Q", raw_value))[0]
            return int(number) if number.is_integer() else number

        def table(addr, limit=4096):
            header = read(addr, 64)
            if header[9] != 11: raise ValueError("Invalid runtime table header")
            array = struct.unpack_from("<Q", header, 16)[0]
            node = struct.unpack_from("<Q", header, 40)[0]
            size, mask = struct.unpack_from("<II", header, 48)
            count = mask + 1
            if size > limit or count > limit or count & (count - 1): raise ValueError("Runtime table exceeds record limit")
            out = {}
            data = read(node, count * 24)
            for off in range(0, len(data), 24):
                if off % (24 * 4096) == 0: check_time()
                val, key = struct.unpack_from("<QQ", data, off)
                if val != NIL:
                    k = runtime_value(key)
                    if isinstance(k, (str, int, float)): out[str(k)] = runtime_value(val)
            if size:
                data = read(array, size * 8)
                for i in range(size):
                    if i % 4096 == 0: check_time()
                    val = struct.unpack_from("<Q", data, i * 8)[0]
                    if val != NIL: out[str(i)] = runtime_value(val)
            return out

        def q(addr): return struct.unpack("<Q", read(addr, 8))[0]
        def uv(func, index): return q(q(func + 40 + index * 8) + 32)
        maps = None
        overlays = {}
        for kind, roots in roots_by_name.items():
            root = table(next(iter(roots)), 1048576)
            wrapper = root.get("data")
            if not isinstance(wrapper, dict) or "raw" not in wrapper: raise RuntimeError("Runtime table wrapper shape changed")
            obj = int(wrapper["raw"], 16) & MASK
            meta = table(q(obj + 32))
            fn = int(meta["__index"]["raw"], 16) & MASK
            original = uv(fn, 0) & MASK
            resolver = uv(original, 3) & MASK
            patch_addr, delete_addr = uv(resolver, 1), uv(resolver, 3)
            if maps is not None and maps != (patch_addr, delete_addr): raise RuntimeError("Story tables use different resolvers")
            maps = (patch_addr, delete_addr)
            overlays[kind] = (table(patch_addr & MASK, 1048576), table(delete_addr & MASK, 1048576))

        static_roots = {"item": (item_handle, item_static), "group": (group_handle, group_static), "dialog": (dialog_handle, dialog_static), "option": (option_handle, option_static)}
        def expand_static_bdd(handle, depth=0):
            if depth >= 5: raise ValueError("Selected static nested record exceeds depth limit")
            return {str(k): expand_static_bdd(v, depth + 1) if typ == 8 else v
                    for k, typ, v in bdd.entries(handle)}

        def expand_runtime(v, depth=0):
            if isinstance(v, dict) and "table" in v:
                if depth >= 5: raise ValueError("Selected nested record exceeds depth limit")
                return {k: expand_runtime(w, depth + 1) for k, w in table(v["table"], 4096).items()}
            if isinstance(v, dict): raise ValueError("Unknown runtime value")
            return v

        def effective(kind, record_id):
            _, static_rows = static_roots[kind]
            handle = static_rows.get(record_id)
            if handle is None: return None
            row = {}
            for key, typ, val in bdd.entries(handle):
                row[str(key)] = expand_static_bdd(val) if typ == 8 else val
            patch, deleted = overlays[kind]
            deletion = deleted.get(str(handle))
            if isinstance(deletion, dict) and "table" in deletion:
                for key, value in table(deletion["table"], 4096).items():
                    if value and key != "_bdd_len": row.pop(key, None)
            replacement = patch.get(str(handle))
            if isinstance(replacement, dict) and "table" in replacement:
                row.update(expand_runtime(replacement))
            return row

        def nested_values(value):
            if isinstance(value, dict):
                for child in value.values(): yield from nested_values(child)
            elif isinstance(value, list):
                for child in value: yield from nested_values(child)
            else: yield value

        # Re-check the actual hotfix item use config, then reverse-check the locator
        # only within the groups linked from those item records.
        effective_items = {}
        linked_groups_by_item = {}
        for item_id in item_candidates:
            check_time()
            item_row = effective("item", item_id)
            if item_row is None: continue
            effective_items[item_id] = item_row
            params = item_row.get("effectPara", {})
            linked = {value for value in nested_values(params)
                      if isinstance(value, int) and value in group_static}
            if not linked: linked = item_candidates[item_id]["groups"]
            linked_groups_by_item[item_id] = linked
        title_items = {item_id for item_id, row in effective_items.items()
                       if STORY_TITLE in " ".join(str(value) for value in nested_values(row)
                                                  if isinstance(value, str))}
        if title_items:
            linked_groups_by_item = {item_id: groups for item_id, groups in linked_groups_by_item.items()
                                     if item_id in title_items}
        candidate_group_ids = set().union(*linked_groups_by_item.values()) if linked_groups_by_item else set()
        if not candidate_group_ids:
            raise RuntimeError("Effective 吉光片羽 item records did not resolve an effectPara story group.")

        def extract_group(gid):
            group_meta = row_fields(group_static[gid], {"id", "name", "desc", "startDialogId", "chapterId", "sectionId", "type"})
            effective_group = effective("group", gid)
            if effective_group is None: return None
            group_meta.update(effective_group)
            start_id = group_meta.get("startDialogId")
            if not isinstance(start_id, int) or start_id <= 0:
                raise RuntimeError("Effective group has no valid startDialogId.")
            output_rows, queue, visited, branch_ids = [], [start_id], set(), set()
            while queue:
                check_time()
                did = queue.pop(0)
                if not isinstance(did, int) or did <= 0 or did in visited: continue
                visited.add(did)
                row = effective("dialog", did)
                if row is None: raise RuntimeError(f"Effective dialogue record missing for reachable id {did}.")
                option_rows = []
                for option_id in options_by_dialog.get(did, ()):
                    option_row = effective("option", option_id)
                    if option_row is None: continue
                    option_rows.append(option_row)
                    option_next = option_row.get("nextDialogId")
                    if isinstance(option_next, int) and option_next > 0:
                        queue.append(option_next); branch_ids.add(option_next)
                output_rows.append((did, row, option_rows))
                next_id = row.get("nextId")
                if isinstance(next_id, int) and next_id > 0: queue.append(next_id)
                for key, value in row.items():
                    if any(word in key.lower() for word in ("option", "choice", "branch", "select")):
                        def collect_ids(item):
                            if isinstance(item, dict):
                                for k, v in item.items():
                                    if k.lower() in ("dialogid", "nextid", "id", "startdialogid") and isinstance(v, int) and v > 0:
                                        queue.append(v); branch_ids.add(v)
                                    else: collect_ids(v)
                            elif isinstance(item, list):
                                for child in item: collect_ids(child)
                            elif isinstance(item, int) and item > 0:
                                queue.append(item); branch_ids.add(item)
                        collect_ids(value)
            has_locator = any(any(TARGET in value for value in row.values() if isinstance(value, str))
                              for _, row, _ in output_rows)
            has_locator = has_locator or any(TARGET in value for _, _, options in output_rows
                                              for option in options for value in nested_values(option)
                                              if isinstance(value, str))
            return group_meta, output_rows, visited, branch_ids, has_locator

        matching_groups = []
        for candidate_id in sorted(candidate_group_ids):
            extracted = extract_group(candidate_id)
            if extracted and extracted[4]: matching_groups.append((candidate_id, extracted))
        if len(matching_groups) != 1:
            raise RuntimeError(f"The locator matched {len(matching_groups)} effective groups linked from the item use config; stopped.")
        gid, (group_meta, output_rows, visited, branch_ids, _) = matching_groups[0]

        def render_value(value):
            if isinstance(value, list): return "; ".join(render_value(v) for v in value)
            if isinstance(value, dict): return "; ".join(f"{k}: {render_value(v)}" for k, v in value.items())
            return str(value).replace("\r\n", "\n").replace("\r", "\n")

        md = [f"# 吉光片羽·{STORY_TITLE}", "", "<!-- 只读热更提取；仅含目标道具关联剧情。 -->", "", f"## {group_meta.get('name') or STORY_TITLE}", ""]
        if group_meta.get("desc"): md += [str(group_meta["desc"]), ""]
        for key, value in group_meta.items():
            if any(word in key.lower() for word in ("note", "annotation", "comment")) and value not in (None, "", [], {}):
                md += [f"> 批注：{render_value(value)}", ""]
        for did, row, option_rows in output_rows:
            if did in branch_ids: md += ["### 选项分支", ""]
            speaker = row.get("name") or row.get("speaker")
            content = row.get("content")
            if content is None: raise RuntimeError(f"Effective dialogue {did} has no content field.")
            if speaker: md.append(f"**{speaker}**：{content}")
            else: md.append(str(content))
            for option in option_rows:
                option_text = option.get("content") or option.get("name") or option.get("text")
                if option_text is not None:
                    md.append(f"- 选项：{option_text}")
                option_note = next((value for key, value in option.items()
                                    if any(word in key.lower() for word in ("note", "annotation", "comment"))
                                    and value not in (None, "", [], {})), None)
                if option_note is not None: md.append(f"> 批注：{render_value(option_note)}")
            for key, value in row.items():
                lower = key.lower()
                if any(word in lower for word in ("option", "choice", "branch", "select")) and value not in (None, "", [], {}):
                    md.append(f"**选项：** {render_value(value)}")
                if any(word in lower for word in ("note", "annotation", "comment")) and value not in (None, "", [], {}):
                    md.append(f"> 批注：{render_value(value)}")
            md.append("")
        markdown = "\n".join(md).rstrip() + "\n"
        if TARGET not in markdown:
            raise RuntimeError("Locator sentence was found in a non-rendered field; refusing to claim a complete export.")
        tmp = OUT.with_suffix(".md.tmp")
        tmp.write_text(markdown, encoding="utf-8")
        tmp.replace(OUT)
        print(f"Complete target extraction written: {OUT}", flush=True)
        print(f"Locator exact text verified; {len(visited)} reachable dialogue records; {len(output_rows)} rendered.", flush=True)
    except Exception as exc:
        print(f"INCOMPLETE: {type(exc).__name__}: {exc}", flush=True)
        tmp = OUT.with_suffix(".md.tmp")
        if tmp.exists(): tmp.unlink()
        raise SystemExit(2)
    finally:
        kernel.CloseHandle(process)


if __name__ == "__main__":
    main()
