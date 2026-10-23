const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { h } = require('koishi');
const plugin = require('../adapters/koishi/stickers.cjs');

test('actual Koishi elements become inline images only in selected OneBot groups', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'arturia-hook-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const bytes=Buffer.from('png-fixture');fs.writeFileSync(path.join(root,'smile.png'),bytes);
  const sticker={id:'official-smile',file:'smile.png',review:'approved',sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({schema_version:1,stickers:[sticker]}));
  let hook;
  plugin.apply({baseDir:root,on(event,callback){assert.equal(event,'before-send');hook=callback;}},{manifestPath:'manifest.json',allowedGuilds:['test-group']});
  for(const [platform,guildId,changed] of [['onebot','test-group',true],['onebot','other-group',false],['discord','test-group',false]]){
    const session={platform,guildId,elements:[h('quote',{id:'quoted'}),h.text('好吧。[[sticker:official-smile]]')]};
    hook(session);
    assert.equal(session.elements.some(x=>x.type==='img'),changed);
    assert.equal(session.elements[0].type,'quote');
    if(changed)assert(session.elements.find(x=>x.type==='img').attrs.src.startsWith('data:image/png;base64,'));
  }
});

test('before-send cancels an image-only reply when its marker is unapproved', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'arturia-hook-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({schema_version:1,stickers:[]}));
  let hook;plugin.apply({baseDir:root,on(_e,cb){hook=cb;}},{manifestPath:'manifest.json',allowedGuilds:['test-group']});
  const session={platform:'onebot',guildId:'test-group',elements:[h.text('[[sticker:pending-image]]')]};
  assert.equal(hook(session),true);
  assert.deepEqual(session.elements,[]);
});
