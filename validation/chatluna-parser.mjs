// CommonJS loader matches the Koishi server path; upstream's standalone ESM loader fails in this environment.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { loadPreset } = require('koishi-plugin-chatluna/llm-core/prompt');
const path = new URL('../build/arturia.yml', import.meta.url);
const preset = loadPreset(fs.readFileSync(path, 'utf8'));
for (const alias of ['塑心','阿尔图罗','图图','图图姐','香草榜第一']) {
  assert(preset.triggerKeyword.includes(alias));
}
assert(preset.messages.length >= 3);
assert(preset.loreBooks.items.length === 4);
assert(preset.authorsNote.content.includes('具体'));
console.log(JSON.stringify({chatluna:'1.4.2',aliases:preset.triggerKeyword,systemChars:preset.messages[0].content.length,loreModules:preset.loreBooks.items.length,authorsNote:preset.authorsNote.insertFrequency}));
