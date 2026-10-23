"""Create reviewable exports and a self-contained Skills archive."""
import hashlib
import json
import shutil
import zipfile
from pathlib import Path
from build import build, load_catalog
ROOT=Path(__file__).resolve().parents[1]

def main():
    _,manifest=build()
    exports=ROOT/'exports/chatluna'
    exports.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/'build/arturia.yml',exports/'arturia.yml')
    shutil.copyfile(ROOT/'build/runtime/manifest.json',exports/'runtime-manifest.json')
    # Keep every exported relative image path usable, and remove revoked images.
    images=exports/'images'
    if images.exists():shutil.rmtree(images)
    shutil.copytree(ROOT/'build/runtime/images',images)
    target=ROOT/'dist';target.mkdir(exist_ok=True)
    archive=target/'arturia-skill-0.1.0.zip'
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
        for path in sorted((ROOT/'build/skill/arturia').rglob('*')):
            if path.is_file():
                info=zipfile.ZipInfo(path.relative_to(ROOT/'build/skill').as_posix(),date_time=(1980,1,1,0,0,0))
                info.compress_type=zipfile.ZIP_DEFLATED
                info.external_attr=0o644 << 16
                z.writestr(info,path.read_bytes())
    items=load_catalog()
    report={'archive':archive.name,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
            'image_policy':'Only explicitly owner-approved images enter runtime',
            'review_counts':{s:sum(x['review']==s for x in items) for s in ['pending','approved','rejected']},
            'runtime_image_count':len(manifest['stickers']),
            'chatluna_parser':'1.4.2 actual package parser validated',
            'koishi_plugin_installed_and_enabled':True,'isolated_preset_loaded':True,
            'production_role_switched':False,'live_qq_image_upload_tested':False,
            'behavior_validation':'independent agent scenario exercise; not a live Gemini/DeepSeek comparison'}
    probe=ROOT/'validation/model-probe-results.json'
    if probe.exists():
        sampled=json.loads(probe.read_text(encoding='utf-8'))
        report['behavior_validation']='configured provider samples plus installed Koishi renderer/hook; one sample per case, not a statistical model comparison'
        report['model_probe']={
            'date':sampled['date'],'model':sampled['model'],'api_calls':sampled['apiCalls'],
            'cases_per_variant':{v:sum(x['variant']==v for x in sampled['results'])for v in ['baseline','modular']},
            'errors':len(sampled['errors']),'qq_messages_sent':sampled['qqMessagesSent']}
    final_probe=ROOT/'validation/final-model-probe-results.json'
    if final_probe.exists():
        sampled=json.loads(final_probe.read_text(encoding='utf-8'))
        report['final_model_probe']={'date':sampled['date'],'model':sampled['model'],
            'api_calls':sampled['apiCalls'],'cases':len(sampled['results']),
            'errors':len(sampled['errors']),'qq_messages_sent':sampled['qqMessagesSent']}
    deployed=ROOT/'validation/production-cutover-result.json'
    if deployed.exists():
        deployment=json.loads(deployed.read_text(encoding='utf-8'))
        health_file=ROOT/'validation/production-health.json'
        health=json.loads(health_file.read_text(encoding='utf-8'))if health_file.exists()else{}
        live_hash=health.get('productionPresetSha256',deployment.get('productionPresetSha256'))
        same_export=live_hash==hashlib.sha256((exports/'arturia.yml').read_bytes()).hexdigest()
        report['production_role_switched']=bool(deployment.get('success') and same_export)
        report['production_snapshot']={
            'matches_current_export':same_export,'selected_groups':deployment['selectedGroupConversations'],
            'model':deployment['newModel'],'history_preserved':deployment['historyUnchangedDuringTransaction'],
            'evidence':['validation/production-cutover-result.json','validation/production-health.json']}
    plugin_version=json.loads((ROOT/'adapters/koishi/package.json').read_text(encoding='utf-8'))['version']
    plugin_name=f'koishi-plugin-arturia-reviewed-stickers-{plugin_version}.tgz'
    plugin=ROOT/'build'/plugin_name
    if plugin.exists():
        shutil.copyfile(plugin,target/plugin_name)
        report['koishi_plugin_archive']={'file':plugin_name,'sha256':hashlib.sha256(plugin.read_bytes()).hexdigest()}
    sticker_update=ROOT/'validation/sticker-replacement-20261024.json'
    if sticker_update.exists():
        update=json.loads(sticker_update.read_text(encoding='utf-8'))
        current=bool(update.get('success') and update.get('preset_sha256')==hashlib.sha256((exports/'arturia.yml').read_bytes()).hexdigest()
                     and update.get('manifest_sha256')==hashlib.sha256((exports/'runtime-manifest.json').read_bytes()).hexdigest())
        report['sticker_replacement']={'matches_current_export':current,'image_count':update['imageCount'],
                                     'evidence':sticker_update.relative_to(ROOT).as_posix()}
        if current:
            report['production_role_switched']=True
            report['production_snapshot']['matches_current_export']=True
            report['production_snapshot']['evidence'].append(sticker_update.relative_to(ROOT).as_posix())
    gif_update=ROOT/'validation/gif-arm-fix-20261024.json'
    if gif_update.exists():
        update=json.loads(gif_update.read_text(encoding='utf-8'))
        current=bool(update.get('success') and update.get('preset_sha256')==hashlib.sha256((exports/'arturia.yml').read_bytes()).hexdigest()
                     and update.get('manifest_sha256')==hashlib.sha256((exports/'runtime-manifest.json').read_bytes()).hexdigest())
        report['gif_arm_repair']={'matches_current_export':current,'changed_assets':update['changedAssets'],
                                 'frames':update['gifFrames'],'duration_ms':update['gifDurationMs'],
                                 'evidence':gif_update.relative_to(ROOT).as_posix()}
        if current:
            report['production_role_switched']=True
            report['production_snapshot']['matches_current_export']=True
            report['production_snapshot']['evidence'].append(gif_update.relative_to(ROOT).as_posix())
    (target/'release.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8', newline='\n')
    print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':main()
