#!/usr/bin/env node
'use strict'

/*
 * Isolated native Skills probe. No live Koishi loader, console login, model,
 * database, QQ adapter, Computer backend, MCP server, or persistent test preset.
 *
 * Run with the dependencies already installed in the target runtime:
 *   node probe-outline.cjs /absolute/koishi-runtime /absolute/exported-skill-root
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
  assert(process.argv[3], 'Pass an exported native Skills root as argument 2')
  const sourceRoot = path.resolve(process.argv[3])
  const req = createRequire(path.join(runtimeRoot, 'package.json'))
  const { Context, Logger } = req('koishi')
  Logger.levels.base = 0
  // Core 1.4.2 CJS has cycles through utils/error -> core -> services/chat.
  // Loading a subpath first can observe an incomplete ChatLunaErrorCode export.
  // Load the public main entry before its platform/prompt subpaths.
  req('koishi-plugin-chatluna')
  const { PlatformService } = req('koishi-plugin-chatluna/llm-core/platform/service')
  const { ChatLunaContextManagerService, EMPTY_PRESET } = req('koishi-plugin-chatluna/llm-core/prompt')

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
    for (const entry of await fs.readdir(sourceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^arturia(?:-|$)/.test(entry.name)) continue
      const from = path.join(sourceRoot, entry.name)
      const raw = await fs.readFile(path.join(from, 'SKILL.md'), 'utf8').catch(() => null)
      if (raw === null) continue
      const name = raw.match(/^name:\s*["']?([a-z0-9-]+)["']?\s*$/m)?.[1]
      assert(name, `Invalid native skill name in ${from}`)
      assert(!expected.has(name), `Duplicate skill name ${name}`)
      const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').trim()
      assert(body, `Empty module body: ${name}`)
      await fs.cp(from, path.join(targetRoot, entry.name), { recursive: true })
      expected.set(name, body)
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
    const modelChecks=[]
    if(process.argv.includes('--model')) {
      const yaml=req('js-yaml'),config=yaml.load(await fs.readFile(path.join(runtimeRoot,'koishi.yml'),'utf8'))
      const routes=[]
      function providers(node){if(!node||typeof node!=='object')return;for(const[k,v]of Object.entries(node)){if(k.startsWith('~'))continue;if(k.startsWith('chatluna-openai-like-adapter:'))routes.push(...(v.apiKeys||[]).filter(x=>x[2]!==false));else providers(v)}}
      providers(config.plugins);assert.equal(routes.length,1)
      const [key,endpoint]=routes[0]
      const preset=req('koishi-plugin-chatluna/llm-core/prompt').loadPreset(await fs.readFile(path.join(runtimeRoot,'data/chathub/presets/arturia.yml'),'utf8'))
      const roles={human:'user',ai:'assistant',system:'system'}
      const initial=preset.messages.map(m=>({role:roles[m.getType()]||'system',content:String(m.content)}))
      initial.push({role:'system',content:prompt})
      const agentReq=createRequire(agentMain),schema=agentReq('zod-to-json-schema').zodToJsonSchema(tool.schema)
      const openaiTool={type:'function',function:{name:tool.name,description:tool.description,parameters:schema}}
      for(const test of [
        {name:'native-sticker-selection',module:'arturia-stickers',input:'图图，我想看你害羞的那张静态表情。请先用skill工具加载arturia-stickers再选图，只发那一张。',expected:'[[sticker:arturia-react-03]]'},
        {name:'native-comfort',module:'arturia-comfort',input:'图图，我今天被老板临时加班，真的烦。请先用skill工具加载arturia-comfort再回应；只想让你听我说，不要建议、不要表情图。'}
      ]) {
        const messages=[...initial,{role:'user',content:test.input}];const calls=[];let final=''
        for(let turn=0;turn<3;turn++) {
          const response=await fetch(endpoint.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-6-luna',messages,tools:[openaiTool],max_tokens:700}),signal:AbortSignal.timeout(60000)})
          assert(response.ok,'Configured model request failed: '+response.status)
          const value=await response.json(),reply=value.choices[0].message
          if(!reply.tool_calls?.length){final=reply.content||'';break}
          messages.push({role:'assistant',content:reply.content||null,tool_calls:reply.tool_calls})
          for(const call of reply.tool_calls){assert.equal(call.function.name,'skill');const args=JSON.parse(call.function.arguments);assert.equal(args.name,test.module);const text=await tool.invoke(args,runConfig);assert(text.includes(expected.get(args.name)));calls.push(args.name);messages.push({role:'tool',tool_call_id:call.id,content:text})}
        }
        assert(calls.includes(test.module),'Model did not load native module');assert(final.trim())
        if(test.expected)assert.equal(final.trim(),test.expected);else assert(!final.includes('[[sticker:'))
        modelChecks.push({case:test.name,nativeToolCalls:calls,reply:final,passed:true})
      }
    }
    process.stdout.write(JSON.stringify({
      ok: true,
      scope: 'actual native Skills, permissions, StructuredTool and description catalog prompt pipeline',
      fullPluginConsoleStartup: false,
      modelCalled: modelChecks.length>0, modelChecks, databaseOpened: false, messageSent: false,
      productionFilesModified: false,
      core: 'arturia', loaded, tools: platform.getFilteredTools(mask),
      computerBackends: [], temporaryStateOnly: true,
    }, null, 2) + '\n')
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
