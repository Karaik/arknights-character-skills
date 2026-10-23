// Run inside the existing Koishi container. It reads its configured enabled
// provider in memory; credentials and private preset text are never exported.
// This probes the parsed preset + literal keyword lore + real renderer/hook.
// It is not a full running ChatLuna conversation or a QQ delivery test.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseArgs } = require('node:util');
const yaml = require('js-yaml');
const { Context, h } = require('koishi');
const { loadPreset } = require('koishi-plugin-chatluna/llm-core/prompt');
const { DefaultRenderer } = require('koishi-plugin-chatluna');
const plugin = require('koishi-plugin-arturia-reviewed-stickers');

const { values: args } = parseArgs({ options: {
  config: { type: 'string', default: '/koishi/koishi.yml' },
  preset: { type: 'string' }, baseline: { type: 'string' },
  manifest: { type: 'string' }, cases: { type: 'string' },
  model: { type: 'string' }, output: { type: 'string' },
  'skip-baseline': { type: 'boolean', default: false },
} });
for (const key of ['preset', 'baseline', 'manifest', 'cases', 'model', 'output']) {
  if (!args[key]) throw new Error('Missing --' + key);
}
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const config = yaml.load(fs.readFileSync(args.config, 'utf8'));
const adapters = [];
function findAdapters(node) {
  if (!node || typeof node !== 'object') return;
  for (const [name, value] of Object.entries(node)) {
    if (name.startsWith('~')) continue;
    if (name.startsWith('chatluna-openai-like-adapter:')) adapters.push(value);
    else if (value && typeof value === 'object') findAdapters(value);
  }
}
findAdapters(config.plugins);
const routes = adapters.flatMap(x => x.apiKeys || []).filter(x => x[2] !== false);
if (routes.length !== 1) throw new Error('Probe requires exactly one enabled configured provider');
const [credential, endpoint] = routes[0];
const cases = JSON.parse(fs.readFileSync(args.cases, 'utf8')).cases;
const manifest = JSON.parse(fs.readFileSync(args.manifest, 'utf8'));
const validIds = new Set(manifest.stickers.map(x => x.id));
const variants = (args['skip-baseline'] ? ['preset'] : ['baseline', 'preset']).map(key => {
  const bytes = fs.readFileSync(args[key]);
  return { variant: key === 'preset' ? 'modular' : 'baseline', hash: sha(bytes), parsed: loadPreset(bytes.toString('utf8')) };
});
const report = {
  date: new Date().toISOString(), model: args.model,
  method: 'Real configured provider calls; actual ChatLuna parser and pure-text renderer; installed Koishi before-send hook in isolated Context. Lore uses literal keyword matches for these exported entries. No private history, no live conversation mutation, no QQ adapter.',
  samplesPerCasePerVariant: 1, apiCalls: 0, qqMessagesSent: 0,
  errors: [], results: [],
};
const save = () => fs.writeFileSync(args.output, JSON.stringify(report, null, 2) + '\n');
function publicText(value) {
  return String(value || '').split(credential).join('[redacted]').replace(/\b\d{7,}\b/g, '[redacted-id]');
}
function messagesFor(preset, input) {
  const roles = { human: 'user', ai: 'assistant', system: 'system' };
  const messages = preset.messages.map(message => ({
    role: roles[message.getType?.() || message._getType?.()] || message.role || 'system',
    content: String(message.content),
  }));
  const matched = (preset.loreBooks?.items || []).filter(item => item.enabled !== false &&
    (item.constant || item.keywords.some(keyword => typeof keyword === 'string' && input.includes(keyword))));
  if (matched.length) messages.push({ role: 'user', content: matched.map(x => x.content).join('\n\n') });
  if (preset.authorsNote?.content) messages.push({ role: 'system', content: preset.authorsNote.content });
  messages.push({ role: 'user', content: input });
  return { messages, loreCount: matched.length };
}

(async () => {
  const ctx = new Context();
  ctx.baseDir = path.dirname(args.manifest);
  ctx.plugin(plugin, { manifestPath: args.manifest, allowedGuilds: ['isolated-arturia-probe'] });
  const renderer = new DefaultRenderer({ scope: { isActive: false }, inject(_names, callback) { callback(this); } },
    { outputMode: 'pure-text', splitMessage: 'none' });
  await ctx.start();
  try {
    for (const variant of variants) {
      for (const item of cases) {
        const started = Date.now();
        const { messages, loreCount } = messagesFor(variant.parsed, item.input);
        const response = await fetch(endpoint.replace(/\/$/, '') + '/chat/completions', {
          method: 'POST', headers: { Authorization: 'Bearer ' + credential, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: args.model, messages, max_tokens: 1024 }),
          signal: AbortSignal.timeout(60000),
        });
        report.apiCalls++;
        const payload = await response.json();
        if (!response.ok) {
          report.errors.push({ variant: variant.variant, case: item.id, http: response.status,
            type: payload.error?.type, code: payload.error?.code });
          save(); throw new Error('Configured model request failed: HTTP ' + response.status);
        }
        const content = payload.choices?.[0]?.message?.content || '';
        const markers = [...content.matchAll(/\[\[sticker:([^\]]+)\]\]/g)].map(x => x[1]);
        const blocks = await renderer.render({ content });
        const session = { platform: 'onebot', guildId: 'isolated-arturia-probe',
          elements: h.normalize(blocks.flatMap(x => h.normalize(x.element))) };
        await ctx.serial(session, 'before-send', session, {});
        const images = session.elements.filter(x => x.type === 'img');
        const imageChecks = images.map(image => {
          const match = /^data:([^;]+);base64,(.*)$/.exec(image.attrs.src || '');
          if (!match) return { inline: false };
          const bytes = Buffer.from(match[2], 'base64');
          const approved = manifest.stickers.find(x => x.sha256 === sha(bytes));
          return { mime: match[1], bytes: bytes.length, sha256: sha(bytes),
            matchesApprovedImage: !!approved, stickerId: approved?.id };
        });
        const result = { variant: variant.variant, presetSha256: variant.hash,
          case: item.id, input: item.input, reply: publicText(content), elapsedMs: Date.now() - started,
          matchedLoreModules: loreCount, finishReason: payload.choices?.[0]?.finish_reason,
          usage: payload.usage, markers, imageCount: images.length, imageChecks,
          checks: { nonempty: !!content.trim(), actionBeat: /[（【][^）】]+[）】]/.test(content),
            markerIdsApproved: markers.every(id => validIds.has(id)),
            expectedSticker: item.expectedSticker ? markers.length === 1 && markers[0] === item.expectedSticker && images.length === 1 : undefined,
            noImageExpected: item.expectNoImage ? markers.length === 0 && images.length === 0 : undefined,
            pureApprovedGif: item.id === 'gif-only' ? content.trim() === '[[sticker:arturia-sway-01]]' && images.length === 1 : undefined,
            noGifForSeriousOrDirect: ['comfort', 'direct-answer'].includes(item.id) ? images.length === 0 : undefined,
            numericAnswer: item.id === 'direct-answer' ? content.trim() === '391' : undefined } };
        report.results.push(result); save();
        console.log(JSON.stringify({ variant: result.variant, case: item.id, chars: content.length,
          imageCount: images.length, elapsedMs: result.elapsedMs }));
      }
    }
  } finally { await ctx.stop(); save(); }
})().catch(error => {
  report.errors.push({ error: error.name, message: publicText(error.message) }); save();
  console.error(JSON.stringify({ probeFailed: true, error: error.name })); process.exitCode = 1;
});
