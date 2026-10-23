# Koishi / ChatLuna 接入说明

本仓库已做离线接口验证，不会自动安装到当前服务器。验证版本：Koishi 4.18.11、ChatLuna 1.4.2、Node 22.19.0。现有 OneBot 6.9.5 / NapCat 不需要替换。

## 先审表情

打开 `review/index.html`，看原图、情绪、来源、理由、适用和回避场景。28 张当前都是 pending。管理者确认 ID 后，可以在仓库本地执行：

```powershell
python scripts/review_stickers.py approve yostar-03 prts-06 --note "管理者明确保留这两个ID"
python scripts/review_catalog.py
python scripts/build.py
python scripts/validate.py
```

这只是仓库本地审批与生成，没有服务端动作。切勿把文件存在、官方来源或模型请求当作审批。重新拉取图片时，只有哈希不变的旧审批才保留。

## 普通 ChatLuna 接法（优先）

1. 本地执行 `python scripts/build.py`。`build/arturia.yml` 是可直接被 ChatLuna 1.4.2 解析的普通预设，包含八个身份别名、常驻核心和四个世界书模块。
2. 经另行批准后，备份服务端原 `arturia.yml`，再将此生成文件放进 Koishi 的 `data/chathub/presets`。不要用整个 Koishi 配置覆盖现有配置。
3. 在目标会话选择“阿尔图罗”预设。保留会话选择的模型；全局默认和已存在会话模型可能不同。
4. 表情接法使用下面的本地插件。不开表情时，直接保持普通纯文本预设即可。

`authors_note` 按 ChatLuna 1.4.2 实际字段 `insertFrequency` 输出；与某些旧文档的 `insertionFrequency` 不同，已经过真实解析器核验。

## Koishi 发送适配器

仓库提供一个很小的本地插件 `adapters/koishi`，不是新机器人框架。它监听真实 Koishi `before-send` 事件，限于指定 OneBot 群；将已批准的 `[[sticker:ID]]` 转成 Koishi `h.image(Buffer, 'image/png')`。图片经校验后以内联数据交给 OneBot，避免依赖两个容器相同的本地文件路径。

本地打包：

```powershell
npm pack ./adapters/koishi --pack-destination ./build
```

之后经批准，在 Koishi 项目安装生成的本地 tgz。复制 `build/runtime/` 到容器内可读的目录，例：`/koishi/data/arturia/runtime/`；插件的 `manifestPath` 指向里面的 manifest.json。每个文件都须与 manifest 的相对路径一致。`allowedGuilds` 默认空，完全不处理群消息；由管理者填入允许群。

`adapters/chatluna/config.example.yml` 是合并参考，真实插件组和实例名沿用现有部署。图片标记需要完整交给发送钩子，所以推荐关闭角色流式输出，关闭分句发送，保留 `pure-text`。不要全局改其他业务的渲染方式。

已验证：真实 ChatLuna pure-text 渲染保留标记；真实 Koishi 消息元素可由钩子替换；未审核、未知、越界路径或哈希变化的图片不能发送。当前没有做真实 QQ 图片上传，也没有给群里发送测试消息。

## MemesLuna 可选接法

`build/memesluna-approved/` 是经批准图片的上传目录；`build/memesluna-labels.json` 是标签对照，**不是 MemesLuna 原生可直接导入的配置文件**。在 MemesLuna 管理页建合集，再上传目录中的图片、按对照填写标签即可。默认目录为空。

如果选择它提供图片路由，可用同 Docker 网络可达的 Koishi 服务名，避免写死容器 IP。本仓库优先使用上面的本地发送适配器，减少 URL、图床过期和渲染差异；不同时要求两条发图链路。

## 标准 Skills 接法（可选）

`dist/arturia-skill-0.1.0.zip` 包含独立 `arturia/SKILL.md`、所有参考与候选图。ChatLuna Agent 安装后可导入该目录；按官方文档核对 `plugin` 模式与 skill/file_read 权限。素材目录仍不是获批清单。普通 ChatLuna 接法不依赖 Agent，也不需要开放服务器 Shell 或任意文件工具。

本仓库没有声称 `chatluna-character` 与普通 ChatLuna 预设直接互通。若以后采用 Character 插件，其状态／触发格式需要独立适配；本次不用它替换现有工作流。

## 旧上下文与模型

先保留原历史，在独立会话评估新版。旧回复可能延续同一种语气；不清空数据库。模型采样参数不统一乱调，也不把角色设定当作解除模型限制的手段。

官方依据：

- https://chatluna.chat/guide/preset-system/write-preset.html
- https://chatluna.chat/ecosystem/plugin/extension-agent.html
- https://github.com/lumia1998/koishi-plugin-memesluna
- https://github.com/koishijs/satori （before-send 与 h.image 的消息发送接口）
