# 阿尔图罗角色 Skill · Koishi / ChatLuna

面向 QQ 群聊的塑心／阿尔图罗／图图／图图姐／香草榜第一角色包。它们是同一个身份。资料、说话风格、关系、场景行为和表情分别维护，主 Skill 只保留运行核心。

本群每位群友都是独立的博士；用昵称与发送者身份分别维护关系。角色保留简短括号演出，单独在 [演出模块](skills/arturia/references/performance.md) 管理神态、动作与台词的配合。

## 先看这三个地方

- [表情审核页面](review/index.html)：32 张实际候选（20 张无角色通用图＋12 张图图本人官方剧情差分裁切），每张都有情绪、出处、选用理由及不适用场景。初始全部待你审核。
- [Skill 入口](skills/arturia/SKILL.md)：人物核心与按需资料。
- [Koishi 接入说明](docs/koishi.md)：实际 ChatLuna 1.4.2 可解析导出与受控发送插件。txy 已按管理者后续授权安装并启用，测试预设与生产角色分开。

预览：[无角色通用表情](review/contact-sheet-01.jpg) · [图图本人表情差分](review/contact-sheet-02.jpg)。[热门塑心同人 GIF 线索](review/community-leads.md)单列，当前尚未取得那套原始 GIF，没有以封面充数。

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

确认保留表情后，才运行 docs/koishi.md 中的审批步骤。所有候选在批准前都不会出现在 runtime manifest。真人群友资料放入忽略的 `local/`，不要把原始群聊、密钥或服务器配置提交进来。

## 验证边界

已做完整图片解码、哈希与元数据核对，真实 ChatLuna 预设解析和 pure-text 渲染验证，以及独立角色场景演练。后续按管理者授权在 txy Koishi 容器中安装、启用插件，并以实际 Koishi Context 的 before-send 钩子做隔离验证；仅测试生成像素图，未发送 QQ 消息。测试预设名为“阿尔图罗-skill测试”，未切换生产角色。它们不能替代对 Gemini、DeepSeek 或其他实际渠道的长期评测；没有调用付费推理。

## 素材说明

20 张来自 PRTS 收录的官方无角色通用套组；12 张裁自阿尔图罗本人官方剧情表情差分，记录原图哈希和裁切坐标，不冒充官方独立发布表情包。其他干员／身份不明人物的图已移除。官方来源不等于测得热门。原创代码与整理说明采用 MIT，第三方图像及原作内容不在 MIT 授权范围内，见 [素材来源](sources/assets.md)。
