#!/usr/bin/env node
'use strict'

/*
 * Isolated natural-sticker model probe. No live Koishi loader, console login,
 * database, QQ adapter, Computer backend, MCP server, or persistent test preset.
 *
 * Run with the dependencies already installed in the target runtime:
 *   node natural-sticker-probe.cjs /absolute/koishi-runtime /path/to/payload.json
 * Or prepend globalThis.__naturalStickerPayload = <JSON>; and pipe to node -.
 *
 * Runs against the exact Agent dependency installed in Koishi.
 * It tests actual Agent Skills + permissions classes and actual core platform
 * and prompt pipeline. It is not a full Agent-plugin / console startup test.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const Module = require('node:module')
const { createRequire } = Module

async function main() {
  const runtimeRoot = path.resolve(process.argv[2] || process.cwd())
  const payload = globalThis.__naturalStickerPayload || JSON.parse(await fs.readFile(process.argv[3], 'utf8'))
  assert(payload.preset && payload.modules && payload.cases, 'Payload requires preset, modules and cases')
  const req = createRequire(path.join(runtimeRoot, 'package.json'))
  const { Context, Logger } = req('koishi')
  Logger.levels.base = 0
  // Core 1.4.2 CJS has cycles through utils/error -> core -> services/chat.
  // Loading a subpath first can observe an incomplete ChatLunaErrorCode export.
  // Load the public main entry before its platform/prompt subpaths.
  req('koishi-plugin-chatluna')
  const { PlatformService } = req('koishi-plugin-chatluna/llm-core/platform/service')
  const promptApi = req('koishi-plugin-chatluna/llm-core/prompt')
  const { ChatLunaContextManagerService, EMPTY_PRESET } = promptApi
  const { HumanMessage, AIMessage } = req('@langchain/core/messages')

  // Agent's main package does not export these internal classes. Add exports to
  // an in-memory module copy, leaving installed package files and require cache
  // untouched. Exact original function/class bodies execute below.
  const agentMain = req.resolve('koishi-plugin-chatluna-agent')
  const agentSource = await fs.readFile(agentMain, 'utf8')
  for (const symbol of [
    'ChatLunaAgentSkillsService', 'ChatLunaAgentPermissionService',
    'getDefaultConfig', 'createSkillItemConfig', 'createToolItemConfig',
  ]) {
    assert(agentSource.includes(symbol), `Unsupported bundle: missing ${symbol}`)
  }
  const isolatedModule = new Module(agentMain + '.isolated-probe.cjs', module)
  isolatedModule.filename = agentMain + '.isolated-probe.cjs'
  isolatedModule.paths = Module._nodeModulePaths(path.dirname(agentMain))
  isolatedModule._compile(agentSource + `\n
    logger = new (require('koishi').Logger)('native-skills-isolated-probe');
    module.exports.__isolatedProbe = {
      ChatLunaAgentSkillsService, ChatLunaAgentPermissionService,
      getDefaultConfig, createSkillItemConfig, createToolItemConfig,
    };
  `, isolatedModule.filename)
  const internals = isolatedModule.exports.__isolatedProbe

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'chatluna-native-probe-'))
  const ctx = new Context()
  ctx.baseDir = tmp
  const platform = new PlatformService(ctx)
  const contextManager = new ChatLunaContextManagerService(ctx)
  ctx.chatluna = { platform, contextManager }
  const cfg = internals.getDefaultConfig()
  cfg.skills.dirs = []
  cfg.computer.local.enabled = false
  cfg.computer.e2b.enabled = false
  cfg.computer.openTerminal.enabled = false
  const permission = new internals.ChatLunaAgentPermissionService(ctx, cfg)
  const skills = new internals.ChatLunaAgentSkillsService(ctx, cfg, permission)
  // These are explicitly inert host adapters. No Computer/Trigger/DB class is
  // started. The native Skills and permission implementations are not replaced.
  ctx.chatluna_agent = {
    computer: {
      hasBin: async () => false,
      listAvailableBackends: () => [],
      materializer: { clear() {} },
      getPromptWorkdir: () => undefined,
      getStatus: () => ({ enabled: false, defaultProvider: 'local' }),
    },
    subAgent: { listRunnableAgents: () => [] },
    refreshConsoleData: async () => {},
    permission,
    skills,
  }
  let started = false
  try {
    const targetRoot = path.join(tmp, 'data', 'chatluna', 'skills')
    await fs.mkdir(targetRoot, { recursive: true })
    const expected = new Map()
    const moduleHashes = {}
    for (const [dir, raw] of Object.entries(payload.modules)) {
      assert(/^arturia(?:-[a-z0-9-]+)?$/.test(dir))
      const name = raw.match(/^name:\s*["']?([a-z0-9-]+)["']?\s*$/m)?.[1]
      assert.equal(name, dir)
      const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').trim()
      assert(body)
      const dest = path.join(targetRoot, dir)
      await fs.mkdir(dest, { recursive: true })
      await fs.writeFile(path.join(dest, 'SKILL.md'), raw)
      expected.set(name, body)
      moduleHashes[name] = crypto.createHash('sha256').update(raw).digest('hex')
    }
    assert(expected.has('arturia'), 'Missing arturia core skill')
    assert(expected.size > 1, 'No independently loadable modules found')
    await permission.start()
    await skills.start()
    started = true

    // The package copies bundled development skills during reload. Disable all
    // scanned entries outside the exact imported production set in this temp
    // process; never rely on deleting bundled files (they are copied back).
    for (const info of skills.listSkills()) {
      const allowed = expected.has(info.name)
      cfg.skills.items[info.id] = internals.createSkillItemConfig({
        enabled: allowed,
        mode: 'description',
        authority: 0, main: allowed, chatluna: allowed,
        character: false, characterGroup: false, characterPrivate: false,
        subAgents: { mode: 'allow', allow: [], deny: [] },
      })
    }
    cfg.tool.items.skill = internals.createToolItemConfig({
      enabled: true, main: true, subAgent: false, chatluna: true,
      character: false, characterGroup: false, characterPrivate: false,
      authority: 0, subAgents: { mode: 'allow', allow: [], deny: [] },
    }, 'skill')
    for (const name of [
      'bash', 'file_read', 'file_write', 'file_edit', 'glob', 'grep',
      'file_publish', 'task', 'trigger', 'finish_trigger_run',
    ]) {
      cfg.tool.items[name] = internals.createToolItemConfig({
        enabled: false, main: false, subAgent: false, chatluna: false,
        character: false, characterGroup: false, characterPrivate: false,
      }, name)
    }
    permission.invalidateCache()
    await skills.reload()
    const session = { user: { authority: 0 }, isDirect: true, userId: 'isolated-probe' }
    const mask = await platform.resolveToolMask({
      session, source: 'chatluna', conversation: { chatMode: 'plugin' },
    })
    assert.deepEqual(platform.getFilteredTools(mask), ['skill'])
    assert.deepEqual(platform.getFilteredTools(mask.toolCallMask), ['skill'])
    const entry = platform.getTool('skill')
    assert.equal(entry.authorization(session), true)
    const tool = entry.createTool({ embeddings: undefined })
    const runConfig = {
      configurable: {
        session,
        agentContext: { kind: 'main', source: 'chatluna', conversationId: undefined },
      },
    }
    const loaded = []
    for (const item of skills.listSkills().filter(x => x.modelEnabled)) {
      assert(expected.has(item.name), `Unexpected visible skill ${item.name}`)
      const output = await tool.invoke({ name: item.name }, runConfig)
      assert.equal(typeof output, 'string')
      assert(output.includes(`<skill_content name="${item.name}">`))
      assert(output.includes(expected.get(item.name)), `Full body missing: ${item.name}`)
      loaded.push({
        name: item.name,
        chars: output.length,
        sha256: crypto.createHash('sha256').update(output).digest('hex'),
      })
    }
    assert.equal(loaded.length, expected.size)
    await assert.rejects(tool.invoke({ name: 'skill-creator' }, runConfig))

    // Exercise the actual core prompt pipeline and native full-mode middleware.
    const promptRuntime = {
      result: [], variables: {}, configurable: {
        ...runConfig.configurable,
        agentContext: { ...runConfig.configurable.agentContext, toolMask: mask },
      },
      usedTokens: 0, sendTokenLimit: 100000,
      tokenCounter: async text => Math.ceil(Buffer.byteLength(text, 'utf8') / 4),
      preset: EMPTY_PRESET, promptRenderService: {},
    }
    await contextManager.runPipeline(promptRuntime)
    const prompt = promptRuntime.result.map(x => String(x.content)).join('\n')
    assert(!prompt.includes('<skill_content name="arturia">'), 'Description mode must not force Arturia identity into unrelated presets')
    for (const name of expected.keys()) {
      assert(prompt.includes(name), `Module catalog missing ${name}`)
    }
    assert.equal(skills.getStatus().activeConversations, 0)
    const modelChecks = []
    const yaml = req('js-yaml')
    const config = yaml.load(await fs.readFile(path.join(runtimeRoot, 'koishi.yml'), 'utf8'))
    const routes = []
    function providers(node) {
      if (!node || typeof node !== 'object') return
      for (const [k, v] of Object.entries(node)) {
        if (k.startsWith('~')) continue
        if (k.startsWith('chatluna-openai-like-adapter:')) routes.push(...(v.apiKeys || []).filter(x => x[2] !== false))
        else providers(v)
      }
    }
    providers(config.plugins)
    assert.equal(routes.length, 1, 'Expected one enabled provider route')
    const [key, endpoint] = routes[0]
    const preset = promptApi.loadPreset(payload.preset)
    const presetHash = crypto.createHash('sha256').update(payload.preset).digest('hex')
    assert.equal(preset.authorsNote?.insertFrequency, 1)
    assert.equal(preset.authorsNote?.insertPosition, 'in_chat')
    assert.equal(preset.authorsNote?.insertDepth, 0)
    assert.equal(preset.formatUserPromptString, '用户{sender}（ID:{sender_id}）说：{prompt}')
    // Register the same actual core stages used to assemble runtime messages.
    // Preset messages / authors_note currently contain only literal text, so
    // their renderer is a static identity adapter; user formatting substitutes
    // the three asserted formal placeholders with synthetic sender metadata.
    promptApi.registerSystemPromptsMiddleware(contextManager)
    promptApi.registerChatHistoryMiddleware(contextManager)
    promptApi.registerInjectionsMiddleware(contextManager)
    promptApi.registerAuthorsNoteMiddleware(contextManager)
    const renderer = {
      renderPresetTemplate: async value => ({ messages: value.messages }),
      renderTemplate: async value => ({ text: value }),
    }
    const formatInput = (text, sender='样本博士', senderId='synthetic-probe') => preset.formatUserPromptString
      .replace('{sender}', sender).replace('{sender_id}', senderId)
      .replace('{prompt}', text)
    const roles = {human:'user', ai:'assistant', system:'system'}
    const agentReq = createRequire(agentMain)
    const schema = agentReq('zod-to-json-schema').zodToJsonSchema(tool.schema)
    const openaiTool = {type:'function', function:{name:tool.name, description:tool.description, parameters:schema}}
    const queue = []
    for (const test of payload.cases.positive) for (let attempt=1; attempt<=payload.cases.positiveRepeats; attempt++) queue.push({...test, kind:'positive', attempt})
    for (const kind of ['controls','contextual']) for (const test of payload.cases[kind]) for (let attempt=1; attempt<=payload.cases.controlRepeats; attempt++) queue.push({...test, kind, attempt})
    let nextIndex = 0
    async function worker() {
      while (nextIndex < queue.length) {
        const index = nextIndex++, test = queue[index]
        const runtime = {
          result: [], variables: {authors_note:preset.authorsNote},
          configurable: {...runConfig.configurable, agentContext:{...runConfig.configurable.agentContext, toolMask:mask}},
          usedTokens:0, sendTokenLimit:100000,
          tokenCounter:async text => Math.ceil(Buffer.byteLength(text,'utf8')/4),
          preset, promptRenderService:renderer,
          chatHistory:(test.history||[]).map(m => m.role==='assistant' ? new AIMessage(m.content) : new HumanMessage(formatInput(m.content,m.sender,m.senderId))),
          input:new HumanMessage(formatInput(test.input,test.sender,test.senderId)),
        }
        await contextManager.runPipeline(runtime)
        const messages = runtime.result.map(m => ({role:roles[m.getType()]||'system', content:String(m.content)}))
        assert(messages.some(m => m.role==='user' && m.content===preset.authorsNote.content), 'Actual note middleware did not inject note')
        assert.equal(messages.at(-1).content, formatInput(test.input,test.sender,test.senderId))
        const calls=[]
        let final='', error, requests=0
        try {
          for(let turn=0; turn<5; turn++) {
            requests++
            const response = await fetch(endpoint.replace(/\/$/,'')+'/chat/completions', {
              method:'POST', headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
              body:JSON.stringify({model:'gpt-6-luna',messages,tools:[openaiTool],max_tokens:700}),
              signal:AbortSignal.timeout(90000),
            })
            assert(response.ok, 'Configured model request failed: '+response.status)
            const value=await response.json(), reply=value.choices[0].message
            if(!reply.tool_calls?.length) {final=reply.content||''; break}
            messages.push({role:'assistant',content:reply.content||null,tool_calls:reply.tool_calls})
            for(const call of reply.tool_calls) {
              assert.equal(call.function.name,'skill')
              const args=JSON.parse(call.function.arguments)
              assert(expected.has(args.name), 'Unexpected module requested')
              const content=await tool.invoke(args,runConfig)
              assert(content.includes(expected.get(args.name)))
              calls.push(args.name)
              messages.push({role:'tool',tool_call_id:call.id,content})
            }
          }
          assert(final.trim(), 'No final response within tool-turn limit')
        } catch(e) {error=String(e.message).slice(0,180)}
        const markers=[...final.matchAll(/\[\[sticker:([^\]]+)\]\]/g)].map(x=>x[1])
        const correct=!error && (test.expected===null ? markers.length===0 : markers.length===1 && markers[0]===test.expected)
        const outcome=error ? 'error' : correct ? 'correct' : markers.length===0 ? 'no-marker' : 'wrong-marker'
        const row={index,case:test.id,kind:test.kind,input:test.input,history:test.history||[],expected:test.expected,attempt:test.attempt,nativeToolCalls:calls,requests,reply:final,markers,outcome,...(error?{error}:{})}
        modelChecks.push(row)
        console.error(JSON.stringify({case:test.id,attempt:test.attempt,outcome,markers,calls,done:modelChecks.length,total:queue.length}))
      }
    }
    await Promise.all(Array.from({length:Math.min(3,queue.length)},worker))
    modelChecks.sort((a,b)=>a.index-b.index)
    const summary = {}
    for(const row of modelChecks) {
      const name=row.kind==='positive' ? row.expected : row.kind
      const stat=summary[name] ||= {total:0,correct:0,'no-marker':0,'wrong-marker':0,error:0}
      stat.total++; stat[row.outcome]++
    }
    process.stdout.write(JSON.stringify({
      schema:1, label:payload.label, generatedAt:new Date().toISOString(),
      sampleLimit:'Independent generations per predeclared positive phrase and control/context case; exact repeats are recorded by the case matrix. A reused matrix is regression evidence after prompt refinement. Counts are small-sample observations, not calibrated production probabilities.',
      ok:modelChecks.every(x=>!x.error),
      model:'gpt-6-luna', concurrency:3,
      scope:'actual native Skills, permissions, StructuredTool, native catalog, core system/history/authors-note/injection pipeline, formal sender wrapper; isolated real model output selection',
      approximations:[
        'Static identity renderer for literal preset/authors-note text; wrapper substitutes the three asserted formal placeholders.',
        'Synthetic isolated conversations; existing group history, model cache, runtime retries, full live Agent loop and final OneBot transport are not exercised.',
        'Tool results use actual native service but undefined conversationId to avoid activation state; no existing conversation is read or changed.',
        'No sampling parameter override; max_tokens 700 and at most five API turns per sample.',
      ],
      hashes:{preset:presetHash,modules:moduleHashes,cases:crypto.createHash('sha256').update(JSON.stringify(payload.cases)).digest('hex'),agentBundle:crypto.createHash('sha256').update(agentSource).digest('hex')},
      authorsNoteIncluded:true,formalUserPromptIncluded:true,
      summary,modelChecks,tools:platform.getFilteredTools(mask),
      databaseOpened:false,messageSent:false,productionFilesModified:false,
      computerBackends:[],temporaryStateOnly:true,
    },null,2)+'\n')
  } finally {
    if (started) await skills.stop()
    await permission.stop()
    platform.dispose()
    await ctx.stop()
    const tmpResolved = path.resolve(tmp)
    const tempParent = path.resolve(os.tmpdir()) + path.sep
    assert(tmpResolved.startsWith(tempParent))
    assert(path.basename(tmpResolved).startsWith('chatluna-native-probe-'))
    await fs.rm(tmpResolved, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error.stack || error)
  process.exitCode = 1
})
