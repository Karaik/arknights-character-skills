# Koishi / ChatLuna 正式接入

当前正式版本使用 Koishi 4.18.11、ChatLuna 1.4.2、`koishi-plugin-chatluna-agent` 1.0.49，以及 `arturia-reviewed-stickers` 0.1.1。前者提供原生 Skills 管理和加载，后者只负责把批准的表情 ID 转成图片；两者作用不同。

## 群聊前情与网页管理

2026-10-25 已增加独立的 `arturia-group-context` 0.1.0 插件，使用当前 ChatLuna 的正式会话、预设和 Skill。它只负责收集与注入前情；昵称、@ 等唤醒条件仍在 `chatluna` 中设置。

在 Koishi 网页后台打开 **插件配置 → chatluan 分组 → arturia-group-context**，也可访问后台 `/plugins/production`。分组沿用服务器原有名称。该页的字段与说明由插件 Schema 发布，保存配置会重载插件并立即生效，不需要 SSH 或修改服务器文件。

| 字段 | 当前设置 | 含义 |
|---|---:|---|
| `enabled` | 开启 | 收集并在正常唤醒时带上前情 |
| `allowedGuilds` | 既有五群 | 各群、各机器人和各频道相互隔离；留空停用 |
| `maxMessages` | 40 | 最多 40 条前文，不包含当前唤醒句 |
| `maxAgeMinutes` | 30 | 只使用最近 30 分钟内的消息 |
| `maxMessageChars` | 500 | 单条旁听消息的字符上限 |
| `maxContextChars` | 8000 | 前情文本含时间和说话人的总字符上限 |
| `maxContextTokens` | 4000 | 前情的 token 上限，并让位于当前输入、工具消息及最新完整对话轮次 |
| `persistAcrossRestarts` | 开启 | 在 Koishi 原有数据库的独立有限缓存表中保存，重载或重启后恢复有效记录 |

普通消息通过 `chatluna/message-observed` 同步进入有限缓存，不调用模型、不下载图片。收到唤醒句时冻结该时刻的前文，再通过 `contextManager.pipeline('after_system_prompts', ...)` 加到模型请求中。Skill 调用后的请求重建会重复使用同一份快照，每个请求只有一份前情；等待期间的新消息不倒灌。旁听内容是带说话人与时间的 JSON 用户资料，不能覆盖系统指令。现有正式聊天历史仍按原方式保留。

旁听从插件启用开始积累；有效缓存能跨重启恢复，不自动回填启用之前的全量群聊。历史图片、语音等仅标注类型；当前唤醒句和引用消息中的图片继续走原有多模态流程。清空或删除已关联的正式会话时，会同时清理该群的旁听缓存。关闭插件停止收集和注入，过期记录不会重新进入上下文。

实现源文件为 `adapters/koishi/group-context.cjs`，本地安装包由 `scripts/deploy_group_context.py` 生成。可运行 `scripts/verify_group_context_console.py` 通过已登录管理员的同一套 Web API 检查运行状态和 Schema；`--roundtrip` 会临时将条数改为 41，再恢复为 40，验证网页保存与重载。

验证记录：[部署](../validation/group-context-deployment-20261025.json)、[网页配置读回](../validation/group-context-web-readback-20261025.json)、[网页保存接口往返](../validation/group-context-web-save-20261025.json)、[实际重启与缓存保留](../validation/group-context-restart-20261025.json)、[原会话与资源保留](../validation/group-context-runtime-readback-20261025.json)。网页验证使用已登录管理员的同一组控制台接口，确认 Schema、当前配置和启用状态，并实测保存条数 41 后恢复 40；未伪称在未经登录的浏览器中目视验证了表单。

[模型测试](../validation/group-context-model-results-20261025.json)使用安装版插件、真实 ChatLuna 解析器、模板渲染器、提示组装阶段及正式预设。两条匿名合成用例都能从 10 条普通前文中找出当前说话人的物品位置和随机贴纸，排除另一说话人及其他群的诱饵，并自然选用批准表情。工具回合重建的快照也单独核对。它不是运行中 Agent 工具循环或 QQ 发送全链路验证；未读取真实群聊正文，不创建测试预设，不向 QQ 群发测试消息。

## 在哪里管理 Skills

刷新 Koishi 控制台后，打开侧栏 **ChatLuna Agent → Skills**，页面路径 `/chatluna-agent`。管理页面需要控制台账户 authority ≥ 3。

当前启用七个独立原生技能：

| 名称 | 内容 |
|---|---|
| `arturia` | 身份、性格、说话方式、演出和多人群聊约定 |
| `arturia-relationships` | 原作人物关系 |
| `arturia-lore` | 技艺、剧情、模组与时间线 |
| `arturia-banter` | 接梗和熟人互逗 |
| `arturia-comfort` | 抱怨、疲惫与陪伴 |
| `arturia-stickers` | 七张批准表情的情绪、适用与回避场景 |
| `arturia-examples` | 对话和演出示例 |

