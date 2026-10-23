"""Build a numbered visual index; individual original files remain untouched."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
def main():
    items = json.loads((ROOT/'stickers/catalog.json').read_text(encoding='utf-8'))['stickers']
    width, height = 260, 275
    font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 17)
    output = ROOT/'review'
    output.mkdir(exist_ok=True)
    for page, start in enumerate(range(0, len(items), 16), 1):
        subset = items[start:start+16]
        sheet = Image.new('RGB', (width*4, height*((len(subset)+3)//4)), '#f0eee8')
        draw = ImageDraw.Draw(sheet)
        for i, item in enumerate(subset):
            x,y = (i%4)*width,(i//4)*height
            draw.rounded_rectangle((x+6,y+6,x+width-6,y+height-6),radius=10,fill='#ffffff')
            source=Image.open(ROOT/'skills/arturia/assets/stickers'/item['file'])
            source.seek(getattr(source,'n_frames',1)//2)
            image=source.convert('RGBA')
            image.thumbnail((225,210))
            sheet.paste(image,(x+(width-image.width)//2,y+12+(210-image.height)//2),image)
            draw.text((x+15,y+225),item['id'],font=font,fill='#182635')
            status={'pending':'待你审核','approved':'已批准','rejected':'已拒绝'}[item['review']]
            draw.text((x+15,y+248),item.get('emotion',['待分类'])[0]+' · '+status,font=font,fill='#765b35')
        sheet.save(output/f'contact-sheet-{page:02}.jpg',quality=92)
    print('Generated contact sheets in review/.')

if __name__ == '__main__':main()
