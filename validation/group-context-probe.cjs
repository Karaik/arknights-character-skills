#!/usr/bin/env node
'use strict';

// Pipe this file to `docker exec -i -w /koishi koishi node - --model`.
// Default: synthetic pipeline assertions only. --model: exactly two requests,
// no retry, using the sole enabled provider configured in memory.
// No live Context, database, QQ adapter, history write, or test preset is used.
// This exercises installed core stages + the group-context middleware, not
// the live native-Agent tool loop, wake-up router, or QQ delivery pipeline.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { parseArgs } = require('node:util');

const started = Date.now();
let args, credential = '', endpoint = '', emitted = false;
const syntheticIds = new Set();
const report = {
  status: 'running', mode: 'pipeline-only', apiCalls: 0, qqMessagesSent: 0,
  realHistoryRead: false, realHistoryWritten: false, testPresetCreated: false,
  method: 'Installed ChatLuna parser, template renderer, core prompt stages and group-context createContextMiddleware; isolated synthetic cache.',
  limits: 'No live wake-up routing, native-Agent tool execution, QQ delivery or provider-tokenizer validation; token counting uses a deterministic UTF-8 byte estimate.',
  pipeline: [], results: [], pass: false,
};

function check(condition, code) {
  if (!condition) { const error = new Error(code); error.probeCode = code; throw error; }
}
function publicText(value) {
  let text = String(value ?? '');
  for (const secret of [credential, endpoint, ...syntheticIds]) {
    if (secret) text = text.split(secret).join('[redacted]');
  }
  return text.replace(/https?:\/\/[^\s<>"']+/gi, '[redacted-url]')
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]+\b/g, '[redacted-key]')
    .replace(/\b\d{7,}\b/g, '[redacted-id]').slice(0, 4000);
}
function finish() {
  if (emitted) return;
  emitted = true;
  report.elapsedMs = Date.now() - started;
  const json = JSON.stringify(report, null, 2) + '\n';
  if (args?.output) {
    try { fs.writeFileSync(args.output, json, { encoding: 'utf8', flag: 'wx', mode: 0o600 }); }
    catch { report.outputWriteFailed = true; report.pass = false; report.status = 'failed'; }
  }
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (!report.pass) process.exitCode = 1;
}
const watchdog = setTimeout(() => {
  report.status = 'failed'; report.error = 'probe_deadline_exceeded'; report.pass = false;
  finish(); process.exit(1);
}, 89000);
watchdog.unref();

function nonce() {
  return '贴纸-' + [...crypto.randomBytes(10)].map(x => String.fromCharCode(65 + x % 26)).join('');
}
function collectProviders(node, result = []) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return result;
  for (const [name, value] of Object.entries(node)) {
    if (name.startsWith('~')) continue;
    if (/^chatluna-openai-like-adapter(?::|$)/.test(name)) {
      if (value?.enabled === false || value?.$disabled === true) continue;
      for (const route of value?.apiKeys || []) {
        if (Array.isArray(route) && route[2] !== false) result.push(route);
      }
    } else collectProviders(value, result);
  }
  return result;
}

