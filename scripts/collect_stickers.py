"""Collect traceable official candidates. Classification is reviewed separately."""
from __future__ import annotations
import concurrent.futures
import csv
import datetime as dt
import hashlib
import io
import json
from pathlib import Path
import requests
from PIL import Image
from research_prts import get

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'skills/arturia/assets/stickers'
CSV_URL = 'https://raw.githubusercontent.com/umittadelen/arknightsStickers/main/stickers.csv'
SELECT = ['表情套组_争锋专用_' + x + '.png' for x in ['busk', 'happy', 'hello', 'sad', 'shock', 'think', 'what', 'wronged']]
SELECT += ['表情套组_卫戍专用_' + x + '.png' for x in ['thanks', 'respect', 'sorry', 'playingcool']]

def fetch_asset(item):
    response = requests.get(item['download_url'], timeout=35)
    response.raise_for_status()
    with Image.open(io.BytesIO(response.content)) as image:
        image.load()
        item['width'], item['height'] = image.size
        item['format'] = image.format
        item['frames'] = getattr(image, 'n_frames', 1)
    item['sha256'] = hashlib.sha256(response.content).hexdigest()
    item['bytes'] = len(response.content)
    item['file'] = item['id'] + '.png'
    item['review'] = 'pending'
    item['retrieved_at'] = dt.datetime.now(dt.timezone.utc).isoformat()
    (ASSETS / item['file']).write_bytes(response.content)
    return item

def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    response = requests.get(CSV_URL, timeout=30)
    response.raise_for_status()
    pack = next(csv.DictReader(io.StringIO(response.text)))
    candidates = []
    for index, url in enumerate(pack['sticker_urls'].split(';'), 1):
        candidates.append({'id': f'yostar-{index:02}', 'title': f'Yostar 官方庆典表情 {index:02}',
            'source_class': 'official_cdn', 'source_url': 'https://www.arknights.global/fankit',
            'discovery_url': CSV_URL, 'download_url': url, 'creator': 'Arknights / Yostar',
            'origin_evidence': '图片直接来自 Yostar 官方 webusstatic.yo-star.com 域名；整套链接由公开索引发现。活动套组名称取自索引，未据此断言传播热度。',
            'popularity': {'level': 'not_measured', 'evidence': []}})
    images = get({'action': 'query', 'list': 'allimages', 'aiprefix': '表情套组', 'ailimit': 500, 'aiprop': 'url'})['query']['allimages']
    by_name = {x['name']: x for x in images}
    for index, name in enumerate(SELECT, 1):
        asset = by_name[name]
        candidates.append({'id': f'prts-{index:02}', 'title': name.removeprefix('表情套组_').removesuffix('.png'),
            'source_class': 'official_game_via_wiki', 'source_url': asset['descriptionurl'],
            'download_url': asset['url'], 'creator': '鹰角网络（PRTS 收录）',
            'origin_evidence': 'PRTS 表情套组页列出游戏模式中的官方表情，并关联游戏活动取得方式。',
            'collection_evidence_url': 'https://prts.wiki/w/' + requests.utils.quote('表情套组'),
            'collection_revision': 431402, 'popularity': {'level': 'not_measured', 'evidence': []}})
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(fetch_asset, candidates))
    path = ROOT / 'stickers/catalog.json'
    path.parent.mkdir(exist_ok=True)
    if path.exists():
        old = {x['id']: x for x in json.loads(path.read_text(encoding='utf-8'))['stickers']}
        for item in results:
            previous = old.get(item['id'], {})
            if previous.get('sha256') == item['sha256']:
                for key in ['review', 'emotion', 'intensity', 'visual_description', 'selection_reason', 'use_when', 'avoid_when', 'arturia_fit', 'review_note']:
                    if key in previous:
                        item[key] = previous[key]
    path.write_text(json.dumps({'schema_version': 1, 'stickers': results}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(f'Collected {len(results)} official candidates; none approved automatically.')

if __name__ == '__main__':
    main()
