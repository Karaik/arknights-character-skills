import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('build_skill', ROOT/'scripts/build.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class BuildTests(unittest.TestCase):
    def test_approval_is_explicit(self):
        items = [{'id':'a','review':'pending'}, {'id':'b','review':'approved'}, {'id':'c','review':'rejected'}]
        self.assertEqual([x['id'] for x in builder.approved_stickers(items)], ['b'])

    def test_default_bundle_excludes_pending_and_replaces_stale_images(self):
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)
            (target/'runtime').mkdir()
            (target/'runtime/stale.png').write_bytes(b'stale')
            preset, manifest=builder.build(target=target)
            expected=builder.approved_stickers(builder.load_catalog())
            self.assertEqual([x['id'] for x in manifest['stickers']], [x['id'] for x in expected])
            self.assertFalse((target/'runtime/stale.png').exists())
            self.assertEqual(len(list((target/'runtime/images').iterdir())),len(expected))
            for alias in ['塑心','阿尔图罗','图图','图图姐','香草榜第一']:
                self.assertIn(alias,preset['keywords'])
            first=(target/'arturia.yml').read_bytes()
            builder.build(target=target)
            self.assertEqual(first,(target/'arturia.yml').read_bytes())

if __name__=='__main__':unittest.main()
