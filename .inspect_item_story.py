import sys
import json
from pathlib import Path
sys.path.insert(0, r"D:\pm03_files_new\tools")
from search_annotations import Reader, old
data = Reader(old.prepare_data(Path(r"D:\fhlLauncher\wcfhl\wcfhl_Data\StreamingAssets\bundles\dataBin\data99.bytes").read_bytes()))
names = [name for _, name, _ in data.root_entries()[2] if isinstance(name, str)]
print("TABLE_NAMES", [name for name in names if any(term in name.lower() for term in ("item", "prop", "story", "use", "dialog", "annotation", "comment"))])
for term in ("吉光片羽", "新花故吾", "第一届忘川郡创新成果阶段性汇报展演"):
    b = term.encode("utf-8")
    hits=[]; pos=0
    while True:
        pos=data.data.find(b,pos)
        if pos<0: break
        start=data.data.rfind(b"\0",0,pos)+1
        end=data.data.find(b"\0",pos)
        hits.append((start, (data.data[start:end] if end>=0 else b"").decode("utf-8","replace")))
        pos += 1
    print("STRING", term, hits[:30], "count", len(hits))
_, _, items = data.table_as_index("item_data")
for key, row in items.items():
    if any("吉光片羽" in str(value) for value in row.values()):
        def tree(handle, depth=0):
            if depth >= 3: return "depth-limit"
            out={}
            for k,t,v in data.entries(handle):
                out[str(k)] = tree(v, depth+1) if t==8 else v
            return out
        children={}
        for k,t,v in data.entries(row["_row_handle"]):
            if t==8: children[str(k)] = tree(v)
        print("ITEM_MATCH", json.dumps({"key": key, "row": row, "children": children}, ensure_ascii=True))
for table_name in ("story_dialog_group_data", "story_dialog_data", "story_dialog_option_group_by_dialog_group_data"):
    _, root = data.find_table(table_name)
    found=[]
    for key, typ, handle in data.entries(root):
        if str(key) == "40470" and typ == 8:
            found.append({"key":key,"row":{str(k):v for k,t,v in data.entries(handle)}})
    print("LINK_CHECK", table_name, json.dumps(found, ensure_ascii=True))
for table_name in ("story_dialog_option_group_by_dialog_group_data", "story_dialog_option_group_data", "story_dialog_option_data"):
    _, root=data.find_table(table_name)
    rows=[]
    for key,t,h in data.entries(root):
        if t!=8: continue
        info=data.table_items(h); numeric={}
        for field,typ,off in zip(info["keys"],info["raw_types"],info["offsets"]):
            base=typ-100 if typ>=100 else typ
            if base not in Reader.formats: continue
            value=data.read_value(h,typ,off)
            if isinstance(value,(int,float)): numeric[str(field)]=value
        if 40470 in numeric.values() or len(rows)<2: rows.append({"key":key,"numeric_fields":numeric})
    print("OPTION_SCHEMA", table_name, json.dumps(rows[:12],ensure_ascii=True))
_, group_root = data.find_table("story_dialog_group_data")
group_row = next((h for k,t,h in data.entries(group_root) if str(k)=="40470" and t==8), None)
if group_row:
    fields={str(k):v for k,t,v in data.entries(group_row)}
    print("GROUP_40470", json.dumps(fields, ensure_ascii=True))
    _, dialog_root = data.find_table("story_dialog_data")
    dialog_handles={str(k):h for k,t,h in data.entries(dialog_root) if t==8}
    cur=fields.get("startDialogId"); seen=set(); chain=[]
    while isinstance(cur,int) and cur not in seen and len(chain)<80:
        handle=dialog_handles.get(str(cur))
        if handle is None: break
        seen.add(cur); row={str(k):v for k,t,v in data.entries(handle)}; chain.append({"id":cur,"fields":row}); cur=row.get("nextId")
    print("STATIC_CHAIN", json.dumps(chain, ensure_ascii=True))
