"""Fetch revisioned PRTS material; raw source stays local and untracked."""
from __future__ import annotations
import concurrent.futures
import datetime as dt
import hashlib
import json
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
API = 'https://prts.wiki/api.php'

def get(params):
    response = requests.get(API, params={**params, 'format': 'json'}, timeout=35,
                            headers={'User-Agent': 'ArturiaSkillResearch/1.0 (private noncommercial reference curation)'})
    response.raise_for_status()
    data = response.json()
    if 'error' in data:
        raise RuntimeError(data['error'])
    return data

def fetch_page(title):
    data = get({'action': 'parse', 'page': title, 'prop': 'wikitext|revid'})['parse']
    text = data['wikitext']['*'].replace('\r\n', '\n')
    directory = ROOT / 'research/raw'
    directory.mkdir(parents=True, exist_ok=True)
    name = title.replace('/', '--')
    (directory / (name + '.wiki')).write_bytes(text.encode('utf-8'))
    ids = {'塑心': 'prts-operator', '塑心/语音记录': 'prts-voice', '塑心/干员密录/1': 'prts-record'}
    return {'id': ids[title], 'title': title,
            'url': 'https://prts.wiki/w/' + requests.utils.quote(title, safe='/'),
            'revision': data['revid'], 'retrieved_at': dt.datetime.now(dt.timezone.utc).isoformat(),
            'sha256': hashlib.sha256(text.encode()).hexdigest(), 'sha256_kind': 'utf8_lf_bytes', 'local_raw': (directory / (name + '.wiki')).relative_to(ROOT).as_posix(),
            'source_kind': 'wiki_transcription_of_game_material',
            'scope': {'prts-operator':'operator archives and module stories', 'prts-voice':'voice lines, including alternate outfit', 'prts-record':'operator record: 天空与流云'}[ids[title]]}

def main():
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        sources = list(executor.map(fetch_page, ['塑心', '塑心/语音记录', '塑心/干员密录/1']))
    target = ROOT / 'sources/prts.json'
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps({'sources': sources}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps(sources, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
