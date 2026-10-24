# Koishi / ChatLuna 正式接入

当前正式版本使用 Koishi 4.18.11、ChatLuna 1.4.2、`koishi-plugin-chatluna-agent` 1.0.49，以及 `arturia-reviewed-stickers` 0.1.1。前者提供原生 Skills 管理和加载，后者只负责把批准的表情 ID 转成图片；两者作用不同。

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

## 验证范围

`native-agent-console-state.json` 记录真实管理页面接口返回的七个可见技能、正文读取与唯一启用工具。`native-skills-probe-results.json` 通过已安装包的实际原生 StructuredTool 逐个加载七个模块，并使用当前模型验证表情、陪伴两条工具调用链；探针在独立进程执行，不创建测试预设或正式聊天历史。

`native-agent-activation-20261024.json` 记录正式插件、五群模式切换和历史校验。之前的 `qq-self-probe-results.json` 则证明 PNG/GIF 各一次机器人自聊上传及图片元素回读；它不是本次原生技能调用后的群聊全链路回归。

官方依据：

- https://chatluna.chat/ecosystem/plugin/extension-agent.html
- https://chatluna.chat/guide/preset-system/write-preset.html
- https://registry.npmjs.org/koishi-plugin-chatluna-agent/1.0.49
