"""Build standard Skill and pinned ChatLuna outputs from one modular source."""
from __future__ import annotations
import argparse
import hashlib
import json
import shutil
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[1]

def load_catalog(root=ROOT):
    return json.loads((root/'stickers/catalog.json').read_text(encoding='utf-8'))['stickers']

def approved_stickers(items):
    return [item for item in items if item.get('review') == 'approved']

def md_body(text):
    return text.split('---', 2)[-1].strip() if text.startswith('---\n') else text.strip()

def build(root=ROOT, target=None):
    target = target or root/'build'
    profile = json.loads((root/'profiles/arturia.json').read_text(encoding='utf-8'))
    skill = root/'skills/arturia'
    target.mkdir(exist_ok=True, parents=True)
    shutil.copytree(skill, target/'skill/arturia', dirs_exist_ok=True)
    core = md_body((skill/'SKILL.md').read_text(encoding='utf-8'))
    # File navigation is a maintenance concern; the ordinary ChatLuna model cannot open local files.
    core = core.split('## 按需要读取')[0].strip()
    common = '\n\n'.join((skill/file).read_text(encoding='utf-8').strip() for file in profile['always'])
    approved = approved_stickers(load_catalog(root))
    lines = ['表情由 Koishi 发送层处理。只可使用本清单里的 ID，每次最多一张；标记形式 [[sticker:ID]]。']
    if approved:
        lines.extend(f"- {x['id']}: {'、'.join(x['emotion'])}；适用：{'；'.join(x['use_when'])}" for x in approved)
    else:
        lines.append('当前没有获批表情；只回复文字，不输出任何 sticker 标记。')
    preset = {
        'keywords': profile['aliases'],
        'prompts': [{'role': 'system', 'content': core+'\n\n'+common+'\n\n'+'\n'.join(lines)},
                    {'role': 'user', 'content': '图图又活了，看看这次能活多久。'},
                    {'role': 'assistant', 'content': '刚回来就给我计时？至少先说一句欢迎吧。'},
                    {'role': 'user', 'content': '今天上班好烦，不想听建议。'},
                    {'role': 'assistant', 'content': '那今天就不劝你努力。先把让你烦的事留在门外。'}],
        'format_user_prompt': '用户{sender}（ID:{sender_id}）说：{prompt}',
        'world_lores': [{'scanDepth': 3, 'tokenLimit': 1800, 'recursiveScan': False}] + [
            {'keywords': item['keywords'], 'content': (skill/item['file']).read_text(encoding='utf-8'),
             'scanDepth': 3, 'enabled': True} for item in profile['lore']],
        'authors_note': {'content': '接眼前这句具体的话，按关系回应；动作、称呼、音乐比喻都只在有意义时出现。',
                         'insertPosition': 'in_chat', 'insertDepth': 0, 'insertFrequency': 1}
    }
    (target/'arturia.yml').write_text(yaml.safe_dump(preset, allow_unicode=True, sort_keys=False, width=1000), encoding='utf-8', newline='\n')
    # Rebuild the runtime directory from scratch to eliminate previously approved but now rejected assets.
    runtime = target/'runtime'
    if runtime.exists():
        shutil.rmtree(runtime)
    (runtime/'images').mkdir(parents=True)
    manifest = {'schema_version': 1, 'stickers': []}
    for item in approved:
        source = skill/'assets/stickers'/item['file']
        if hashlib.sha256(source.read_bytes()).hexdigest() != item['sha256']:
            raise ValueError('Image hash mismatch: '+item['id'])
        file = 'images/'+item['file']
        shutil.copyfile(source, runtime/file)
        manifest['stickers'].append({key: item[key] for key in ['id','review','sha256','emotion','use_when']} | {'file': file})
    (runtime/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8', newline='\n')
    # MemesLuna accepts an uploadable image folder. It is not claimed to accept this metadata JSON natively.
    memes = target/'memesluna-approved'
    if memes.exists(): shutil.rmtree(memes)
    memes.mkdir()
    for item in approved:
        shutil.copyfile(skill/'assets/stickers'/item['file'], memes/item['file'])
    (target/'memesluna-labels.json').write_text(json.dumps([
        {'file':x['file'], 'tags':x['emotion'], 'aliases':x['use_when']} for x in approved
    ], ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    return preset, manifest

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    preset, manifest = build(target=args.output)
    print(f"Built {len(preset['keywords'])} aliases, {len(preset['world_lores'])-1} lore modules, {len(manifest['stickers'])} approved images.")