这些模块均使用 `description` 模式，模型按需调用原生 `skill` 工具读取完整正文。也可在已启用的会话手动输入 `/arturia-stickers …` 等技能前缀。无需为读取角色模块启用文件、终端或 Computer 工具。

当前七个模块的主会话工具权限只启用 `skill`，Computer 后端关闭，内置开发技能禁用。插件对普通 ChatLuna 来源没有按“预设”划分技能权限，因此未使用全局 `full` 模式强行注入阿尔图罗身份；正式预设负责稳定身份，模块仅在相关任务中加载。

## 正式预设和会话模式

正式文件为 `data/chathub/presets/arturia.yml`，对应“阿尔图罗”，并保留塑心、图图、图图姐、香草榜第一等八个身份别名。

旧 `arturia-skill-test.yml` 已删除，未被任何会话引用。现有五个群的当前会话已改为 **`plugin`** 模式，模型仍为 `gpt-6-luna`。本次事务前后 1487 条原历史记录哈希一致，未清空会话。ChatLuna 的新会话默认模式也设为 `plugin`。

原生模块导入路径是 `data/chatluna/skills/<模块名>/SKILL.md`。实际运行配置由插件维护在 `data/chatluna/agents/config.json`；该现场配置不提交到 Git。

## 本地维护和重新导出

原始资料仍在 `skills/arturia/` 分模块维护。构建会生成正文自包含的原生模块，避免把仅含附件链接的入口误当作完整运行能力。

```powershell
python scripts/review_catalog.py
python scripts/build.py
python scripts/validate.py
python scripts/package_release.py
```

产物：

- `exports/chatluna/arturia.yml`：正式身份预设，包含原生技能调用指引。
- `exports/chatluna/native-skills/`：七个原生模块。
- `dist/arturia-chatluna-skills.zip`：可通过 Agent 的 Skills 页面导入。
- `dist/arturia-skill-0.1.0.zip`：通用模块化资料包，含参考与图片；与原生加载包用途不同。
- `exports/chatluna/runtime-manifest.json` 和 `images/`：七张批准表情。

不要重新创建测试预设。对生产更新使用正式名称，并在部署前核对导出的哈希和原生模块目录。

## 表情发送

`arturia-reviewed-stickers` 监听 Koishi 的 `before-send`，将 `[[sticker:ID]]` 转成经过哈希验证的 `h.image(Buffer, mime)`；每次最多一张，限既有五群白名单。PNG 和 GIF 使用对应 MIME，容器之间无需共享图片路径。

当前六张透明静图分别用于疑惑、为难、害羞、无语、得意、戏谑；摇摆 GIF 保持 70 帧、每帧 100ms、共 7 秒。详见 [逐张分类](../skills/arturia/references/stickers.md)。

### 自然语境选择

博士不需要说“发图”、GIF、技能名或标记。正式预设常驻简短决策规则和当前获批索引，模型可直接选图；需要进一步区分时自主读取 `arturia-stickers`。已决定回复的普通群聊默认附一张，短答、同一梗的连续接话和普通问答不自动禁图。接梗和陪伴模块遵循同一规则，不能以括号演出代替图片。

| 图片 | 主要自然场景 | 相近情绪的区分 |
|---|---|---|
| 01 疑惑 | 轻松闲聊缺前情、指代不明 | 真没明白；已听懂歪理用04 |
| 02 为难 | 玩笑式要求当下办不到的事、无伤大雅的小乌龙 | 苦笑接住；普通反问不等于05的占上风 |
| 03 害羞 | 她接受的真诚夸奖、自己的关心被善意点破 | 油腻或单方面占便宜不自动脸红；夸别人也不是夸她 |
| 04 无语 | 听懂下头双关、尬撩、占便宜、歪理或烂梗，但不买账 | 轻度拒绝仍可配图，不必真生气，也不必装不懂 |
| 05 得意 | 猜中、识破、反将一军、博士认输 | 有可见的占上风；不是所有俏皮回答 |
| 06 会意 | 留座、善意邀约、彼此默契、普通友好回应 | 可表达从容微笑；单方面要求不等于双方默契 |
| 摇摆 GIF | 邀舞、摇摆、冒泡出场、欢迎、庆祝 | 实际任务优先，引用“跳舞”不算邀舞 |

通常是短台词、可选的简短演出和一张图片组成同一条消息。只有明确禁图、需要干净数字／代码／JSON／译文、真实危险痛苦、严重冲突或确无贴切图片时纯文字。普通问题先答完整，可带合适的图；连续接话和刚用过同图不自动退回文字。不设置跨群图片冷却，不增加机器人主动插话频率。

