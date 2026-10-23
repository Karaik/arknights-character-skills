"""Validate every local module, candidate image and owner-review field."""
import hashlib
import json
import re
from pathlib import Path
from PIL import Image
import yaml
ROOT=Path(__file__).resolve().parents[1]

def main():
    errors=[]
    skill=ROOT/'skills/arturia'
    text=(skill/'SKILL.md').read_text(encoding='utf-8')
    front=yaml.safe_load(text.split('---',2)[1])
    if front.get('name')!='arturia' or not front.get('description'):errors.append('Invalid skill frontmatter')
    for file in skill.rglob('*.md'):
        for link in re.findall(r'\[[^\]]*\]\(([^)]+)\)',file.read_text(encoding='utf-8')):
            if link.startswith(('https://','http://','#')):continue
            target=(file.parent/link.split('#')[0]).resolve()
            if not target.is_relative_to(skill.resolve()) or not target.exists():errors.append(f'Broken or external local reference: {file.name}: {link}')
    items=json.loads((ROOT/'stickers/catalog.json').read_text(encoding='utf-8'))['stickers']
    ids=set();hashes=set()
    for item in items:
        id=item['id']
        if id in ids:errors.append('Duplicate ID: '+id)
        ids.add(id)
        for key in ['emotion','source_url','download_url','origin_evidence','selection_reason','arturia_fit','use_when','avoid_when','visual_description','creator']:
            if not item.get(key):errors.append(f'{id}: missing {key}')
        if item.get('review') not in ['pending','approved','rejected']:errors.append(id+': invalid review state')
        if item.get('intensity') not in [1,2,3]:errors.append(id+': invalid intensity')
        if item.get('popularity',{}).get('level')!='not_measured' and not item.get('popularity',{}).get('evidence'):errors.append(id+': unsubstantiated popularity')
        path=(skill/'assets/stickers'/item['file']).resolve()
        if not path.is_relative_to((skill/'assets/stickers').resolve()):errors.append(id+': escaped asset path');continue
        digest=hashlib.sha256(path.read_bytes()).hexdigest()
        if digest!=item['sha256']:errors.append(id+': image hash mismatch')
        if digest in hashes:errors.append(id+': duplicate image')
        hashes.add(digest)
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            if list(image.size)!=[item['width'],item['height']]:errors.append(id+': image dimensions mismatch')
    copied=json.loads((skill/'references/stickers.json').read_text(encoding='utf-8'))['stickers']
    if copied!=items:errors.append('Skill catalog is stale; run review_catalog.py')
    for x in json.loads((ROOT/'sources/prts.json').read_text(encoding='utf-8'))['sources']:
        if not x.get('revision') or not x.get('sha256'):errors.append('Unversioned PRTS source')
        raw=ROOT/x['local_raw']
        if raw.exists() and hashlib.sha256(raw.read_bytes()).hexdigest()!=x['sha256']:
            errors.append('Raw PRTS bytes do not match source hash: '+x['id'])
    manifest=ROOT/'build/runtime/manifest.json'
    if manifest.exists():
        actual=json.loads(manifest.read_text(encoding='utf-8'))['stickers']
        approved={x['id'] for x in items if x['review']=='approved'}
        if {x['id'] for x in actual}!=approved:errors.append('Runtime approval gate mismatch')
        if any(x['review']!='approved' for x in actual):errors.append('Pending sticker leaked into runtime')
    if errors:
        raise SystemExit('\n'.join(errors))
    print(json.dumps({'skill':'arturia','images_verified':len(items),'unique_images':len(hashes),
                      'pending':sum(x['review']=='pending' for x in items),'approved':sum(x['review']=='approved' for x in items),
                      'local_references':'valid','prts_sources':3},ensure_ascii=False))

if __name__=='__main__':main()
