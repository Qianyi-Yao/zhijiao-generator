"""Isolated data and rollback checks for the offline editor."""
import base64
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(dir=server.ROOT)
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        data = self.root / "library" / "data" / "library.json"
        data.parent.mkdir(parents=True)
        data.write_text(json.dumps({"version": 2, "articles": [{
            "id": "old", "title": "已有篇目", "date_start": "2026-10-11",
            "date_end": "2026-10-17", "source": "main", "characters": [],
            "paragraphs": [{"runs": [{"text": "旧文"}]}]
        }]}, ensure_ascii=False), encoding="utf-8")
        self.store = server.LibraryEditorStore(self.root)
        self.id = "a" * 32
        self.doc = {"type": "doc", "content": [{"type": "paragraph", "content": [
            {"type": "text", "text": "见旧文", "marks": [
                {"type": "link", "attrs": {"href": "#article=old"}},
                {"type": "strike"}
            ]}
        ]}]}

    def draft(self, doc=None):
        return self.store.save_draft({"id": self.id, "date_start": "2026-10-11",
            "title": "新篇目", "source": "main", "characters": ["元宏"],
            "doc": doc or self.doc, "published_hash": None})

    def test_draft_reopen_publish_and_update_keeps_id(self):
        self.draft()
        self.assertEqual(self.store.get_draft(self.id)["title"], "新篇目")
        first = self.store.publish(self.id, self.store.state()["libraryHash"])
        self.assertEqual(first["articleId"], "editor-" + self.id)
        self.assertTrue((self.root / first["backup"] / "library.json").exists())
        saved = self.store.get_draft(self.id)
        saved["title"] = "修改后的新篇目"
        self.store.save_draft(saved)
        self.store.publish(self.id, self.store.state()["libraryHash"])
        articles = self.store.library()[0]["articles"]
        self.assertEqual(len(articles), 2)
        article = next(a for a in articles if a["id"] == "editor-" + self.id)
        self.assertEqual(article["title"], "修改后的新篇目")
        self.assertEqual(article["characters"], ["元宏"])
        self.assertEqual(article["paragraphs"][0]["runs"][0]["linkId"], "old")
        self.assertTrue(article["paragraphs"][0]["runs"][0]["strike"])

    def test_table_merge_and_cell_image(self):
        self.draft()
        png = base64.b64encode(b"\x89PNG\r\n\x1a\nexample").decode("ascii")
        src = self.store.save_image(self.id, png)["src"]
        doc = {"type": "doc", "content": [{"type": "table", "content": [
            {"type": "tableRow", "content": [
                {"type": "tableCell", "attrs": {"colspan": 2, "rowspan": 2}, "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": "合并"}]},
                    {"type": "image", "attrs": {"src": src}}]},
                {"type": "tableCell", "content": [{"type": "paragraph"}]}]},
            {"type": "tableRow", "content": [
                {"type": "tableCell", "content": [{"type": "paragraph"}]}]}
        ]}]}
        self.store.save_draft({**self.store.get_draft(self.id), "doc": doc})
        self.store.publish(self.id, self.store.state()["libraryHash"])
        article = next(a for a in self.store.library()[0]["articles"]
                       if a["id"] == "editor-" + self.id)
        table = article["paragraphs"][0]
        self.assertEqual(table["rows"][0][0]["colspan"], 2)
        self.assertEqual(table["rows"][1][:2], [None, None])
        image = table["rows"][0][0]["images"][0]
        self.assertTrue((self.root / "library" / image).is_file())

    def test_external_change_blocks_publish(self):
        self.draft()
        old_hash = self.store.state()["libraryHash"]
        self.store.data.write_text(self.store.data.read_text(encoding="utf-8") + " ", encoding="utf-8")
        with self.assertRaises(server.EditorError) as caught:
            self.store.publish(self.id, old_hash)
        self.assertEqual(caught.exception.status, 409)

    def test_external_edit_to_published_article_blocks_republish(self):
        self.draft()
        self.store.publish(self.id, self.store.state()["libraryHash"])
        library, _ = self.store.library()
        article = next(a for a in library["articles"] if a.get("origin") == "editor")
        article["title"] = "人工修改过的标题"
        server.atomic_write(self.store.data, server.json_bytes(library))
        with self.assertRaises(server.EditorError) as caught:
            self.store.publish(self.id, self.store.state()["libraryHash"])
        self.assertEqual(caught.exception.status, 409)

    def test_ppt_reimport_keeps_editor_article(self):
        converter_dir = server.ROOT / "任务书" / "转换器"
        sys.path.insert(0, str(converter_dir))
        try:
            spec = importlib.util.spec_from_file_location("library_converter_check", converter_dir / "converter.py")
            converter = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(converter)
        finally:
            sys.path.remove(str(converter_dir))
        issue = {"2026-10-11"}
        self.assertTrue(converter.ppt_replaces({"source": "main", "date_start": "2026-10-11"}, issue))
        self.assertFalse(converter.ppt_replaces({"source": "main", "origin": "editor",
                                                 "date_start": "2026-10-11"}, issue))

    def test_only_unpublished_draft_can_be_deleted(self):
        self.draft()
        self.store.delete_draft(self.id)
        self.assertFalse(self.store.draft_path(self.id).exists())
        self.draft()
        self.store.publish(self.id, self.store.state()["libraryHash"])
        with self.assertRaises(server.EditorError):
            self.store.delete_draft(self.id)

    def test_failed_json_write_restores_images_and_data(self):
        self.draft()
        png = base64.b64encode(b"\x89PNG\r\n\x1a\nexample").decode("ascii")
        src = self.store.save_image(self.id, png)["src"]
        doc = {"type": "doc", "content": [{"type": "image", "attrs": {"src": src}}]}
        self.store.save_draft({**self.store.get_draft(self.id), "doc": doc})
        before = self.store.data.read_bytes()
        original = server.atomic_write

        def fail_library(path, data):
            if path == self.store.data:
                raise OSError("simulated disk failure")
            return original(path, data)

        with patch.object(server, "atomic_write", side_effect=fail_library):
            with self.assertRaises(OSError):
                self.store.publish(self.id, self.store.state()["libraryHash"])
        self.assertEqual(self.store.data.read_bytes(), before)
        self.assertEqual(list((self.root / "library" / "images").glob("editor_*")), [])

    def test_failed_draft_status_write_rolls_back_published_article(self):
        self.draft()
        before = self.store.data.read_bytes()
        original = server.atomic_write

        def fail_draft(path, data):
            if path == self.store.draft_path(self.id):
                raise OSError("simulated draft failure")
            return original(path, data)

        with patch.object(server, "atomic_write", side_effect=fail_draft):
            with self.assertRaises(OSError):
                self.store.publish(self.id, self.store.state()["libraryHash"])
        self.assertEqual(self.store.data.read_bytes(), before)
        self.assertIsNone(self.store.get_draft(self.id)["published_hash"])


if __name__ == "__main__":
    unittest.main()