维护入口为 [sticker-policy.md](../skills/arturia/behaviors/sticker-policy.md)、[catalog.json](../stickers/catalog.json) 的 `natural_triggers`／`selection_boundary` 和 [few-shot.json](../skills/arturia/examples/few-shot.json)。正式预设与原生示例共用按批准状态过滤的样例，撤批图片不会残留在运行示例中。

这是模型的语义选择规则，不能保证任意表达必出固定图片。复测使用自然转述、相邻情绪、文字排除和合成多轮上下文，逐项保留漏图与错图；结果和限制见 [评估记录](../validation/natural-sticker-evaluation.md)。

2026-10-24 的首轮自然触发优化固定回归42次均出图、40次精确选图；另6条新正例均选对。相关旧版报告中的“混合实质问题必须无图”属于当时的低频策略，已被用户后续的高频要求取代，不能继续作为当前验收标准。旧证据作为历史保留。

本轮高频与群聊态度优化的合成对照为：普通正例出图47/56→56/56，严格选图41/56→55/56，无语12/20→20/20；8条真正排除项和10条新对照通过。只保留了一次疑惑／苦笑的相邻错选。一个经用户授权查看的近期漏图案例还做了私有重放；仓库只收 [脱敏计数](../validation/group-emotion-private-replay-summary.json)，不收真实群聊原文。完整合成测试和中途网络失败的保留、恢复方式见 [本轮评估](../validation/group-emotion-evaluation.md)。

正式预设通过文件哈希、安装版解析器和逐请求 computed 读取机制验证；没有伪称读到了未公开的内存正文接口。原生 Skills 通过控制台读回正文核对。首轮部署证据 [热更新记录](../validation/natural-sticker-deployment-20261024.json) 与 [线上读回](../validation/natural-sticker-live-readback.json) 是历史快照；本轮以 [部署记录](../validation/group-emotion-deployment-20261024.json) 和 [线上读回](../validation/group-emotion-live-readback.json) 为准。测试不向 QQ 群发送消息。

### 唤醒消息里的图片

当前 `gpt-6-luna` 真实接口支持图像，但安装版适配器无法从这个自定义模型名自动推断 `ImageInput`。没有能力标记时，核心只注入 `[image:URL]` 文本，不会真的把图像内容传给模型。

接入时在 OpenAI-like 的 `additionalModels` 明确当前模型的 `text_input`、`tool_call`、`image_input` 能力，并保留原推断的128000上下文。普通唤醒消息附图、艾特附图及引用消息中可解析的图会由核心转换成图像输入；不需要用户手动调用 Skill。已安装的多模态插件仅启用 GIF 上下文处理，平均抽取3帧；文件读取工具、音频和 Computer 不随之开启。GIF文件本身的70帧不变。

安装版转换器、核心输入处理器、多模态 GIF 处理器和实际请求格式的前后对照见 [图片输入验证](../validation/vision-input-results-20261024.json)。测试使用合成静图中的随机字符／颜色及GIF中的不同帧内容，通过同一路由实际识别；没有使用真实群图片作为公开测试资料。

本轮已经仅重载两个相关插件，并读回其加载配置和运行状态：[上线记录](../validation/vision-input-deployment-20261024.json)。读取已部署配置后的 [原生处理链与识别复测](../validation/vision-input-live-results-20261024.json) 及 [正式预设联合测试](../validation/vision-input-combined-results-20261024.json) 通过：图像内容识别正确，普通看图提问的回答还能自然配一张会意图。这里没有直接读取运行时 ModelInfo 的 RPC，也没有向真实群发测试消息；证据按实际范围记录。可用 `validation/run-vision-input-probe.py` 复现隔离处理链验证。

## 验证范围

`native-agent-console-state.json` 记录真实管理页面接口返回的七个可见技能、正文读取与唯一启用工具。`native-skills-probe-results.json` 通过已安装包的实际原生 StructuredTool 逐个加载七个模块，并使用当前模型验证表情、陪伴两条工具调用链；探针在独立进程执行，不创建测试预设或正式聊天历史。

`native-agent-activation-20261024.json` 记录正式插件、五群模式切换和历史校验。之前的 `qq-self-probe-results.json` 则证明 PNG/GIF 各一次机器人自聊上传及图片元素回读；它不是本次原生技能调用后的群聊全链路回归。

官方依据：

- https://chatluna.chat/ecosystem/plugin/extension-agent.html
- https://chatluna.chat/guide/preset-system/write-preset.html
- https://registry.npmjs.org/koishi-plugin-chatluna-agent/1.0.49
