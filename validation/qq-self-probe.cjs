// Exercise the installed renderer/hook/OneBot encoder, delivering only to
// the currently logged-in QQ account itself. A short-lived WebUI credential
// arrives on stdin; it is never written to the report or printed.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {Context,h}=require('koishi');
const {DefaultRenderer}=require('koishi-plugin-chatluna');
const {OneBotBot}=require('koishi-plugin-adapter-onebot');
const stickers=require('koishi-plugin-arturia-reviewed-stickers');
const WebSocket=require('ws');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
(async()=>{
 let input='';for await(const chunk of process.stdin)input+=chunk;
 const {credential,apiBase,output}=JSON.parse(input);assert(credential&&apiBase&&output);
 const root=path.dirname(output),runtime='/koishi/data/arturia/runtime';
 const manifest=JSON.parse(fs.readFileSync(path.join(runtime,'manifest.json')));
 const models=JSON.parse(fs.readFileSync(path.join(root,'seven-sticker-model-results.json')));
 const currentPreset=sha(fs.readFileSync('/koishi/data/chathub/presets/arturia.yml'));
 assert.equal(models.results.length,9);assert.equal(models.errors.length,0);
 const required=['nonempty','markerIdsApproved','expectedSticker','noImageExpected','pureApprovedGif','noGifForSeriousOrDirect','numericAnswer'];
 assert(models.results.every(r=>r.presetSha256===currentPreset&&required.every(key=>r.checks[key]!==false)));
 const report={date:new Date().toISOString(),success:false,method:'Configured-model replies through installed ChatLuna renderer, sticker hook and Koishi OneBot encoder; an authenticated NapCat debug WebSocket supplies the isolated transport; destination restricted to the logged-in bot itself.',
  presetSha256:currentPreset,manifestSha256:sha(fs.readFileSync(path.join(runtime,'manifest.json'))),
  recipients:'bot-self-only',groupMessagesSent:0,qqMessagesSent:0,results:[],errors:[]};
 const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 async function api(route,body){
  const response=await fetch(apiBase.replace(/\/$/,'')+route,{method:'POST',headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const value=await response.json();assert(response.ok&&value.code===0,'NapCat API failed: '+route+' code='+value.code+' '+String(value.message||value.msg||'').slice(0,240));return value.data;
 }
 let selfId,socket,debugToken,sequence=0;const pending=new Map();
 const allowed=new Set(['get_login_info','get_status','can_send_image','send_private_msg','get_msg']);
 async function request(action,params={}){
  assert(allowed.has(action),'Unapproved OneBot action');
  (report.attemptedActions??=[]).push(action);
  if(action==='send_private_msg'){
   assert(selfId&&String(params.user_id)===selfId,'Recipient must be bot self');
   assert(report.qqMessagesSent<2,'At most two self-test messages');
   assert(Array.isArray(params.message)&&params.message.filter(e=>e.type==='image').length===1,'One approved image per test');
  }
  const echo='arturia-self-'+(++sequence);
  const value=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(echo);reject(new Error('OneBot timeout: '+action))},30000);
   pending.set(echo,{resolve:value=>{clearTimeout(timer);resolve(value)},reject});
   socket.send(JSON.stringify({action,params,echo}));
  });
  assert.equal(value.status,'ok','OneBot rejected '+action+': '+String(value.message||value.wording||''));
  assert.equal(value.retcode,0,'OneBot failed '+action);
  if(action==='send_private_msg')report.qqMessagesSent++;
  return value;
 }
 const ctx=new Context();ctx.baseDir='/koishi';let botFork;
 try{
  const debug=await api('/Debug/create',{});debugToken=debug.token;assert(debugToken);
  const url=new URL(apiBase.replace(/^http/,'ws').replace(/\/$/,'')+'/Debug/ws');
  url.searchParams.set('adapterName',debug.adapterName);url.searchParams.set('token',debugToken);
  socket=new WebSocket(url);
  socket.on('message',bytes=>{try{const value=JSON.parse(bytes.toString());const entry=pending.get(value.echo);if(entry){pending.delete(value.echo);entry.resolve(value)}}catch{}});
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject)});
  const login=(await request('get_login_info')).data;selfId=String(login.user_id);assert(/^\d+$/.test(selfId));
  const status=(await request('get_status')).data;assert(status.online&&status.good);report.qqOnline=true;
  assert((await request('can_send_image')).data.yes);report.canSendImage=true;
  ctx.plugin(stickers,{manifestPath:path.join(runtime,'manifest.json'),allowedGuilds:['isolated-self-image-check']});
  // No protocol is selected, so this private test bot opens no adapter socket.
  let bot;
  botFork=ctx.plugin({name:'arturia-isolated-onebot-self-probe',apply(child){
   bot=new OneBotBot(child,{selfId,timeout:30000,advanced:{}});
   bot.internal._request=request;
  }});
  const renderer=new DefaultRenderer({scope:{isActive:false},inject(_names,callback){callback(this)}},{outputMode:'pure-text',splitMessage:'none'});
  await ctx.start();
  for(const name of ['puzzled','gif-only']){
   const sample=models.results.find(r=>r.case===name);assert(sample&&sample.checks.expectedSticker);
   const blocks=await renderer.render({content:sample.reply});
   const session={platform:'onebot',guildId:'isolated-self-image-check',elements:h.normalize(blocks.flatMap(x=>h.normalize(x.element)))};
   await ctx.serial(session,'before-send',session,{});
   const images=session.elements.filter(x=>x.type==='img');assert.equal(images.length,1);
   const bytes=Buffer.from(images[0].attrs.src.split(',')[1],'base64');const item=manifest.stickers.find(x=>x.sha256===sha(bytes));assert(item);
   const ids=await bot.sendPrivateMessage(selfId,session.elements);assert.equal(ids.length,1);
   const received=(await request('get_msg',{message_id:ids[0]})).data;
   assert.equal(received.message_type,'private');assert.equal(String(received.sender.user_id),selfId);
   assert(Array.isArray(received.message)&&received.message.some(x=>x.type==='image'));
   report.results.push({case:name,stickerId:item.id,sha256:item.sha256,actualOneBotEncoder:true,selfRecipientVerified:true,messageIdReturned:true,readbackImageVerified:true});save();
  }
  assert.equal(report.qqMessagesSent,2);report.success=true;
 }catch(error){
  let message=String(error.message);for(const secret of [credential,debugToken].filter(Boolean))message=message.split(secret).join('[redacted]');
  report.errors.push({name:error.name,message:message.replace(/\b\d{7,}\b/g,'[redacted-id]').slice(0,700)});
  process.exitCode=1;
 }finally{
  if(botFork)await botFork.dispose();
  if(socket)socket.close();
  await ctx.stop();save();console.log(JSON.stringify(report));
 }
})().catch(e=>{console.error(JSON.stringify({failed:true,error:e.name}));process.exitCode=1});
