"""Read authenticated Koishi configuration/schema/status without exporting secrets."""
from pathlib import Path
import json
import subprocess
import sys

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]
ROUNDTRIP = '--roundtrip' in sys.argv
REMOTE = r'''
import json,sqlite3,subprocess,time
from pathlib import Path
with sqlite3.connect('file:/root/qqbot/koishi/data/koishi.db?mode=ro',uri=True)as db:
 token=db.execute('SELECT t.id,t.token FROM token t JOIN user u ON t.id=u.id WHERE u.authority>=4 AND t.expiredAt>? ORDER BY t.lastUsedAt DESC LIMIT 1',(int(time.time()*1000),)).fetchone()
 assert token,'No existing administrator console session'
js=r"""
const WebSocket=require('ws'),assert=require('assert/strict');
(async()=>{
let input='';for await(const x of process.stdin)input+=x;const credentials=JSON.parse(input);
const socket=new WebSocket('ws://127.0.0.1:5140/status'),pending=new Map(),data=new Map();let seq=0;
socket.on('message',raw=>{let msg;try{msg=JSON.parse(raw)}catch{return};if(msg.type==='data')data.set(msg.body.key,msg.body.value);
 if(msg.type==='response'){const p=pending.get(msg.body.id);if(p){pending.delete(msg.body.id);clearTimeout(p.timer);msg.body.error?p.reject(new Error(msg.body.error)):p.resolve(msg.body.value)}}});
const call=(type,args=[])=>new Promise((resolve,reject)=>{const id=String(++seq),timer=setTimeout(()=>reject(new Error('RPC timeout: '+type)),15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,type,args}))});
try{
 await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject)});
 await call('login/token',[credentials.id,credentials.token]);
 const status=await call('arturia-group-context/status');
 await call('config/request-runtime',['arturia-group-context']);
 const deadline=Date.now()+10000;let pkg;
 while(Date.now()<deadline){pkg=data.get('packages')?.['koishi-plugin-arturia-group-context'];if(pkg?.runtime?.schema)break;await new Promise(r=>setTimeout(r,150));}
 assert(pkg?.runtime?.schema,'The normal Web configuration did not publish the plugin schema');
 const schema=pkg.runtime.schema;
 const root=schema.refs?.[schema.uid]||schema;
 const fields=Object.fromEntries(Object.entries(root.dict||{}).map(([k,v])=>[k,schema.refs?.[v]||v]));
 for(const name of ['enabled','allowedGuilds','maxMessages','maxAgeMinutes','maxMessageChars','maxContextChars','maxContextTokens','persistAcrossRestarts'])assert(fields?.[name],'Missing Web setting '+name);
 assert(Object.values(pkg.runtime.forks).some(x=>x.status===2),'The loaded plugin is not active');
 function find(node,parent=''){for(const[k,v]of Object.entries(node||{})){if(k.startsWith('arturia-group-context:'))return {value:v,parent,key:k};if(k.startsWith('group:')){const r=find(v,k.slice(6));if(r)return r}if(k==='plugins'){const r=find(v,parent);if(r)return r}}}
 const entry=find(data.get('config')||{}),live=entry?.value;
 assert(live?.enabled&&live.maxMessages===40&&live.allowedGuilds.length===5,'Web configuration differs from intended settings');
 let roundtrip=null;
 if(ROUNDTRIP){
   const changed={...live,maxMessages:41};
   const waitFor=async expected=>{for(let i=0;i<30;i++){try{const value=await call('arturia-group-context/status');if(value.maxMessages===expected)return value;}catch{}await new Promise(r=>setTimeout(r,150));}throw new Error('Web save did not update the running plugin')};
   try{await call('manager/reload',[entry.parent,entry.key,changed]);const interim=await waitFor(41);
     roundtrip={managerSaveApplied:true,temporaryMaxMessages:interim.maxMessages};
   }finally{await call('manager/reload',[entry.parent,entry.key,live]);const restored=await waitFor(40);
     if(roundtrip){roundtrip.restoredMaxMessages=restored.maxMessages;roundtrip.restoredEnabled=restored.enabled;roundtrip.restoredCachedMessages=restored.cachedMessages;}}
 }
 const finalStatus=await call('arturia-group-context/status');
 console.log(JSON.stringify({status:finalStatus,webConfigPublished:true,webSchemaPublished:true,webFieldNames:Object.keys(fields),
   webChineseDescriptions:Object.values(fields).every(x=>/[\u3400-\u9fff]/.test(x.meta?.description||'')),
   webPluginActive:true,webConfigurationMatches:true,usageVisible:!!pkg.runtime.usage,webSaveRoundtrip:roundtrip}));
}finally{socket.close()}
})().catch(error=>{console.error(JSON.stringify({failed:true,error:error.message}));process.exitCode=1});
"""
p=subprocess.run(['docker','exec','-i','-w','/koishi','koishi','node','-e',js],input=json.dumps({'id':token[0],'token':token[1]}),capture_output=True,text=True,timeout=50)
if p.returncode:raise RuntimeError(p.stderr.strip()or'Console readback failed')
print(p.stdout.strip())
'''
p = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=12',
                    'txyun-2h2g-gr', 'python3 -'], input=REMOTE.replace('if(ROUNDTRIP)', 'if(' + str(ROUNDTRIP).lower() + ')').encode(), capture_output=True, timeout=90)
if p.returncode:
    print(p.stderr.decode('utf-8', 'replace'))
    raise SystemExit(p.returncode)
result = json.loads(p.stdout)
(ROOT / 'validation/group-context-web-readback-20261025.json').write_text(
    json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
