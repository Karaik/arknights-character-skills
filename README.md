# 阿尔图罗角色 Skill · Koishi / ChatLuna

面向 QQ 群聊的塑心／阿尔图罗／图图／图图姐／香草榜第一角色包。它们是同一个身份。资料、说话风格、关系、场景行为和表情分别维护，主 Skill 只保留运行核心。

## 先看这三个地方

- [表情审核页面](review/index.html)：28 张实际官方候选，每张都有情绪、出处、选用理由及不适用场景。全部待你审核。
- [Skill 入口](skills/arturia/SKILL.md)：人物核心与按需资料。
- [Koishi 接入说明](docs/koishi.md)：实际 ChatLuna 1.4.2 可解析导出与受控发送插件，不会自动部署。

预览：[官方庆典表情](review/contact-sheet-01.jpg) · [官方游戏内表情](review/contact-sheet-02.jpg)。[热门塑心同人 GIF 线索](review/community-leads.md)单列，当前尚未取得原始 GIF，没有以封面充数。

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

`build/` 是生成目录，重建会清除其中旧运行素材；不要把手工内容放进去。常驻提示约 2,800 中文字符，另有按关键词触发的资料；不是每轮把所有来源一起发送。

确认保留表情后，才运行 docs/koishi.md 中的审批步骤。所有候选在批准前都不会出现在 runtime manifest。真人群友资料放入忽略的 `local/`，不要把原始群聊、密钥或服务器配置提交进来。

## 验证边界

已做完整图片解码、哈希与元数据核对，真实 ChatLuna 预设解析和 pure-text 渲染验证，以及独立角色场景演练。它们不能替代对 Gemini、DeepSeek 或其他实际渠道的长期评测。本次没有调用付费推理、安装服务端插件、修改线上提示或发送 QQ 消息。

## 素材说明

16 张来自 Yostar 官方 CDN；12 张来自 PRTS 收录的官方游戏内套组。官方来源不等于已经测得热门。图片保留原样和版权标记；原权利归属不因私有仓库而改变。原创代码与整理说明采用 MIT，第三方图像及原作内容不在 MIT 授权范围内，见 [素材来源](sources/assets.md)。