async function main() {
  ({ values: args } = parseArgs({ options: {
    root: { type: 'string', default: '/koishi' },
    preset: { type: 'string' }, config: { type: 'string' },
    model: { type: 'boolean', default: false },
    'model-name': { type: 'string', default: 'gpt-6-luna' },
    output: { type: 'string' },
    // Explicit source-file mode permits local CPU assertions without installing
    // another package. Production runs omit this and load the installed plugin.
    'plugin-file': { type: 'string' },
  } }));
  report.mode = args.model ? 'two-synthetic-model-requests' : 'pipeline-only';
  const runtimeRoot = path.resolve(args.root);
  const req = createRequire(path.join(runtimeRoot, 'package.json'));
  const { Logger, h } = req('koishi');
  Logger.levels.base = 0;
  req('koishi-plugin-chatluna'); // Initialise the package's supported CJS cycles.
  const coreReq = createRequire(req.resolve('koishi-plugin-chatluna'));
  const promptApi = coreReq('koishi-plugin-chatluna/llm-core/prompt');
  const { ChatLunaPromptRenderService } = coreReq('koishi-plugin-chatluna/services/chat');
  const { HumanMessage, AIMessage, ToolMessage } = coreReq('@langchain/core/messages');
  const pluginFile = args['plugin-file'] ? path.resolve(args['plugin-file'])
    : req.resolve('koishi-plugin-arturia-group-context');
  const plugin = req(pluginFile);
  check(typeof plugin.GroupContextCache === 'function' && typeof plugin.createContextMiddleware === 'function', 'plugin_interface_missing');
  report.pluginSource = args['plugin-file'] ? 'explicit-source-file' : 'installed-package';
  report.pluginSha256 = crypto.createHash('sha256').update(fs.readFileSync(pluginFile)).digest('hex');

  const presetFile = args.preset ? path.resolve(args.preset)
    : path.join(runtimeRoot, 'data/chathub/presets/arturia.yml');
  const presetBytes = fs.readFileSync(presetFile);
  const preset = promptApi.loadPreset(presetBytes.toString('utf8'));
  report.formalPresetSha256 = crypto.createHash('sha256').update(presetBytes).digest('hex');
  check(preset.authorsNote?.content && preset.authorsNote.insertFrequency === 1, 'formal_authors_note_missing');
  check(preset.formatUserPromptString === '用户{sender}（ID:{sender_id}）说：{prompt}', 'formal_sender_format_changed');
  const renderer = new ChatLunaPromptRenderService();
  const targetGroup = 'synthetic-target-' + crypto.randomUUID();
  const decoyGroup = 'synthetic-decoy-' + crypto.randomUUID();
  const bot = 'synthetic-bot-' + crypto.randomUUID();
  const doctors = { a: 'synthetic-doctor-a-' + crypto.randomUUID(), b: 'synthetic-doctor-b-' + crypto.randomUUID() };
  for (const id of [targetGroup, decoyGroup, bot, ...Object.values(doctors)]) syntheticIds.add(id);
  const config = plugin.Config({ enabled: true, allowedGuilds: [targetGroup, decoyGroup],
    maxMessages: 40, maxAgeMinutes: 30, maxMessageChars: 500,
    maxContextChars: 8000, maxContextTokens: 4000, persistAcrossRestarts: false });
  const now = Date.now(), base = now - 60000;
  function session(index, who, text, group = targetGroup) {
    return { platform: 'onebot', selfId: bot, guildId: group, channelId: group,
      isDirect: false, userId: doctors[who], username: who === 'a' ? '博士甲' : '博士乙',
      author: { name: who === 'a' ? '博士甲' : '博士乙' },
      messageId: `synthetic-message-${group}-${index}`, timestamp: base + index * 100,
      content: text, elements: [h.text(text)] };
  }

  const cases = [
    { id: 'ten-ordinary-then-eleventh-wake', who: 'a', expectedLocker: 5,
      marker: nonce(), otherMarker: nonce(), decoyMarker: nonce() },
    { id: 'two-senders-and-cross-group-decoy', who: 'b', expectedLocker: 9,
      marker: nonce(), otherMarker: nonce(), decoyMarker: nonce() },
  ];
  const prepared = [];
  for (const test of cases) {
    const cache = new plugin.GroupContextCache(config, () => now);
    const injected = [];
    const cm = new promptApi.ChatLunaContextManagerService({ on() {} });
    promptApi.registerSystemPromptsMiddleware(cm);
    cm.pipeline('after_system_prompts', plugin.createContextMiddleware(cache, config, info => injected.push(info)), -10);
    promptApi.registerChatHistoryMiddleware(cm);
    promptApi.registerLongHistoryMiddleware(cm);
    promptApi.registerInjectionsMiddleware(cm);
    promptApi.registerAuthorsNoteMiddleware(cm);
    promptApi.registerAfterUserMessageMiddleware(cm);
    const first = test.who === 'a'
      ? `我的红色雨伞放在五号柜，伞上的识别贴纸是${test.marker}。`
      : `我的红色雨伞放在五号柜，伞上的识别贴纸是${test.otherMarker}。`;
    const second = test.who === 'a'
      ? `我的蓝色背包放在二号柜，背包上的识别贴纸是${test.otherMarker}。`
      : `我的绿色雨伞放在九号柜，伞上的识别贴纸是${test.marker}。`;
    const ordinary = [first, second, '今天走廊很安静。', '窗外刚才下了一点雨。',
      '等会儿我去接杯水。', '我先把书合上。', '桌上还有两张便签。',
      '晚饭之后想散散步。', '墙上的钟慢了一分钟。', '我把窗户关好了。'];
    for (let i = 0; i < ordinary.length; i++) cache.observe(session(i + 1, i % 2 ? 'b' : 'a', ordinary[i]));
    if (test.who === 'b') {
      cache.observe(session(10, 'b', `我的绿色雨伞在一号柜，识别贴纸是${test.decoyMarker}。`, decoyGroup));
      cache.observe(session(10, 'a', '另一个群的人都在楼上。', decoyGroup));
    }
    check(injected.length === 0 && report.apiCalls === 0, 'ordinary_messages_invoked_pipeline_or_api');
    const question = '图图，我刚才的伞在哪里？也告诉我伞上的识别贴纸。';
    const wake = session(11, test.who, question);
    cache.observe(wake);
    const configurable = { session: wake, agentContext: { kind: 'main',
      requestId: 'synthetic-request-' + test.id, conversationId: 'synthetic-conversation-' + test.id } };
    const variables = { authors_note: preset.authorsNote, sender: wake.username,
      sender_id: wake.userId, prompt: question };
    const formatted = await renderer.renderTemplate(preset.formatUserPromptString, variables, { configurable });
    const input = new HumanMessage({ content: formatted.text, name: wake.username, id: wake.userId });
    const history = [new HumanMessage('合成的上一轮问候：早上好。'), new AIMessage('早上好。')];
    const runtime = (scratchpad) => ({ result: [], variables: { ...variables }, configurable,
      input, chatHistory: history, agentScratchpad: scratchpad, documents: [], usedTokens: 0,
      sendTokenLimit: 100000, tokenCounter: async text => Math.ceil(Buffer.byteLength(text, 'utf8') / 4),
      preset, promptRenderService: renderer });
    const initial = runtime(); await cm.runPipeline(initial);
    const blocks = initial.result.filter(m => m.additional_kwargs?.arturia_group_context);
    check(blocks.length === 1, 'background_block_count');
    const rows = JSON.parse(blocks[0].content.slice(blocks[0].content.indexOf('\n') + 1));
    check(rows.length === 10 && blocks[0].additional_kwargs.messageCount === 10, 'ten_prior_messages_missing');
    check(rows[0].userId === doctors.a && rows[1].userId === doctors.b, 'sender_identity_mismatch');
    check(rows.every((r, i) => r.text === ordinary[i]), 'prior_message_order_or_text_changed');
    check(!blocks[0].content.includes(question), 'current_input_duplicated_in_background');
    check(!initial.result.some(m => String(m.content).includes(test.decoyMarker)), 'cross_group_context_leaked');
    check(initial.result.filter(m => m === input).length === 1 && initial.result.at(-1) === input, 'current_input_not_unique_or_last');
    check(history.every(m => initial.result.includes(m)), 'formal_history_changed');
    const note = await renderer.renderTemplate(preset.authorsNote.content, variables, { configurable });
    check(initial.result.filter(m => m.content === note.text).length === 1, 'formal_authors_note_missing_or_repeated');

    cache.observe(session(12, 'a', '这条消息在唤醒后到达，不能改变已开始的请求。'));
    const continued = runtime([new AIMessage({ content: '', tool_calls: [{ name: 'skill', args: { name: 'arturia' }, id: 'synthetic-tool-call' }] }),
      new ToolMessage({ content: '合成工具结果，没有执行实际工具。', tool_call_id: 'synthetic-tool-call' })]);
    await cm.runPipeline(continued);
    const repeated = continued.result.filter(m => m.additional_kwargs?.arturia_group_context);
    check(repeated.length === 1 && repeated[0].content === blocks[0].content, 'tool_round_snapshot_changed_or_duplicated');
    report.pipeline.push({ case: test.id, status: 'passed', pass: true, refsCount: rows.length,
      senderSeparation: true, crossGroupDecoyExcluded: true, currentInputOnce: true,
      formalHistoryPreserved: true, authorsNoteOnce: true, toolRoundFrozenSnapshotOnce: true,
      modelCallsDuringOrdinaryMessages: 0 });
    prepared.push({ test, messages: initial.result.map(m => ({ role: { human: 'user', ai: 'assistant', system: 'system' }[m.getType()], content: String(m.content) })) });
  }

  if (args.model) {
    const yaml = req('js-yaml');
    const liveConfig = yaml.load(fs.readFileSync(args.config || path.join(runtimeRoot, 'koishi.yml'), 'utf8'));
    const routes = collectProviders(liveConfig.plugins);
    check(routes.length === 1, 'enabled_provider_count_not_one');
    [credential, endpoint] = routes[0];
    check(typeof credential === 'string' && credential.length > 0 && typeof endpoint === 'string', 'invalid_provider_configuration');
    check(/^https?:\/\//.test(endpoint), 'invalid_provider_endpoint');
    // Both synthetic cases are prepared before either API request is made.
    report.results = await Promise.all(prepared.map(async ({ test, messages }) => {
      report.apiCalls++;
      const result = { case: test.id, status: 'failed', refsCount: 10, pass: false };
      try {
        const remaining = 80000 - (Date.now() - started);
        check(remaining > 0, 'request_deadline_exceeded');
        const response = await fetch(endpoint.replace(/\/$/, '') + '/chat/completions', {
          method: 'POST', headers: { Authorization: 'Bearer ' + credential, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: args['model-name'], messages, max_tokens: 700 }),
          signal: AbortSignal.timeout(remaining),
        });
        if (!response.ok) { result.status = 'http_error'; result.httpStatus = response.status; return result; }
        const payload = await response.json();
        const answer = payload.choices?.[0]?.message?.content;
        if (typeof answer !== 'string' || !answer.trim()) { result.status = 'empty_response'; return result; }
        const locker = test.expectedLocker === 5 ? /(?:五|5)\s*(?:号|號)?\s*(?:储物)?柜/ : /(?:九|9)\s*(?:号|號)?\s*(?:储物)?柜/;
        const wrongLocker = test.expectedLocker === 5 ? /(?:二|2)\s*(?:号|號)\s*柜/ : /(?:一|1|五|5)\s*(?:号|號)\s*柜/;
        result.checks = { correctLocker: locker.test(answer), correctSyntheticMarker: answer.includes(test.marker),
          noOtherSenderOrGroupMarker: !answer.includes(test.otherMarker) && !answer.includes(test.decoyMarker),
          noWrongLocker: !wrongLocker.test(answer) };
        result.response = publicText(answer);
        result.pass = Object.values(result.checks).every(Boolean);
        result.status = result.pass ? 'passed' : 'semantic_mismatch';
        return result;
      } catch (error) {
        result.status = ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'request_error';
        return result;
      }
    }));
    check(report.apiCalls === 2, 'model_request_count_not_two');
  }
  report.pass = report.pipeline.length === 2 && report.pipeline.every(x => x.pass)
    && (!args.model || report.results.length === 2 && report.results.every(x => x.pass));
  report.status = report.pass ? 'passed' : 'failed';
}

main().catch(error => {
  report.status = 'failed'; report.pass = false;
  report.error = error.probeCode || (error.code === 'MODULE_NOT_FOUND' ? 'installed_dependency_missing' : 'probe_setup_or_pipeline_failed');
}).finally(() => { clearTimeout(watchdog); finish(); });
