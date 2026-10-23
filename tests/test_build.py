import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('build_skill', ROOT/'scripts/build.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class BuildTests(unittest.TestCase):
    def test_conversation_examples_follow_sticker_approval(self):
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)
            fixture=copy.deepcopy(next(x for x in builder.load_catalog() if x['id']=='arturia-sway-01'))
            fixture['review']='approved'
            with patch.object(builder,'load_catalog',return_value=[fixture]):
                preset,_=builder.build(target=target)
            assistants=[x['content']for x in preset['prompts']if x['role']=='assistant']
            self.assertTrue(any('[[sticker:arturia-sway-01]]' in x for x in assistants))
            with patch.object(builder,'load_catalog',return_value=[]):
                preset,_=builder.build(target=target)
            self.assertFalse(any('[[sticker:' in x['content']for x in preset['prompts']if x['role']=='assistant'))

    def test_approval_is_explicit(self):
        items = [{'id':'a','review':'pending','subject_scope':'generic'}, {'id':'b','review':'approved','subject_scope':'generic'},
                 {'id':'c','review':'rejected','subject_scope':'arturia'}, {'id':'d','review':'approved','subject_scope':'other'}]
        self.assertEqual([x['id'] for x in builder.approved_stickers(items)], ['b'])

    def test_default_bundle_excludes_pending_and_replaces_stale_images(self):
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)
            (target/'runtime').mkdir()
            (target/'runtime/stale.png').write_bytes(b'stale')
            preset, manifest=builder.build(target=target)
            stale=target/'skill/arturia/references/deleted-module.md'
            stale.write_text('removed source',encoding='utf-8')
            expected=builder.approved_stickers(builder.load_catalog())
            self.assertEqual([x['id'] for x in manifest['stickers']], [x['id'] for x in expected])
            self.assertFalse((target/'runtime/stale.png').exists())
            self.assertEqual(len(list((target/'runtime/images').iterdir())),len(expected))
            for alias in ['塑心','阿尔图罗','图图','图图姐','香草榜第一']:
                self.assertIn(alias,preset['keywords'])
            first=(target/'arturia.yml').read_bytes()
            builder.build(target=target)
            self.assertEqual(first,(target/'arturia.yml').read_bytes())
            self.assertFalse(stale.exists())

if __name__=='__main__':unittest.main()
