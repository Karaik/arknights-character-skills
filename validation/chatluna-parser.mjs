// CommonJS loader matches the Koishi server path; upstream's standalone ESM loader fails in this environment.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { loadPreset } = require('koishi-plugin-chatluna/llm-core/prompt');
const path = new URL('../build/arturia.yml', import.meta.url);
const source = fs.readFileSync(path, 'utf8');
const preset = loadPreset(source);
for (const alias of ['塑心','阿尔图罗','图图','图图姐','香草榜第一']) {
  assert(preset.triggerKeyword.includes(alias));
}
assert(preset.messages.length >= 3);
const profile=JSON.parse(fs.readFileSync(new URL('../profiles/arturia.json',import.meta.url),'utf8'));
assert(preset.loreBooks.items.length === (profile.runtime==='chatluna-agent'?0:4));
if(profile.runtime==='chatluna-agent')assert(preset.messages[0].content.includes('原生 skill 工具'));
assert.equal(preset.authorsNote.content, require('js-yaml').load(source).authors_note.content);
assert.equal(preset.authorsNote.insertDepth, 0);
assert.equal(preset.authorsNote.insertFrequency, 1);
console.log(JSON.stringify({chatluna:'1.4.2',aliases:preset.triggerKeyword,systemChars:preset.messages[0].content.length,loreModules:preset.loreBooks.items.length,authorsNote:preset.authorsNote.insertFrequency}));
