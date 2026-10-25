'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { h } = require('koishi');
const filename = path.join(__dirname, '../adapters/koishi/group-context.cjs');
const plugin = fs.existsSync(filename) ? require(filename) : {};
const promptApi = require('koishi-plugin-chatluna/llm-core/prompt');
const { HumanMessage, AIMessage, ToolMessage, SystemMessage } = require('@langchain/core/messages');

function message(i, overrides = {}) {
  return { platform: 'onebot', selfId: 'bot-a', guildId: 'group-a', channelId: 'group-a',
    userId: `doctor-${i % 2}`, username: `博士${i % 2}`, messageId: String(i),
    timestamp: Date.now(), elements: [h.text(`普通消息${i}`)], ...overrides };
}
function makeRuntime(session, overrides = {}) {
  return { result: [new SystemMessage('角色设定')], variables: {}, configurable: { session,
    agentContext: { kind: 'main', conversationId: 'conversation-a', requestId: 'request-a' } },
    input: new HumanMessage('图图，接着刚才的话说。'), chatHistory: [], usedTokens: 30,
    sendTokenLimit: 16000, tokenCounter: async text => Math.ceil(text.length / 3), ...overrides };
}
function makeManager() {
  const manager = new promptApi.ChatLunaContextManagerService({ on() {} });
  promptApi.registerChatHistoryMiddleware(manager);
  promptApi.registerInjectionsMiddleware(manager);
  return manager;
}

test('ten unaddressed group messages are available when the eleventh message invokes the bot', () => {
  assert.equal(typeof plugin.GroupContextCache, 'function', 'A passive group context cache must exist');
  const cache = new plugin.GroupContextCache({ allowedGuilds: ['group-a'] });
  const base = Date.now();
  for (let i = 1; i <= 11; i++) cache.observe({
    platform: 'onebot', selfId: 'bot-a', guildId: 'group-a', channelId: 'group-a',
    userId: 'doctor-a', username: '博士甲', messageId: String(i), timestamp: base + i,
    content: i === 11 ? '图图，刚才说的是什么？' : `第${i}句普通群聊`,
    elements: [h.text(i === 11 ? '图图，刚才说的是什么？' : `第${i}句普通群聊`)],
  });
  const messages = cache.snapshot({ platform: 'onebot', selfId: 'bot-a', guildId: 'group-a',
    channelId: 'group-a', messageId: '11', timestamp: base + 11 });
  assert.equal(messages.length, 10);
  assert.equal(messages[0].text, '第1句普通群聊');
  assert.equal(messages[9].text, '第10句普通群聊');
  assert(messages.every(m => m.userId === 'doctor-a' && m.username === '博士甲'));
});

test('scope includes group, channel and bot and excludes private or non-QQ traffic', () => {
  const cache = new plugin.GroupContextCache({ allowedGuilds: ['group-a', 'group-b'] });
  for (const overrides of [{ guildId: 'group-b', channelId: 'group-b' }, { selfId: 'bot-b' },
    { channelId: 'other-channel' }, { isDirect: true }, { guildId: 'not-allowed' },
    { platform: 'discord' }, { userId: 'bot-a' }]) cache.observe(message(1, overrides));
  assert.deepEqual(cache.snapshot(message(2)), []);
  cache.observe(message(3));
  assert.equal(cache.snapshot(message(4)).length, 1);
});

test('retains forty PRECEDING messages, drops expired text and ignores repeated platform IDs', () => {
  const now = Date.now();
  const cache = new plugin.GroupContextCache({ allowedGuilds: ['group-a'], maxMessages: 40 }, () => now);
  cache.observe(message('old', { timestamp: now - 31 * 60000 }));
  for (let i = 1; i <= 45; i++) cache.observe(message(i, { timestamp: now - 1000 + i }));
  const current = message(46, { timestamp: now });
  cache.observe(current); cache.observe(current);
  const rows = cache.snapshot(current);
  assert.equal(rows.length, 40);
  assert.equal(rows[0].messageId, '6');
  assert.equal(rows.at(-1).messageId, '45');
});

test('restore validates scope and applies current age and per-message limits', () => {
  const now = Date.now();
  const cache = new plugin.GroupContextCache({ allowedGuilds: ['group-a'] }, () => now);
  const key = cache.observe(message(1, { timestamp: now, elements: [h.text('甲'.repeat(200))] }));
  const row = cache.exportRow(key);
  const restored = new plugin.GroupContextCache({ allowedGuilds: ['group-a'], maxMessageChars: 60 }, () => now);
  restored.restore([row, { ...row, id: 'forged', data: '[]' }, { data: 'broken' }]);
  assert.equal(restored.snapshot(message(2)).length, 1);
  assert.equal(restored.snapshot(message(2))[0].text.length, 60);
  const expired = new plugin.GroupContextCache({ allowedGuilds: ['group-a'] }, () => now + 31 * 60000);
  expired.restore([row]);
  assert.equal(expired.status().cachedMessages, 0);
});

