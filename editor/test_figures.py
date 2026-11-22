"""Figure conversion and stable image publication, without browser acceptance."""
import base64
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import server


class FigureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = server.LibraryEditorStore(Path(self.temp.name))
        server.atomic_write(self.store.data, server.json_bytes({'articles': []}))
        (self.store.root / 'characters.js').write_text('const characters = [{cardId: 1, name: "甲"}, {cardId: 2, name: "乙"}];', encoding='utf-8')
        self.id = 'a' * 32
        self.store.save_draft({'id': self.id, 'title': '测试', 'date_start': '2026-09-24', 'source': 'main', 'characters': [], 'doc': {'type': 'doc', 'content': []}})
        self.src = self.upload()

    def upload(self):
        return self.store.save_image(self.id, base64.b64encode(b'\x89PNG\r\n\x1a\nfixture').decode())['src']

    def image(self, caption='', src=None, numbered=True):
        return {'type': 'image', 'attrs': {'src': src or self.src, 'numbered': numbered, 'caption': caption}}

    def save(self, nodes):
        draft = self.store.get_draft(self.id)
        draft['doc']['content'] = nodes
        return self.store.save_draft(draft)

    def publish(self):
        self.store.publish(self.id, self.store.library()[1])
        return self.store.library()[0]['articles'][0]

    def test_nested_order_and_occurrence_captions(self):
        nodes = [self.image(numbered=False), self.image('首图'),
            {'type': 'mediaRow', 'attrs': {'images': [self.image('左图')['attrs']]}, 'content': [
                {'type': 'table', 'content': [{'type': 'tableRow', 'content': [
                    {'type': 'tableCell', 'content': [self.image('表格图')]}]}]}]},
            self.image('末图')]
        self.save(nodes)
        blocks = self.publish()['paragraphs']
        self.assertEqual(blocks[0]['image_meta'], [None])
        self.assertEqual(blocks[1]['image_meta'], [{'number': 1, 'caption': '首图'}])
        self.assertEqual(blocks[2]['image_meta'][0]['number'], 2)
        self.assertEqual(blocks[2]['mediaBlocks'][0]['rows'][0][0]['image_meta'], [{'number': 3, 'caption': '表格图'}])
        self.assertEqual(blocks[3]['image_meta'][0]['number'], 4)
        self.save([nodes[3], nodes[1]])
        blocks = self.publish()['paragraphs']
        self.assertEqual([b['image_meta'][0]['number'] for b in blocks], [1, 2])
        self.assertEqual(blocks[0]['image_meta'][0]['caption'], '末图')

    def test_names_stable_and_never_reused(self):
        second = self.upload()
        self.save([self.image(), self.image(src=second)])
        first = self.publish()['paragraphs']
        paths = [b['images'][0] for b in first]
        self.assertRegex(paths[0], r'^images/20260924-[a-f0-9]{8}-img01.png$')
        self.assertTrue(paths[1].endswith('-img02.png'))
        draft = self.save([self.image(src=second), self.image('修改标题')])
        draft['date_start'] = '2026-10-04'
        self.store.save_draft(draft)
        self.assertEqual([b['images'][0] for b in self.publish()['paragraphs']], paths[::-1])
        third = self.upload()
        self.save([self.image(src=third)])
        self.assertTrue(self.publish()['paragraphs'][0]['images'][0].endswith('-img03.png'))

    def test_old_file_kept_and_new_file_named(self):
        self.save([self.image(numbered=False)])
        old = self.publish()['paragraphs'][0]['images'][0]
        self.assertTrue(old.startswith('images/editor_'))
        self.save([self.image(numbered=False), self.image(src=self.upload())])
        blocks = self.publish()['paragraphs']
        self.assertEqual(blocks[0]['images'][0], old)
        self.assertIsNone(blocks[0]['image_meta'][0])
        self.assertTrue(blocks[1]['images'][0].endswith('-img01.png'))
        self.assertEqual(blocks[1]['image_meta'][0]['number'], 1)

    def test_easter_prefix(self):
        draft = self.save([self.image()])
        draft.update(source='easter', date_start='', pair_card_ids=[1, 2])
        self.store.save_draft(draft)
        self.assertTrue(self.publish()['paragraphs'][0]['images'][0].startswith('images/qiyu-'))

    def test_failed_publish_does_not_allocate_names(self):
        self.save([self.image()])
        before = self.store.get_draft(self.id)
        write = server.atomic_write
        def fail(path, raw):
            if path == self.store.draft_path(self.id):
                raise OSError('simulated failure')
            return write(path, raw)
        with patch.object(server, 'atomic_write', side_effect=fail):
            with self.assertRaises(OSError):
                self.publish()
        self.assertEqual(self.store.get_draft(self.id), before)
        self.assertEqual(self.store.library()[0]['articles'], [])

    def test_collision_gets_longer_article_key(self):
        short = server.digest(('editor-' + self.id).encode())[:8]
        server.atomic_write(self.store.images / f'20260924-{short}-img01.png', b'existing')
        self.save([self.image()])
        path = self.publish()['paragraphs'][0]['images'][0]
        self.assertRegex(path, r'20260924-[a-f0-9]{10}-img01.png$')


if __name__ == '__main__':
    unittest.main()
