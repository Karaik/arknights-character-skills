"""Resolve actual Arturia story sprite URLs from PRTS's published story renderer data."""
import json
from pathlib import Path
from research_prts import get
ROOT=Path(__file__).resolve().parents[1]

def main():
    data=get({'action':'parse','page':'Widget:Data_Char','prop':'wikitext|revid'})['parse']
    mapping=dict(line.split(',',1) for line in data['wikitext']['*'].splitlines() if line.startswith('avg_245_cello_1-') and ',' in line)
    items=[]
    for i in range(1,13):
        key=f'avg_245_cello_1-{i}$1'
        if key not in mapping:raise ValueError('Missing story expression '+key)
        items.append({'id':f'arturia-{i:02}','title':f'阿尔图罗官方剧情差分 {i:02}',
            'subject_scope':'arturia','source_class':'official_story_crop',
            'source_url':'https://prts.wiki/w/Widget:Data_Char',
            'download_url':mapping[key], 'creator':'鹰角网络（PRTS 剧情模拟器收录）',
            'origin_evidence':f'PRTS 剧情模拟器公开映射 {key}，干员 char_245_cello；本项目仅裁切头像区域，非官方独立发布表情包。',
            'source_revision':data['revid'], 'transform':{'kind':'crop','box':[400,0,800,400]},
            'popularity':{'level':'not_measured','evidence':[]}})
    (ROOT/'sources/arturia-stickers.json').write_text(json.dumps({'stickers':items},ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(f'Resolved {len(items)} Arturia story expressions, revision {data["revid"]}.')

if __name__=='__main__':main()
