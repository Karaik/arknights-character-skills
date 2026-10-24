import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import yaml
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('build_skill', ROOT/'scripts/build.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class BuildTests(unittest.TestCase):
    def test_native_skill_modules_include_text_and_follow_approval(self):
        with tempfile.TemporaryDirectory()as tmp:
            target=Path(tmp);preset,_=builder.build(target=target)
            index=json.loads((target/'native-skills.json').read_text(encoding='utf-8'))
            self.assertEqual(len(index['skills']),7)
            for item in index['skills']:
                text=(target/'native-skills'/item['file']).read_text(encoding='utf-8')
                metadata=yaml.safe_load(text.split('---',2)[1])
                self.assertEqual(metadata['name'],item['name'])
                self.assertGreater(len(text.split('---',2)[2].strip()),100)
                self.assertNotIn('## 按需要读取',text)
            self.assertEqual(len(preset['world_lores']),1)
            with patch.object(builder,'load_catalog',return_value=[]):builder.build(target=target)
            self.assertNotIn('arturia-sway-01',(target/'native-skills/arturia-stickers/SKILL.md').read_text(encoding='utf-8'))

    def test_conversation_examples_follow_sticker_approval(self):
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)
            fixture=copy.deepcopy(next(x for x in builder.load_catalog() if x['id']=='arturia-sway-01'))
            fixture['review']='approved'
            with patch.object(builder,'load_catalog',return_value=[fixture]):
                preset,_=builder.build(target=target)
            assistants=[x['content']for x in preset['prompts']if x['role']=='assistant']
            self.assertTrue(any('[[sticker:arturia-sway-01]]' in x for x in assistants))
            native_examples=(target/'native-skills/arturia-examples/SKILL.md').read_text(encoding='utf-8')
            self.assertIn('[[sticker:arturia-sway-01]]',native_examples)
            self.assertNotRegex(native_examples,r'\[\[sticker:arturia-react-\d+\]\]')
            with patch.object(builder,'load_catalog',return_value=[]):
                preset,_=builder.build(target=target)
            self.assertFalse(any('[[sticker:' in x['content']for x in preset['prompts']if x['role']=='assistant'))
            self.assertNotIn('[[sticker:',(target/'native-skills/arturia-examples/SKILL.md').read_text(encoding='utf-8'))

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
