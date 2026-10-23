"""Collect traceable official candidates. Classification is reviewed separately."""
from __future__ import annotations
import concurrent.futures
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
SELECT = ['表情套组_争锋专用_' + x + '.png' for x in ['busk', 'happy', 'hello', 'sad', 'shock', 'think', 'what', 'wronged']]
SELECT += ['表情套组_卫戍专用_' + x + '.png' for x in ['thanks', 'respect', 'sorry', 'playingcool']]
SELECT += ['表情套组_争锋专用_' + x + '.png' for x in ['pray', 'clown']]
SELECT += ['表情套组_卫戍专用_' + x + '.png' for x in ['noproblem', 'happy', 'thinking', 'sad', 'dying', 'scared']]

def fetch_asset(item):
    if item.get('asset_origin') == 'repository':
        source = (ASSETS / item['file']).resolve()
        if not source.is_relative_to(ASSETS.resolve()):
            raise ValueError('Repository asset path escapes sticker directory')
        content = source.read_bytes()
        if hashlib.sha256(content).hexdigest() != item['sha256']:
            raise ValueError('Repository image hash mismatch: ' + item['id'])
    else:
        response = requests.get(item['download_url'], timeout=35)
        response.raise_for_status()
        content=response.content
    if item.get('transform'):
        item['original_sha256']=hashlib.sha256(content).hexdigest()
        with Image.open(io.BytesIO(content)) as image:
            image=image.convert('RGBA').crop(tuple(item['transform']['box']))
            output=io.BytesIO();image.save(output,format='PNG');content=output.getvalue()
    with Image.open(io.BytesIO(content)) as image:
        image.load()
        item['width'], item['height'] = image.size
        item['format'] = image.format
        item['frames'] = getattr(image, 'n_frames', 1)
    item['sha256'] = hashlib.sha256(content).hexdigest()
    item['bytes'] = len(content)
    item['file'] = item['id'] + { 'PNG':'.png', 'GIF':'.gif', 'JPEG':'.jpg', 'WEBP':'.webp' }[item['format']]
    item['review'] = 'pending'
    item['retrieved_at'] = dt.datetime.now(dt.timezone.utc).isoformat()
    (ASSETS / item['file']).write_bytes(content)
    return item

def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    candidates = []
    images = get({'action': 'query', 'list': 'allimages', 'aiprefix': '表情套组', 'ailimit': 500, 'aiprop': 'url'})['query']['allimages']
    by_name = {x['name']: x for x in images}
    for index, name in enumerate(SELECT, 1):
        asset = by_name[name]
        candidates.append({'id': f'prts-{index:02}', 'title': name.removeprefix('表情套组_').removesuffix('.png'),
            'source_class': 'official_game_via_wiki', 'subject_scope':'generic', 'source_url': asset['descriptionurl'],
            'download_url': asset['url'], 'creator': '鹰角网络（PRTS 收录）',
            'origin_evidence': 'PRTS 表情套组页列出游戏模式中的官方表情，并关联游戏活动取得方式。',
            'collection_evidence_url': 'https://prts.wiki/w/' + requests.utils.quote('表情套组'),
            'collection_revision': 431402, 'popularity': {'level': 'not_measured', 'evidence': []}})
    for name in ['arturia-stickers.json', 'arturia-redraws.json']:
        supplements=ROOT/'sources'/name
        if supplements.exists():candidates.extend(json.loads(supplements.read_text(encoding='utf-8'))['stickers'])
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
    print(f'Collected {len(results)} traceable candidates; none approved automatically.')

if __name__ == '__main__':
    main()
