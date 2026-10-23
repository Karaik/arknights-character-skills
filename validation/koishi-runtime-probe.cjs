// Runs in the Koishi container without a QQ adapter, paid model call or network send.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {Context,h}=require('koishi');
const plugin=require('koishi-plugin-arturia-reviewed-stickers');

(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'arturia-probe-'));
 const ctx=new Context();
 try{
  // Generated test pixel. It is not a collected candidate and is never connected to QQ.
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  fs.writeFileSync(path.join(root,'pixel.png'),bytes);
  const item={id:'local-probe',review:'approved',subject_scope:'generic',file:'pixel.png',sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  const manifest=path.join(root,'manifest.json');
  fs.writeFileSync(manifest,JSON.stringify({schema_version:1,stickers:[item]}));
  ctx.baseDir=root;
  ctx.plugin(plugin,{manifestPath:manifest,allowedGuilds:['isolated-local-test']});
  await ctx.start();
  const make=()=>({platform:'onebot',guildId:'isolated-local-test',elements:[h('quote',{id:'local-quote'}),h.text('[[sticker:local-probe]]')]});
  const first=make();await ctx.serial(first,'before-send',first,{});
  assert(first.elements.some(x=>x.type==='img'&&x.attrs.src.startsWith('data:image/png;base64,')));
  fs.writeFileSync(manifest,JSON.stringify({schema_version:1,stickers:[]}));
  const revoked=make();assert.equal(await ctx.serial(revoked,'before-send',revoked,{}),true);
  assert(!revoked.elements.some(x=>x.type==='img'));
  console.log(JSON.stringify({installedPlugin:'arturia-reviewed-stickers',pluginVersion:require('koishi-plugin-arturia-reviewed-stickers/package.json').version,koishi:require('koishi/package.json').version,
    actualContextHook:true,inlineImage:true,revocation:true,quoteOnlySuppressed:true,qqMessagesSent:0,networkAdapters:0}));
 }finally{
  await ctx.stop();
  fs.rmSync(root,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
