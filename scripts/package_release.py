"""Create reviewable exports and a self-contained Skills archive."""
import hashlib
import json
import shutil
import zipfile
from pathlib import Path
from build import build
ROOT=Path(__file__).resolve().parents[1]

def main():
    build()
    exports=ROOT/'exports/chatluna'
    exports.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/'build/arturia.yml',exports/'arturia.yml')
    shutil.copyfile(ROOT/'build/runtime/manifest.json',exports/'runtime-manifest.json')
    target=ROOT/'dist';target.mkdir(exist_ok=True)
    archive=target/'arturia-skill-0.1.0.zip'
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
        for path in sorted((ROOT/'build/skill/arturia').rglob('*')):
            if path.is_file():
                info=zipfile.ZipInfo(path.relative_to(ROOT/'build/skill').as_posix(),date_time=(1980,1,1,0,0,0))
                info.compress_type=zipfile.ZIP_DEFLATED
                info.external_attr=0o644 << 16
                z.writestr(info,path.read_bytes())
    report={'archive':archive.name,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
            'image_policy':'All candidates pending owner review; runtime manifest intentionally empty',
            'chatluna_parser':'1.4.2 actual package parser validated',
            'server_deployed':False,'live_qq_image_upload_tested':False,
            'behavior_validation':'independent agent scenario exercise; not a live Gemini/DeepSeek comparison'}
    (target/'release.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8', newline='\n')
    print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':main()
