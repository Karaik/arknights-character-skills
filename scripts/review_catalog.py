"""Generate a filterable owner review page and a self-contained Skill emotion index."""
import html
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
LABELS={'official_game_via_wiki':'官方无角色通用表情（PRTS 收录）','official_story_crop':'图图官方剧情差分裁切（非官方独立表情包）','owner_reviewed_redraw':'用户提供动作、参考描改的图图 GIF（非官方表情包）'}
REVIEW_LABELS={'approved':'已批准','pending':'待审核','rejected':'已拒绝'}

def main():
    payload=json.loads((ROOT/'stickers/catalog.json').read_text(encoding='utf-8'))
    items=payload['stickers']
    skill=ROOT/'skills/arturia'
    (skill/'references/stickers.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8', newline='\n')
    states={s:sum(x['review']==s for x in items) for s in ['pending','approved','rejected']}
    approved_ids='、'.join(x['id'] for x in items if x['review']=='approved') or '无'
    lines=['# 表情决策与逐张情绪索引','',
           f"当前待审 {states['pending']} 张、批准 {states['approved']} 张、拒绝 {states['rejected']} 张。只读这个索引不代表可以发送；运行时以已批准清单为准。",
           '先确定情绪与强度，再看是否适合当前对象和场景。轻松群聊不必每条配图；真实悲伤、求助时先直接回应。',
           '仅允许无特定角色的通用图或阿尔图罗本人；其他角色已移除。官方来源与传播热度分开，不虚标热门。',
           '每张完整出处、哈希、选用理由、禁用场景与审核状态见 [结构化目录](stickers.json)。','',
           '| ID／预览 | 情绪（强度1—3） | 选用理由与角色适配 |','|---|---|---|']
    cards=[]
    for x in items:
        emotions='、'.join(x['emotion'])
        popularity='热度：未测量，不声称热门。'
        if x.get('popularity',{}).get('evidence'):
            record=x['popularity']['evidence'][0]
            popularity=f"原帖观察数据：{record.get('likes','未知')}赞、{record.get('comments','未知')}评论、{record.get('shares','未知')}分享；不代表全圈爆款。"
        lines.append(f"| [{x['id']}](../assets/stickers/{x['file']}) | {emotions}（{x['intensity']}） | {x['arturia_fit']}；来源：{LABELS[x['source_class']]}；审核：{x['review']} |")
        e=lambda v:html.escape(str(v),quote=True)
        cards.append(f'''<article data-tags="{e(emotions+' '+x['source_class']+' '+x['id']+' '+x['visual_description']+' '+x['review']+' '+REVIEW_LABELS[x['review']])}">
<a href="../skills/arturia/assets/stickers/{e(x['file'])}"><img loading="lazy" src="../skills/arturia/assets/stickers/{e(x['file'])}" alt="{e(x['visual_description'])}"></a>
<h2>{e(x['id'])} · {e(emotions)}</h2><p class="badge">{e(LABELS[x['source_class']])} · 强度 {x['intensity']} · {e(REVIEW_LABELS[x['review']])}</p>
<p><b>画面：</b>{e(x['visual_description'])}</p><p><b>为什么收：</b>{e(x['selection_reason'])}</p>
<p><b>为什么适合图图：</b>{e(x['arturia_fit'])}</p><p><b>什么时候发：</b>{e('；'.join(x['use_when']))}</p>
<p><b>什么时候不用：</b>{e('；'.join(x['avoid_when']))}</p><p><b>作者：</b>{e(x['creator'])}</p>
<p><b>审核记录：</b>{e(x.get('review_note','待管理者判断'))}</p>
<p><a href="{e(x['source_url'])}" target="_blank" rel="noreferrer">来源页面</a> · <a href="{e(x['download_url'])}" target="_blank" rel="noreferrer">原图地址</a></p>
<p class="muted">{e(x['origin_evidence'])}<br>{e(popularity)}<br>SHA256 {e(x['sha256'][:16])}…</p></article>''')
    (skill/'references/stickers.md').write_text('\n'.join(lines)+'\n',encoding='utf-8', newline='\n')
    page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>图图表情候选审核</title>
<style>body{font:16px/1.65 "Microsoft YaHei",sans-serif;background:#f3f0e9;color:#26313b;margin:0;padding:30px}header{max-width:1100px;margin:auto}h1{margin:0}input{font:inherit;padding:10px;width:min(90%,550px);margin:16px 0;border:1px solid #bbb;border-radius:6px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:20px;max-width:1400px;margin:auto}article{background:white;border:1px solid #d9d4c9;border-radius:12px;padding:20px}article img{display:block;height:210px;width:100%;object-fit:contain}h2{font-size:19px}.badge{color:#8a5c10}.muted{font-size:13px;color:#66717a}a{color:#245b88}p{margin:9px 0}[hidden]{display:none}</style>
<header><h1>阿尔图罗 · 表情审核</h1><p>点击图片查看原图，搜索情绪、ID、画面或“已批准”。你可直接回复“保留 arturia-11、prts-06，其余再议”；此页面不会保存批准，也不会改服务器。</p><p>包含官方无角色通用图、图图本人官方剧情差分，以及用户提供动作、参考描改的图图 GIF。来源类别逐张标注，其他角色不使用。<a href="community-leads.md">社区来源线索</a>另列。</p>'''+f'<p>总计 {len(items)} 张；已批准 {states["approved"]} 张，待审 {states["pending"]} 张。已批准 ID：{html.escape(approved_ids)}。</p>'+'''<input id="search" placeholder="搜索：已批准、嫌弃、感谢、arturia-sway-01…" aria-label="筛选表情"></header><main>'''+''.join(cards)+'''</main><script>document.querySelector('#search').addEventListener('input',event=>{const query=event.target.value.trim().toLowerCase();for(const card of document.querySelectorAll('article'))card.hidden=!card.dataset.tags.toLowerCase().includes(query)});</script></html>'''
    (ROOT/'review').mkdir(exist_ok=True)
    (ROOT/'review/index.html').write_text(page,encoding='utf-8', newline='\n')
    print(f'Generated review page and Skill emotion index for {len(items)} images.')

if __name__=='__main__':main()
