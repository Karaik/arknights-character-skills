# 阿尔图罗角色 Skill · Koishi / ChatLuna

面向 QQ 群聊的塑心／阿尔图罗／图图／图图姐／香草榜第一角色包。它们是同一个身份。资料、说话风格、关系、场景行为和表情分别维护，主 Skill 只保留运行核心。

本群每位群友都是独立的博士；用昵称与发送者身份分别维护关系。角色保留简短括号演出，单独在 [演出模块](skills/arturia/references/performance.md) 管理神态、动作与台词的配合。

## 先看这三个地方

- [表情审核页面](review/index.html)：33 张素材（20 张无角色通用图＋12 张图图本人官方剧情差分裁切＋1 张图图摇摆 GIF），逐张标注情绪、出处、理由和使用场景。管理者已批准 `arturia-sway-01`，其余 32 张待审。
- [Skill 入口](skills/arturia/SKILL.md)：人物核心与按需资料。
- [Koishi 接入说明](docs/koishi.md)：实际 ChatLuna 1.4.2 可解析导出与受控发送插件。txy 已经管理者确认正式启用，5 个群当前会话切换为 `gpt-6-luna`，并保留独立测试预设。

预览：[无角色通用表情](review/contact-sheet-01.jpg) · [图图本人表情差分](review/contact-sheet-02.jpg)。[热门塑心同人 GIF 线索](review/community-leads.md)单列，当前尚未取得那套原始 GIF，没有以封面充数。

已批准：[图图摇摆 GIF](skills/arturia/assets/stickers/arturia-sway-01.gif)，适合开心、欢迎和熟人接梗。它是用户提供动作、参考描改并明确认可的作品；来源链与修改说明在 [描改素材记录](sources/arturia-redraws.json)。运行清单只含这一张。

## 模块

```text
skills/arturia/
  SKILL.md                 简短运行核心、昵称和资料路由
  references/              身份、性格、说话方式、关系、时间线与来源
  behaviors/               群聊、接梗、陪伴
  examples/                原创对话样例
  assets/stickers/         实际候选图片（默认不进入运行包）
profiles/                  角色组合方式、模型说明、匿名群关系示例
stickers/catalog.json      逐张分类与管理者审批的唯一来源
adapters/                  ChatLuna 配置参考与 Koishi 发图插件
sources/                   PRTS 修订号、抓取哈希、社区来源线索
review/                    可视化候选目录
validation/                行为案例及验证记录
exports/chatluna/          最新可查看的生成预设快照
dist/                      可导入 Skills ZIP
```

事实来自 PRTS 档案、完整基础语音、模组故事和密录“天空与流云”。性格提炼与原创群聊例子分别标明。生日为 9 月 23 日、身高 168cm，已修正旧提示中的错误。

运行中的对话示例在 `skills/arturia/examples/few-shot.json` 单独维护，通过 `profiles/arturia.json` 选择。涉及图片的示例声明所需 ID，只有对应图片获批时才进入导出；角色文字与图片审批可以分别调整。

## 本地生成与验证

```powershell
python -m pip install -r requirements.txt
npm ci --ignore-scripts --legacy-peer-deps
python scripts/review_catalog.py
python scripts/build.py
python scripts/validate.py
npm test
python -m unittest discover -s tests -p "test_*.py"
npm run test:chatluna
python scripts/package_release.py
```

`build/` 是生成目录，重建会清除其中旧运行素材；不要把手工内容放进去。常驻提示由身份、性格、说话方式、演出与群聊模块组成，另有按关键词触发的资料；不是每轮把所有来源一起发送。

确认保留其他表情后，再运行 docs/koishi.md 中的审批步骤。未经批准的素材不会出现在 runtime manifest。本地描改素材重新采集时使用仓库文件并验证哈希，原批准仅在哈希相同时保留。真人群友资料放入忽略的 `local/`，不要把原始群聊、密钥或服务器配置提交进来。

## 验证边界

已做完整图片解码、哈希与元数据核对，真实 ChatLuna 预设解析和 pure-text 渲染验证，以及独立角色场景演练。当前渠道 `gpt-6-luna` 的 6 个匿名场景各跑旧版／新版一次，共 12 次实际调用，最终示例版本再做 4 次复核；新版纯动图回复经已安装的 Koishi 钩子转为获批 GIF 的完整内联数据。随后管理者明确批准正式启用，现已替换生产角色、迁移 5 个群当前会话的模型并开放这 5 个群的发图白名单。958 条原有历史记录校验一致。未发送合成 QQ 测试消息。样本见 [实际调用结果](validation/model-probe-results.json)及[正式切换记录](validation/production-cutover-result.json)；这不是长期或跨模型统计评测。

本次核对发现，5 个群当前会话原先为 4 个 DeepSeek、1 个 Sonnet，而当前启用渠道不提供这些 ID；实际 DeepSeek 请求返回 404。按管理者确认，这 5 个群已统一改为原有全局默认 `gpt-6-luna`。其它非目标会话的模型选择未迁移。

## 素材说明

20 张来自 PRTS 收录的官方无角色通用套组；12 张裁自阿尔图罗本人官方剧情表情差分；另 1 张为管理者提供动作并认可的塑心描改 GIF。来源和衍生过程分别记录，不冒充官方独立表情包或已流行作品。其他干员／身份不明人物的图已移除。原创代码与整理说明采用 MIT，第三方图像及原作内容不在 MIT 授权范围内，见 [素材来源](sources/assets.md)。
