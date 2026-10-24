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
    native=exports/'native-skills'
    if native.exists():shutil.rmtree(native)
    shutil.copytree(ROOT/'build/native-skills',native)
    shutil.copyfile(ROOT/'build/native-skills.json',exports/'native-skills.json')
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
    native_archive=target/'arturia-chatluna-skills.zip'
    with zipfile.ZipFile(native_archive,'w',compression=zipfile.ZIP_DEFLATED)as z:
        for path in sorted((ROOT/'build/native-skills').rglob('SKILL.md')):
            info=zipfile.ZipInfo(path.relative_to(ROOT/'build/native-skills').as_posix(),date_time=(1980,1,1,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16
            z.writestr(info,path.read_bytes())
    items=load_catalog()
    report={'archive':archive.name,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
            'native_skill_archive':native_archive.name,'native_skill_count':7,
            'image_policy':'Only explicitly owner-approved images enter runtime',
            'review_counts':{s:sum(x['review']==s for x in items) for s in ['pending','approved','rejected']},
            'runtime_image_count':len(manifest['stickers']),
            'chatluna_parser':'1.4.2 actual package parser validated',
            'koishi_plugin_installed_and_enabled':True,'formal_preset_loaded':False,
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
    delivery_file=ROOT/'validation/qq-self-probe-results.json'
    if delivery_file.exists():
        delivery=json.loads(delivery_file.read_text(encoding='utf-8'))
        current=bool(delivery.get('success') and delivery.get('presetSha256')==hashlib.sha256((exports/'arturia.yml').read_bytes()).hexdigest()
                     and delivery.get('manifestSha256')==hashlib.sha256((exports/'runtime-manifest.json').read_bytes()).hexdigest())
        report['live_qq_image_upload_tested']=current
        report['qq_delivery_probe']={'matches_current_export':current,'recipients':delivery['recipients'],
            'messages_sent':delivery['qqMessagesSent'],'group_messages_sent':delivery['groupMessagesSent'],
            'verified_stickers':[x['stickerId'] for x in delivery['results']],
            'evidence':delivery_file.relative_to(ROOT).as_posix()}
    native_file=ROOT/'validation/native-agent-activation-20261024.json'
    native_console=ROOT/'validation/native-agent-console-state.json'
    native_probe=ROOT/'validation/native-skills-probe-results.json'
    if all(p.exists()for p in [native_file,native_console,native_probe]):
        activation=json.loads(native_file.read_text(encoding='utf-8'))
        console=json.loads(native_console.read_text(encoding='utf-8'))
        probe=json.loads(native_probe.read_text(encoding='utf-8'))
        index=json.loads((exports/'native-skills.json').read_text(encoding='utf-8'))
        current=bool(activation['formalPresetSha256']==hashlib.sha256((exports/'arturia.yml').read_bytes()).hexdigest()
                     and {x['name']:x['sha256']for x in activation['skills']}=={x['name']:x['sha256']for x in index['skills']}
                     and console['nativeAgentConsoleAvailable']and probe['ok'])
        report['native_agent']={'matches_current_export':current,'version':activation['version'],
            'ui_route':console['route'],'loaded_skill_count':len(probe['loaded']),
            'model_tool_cases_passed':len(probe['modelChecks']),'test_preset_removed':activation['testPresetRemoved'],
            'chat_mode':activation['activeGroupChatMode'],
            'evidence':[p.relative_to(ROOT).as_posix()for p in [native_file,native_console,native_probe]]}
        if current:
            report['formal_preset_loaded']=True;report['production_role_switched']=True
            report['production_snapshot']={'matches_current_export':True,'selected_groups':activation['activeGroups'],
                'model':'openai-like/gpt-6-luna','chat_mode':'plugin','history_preserved':activation['historyUnchangedDuringTransaction'],
                'evidence':[native_file.relative_to(ROOT).as_posix()]}
    optimization_file=ROOT/'validation/natural-sticker-deployment-20261024.json'
    optimization_readback=ROOT/'validation/natural-sticker-live-readback.json'
    evaluation_file=ROOT/'validation/natural-sticker-candidate-v3.json'
    if all(p.exists()for p in [optimization_file,optimization_readback,evaluation_file]):
        deployment=json.loads(optimization_file.read_text(encoding='utf-8'))
        readback=json.loads(optimization_readback.read_text(encoding='utf-8'))
        evaluation=json.loads(evaluation_file.read_text(encoding='utf-8'))
        index=json.loads((exports/'native-skills.json').read_text(encoding='utf-8'))
        expected_modules={x['name']:x['sha256']for x in index['skills']}
        preset_hash=hashlib.sha256((exports/'arturia.yml').read_bytes()).hexdigest()
        current=bool(deployment['success']and deployment['formalPresetSha256']==preset_hash
                     and readback['presetSha256']==preset_hash and evaluation['hashes']['preset']==preset_hash
                     and evaluation['hashes']['modules']==expected_modules
                     and {x['name']:x['sha256']for x in readback['nativeAgent']['skills']}==expected_modules
                     and readback['manifestSha256']==hashlib.sha256((exports/'runtime-manifest.json').read_bytes()).hexdigest()
                     and readback['originalHistoryPreserved']and readback['nativeAgent']['nativeConsoleAvailable'])
        positives=[x for x in evaluation['modelChecks']if x['kind']=='positive']
        report['natural_sticker_optimization']={'matches_current_export':current,
            'model':evaluation['model'],'exact_positive_selections':sum(x['outcome']=='correct'for x in positives),
            'positive_samples':len(positives),'sample_limit':evaluation['sampleLimit'],
            'qq_messages_sent':deployment['syntheticQqMessagesSent'],
            'evidence':[p.relative_to(ROOT).as_posix()for p in [optimization_file,optimization_readback,evaluation_file]]}
        if current:
            report['formal_preset_loaded']=True;report['production_role_switched']=True
            report['production_snapshot']={'matches_current_export':True,'selected_groups':deployment['activeGroups'],
                'model':deployment['model'],'chat_mode':deployment['chatMode'],
                'history_preserved':readback['originalHistoryPreserved'],'restart_required':False,
                'preset_verification':readback['presetRuntimeVerification'],
                'evidence':[optimization_file.relative_to(ROOT).as_posix(),optimization_readback.relative_to(ROOT).as_posix()]}
            report['native_agent']={'matches_current_export':True,'version':'1.0.49',
                'ui_route':'/chatluna-agent','loaded_skill_count':len(readback['nativeAgent']['skills']),
                'test_preset_removed':not readback['testPresetLeft'],'chat_mode':deployment['chatMode'],
                'evidence':[optimization_readback.relative_to(ROOT).as_posix()]}
            report['behavior_validation']='natural utterance samples with native Skills and prompt pipeline; synthetic context, no QQ group delivery test'
    emotion_file=ROOT/'validation/group-emotion-deployment-20261024.json'
    emotion_readback=ROOT/'validation/group-emotion-live-readback.json'
    emotion_evaluation=ROOT/'validation/group-emotion-candidate.json'
    emotion_heldout=ROOT/'validation/group-emotion-heldout.json'
    if all(p.exists()for p in [emotion_file,emotion_readback,emotion_evaluation,emotion_heldout]):
        deployment=json.loads(emotion_file.read_text(encoding='utf-8'))
        readback=json.loads(emotion_readback.read_text(encoding='utf-8'))
        evaluation=json.loads(emotion_evaluation.read_text(encoding='utf-8'))
        heldout=json.loads(emotion_heldout.read_text(encoding='utf-8'))
        index=json.loads((exports/'native-skills.json').read_text(encoding='utf-8'))
        expected_modules={x['name']:x['sha256']for x in index['skills']}
        preset_hash=hashlib.sha256((exports/'arturia.yml').read_bytes()).hexdigest()
        current=bool(deployment['success']and evaluation['ok']and heldout['ok']
                     and deployment['formalPresetSha256']==preset_hash==readback['presetSha256']==evaluation['hashes']['preset']
                     and heldout['hashes']['preset']==preset_hash and heldout['hashes']['modules']==expected_modules
                     and evaluation['hashes']['modules']==expected_modules
                     and {x['name']:x['sha256']for x in readback['nativeAgent']['skills']}==expected_modules
                     and readback['manifestSha256']==hashlib.sha256((exports/'runtime-manifest.json').read_bytes()).hexdigest()
                     and readback['originalHistoryPreserved']and readback['nativeAgent']['nativeConsoleAvailable']
                     and not readback['testPresetLeft'])
        report['group_emotion_optimization']={'matches_current_export':current,'model':evaluation['model'],
            'summary':evaluation['summary'],'heldout_summary':heldout['summary'],'sample_limit':evaluation['sampleLimit'],
            'policy':'Ordinary selected replies default to one appropriate sticker; understood unwanted banter can use deadpan; genuine distress, exact format and opt-outs stay text-only',
            'qq_messages_sent':deployment['syntheticQqMessagesSent'],
            'evidence':[p.relative_to(ROOT).as_posix()for p in [emotion_file,emotion_readback,emotion_evaluation,emotion_heldout]]}
        if current:
            report['formal_preset_loaded']=True;report['production_role_switched']=True
            report['production_snapshot']={'matches_current_export':True,'selected_groups':deployment['activeGroups'],
                'model':deployment['model'],'chat_mode':deployment['chatMode'],
                'history_preserved':readback['originalHistoryPreserved'],
                'preset_verification':readback['presetRuntimeVerification'],
                'evidence':[emotion_file.relative_to(ROOT).as_posix(),emotion_readback.relative_to(ROOT).as_posix()]}
            report['native_agent']={'matches_current_export':True,'version':'1.0.49','ui_route':'/chatluna-agent',
                'loaded_skill_count':len(readback['nativeAgent']['skills']),'test_preset_removed':not readback['testPresetLeft'],
                'chat_mode':deployment['chatMode'],'evidence':[emotion_readback.relative_to(ROOT).as_posix()]}
            report['behavior_validation']='synthetic group banter, high-frequency image selection and true text-only exclusions through native Skills/prompt pipeline; private live replay is excluded from the repository'
    vision_deployment_file=ROOT/'validation/vision-input-deployment-20261024.json'
    vision_live_file=ROOT/'validation/vision-input-live-results-20261024.json'
    vision_combined_file=ROOT/'validation/vision-input-combined-results-20261024.json'
    if all(p.exists()for p in [vision_deployment_file,vision_live_file,vision_combined_file]):
        deployment=json.loads(vision_deployment_file.read_text(encoding='utf-8'))
        live=json.loads(vision_live_file.read_text(encoding='utf-8'))
        combined=json.loads(vision_combined_file.read_text(encoding='utf-8'))
        current=bool(deployment['ok']and live['ok']and combined['ok']and combined['combinedCheck']['passed']
                     and combined['combinedCheck']['formalPresetSha256']==hashlib.sha256((exports/'arturia.yml').read_bytes()).hexdigest()
                     and deployment['loadedPluginConfigurationReadBack']
                     and 'image_input'in deployment['loadedModel']['modelCapabilities'])
        report['vision_input']={'matches_current_export':current,'model':deployment['loadedModel']['model'],
            'loaded_plugin_configuration_read_back':deployment['loadedPluginConfigurationReadBack'],
            'direct_runtime_model_info_rpc_available':deployment['directRuntimeModelInfoRpcAvailable'],
            'gif_frames_sent':deployment['loadedMultimodal']['gifFrameCount'],
            'group_messages_sent':0,'scope':'loaded plugin configuration and active forks; installed native input/request pipeline plus synthetic model OCR and formal-preset reply; no live QQ group end-to-end test',
            'evidence':[p.relative_to(ROOT).as_posix()for p in [vision_deployment_file,vision_live_file,vision_combined_file]]}
    (target/'release.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8', newline='\n')
    print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':main()
