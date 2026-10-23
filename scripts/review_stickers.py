"""Apply explicit owner choices; never guesses approval from source or emotion."""
import argparse
import datetime as dt
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('decision',choices=['approve','reject','pending'])
    parser.add_argument('ids',nargs='+')
    parser.add_argument('--note',required=True,help='Owner decision or link to explicit instruction')
    args=parser.parse_args()
    if not args.note.strip():parser.error('An explicit owner decision note is required')
    p=ROOT/'stickers/catalog.json';data=json.loads(p.read_text(encoding='utf-8'))
    lookup={x['id']:x for x in data['stickers']}
    unknown=set(args.ids)-lookup.keys()
    if unknown:parser.error('Unknown IDs: '+', '.join(sorted(unknown)))
    state={'approve':'approved','reject':'rejected','pending':'pending'}[args.decision]
    for id in args.ids:
        lookup[id]['review']=state
        lookup[id]['review_note']=args.note
        lookup[id]['reviewed_at']=dt.datetime.now(dt.timezone.utc).isoformat()
    p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8', newline='\n')
    print('Review updated. Run review_catalog.py and build.py before exporting.')

if __name__=='__main__':main()
