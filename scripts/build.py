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

def build_native_skills(skill, target, core, common, sticker_lines, examples):
    """Native Skills load their own bodies, so modules include needed text."""
    modules = [
        ('arturia', '阿尔图罗角色核心：当前角色为塑心、阿尔图罗、图图时加载身份、性格、语气、演出与群聊约定。', core+'\n\n'+common),
        ('arturia-relationships', '阿尔图罗人物关系：讨论费德里科、阿米娅、博士或原作关系时加载。', (skill/'references/relationships.md').read_text(encoding='utf-8')),
        ('arturia-lore', '阿尔图罗剧情与设定：讨论源石技艺、监督、模组、时装和时间线时加载。', (skill/'references/lore/timeline.md').read_text(encoding='utf-8')),
        ('arturia-banter', '阿尔图罗接梗：与博士调侃、玩笑、互逗时加载，接梗仍遵循当前表情索引。', (skill/'behaviors/banter.md').read_text(encoding='utf-8')),
        ('arturia-comfort', '阿尔图罗陪伴：当前以图图身份回应博士疲惫、抱怨、难过或需要倾听时加载。', (skill/'behaviors/comfort.md').read_text(encoding='utf-8')),
        ('arturia-stickers', '阿尔图罗表情：轻松疑惑、为难、被夸、吐槽、得意、会意、跳舞、冒泡、欢迎或庆祝时，读取获批图的选择边界；不用博士要求图片。', '\n'.join(sticker_lines)),
        ('arturia-examples', '阿尔图罗表达示例：参考自然接话、神态、短台词与获批表情配合，或改善重复回复时加载。', (skill/'examples/dialogue.md').read_text(encoding='utf-8')+'\n\n## 当前运行样例（已按图片批准状态过滤）\n\n'+'\n\n'.join('博士：'+x['user']+'\n\n图图：'+x['assistant'] for x in examples)),
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
             '图片主体只允许无特定角色的通用表情或阿尔图罗本人；其他角色和身份不明人物一律不使用。']
    if approved:
        lines.append((skill/'behaviors/sticker-policy.md').read_text(encoding='utf-8').strip())
        lines.append('## 当前获批表情索引')
        lines.extend(f"- {x['id']}: {'、'.join(x['emotion'])}（强度{x['intensity']}）；自然场景：{'；'.join(x.get('natural_triggers',x['use_when']))}；区分：{x.get('selection_boundary','按当前情绪选择')}；不用于：{'；'.join(x['avoid_when'])}；使用：{x.get('usage_priority','按当前情绪自然选择')}" for x in approved)
    else:
        lines.append('当前没有获批表情；只回复文字，不输出任何 sticker 标记。')
    approved_ids={x['id']for x in approved}
    examples=[x for x in json.loads((skill/profile['examples']).read_text(encoding='utf-8'))['examples']
              if set(x.get('requires_stickers',[])).issubset(approved_ids)]
    native_items=build_native_skills(skill,target,core,common,lines,examples)
    native_runtime=profile.get('runtime')=='chatluna-agent'
    native_note=('\n\n当前运行于 ChatLuna plugin 模式，提供原生 skill 工具。当前身份始终是阿尔图罗；按当前话题调用技能加载完整模块，不向群友描述加载过程，也不要求博士知道技能名。当前获批表情索引已给出，可直接选图；读取接梗模块不替代选图，需要细分场景时读取表情模块。\n'+'\n'.join(f"- {x['name']}: {x['description']}"for x in native_items))if native_runtime else ''
    example_messages=[]
    for example in examples:
        example_messages.extend([{'role':'user','content':example['user']},
                                 {'role':'assistant','content':example['assistant']}])
    preset = {
        'keywords': profile['aliases'],
        'prompts': [{'role': 'system', 'content': core+'\n\n'+common+'\n\n'+'\n'.join(lines)+native_note}]+example_messages,
        'format_user_prompt': '用户{sender}（ID:{sender_id}）说：{prompt}',
        'world_lores': [{'scanDepth': 3, 'tokenLimit': 1800, 'recursiveScan': False}] + [
            {'keywords': item['keywords'], 'content': (skill/item['file']).read_text(encoding='utf-8'),
             'scanDepth': 3, 'enabled': True} for item in ([]if native_runtime else profile['lore'])],
        'authors_note': {'content': '每位群友都是独立的博士，按昵称与引用分清对象。先看本轮主旨：知识解答、认真求助、文字限定整条不配图，夹带问候也一样；轻松疑惑、为难小乌龙、被夸、吐槽、得意、会意、邀舞冒泡欢迎，默认在短台词末尾带对应的一张获批图，短括号演出不代替图片。不要因顺嘴打趣就把为难改成得意。',
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
