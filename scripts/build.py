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
    return [item for item in items if item.get('review') == 'approved' and item.get('subject_scope') in ['generic','arturia']]

def md_body(text):
    return text.split('---', 2)[-1].strip() if text.startswith('---\n') else text.strip()

def build_native_skills(skill, target, core, common, sticker_lines):
    """Native Skills load their own bodies, so modules include needed text."""
    modules = [
        ('arturia', '阿尔图罗角色核心：当前角色为塑心、阿尔图罗、图图时加载身份、性格、语气、演出与群聊约定。', core+'\n\n'+common),
        ('arturia-relationships', '阿尔图罗人物关系：讨论费德里科、阿米娅、博士或原作关系时加载。', (skill/'references/relationships.md').read_text(encoding='utf-8')),
        ('arturia-lore', '阿尔图罗剧情与设定：讨论源石技艺、监督、模组、时装和时间线时加载。', (skill/'references/lore/timeline.md').read_text(encoding='utf-8')),
        ('arturia-banter', '阿尔图罗接梗：当前以图图身份与博士调侃、玩笑、互逗时加载。', (skill/'behaviors/banter.md').read_text(encoding='utf-8')),
        ('arturia-comfort', '阿尔图罗陪伴：当前以图图身份回应博士疲惫、抱怨、难过或需要倾听时加载。', (skill/'behaviors/comfort.md').read_text(encoding='utf-8')),
        ('arturia-stickers', '阿尔图罗表情：当前图图要发表情时加载七张已批准图片的情绪、适用与回避场景。', '\n'.join(sticker_lines)),
        ('arturia-examples', '阿尔图罗表达示例：图图回复重复或需要参考自然对话、神态与动作配合时加载。', (skill/'examples/dialogue.md').read_text(encoding='utf-8')),
    ]
    native=target/'native-skills'
    if native.exists(): shutil.rmtree(native)
    items=[]
    for name,description,body in modules:
        folder=native/name;folder.mkdir(parents=True)
        text='---\n'+yaml.safe_dump({'name':name,'description':description},allow_unicode=True,sort_keys=False).strip()+'\n---\n\n'+body.strip()+'\n'
        path=folder/'SKILL.md';path.write_text(text,encoding='utf-8',newline='\n')
        items.append({'name':name,'description':description,'file':name+'/SKILL.md','sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'mode':'description'})
    (target/'native-skills.json').write_text(json.dumps({'schema_version':1,'plugin':'koishi-plugin-chatluna-agent','version':'1.0.49','chat_mode':'plugin','skills':items},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return items


def build(root=ROOT, target=None):
    target = target or root/'build'
    profile = json.loads((root/'profiles/arturia.json').read_text(encoding='utf-8'))
    skill = root/'skills/arturia'
    if target.resolve() == root.resolve() or target.resolve() in root.resolve().parents:
        raise ValueError('Build output must not be the source root or its ancestor')
    target.mkdir(exist_ok=True, parents=True)
    skill_target=target/'skill/arturia'
    if skill_target.exists():
        if not skill_target.resolve().is_relative_to(target.resolve()):
            raise ValueError('Generated Skill path escapes output directory')
        shutil.rmtree(skill_target)
    shutil.copytree(skill, skill_target)
    core = md_body((skill/'SKILL.md').read_text(encoding='utf-8'))
    # File navigation is a maintenance concern; the ordinary ChatLuna model cannot open local files.
    core = core.split('## 按需要读取')[0].strip()
    common = '\n\n'.join((skill/file).read_text(encoding='utf-8').strip() for file in profile['always'])
    approved = approved_stickers(load_catalog(root))
    lines = ['表情由 Koishi 发送层处理。只可使用本清单里的 ID，每次最多一张；标记形式 [[sticker:ID]]。',
             '图片主体只允许无特定角色的通用表情或阿尔图罗本人；其他角色和身份不明人物一律不使用。',
             '先接当前博士的话，再按情绪选图；常用表情可以自然参与接梗，文字、短动作和纯图片都是回应方式。事实问答、认真诉苦和紧急求助先直接回应，不机械配图；连续接话时变化表达。']
    if approved:
        lines.extend(f"- {x['id']}: {'、'.join(x['emotion'])}（强度{x['intensity']}）；适用：{'；'.join(x['use_when'])}；不用于：{'；'.join(x['avoid_when'])}；使用：{x.get('usage_priority','按当前情绪自然选择')}" for x in approved)
    else:
        lines.append('当前没有获批表情；只回复文字，不输出任何 sticker 标记。')
    native_items=build_native_skills(skill,target,core,common,lines)
    native_runtime=profile.get('runtime')=='chatluna-agent'
    native_note=('\n\n当前运行于 ChatLuna plugin 模式，提供原生 skill 工具。当前身份始终是阿尔图罗；按当前话题调用技能加载完整模块，不向群友描述加载过程，也不要求博士知道技能名。\n'+'\n'.join(f"- {x['name']}: {x['description']}"for x in native_items))if native_runtime else ''
    example_messages=[]
    approved_ids={x['id']for x in approved}
    examples=json.loads((skill/profile['examples']).read_text(encoding='utf-8'))['examples']
    for example in examples:
        if not set(example.get('requires_stickers',[])).issubset(approved_ids):continue
        example_messages.extend([{'role':'user','content':example['user']},
                                 {'role':'assistant','content':example['assistant']}])
    preset = {
        'keywords': profile['aliases'],
        'prompts': [{'role': 'system', 'content': core+'\n\n'+common+'\n\n'+'\n'.join(lines)+native_note}]+example_messages,
        'format_user_prompt': '用户{sender}（ID:{sender_id}）说：{prompt}',
        'world_lores': [{'scanDepth': 3, 'tokenLimit': 1800, 'recursiveScan': False}] + [
            {'keywords': item['keywords'], 'content': (skill/item['file']).read_text(encoding='utf-8'),
             'scanDepth': 3, 'enabled': True} for item in ([]if native_runtime else profile['lore'])],
        'authors_note': {'content': '每位群友都是独立的博士，按昵称与引用分清对象。接眼前具体的话，保留简短括号演出，让神态或小动作与台词一起表现当下情绪；自然短答也可以。',
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
        manifest['stickers'].append({key: item[key] for key in ['id','review','sha256','emotion','use_when','subject_scope']} | {'file': file})
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
    print(f"Built {len(preset['keywords'])} aliases, 7 native skills, {len(manifest['stickers'])} approved images.")
