# 原 70 帧 GIF 局部修正

当前成品为 [arturia-sway-01.gif](../../skills/arturia/assets/stickers/arturia-sway-01.gif)。保留原 70 帧、每帧 100ms，共 7 秒。

`poses/` 保存五张 950px 局部修正画稿。对照图来自最终 GIF 的实际解码像素；`verification.json` 记录对应 10 帧变化及其余 60 帧不变，`independent-qa.json` 记录独立视觉复核。报告中的历史本机路径用于标识当时的输入，不是克隆仓库后的运行路径。

发图素材、情绪分类和 Koishi 导出由仓库根目录的 `scripts/build.py` 生成。本目录不包含依赖本机临时原稿的实验性绘制程序。