test('historical media exposes only type markers and never URLs or file payloads', () => {
  const text = plugin.plainText(message(1, { elements: [h.text('看这里'), h.image('https://private.invalid/token=secret'),
    h('audio', { src: 'https://private.invalid/audio' }), h.at('doctor-b'), h('face', { id: '1' })] }), 500);
  assert(text.includes('[图片]') && text.includes('[语音]') && text.includes('[提及:doctor-b]'));
  assert(!text.includes('private.invalid') && !text.includes('secret'));
});

test('actual ChatLuna assembly adds one background block and keeps native history and image input intact', async () => {
  const config = plugin.Config({ allowedGuilds: ['group-a'] });
  const cache = new plugin.GroupContextCache(config);
  for (let i = 1; i <= 10; i++) cache.observe(message(i));
  const session = message(11); cache.observe(session);
  const history = [new HumanMessage('上次的正式问题'), new AIMessage('上次的正式回答')];
  const input = new HumanMessage({ content: [{ type: 'text', text: '图图，看看图并结合刚才讨论回答。' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,c3ludGhldGlj' } }] });
  const manager = makeManager();
  manager.pipeline('after_system_prompts', plugin.createContextMiddleware(cache, config), -10);
  const runtime = makeRuntime(session, { input, chatHistory: history });
  await manager.runPipeline(runtime);
  const blocks = runtime.result.filter(m => m.additional_kwargs?.arturia_group_context);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].additional_kwargs.messageCount, 10);
  assert.equal(runtime.result.at(-1), input);
  assert(runtime.result.includes(history[0]) && runtime.result.includes(history[1]));
  assert.equal(runtime.result[1].getType(), 'system');
  assert(blocks[0].content.includes('博士0') && blocks[0].content.includes('博士1'));
});

test('tool continuation rebuilds the same snapshot once per prompt and ignores later group traffic', async () => {
  const config = plugin.Config({ allowedGuilds: ['group-a'] });
  const cache = new plugin.GroupContextCache(config);
  for (let i = 1; i <= 10; i++) cache.observe(message(i));
  const session = message(11); cache.observe(session);
  const middleware = plugin.createContextMiddleware(cache, config);
  const first = makeRuntime(session); await middleware(first, async () => {});
  cache.observe(message(12, { timestamp: session.timestamp + 1, elements: [h.text('晚来的消息不能穿越到上一轮')] }));
  const second = makeRuntime(session, { agentScratchpad: [new AIMessage({ content: '',
    tool_calls: [{ id: 'call-a', name: 'skill', args: { name: 'arturia' } }] }),
    new ToolMessage({ content: '角色模块内容', tool_call_id: 'call-a' })] });
  await middleware(second, async () => {});
  const block = runtime => runtime.result.find(m => m.additional_kwargs?.arturia_group_context);
  assert.equal(block(first).content, block(second).content);
  assert(!block(second).content.includes('晚来的消息'));
  assert.equal(second.result.filter(m => m.additional_kwargs?.arturia_group_context).length, 1);
});

test('a queued invocation retains its arrival-time context even when forty newer messages arrive', async () => {
  const config = plugin.Config({ allowedGuilds: ['group-a'] });
  const cache = new plugin.GroupContextCache(config);
  for (let i = 1; i <= 10; i++) cache.observe(message(i));
  const session = message(11); cache.observe(session);
  for (let i = 12; i < 80; i++) cache.observe(message(i, { timestamp: session.timestamp + i }));
  const runtime = makeRuntime(session);
  await plugin.createContextMiddleware(cache, config)(runtime, async () => {});
  const block = runtime.result.find(m => m.additional_kwargs?.arturia_group_context);
  assert(block && block.additional_kwargs.messageCount === 10, 'Use the context at invocation arrival, before queue wait');
  assert(block.content.includes('普通消息10') && !block.content.includes('普通消息12'));
});

test('token and character limits trim the oldest background without sacrificing the latest formal round', async () => {
  const config = plugin.Config({ allowedGuilds: ['group-a'], maxContextChars: 1100, maxContextTokens: 400 });
  const cache = new plugin.GroupContextCache(config);
  for (let i = 1; i <= 10; i++) cache.observe(message(i, { elements: [h.text(`标记${i}:` + '字'.repeat(100))] }));
  const session = message(11); cache.observe(session);
  const runtime = makeRuntime(session, { sendTokenLimit: 1300,
    chatHistory: [new HumanMessage('原有问题'.repeat(80)), new AIMessage('原有回答'.repeat(80))] });
  const manager = makeManager();
  manager.pipeline('after_system_prompts', plugin.createContextMiddleware(cache, config), -10);
  await manager.runPipeline(runtime);
  const block = runtime.result.find(m => m.additional_kwargs?.arturia_group_context);
  assert(block && block.additional_kwargs.messageCount < 10);
  assert(block.content.includes('标记10:') && !block.content.includes('标记1:'));
  assert(block.content.length <= 1100);
  assert(runtime.result.includes(runtime.chatHistory[0]) && runtime.result.includes(runtime.chatHistory[1]));
  assert(runtime.usedTokens <= runtime.sendTokenLimit);
  const blocked = makeRuntime(session, { sendTokenLimit: 50 });
  await plugin.createContextMiddleware(cache, config)(blocked, async () => {});
  assert(!blocked.result.some(m => m.additional_kwargs?.arturia_group_context));
});

test('the Web switch and an empty group list both disable passive collection and injection', async () => {
  for (const overrides of [{ enabled: false, allowedGuilds: ['group-a'] }, { allowedGuilds: [] }]) {
    const config = plugin.Config(overrides);
    const cache = new plugin.GroupContextCache(config);
    assert.equal(cache.observe(message(1)), null);
    const runtime = makeRuntime(message(2));
    await plugin.createContextMiddleware(cache, config)(runtime, async () => {});
    assert.equal(runtime.result.length, 1);
  }
});

test('clearing a formal conversation also clears its background, including a frozen tool snapshot', async () => {
  const config = plugin.Config({ allowedGuilds: ['group-a', 'group-b'] });
  const cache = new plugin.GroupContextCache(config);
  cache.observe(message(1));
  cache.observe(message(1, { guildId: 'group-b', channelId: 'group-b' }));
  const session = message(2); cache.observe(session);
  const middleware = plugin.createContextMiddleware(cache, config);
  const first = makeRuntime(session); await middleware(first, async () => {});
  assert(first.result.some(m => m.additional_kwargs?.arturia_group_context));
  assert.equal(typeof cache.clearConversation, 'function', 'Formal history clear must invalidate passive context');
  assert.equal(cache.clearConversation('conversation-a').length, 1);
  const second = makeRuntime(session); await middleware(second, async () => {});
  assert(!second.result.some(m => m.additional_kwargs?.arturia_group_context));
  assert.equal(cache.snapshot(message(2, { guildId: 'group-b', channelId: 'group-b' })).length, 1);
});

test('subagents do not inherit the group background from their parent session', async () => {
  const config = plugin.Config({ allowedGuilds: ['group-a'] });
  const cache = new plugin.GroupContextCache(config); cache.observe(message(1));
  const session = message(2);
  const runtime = makeRuntime(session, { configurable: { session, agentContext: { kind: 'subagent' } } });
  await plugin.createContextMiddleware(cache, config)(runtime, async () => {});
  assert(!runtime.result.some(m => m.additional_kwargs?.arturia_group_context));
});

test('bounded storage survives plugin restart and no observed message calls a model or sends a reply', async () => {
  const rows = new Map(), handlers = new Map(), manager = makeManager();
  let modelCalls = 0, sends = 0, rpc;
  const context = () => ({
    model: { extend() {} }, logger: () => ({ info() {}, warn() {} }),
    database: { get: async () => [...rows.values()], remove: async (_table, query) => {
      for (const [id, row] of rows) if (id === query.id) rows.delete(id);
    }, upsert: async (_table, batch) => {
      for (const row of batch) rows.set(row.id, row);
    } },
    chatluna: { contextManager: manager, createChatModel: () => { modelCalls++; throw new Error('must not call'); } },
    send: () => { sends++; throw new Error('must not send'); },
    on: (event, callback) => { handlers.set(event, callback); return () => handlers.delete(event); },
    inject: (_services, callback) => callback({ console: { addListener: (_name, callback) => { rpc = callback; } } }),
  });
  const first = await plugin.apply(context(), { allowedGuilds: ['group-a'] });
  for (let i = 1; i <= 60; i++) handlers.get('chatluna/message-observed')({ session: message(i) });
  await first.flush();
  assert.equal(modelCalls, 0); assert.equal(sends, 0);
  assert.equal(rows.size, 1);
  assert(JSON.parse([...rows.values()][0].data).length <= 41);
  const status = rpc(); assert(!JSON.stringify(status).includes('普通消息'));
  await handlers.get('dispose')();
  const restarted = await plugin.apply(context(), { allowedGuilds: ['group-a'] });
  assert.equal(restarted.cache.snapshot(message(61)).length, 40);
  assert.equal(restarted.getStatus().cachedGroups, 1);
  await handlers.get('dispose')();
});
