import hashlib
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('collect_stickers', ROOT / 'scripts/collect_stickers.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class RepositoryStickerTests(unittest.TestCase):
    def make_asset(self, directory):
        file = directory / 'owner-dance.gif'
        frames = [Image.new('RGB', (4, 4), color) for color in ['black', 'white']]
        frames[0].save(file, save_all=True, append_images=frames[1:], duration=100, loop=0)
        data = file.read_bytes()
        return file, data, {
            'id': 'owner-dance', 'asset_origin': 'repository', 'file': file.name,
            'download_url': '../skills/arturia/assets/stickers/owner-dance.gif',
            'sha256': hashlib.sha256(data).hexdigest(),
        }

    def test_recollection_preserves_repository_gif_without_network(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            file, data, item = self.make_asset(directory)
            with patch.object(collector, 'ASSETS', directory), patch.object(
                collector.requests, 'get', side_effect=AssertionError('Repository assets must not be downloaded')
            ):
                result = collector.fetch_asset(item)
            self.assertEqual(file.read_bytes(), data)
            self.assertEqual(result['sha256'], hashlib.sha256(data).hexdigest())
            self.assertEqual(result['format'], 'GIF')
            self.assertEqual(result['frames'], 2)

    def test_recollection_rejects_changed_repository_gif(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            _, _, item = self.make_asset(directory)
            item['sha256'] = '0' * 64
            with patch.object(collector, 'ASSETS', directory), patch.object(
                collector.requests, 'get', side_effect=AssertionError('Repository assets must not be downloaded')
            ):
                with self.assertRaisesRegex(ValueError, 'hash'):
                    collector.fetch_asset(item)


if __name__ == '__main__':
    unittest.main()
