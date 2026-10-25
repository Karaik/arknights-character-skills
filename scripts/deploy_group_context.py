"""Install the local context plugin on the already-authorized txy deployment.

No live group IDs, secrets or chat content leave the server. The group scope is
copied from the existing sticker plugin. Only Koishi is restarted.
"""
from pathlib import Path
import base64
import hashlib
import io
import json
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'local/group-context-20261025'
OUT.mkdir(parents=True, exist_ok=True)
source = (ROOT / 'adapters/koishi/group-context.cjs').read_bytes()
manifest = (ROOT / 'adapters/koishi/group-context-package.json').read_bytes()
package = OUT / 'koishi-plugin-arturia-group-context-0.1.0.tgz'
with tarfile.open(package, 'w:gz') as archive:
    for name, data in [('package/group-context.cjs', source), ('package/package.json', manifest)]:
        info = tarfile.TarInfo(name)
        info.size = len(data)
        info.mode = 0o644
        archive.addfile(info, io.BytesIO(data))
payload = {'archive': base64.b64encode(package.read_bytes()).decode(),
           'sourceSha256': hashlib.sha256(source).hexdigest()}

REMOTE = r'''
from pathlib import Path
import base64, datetime, hashlib, json, os, re, subprocess, time, urllib.request
R=Path('/root/qqbot/koishi')
paths=[R/'koishi.yml',R/'package.json',R/'yarn.lock']
old={p:p.read_bytes() for p in paths}
protected=[R/'data/chathub/presets/arturia.yml',R/'data/chatluna/agents/config.json',R/'data/arturia/runtime/manifest.json']
protected_hash={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
archive=R/'.yarn/local-plugins/koishi-plugin-arturia-group-context-0.1.0.tgz'
assert not archive.exists(),'An existing context package needs separate upgrade handling'
archive.parent.mkdir(parents=True,exist_ok=True)
archive.write_bytes(base64.b64decode(PAYLOAD['archive']))
def run(args,timeout=120):
 p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
 if p.returncode:raise RuntimeError('Command failed: '+str(args[:6])+'\n'+p.stderr[-1800:]+'\n'+p.stdout[-1800:])
 return p.stdout
def node(script):return run(['docker','exec','-w','/koishi','koishi','node','-e',script])
def check_http():
 with urllib.request.urlopen('http://127.0.0.1:5140/',timeout=4)as response:return response.status
changed=False
try:
 print('Installing the local Koishi context plugin.',flush=True)
 run(['docker','exec','-e','YARN_ENABLE_SCRIPTS=false','-w','/koishi','koishi','yarn','add',
      'koishi-plugin-arturia-group-context@file:.yarn/local-plugins/koishi-plugin-arturia-group-context-0.1.0.tgz'],timeout=180)
 code=r"""
const fs=require('fs'),yaml=require('js-yaml'),crypto=require('crypto');
const file='/koishi/koishi.yml',text=fs.readFileSync(file,'utf8'),cfg=yaml.load(text);
function find(n,p){for(const[k,v]of Object.entries(n||{})){if(k.startsWith('~'))continue;if(k.startsWith(p))return v;if(v&&typeof v==='object'){const r=find(v,p);if(r)return r;}}}
const current=find(cfg.plugins,'arturia-reviewed-stickers:');
if(!current||current.allowedGuilds.length!==5)throw new Error('Unexpected existing group scope');
if(find(cfg.plugins,'arturia-group-context:'))throw new Error('Context plugin already configured');
const settings={enabled:true,allowedGuilds:current.allowedGuilds,maxMessages:40,maxAgeMinutes:30,maxMessageChars:500,maxContextChars:8000,maxContextTokens:4000,persistAcrossRestarts:true};
const match=text.match(/^(\s*)arturia-reviewed-stickers:arturiaskill:/m);if(!match)throw new Error('Plugin insertion point missing');
const indent=match[1],block=indent+'arturia-group-context:production:\n'+yaml.dump(settings,{lineWidth:-1}).split('\n').filter(Boolean).map(l=>indent+'  '+l).join('\n')+'\n';
const next=text.slice(0,match.index)+block+text.slice(match.index);const validated=yaml.load(next);
const actual=find(validated.plugins,'arturia-group-context:');if(JSON.stringify(actual)!==JSON.stringify(settings))throw new Error('Configuration validation failed');
fs.writeFileSync(file+'.group-context-tmp',next);fs.renameSync(file+'.group-context-tmp',file);
const plugin=require('koishi-plugin-arturia-group-context');plugin.Config(actual);
const digest=crypto.createHash('sha256').update(fs.readFileSync(require.resolve('koishi-plugin-arturia-group-context'))).digest('hex');
console.log(JSON.stringify({groupCount:actual.allowedGuilds.length,sourceSha256:digest,configured:true}));
"""
 assert (R/'koishi.yml').read_bytes()==old[R/'koishi.yml'],'Web configuration changed concurrently; abort'
 installed=json.loads(node(code));changed=True
 assert installed['sourceSha256']==PAYLOAD['sourceSha256']
 print('Restarting Koishi only.',flush=True)
 run(['docker','restart','koishi'],timeout=60)
 deadline=time.monotonic()+65
 while True:
  try:
   if check_http()==200:break
  except Exception:pass
  if time.monotonic()>deadline:raise RuntimeError('Koishi console did not become available')
  time.sleep(1)
 for p in protected:assert hashlib.sha256(p.read_bytes()).hexdigest()==protected_hash[str(p)],'Unrelated runtime content changed'
 state=json.loads(run(['docker','inspect','koishi','--format','{{json .State}}']))
 assert state['Running'] and not state['Restarting'] and not state['OOMKilled']
 result={'installedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
  'name':'arturia-group-context','version':'0.1.0','groupCount':installed['groupCount'],
  'sourceSha256':installed['sourceSha256'],'maxMessages':40,'maxAgeMinutes':30,
  'maxContextChars':8000,'maxContextTokens':4000,'persistAcrossRestarts':True,
  'consoleHTTP':200,'koishiRestarted':True,'presetAgentManifestUnchanged':True,
  'qqMessagesSent':0,'onlyKoishiRestartRequested':True}
 print(json.dumps(result,ensure_ascii=False),flush=True)
except Exception:
 for p,data in old.items():p.write_bytes(data)
 try:run(['docker','restart','koishi'],timeout=60)
 except Exception:pass
 print('Deployment failed; original Koishi configuration and dependency manifests restored.',flush=True)
 raise
'''

if '--apply' not in sys.argv:
    print(json.dumps({'prepared': True, 'sourceSha256': payload['sourceSha256'],
                      'package': str(package), 'requires': 'existing deployment authorization'}))
    raise SystemExit()
command = 'PAYLOAD=' + repr(payload) + '\n' + REMOTE
process = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=12',
                          'txyun-2h2g-gr', 'python3 -'], input=command.encode(),
                         capture_output=True, timeout=290)
stdout = process.stdout.decode('utf-8', 'replace')
print(stdout)
if process.returncode:
    print(process.stderr.decode('utf-8', 'replace'))
    raise SystemExit(process.returncode)
result = json.loads(stdout.strip().splitlines()[-1])
(ROOT / 'validation/group-context-deployment-20261025.json').write_text(
    json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
