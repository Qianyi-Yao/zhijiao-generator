"""Code-level tests only: isolated issue cover storage."""
import base64
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class CoverTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = server.LibraryEditorStore(Path(self.temp.name))
        server.atomic_write(self.store.data, server.json_bytes({'articles': [
            {'id': 'one', 'title': '一', 'date_start': '2026-08-23', 'source': 'main'},
            {'id': 'two', 'title': '二', 'date_start': '2026-08-23', 'source': 'extra'},
            {'id': 'other', 'title': '三', 'date_start': '2026-08-30'}]}))
        self.week = '2026-08-23'

    def call(self, action, **extra):
        state = self.store.cover_state()
        return self.store.cover_action(action, {'week': self.week, 'revision': state['revision'],
            'libraryHash': state['libraryHash'], **extra})

    def draft(self, **overrides):
        src = self.call('image', data=base64.b64encode(b'\x89PNG\r\n\x1a\nfixture').decode())['src']
        value = {'cover': src, 'video_url': 'https://example.com/video', 'article_ids': ['one', 'two']}
        value.update(overrides)
        return self.call('save', draft=value)

    def test_publish_withdraw_preserve_articles_and_draft(self):
        before = self.store.data.read_bytes()
        self.draft()
        self.assertEqual(self.store.cover_state()['issues'], {})
        published = self.call('publish')
        self.assertEqual(published['issues'][self.week]['article_ids'], ['one', 'two'])
        self.assertTrue((self.store.root / published['issues'][self.week]['cover']).is_file())
        self.assertEqual(self.store.data.read_bytes(), before)
        withdrawn = self.call('withdraw')
        self.assertEqual(withdrawn['issues'], {})
        self.assertIn(self.week, withdrawn['drafts'])
        self.assertEqual(len(list(self.store.backups.glob('covers-*/issue-covers.json'))), 1)

    def test_partial_draft_is_private_and_cannot_publish(self):
        self.call('save', draft={})
        with self.assertRaises(server.EditorError):
            self.call('publish')
        self.assertEqual(self.store.cover_state()['issues'], {})

    def test_invalid_links_and_wrong_week(self):
        for link in ['javascript:alert(1)', 'file:///x', 'https://', 'https://u:p@example.com']:
            self.draft(video_url=link)
            with self.assertRaises(server.EditorError):
                self.call('publish')
        self.draft(article_ids=['other'])
        with self.assertRaises(server.EditorError):
            self.call('publish')

    def test_revision_and_library_conflicts(self):
        old = self.store.cover_state()
        self.draft()
        with self.assertRaises(server.EditorError) as raised:
            self.call('save', revision=old['revision'], draft={})
        self.assertEqual(raised.exception.status, 409)
        with self.assertRaises(server.EditorError):
            self.call('save', libraryHash='stale', draft={})
        with self.assertRaises(server.EditorError):
            self.call('publish', libraryHash='stale')

    def test_publication_failure_preserves_previous_publication(self):
        self.draft()
        self.call('publish')
        public, _ = self.store.cover_paths()
        before = public.read_bytes()
        self.draft(article_ids=['one'])
        write = server.atomic_write

        def fail_public(path, raw):
            if path == public:
                raise OSError('simulated write failure')
            return write(path, raw)

        with patch.object(server, 'atomic_write', side_effect=fail_public):
            with self.assertRaises(OSError):
                self.call('publish')
        self.assertEqual(public.read_bytes(), before)

    def test_replacement_draft_does_not_change_publication(self):
        self.draft()
        published = self.call('publish')['issues']
        self.draft(video_url='https://example.com/new', article_ids=['one'])
        self.assertEqual(self.store.cover_state()['issues'], published)
        updated = self.call('publish')['issues'][self.week]
        self.assertEqual(updated['article_ids'], ['one'])
        self.assertEqual(updated['video_url'], 'https://example.com/new')

    def test_asset_path_and_image_validation(self):
        with self.assertRaises(server.EditorError):
            self.call('image', data=base64.b64encode(b'not an image').decode())
        self.draft(cover='../../private.png')
        with self.assertRaises(server.EditorError):
            self.call('publish')

    def test_old_or_invalid_issue_date_rejected(self):
        for week in ['2026-08-16', '2026-02-30', '../../x']:
            with self.assertRaises(server.EditorError):
                self.call('save', week=week, draft={})

    def test_non_sunday_issue_keeps_its_original_date(self):
        library, _ = self.store.library()
        library['articles'].extend([
            {'id': 'sep24-first', 'date_start': '2026-09-24', 'episode': 924},
            {'id': 'sep24-last', 'date_start': '2026-09-24', 'episode': 924},
            {'id': 'sep27', 'date_start': '2026-09-27', 'episode': 927}])
        server.atomic_write(self.store.data, server.json_bytes(library))
        self.week = '2026-09-24'
        self.draft(article_ids=['sep24-first', 'sep24-last'])
        state = self.call('publish')
        self.assertEqual(set(state['issues']), {'2026-09-24'})
        self.assertEqual(state['issues'][self.week]['article_ids'], ['sep24-first', 'sep24-last'])
        self.draft(article_ids=['sep27'])
        with self.assertRaises(server.EditorError):
            self.call('publish')

    def test_delete_unpublished_draft(self):
        saved = self.draft()
        asset = self.store.root / saved['drafts'][self.week]['cover']
        state = self.call('delete-draft')
        self.assertFalse(asset.exists())
        self.assertNotIn(self.week, state['drafts'])
        self.assertEqual(state['issues'], {})
        self.assertEqual(len(list(self.store.backups.glob('cover-drafts-*/state.json'))), 1)
        self.assertNotIn(self.week, self.call('delete-draft')['drafts'])

    def test_delete_published_draft_preserves_live_cover(self):
        self.draft()
        published = self.call('publish')['issues']
        saved = self.draft(video_url='https://example.com/unpublished-change')
        asset = self.store.root / saved['drafts'][self.week]['cover']
        old = self.store.cover_state()
        state = self.call('delete-draft')
        self.assertFalse(asset.exists())
        self.assertEqual(state['issues'], published)
        self.assertNotIn(self.week, state['drafts'])
        self.assertTrue((self.store.root / published[self.week]['cover']).is_file())
        with self.assertRaises(server.EditorError):
            self.call('delete-draft', revision=old['revision'])


if __name__ == '__main__':
    unittest.main()
