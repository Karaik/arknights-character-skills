#!/usr/bin/env node
'use strict'

/* Isolated image-input regression probe for the installed ChatLuna packages.
 * Prepend `globalThis.__visionChallenge = { png: dataUrl, gif: dataUrl };` when
 * piping into the Koishi container. Fixtures must be synthetic/public only.
 * No live loader, DB, QQ sends, persistent plugin, or package edits are used.
 * --model makes OCR requests using the existing enabled provider in memory;
 * credentials, provider URLs and image bytes never appear in the report.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const crypto = require('node:crypto')

function internals(req, name, tail) {
  const filename = req.resolve(name)
  const source = fs.readFileSync(filename, 'utf8')
  const isolated = new Module(filename + '.vision-isolated.cjs', module)
  isolated.filename = filename + '.vision-isolated.cjs'
  isolated.paths = Module._nodeModulePaths(path.dirname(filename))
  isolated._compile(source + '\n' + tail, isolated.filename)
  return isolated.exports.__visionProbe
}

async function main() {
  const req = Module.createRequire(path.resolve(process.argv[2] || '/koishi', 'package.json'))
  const { Logger, h } = req('koishi')
  Logger.levels.base = 0
  req('koishi-plugin-chatluna')
  const { HumanMessage } = req('@langchain/core/messages')
  const { ModelCapabilities } = req('koishi-plugin-chatluna/llm-core/platform/types')
  const sharedReq = Module.createRequire(req.resolve('koishi-plugin-chatluna-openai-like-adapter'))
  const shared = sharedReq('@chatluna/v1-shared-adapter')
  const liveConfig = req('js-yaml').load(fs.readFileSync('/koishi/koishi.yml', 'utf8'))
  function matching(node, prefix, result = []) {
    for (const [key, value] of Object.entries(node || {})) {
      if (key.startsWith(prefix)) result.push(value)
      else if (!key.startsWith('~') && value && typeof value === 'object') matching(value, prefix, result)
    }
    return result
  }
  const configuredProvider = matching(liveConfig.plugins, 'chatluna-openai-like-adapter:')
  assert.equal(configuredProvider.length, 1)
  const configuredModel = configuredProvider[0].additionalModels?.find(item => item.model === 'gpt-6-luna')
  const liveMode = process.argv.includes('--live-config')
  let candidateNative = true
  let candidateMultimodal = { enableContextImageDescription: false,
    enableContextGifHandling: true, gifStrategy: 'average', gifFrameCount: 3,
    imageModel: 'openai-like/gpt-6-luna', enableImageReadTool: false,
    enableGifReadTool: false, enableFileReadTool: false, enableAudioFfmpegConversion: false }
  if (liveMode) {
    assert(configuredModel, 'The deployed custom model metadata is missing')
    candidateNative = configuredModel.modelCapabilities.includes(ModelCapabilities.ImageInput)
    const mm = matching(liveConfig.plugins, 'chatluna-multimodal-service:')
    assert.equal(mm.length, 1, 'The installed multimodal plugin must be enabled in live config')
    candidateMultimodal = req('koishi-plugin-chatluna-multimodal-service').Config(mm[0])
    assert(candidateNative && candidateMultimodal.enableContextGifHandling)
    assert(!candidateMultimodal.enableImageReadTool && !candidateMultimodal.enableGifReadTool &&
      !candidateMultimodal.enableFileReadTool && !candidateMultimodal.enableAudioFfmpegConversion)
  }
  const core = internals(req, 'koishi-plugin-chatluna', `
    logger10 = new (require('koishi').Logger)('vision-isolated-core');
    module.exports.__visionProbe = { applyReadChatMessage: apply18 };
  `)
  const services = internals(req, 'koishi-plugin-chatluna/services/chat', `
    module.exports.__visionProbe = { MessageTransformer };
  `)
  const multimodal = internals(req, 'koishi-plugin-chatluna-multimodal-service', `
    logger = new (require('koishi').Logger)('vision-isolated-multimodal');
    module.exports.__visionProbe = { applyImageContext: apply2 };
  `)
  const fixtures = globalThis.__visionChallenge
  assert(fixtures?.png?.startsWith('data:image/png;base64,'))
  assert(fixtures?.gif?.startsWith('data:image/gif;base64,'))
  const baselineNative = shared.supportImageInput('gpt-6-luna')
  assert.equal(baselineNative, false, 'Update baseline if upstream fixes model recognition')
  const cases = []
  const modelChecks = []

  async function pipeline(native, gifEnabled) {
    const transformer = new services.MessageTransformer({})
    const middleware = new Map()
    const ctx = {
      chatluna: {
        messageTransformer: transformer,
        platform: { findModel: () => ({ value: {
          name: 'gpt-6-luna', capabilities: native
            ? [ModelCapabilities.TextInput, ModelCapabilities.ToolCall, ModelCapabilities.ImageInput]
            : [ModelCapabilities.ToolCall],
        } }) },
        getPlugin: () => gifEnabled ? {} : null,
        createChatModel: async () => ({ value: undefined }),
        preset: { getKeywordTriggerAliases: () => ({ value: ['图图'] }), getPreset: () => ({ value: {} }) },
      },
      inject() {}, effect(fn) { return fn() },
    }
    const chain = { middleware(name, fn) {
      middleware.set(name, fn)
      const item = { after: () => item, before: () => item }
      return item
    } }
    core.applyReadChatMessage(ctx, { includeQuoteReply: true }, chain)
    if (gifEnabled) await multimodal.applyImageContext(ctx, candidateMultimodal, {})
    return { transformer, middleware }
  }

  const base = await pipeline(false, false)
  const candidate = await pipeline(candidateNative, true)
  function session(quote) {
    return { username: 'Synthetic Doctor', platform: 'onebot', isDirect: false,
      bot: { selfId: 'synthetic-bot' }, quote,
      text: () => 'said' }
  }
  const samples = [
    { name: 'inline-png-wakeup', elements: () => [h.text('图图，读出图片中的六位字符和方块颜色。'), h.image(fixtures.png)], images: 1 },
    { name: 'at-plus-png', elements: () => [h.at('synthetic-bot'), h.text('看这张图'), h.image(fixtures.png)], images: 1 },
    { name: 'quoted-png-wakeup', elements: () => [h.text('图图，看看我引用的这张图。')],
      quote: () => ({ elements: [h.image(fixtures.png)], user: { name: 'Synthetic Doctor' } }), images: 1 },
    { name: 'inline-gif-wakeup', elements: () => [h.text('图图，按顺序读出这张动图的三个词。'), h.image(fixtures.gif)], images: 3 },
    { name: 'text-only-control', elements: () => [h.text('图图，早上好。')], images: 0 },
  ]
  for (const test of samples) {
    const before = await base.transformer.transform(session(test.quote?.()), test.elements(), 'openai-like/gpt-6-luna')
    const after = await candidate.transformer.transform(session(test.quote?.()), test.elements(), 'openai-like/gpt-6-luna')
    const count = message => Array.isArray(message.content) ? message.content.filter(x => x.type === 'image_url').length : 0
    assert.equal(count(before), 0)
    assert.equal(count(after), test.images)
    const request = await shared.buildChatCompletionParams({ model: 'gpt-6-luna', input: [new HumanMessage(after)], maxTokens: 160 }, {}, false, true)
    const imageParts = request.messages.flatMap(x => Array.isArray(x.content) ? x.content.filter(c => c.type === 'image_url') : [])
    assert.equal(imageParts.length, test.images, 'Adapter must preserve all transformed image parts')
    assert(imageParts.every(x => x.image_url.url.startsWith('data:image/png;base64,')))
    const result = { case: test.name, beforeImageParts: count(before), afterImageParts: count(after),
      adapterImageParts: imageParts.length, imageTransport: imageParts.length ? 'PNG base64 image_url' : 'none', passed: true }
    cases.push(result)
    if (process.argv.includes('--model') && !process.argv.includes('--combined-only') && ['inline-png-wakeup', 'quoted-png-wakeup', 'inline-gif-wakeup'].includes(test.name)) {
      const cfg = req('js-yaml').load(fs.readFileSync('/koishi/koishi.yml', 'utf8'))
      const routes = []
      function providers(node) { for (const [k, v] of Object.entries(node || {})) {
        if (k.startsWith('~')) continue
        if (k.startsWith('chatluna-openai-like-adapter:')) routes.push(...v.apiKeys.filter(x => x[2] !== false))
        else if (v && typeof v === 'object') providers(v)
      } }
      providers(cfg.plugins)
      assert.equal(routes.length, 1)
      const [key, endpoint] = routes[0]
      delete request.stream
      delete request.stream_options
      const response = await fetch(endpoint.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal: AbortSignal.timeout(60000),
      })
      assert(response.ok, 'Configured model request failed with HTTP ' + response.status)
      const value = await response.json()
      const text = value.choices[0].message.content || ''
      if (test.name.includes('gif')) assert(/START[\s\S]*MIDDLE[\s\S]*FINISH/i.test(text))
      else { assert(text.includes('Q7M4K9')); assert(/green|绿/i.test(text)) }
      modelChecks.push({ case: test.name, imageParts: imageParts.length, reply: text, passed: true })
    }
  }
  // Preset-alias trimming must retain non-text elements in the wakeup input.
  const input = [h.text('图图，看看图片'), h.image(fixtures.png)]
  const readContext = { options: {} }
  await candidate.middleware.get('read_chat_message')({ ...session(), elements: input }, readContext)
  assert.equal(readContext.options.chatMessage.filter(x => x.type === 'img').length, 1)
  assert.equal(readContext.options.presetLane, '图图')
  assert.equal(readContext.options.chatMessage.filter(x => x.type === 'text').map(x => x.attrs.content).join(''), '看看图片')
  let combinedCheck = null
  if (process.argv.includes('--combined-only')) {
    const presetRaw = fs.readFileSync('/koishi/data/chathub/presets/arturia.yml', 'utf8')
    const preset = req('koishi-plugin-chatluna/llm-core/prompt').loadPreset(presetRaw)
    assert(preset.authorsNote?.content && preset.authorsNote.insertFrequency === 1)
    assert.equal(preset.formatUserPromptString, '用户{sender}（ID:{sender_id}）说：{prompt}')
    const after = await candidate.transformer.transform(session(), [
      h.text('图图，看看这张图上写了什么、右边是什么颜色？'), h.image(fixtures.png),
    ], 'openai-like/gpt-6-luna')
    assert(Array.isArray(after.content))
    const content = after.content.map((part, index) => index === 0 && part.type === 'text'
      ? { ...part, text: '用户合成博士（ID:synthetic-vision）说：' + part.text } : part)
    const request = await shared.buildChatCompletionParams({ model: 'gpt-6-luna',
      input: [...preset.messages, new HumanMessage(preset.authorsNote.content), new HumanMessage({ content })], maxTokens: 500,
    }, {}, false, true)
    delete request.stream
    delete request.stream_options
    const routes = configuredProvider[0].apiKeys.filter(x => x[2] !== false)
    assert.equal(routes.length, 1)
    const [key, endpoint] = routes[0]
    const response = await fetch(endpoint.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(request), signal: AbortSignal.timeout(60000),
    })
    assert(response.ok, 'Combined model request failed with HTTP ' + response.status)
    const value = await response.json()
    const reply = value.choices[0].message.content || ''
    assert(reply.includes('Q7M4K9') && /green|绿/i.test(reply), 'Combined response did not read the image')
    const markers = [...reply.matchAll(/\[\[sticker:([^\]]+)\]\]/g)].map(x => x[1])
    assert.equal(markers.length, 1, 'Expected one naturally selected sticker with the casual image answer')
    assert(/^(arturia-react-0[1-6]|arturia-sway-01)$/.test(markers[0]))
    combinedCheck = { case: 'current-formal-role-image-plus-natural-sticker',
      scope: 'installed preset parser messages and authors note plus native transformed image and shared request formatter; direct model selection without tool loop',
      formalPresetSha256: crypto.createHash('sha256').update(presetRaw).digest('hex'),
      imageParts: 1, reply, selectedSticker: markers[0], passed: true,
      userRequestedImageOutput: false, forcedToolChoice: false }
  }
  const files = ['koishi-plugin-chatluna', 'koishi-plugin-chatluna-multimodal-service', 'koishi-plugin-chatluna-openai-like-adapter']
  const packageEvidence = files.map(name => ({ name, version: req(name + '/package.json').version,
    bundleSha256: crypto.createHash('sha256').update(fs.readFileSync(req.resolve(name))).digest('hex') }))
  console.log(JSON.stringify({ ok: true, date: '2026-10-24', scope: 'installed native message transformer, core input handlers, multimodal GIF handler and OpenAI adapter request formatter',
    livePluginStartup: false, liveGroupMessageSent: false, databaseOpened: false, productionFilesModified: false,
    model: 'gpt-6-luna', autoRecognizedImageInput: baselineNative,
    candidateSource: liveMode ? 'deployed configuration read and validated through installed schemas' : 'isolated proposed configuration',
    activeRuntimeMetadataRead: false, aliasPrefixStrippingRetainsImage: true,
    candidateCapabilities: ['text_input', 'tool_call', 'image_input'], contextSizePreserved: shared.getModelMaxContextSizeByName('gpt-6-luna'),
    config: { enableContextImageDescription: false, enableContextGifHandling: true, gifStrategy: 'average', gifFrameCount: 3,
      enableImageReadTool: false, enableGifReadTool: false, enableFileReadTool: false, enableAudioFfmpegConversion: false },
    cases, modelChecks, combinedCheck, packageEvidence }, null, 2))
}
main().catch(error => { console.error(error.stack || error.name); process.exitCode = 1 })
