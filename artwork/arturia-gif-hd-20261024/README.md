# 摇摆 GIF 高清化与运行体积验证

管理者明确要求制作高清 GIF，并同步角色 Skill。此次使用已经批准的 512×512、70 帧、7 秒版本作为输入，保留原动作、姿势顺序、每帧 100ms 和无限循环；GIF 不插帧。

角色的 35 个独立姿势先用官方 Real-ESRGAN ncnn Vulkan v0.2.0 与 `realesr-animevideov3-x4` 模型做神经超分，得到 2048×2048 RGBA，再缩至 1024×1024 运行尺寸。比较后选用能保留原平涂风格的动漫视频模型；更强的 x4plus-anime 模型会引入不需要的高光渐变。

透明区域在推理前用最近的可见边缘色扩展 RGB，避免黑色隐藏像素污染轮廓；原 alpha 单独缩放。GIF 使用独立透明色索引和二值 alpha，保留原来存在的细浅色外轮廓、白衣、眼白及光环，没有按颜色抠除白色内容。

插件已有 5 MiB 上限。运行 GIF 使用 112 色全局调色盘，其中为粉红嘴部、金线等小面积颜色保留 16 个色位，禁用抖动，再用 Gifsicle 1.97 做无损结构优化。最终文件 **5,047,924 字节（4.814 MiB）**，未修改插件限制。对应的 128 色候选为 5,318,844 字节，超过上限。

- 当前文件：[arturia-sway-01.gif](../../skills/arturia/assets/stickers/arturia-sway-01.gif)
- [神经超分细节对照](character-detail-contact.png)
- [运行 GIF 与 RGBA、初版 GIF 的细节对照](runtime-detail-comparison.png)
- [完整验证记录](verification.json)

Pillow 逐帧检查与 FFprobe 均确认 1024×1024、70 帧、每帧 100ms、总计 7 秒、35 个独立可见姿势。所有帧透明掩模与参考 PNG 阈值完全一致；LCDF `gifdiff` 确认结构优化前后显示像素相同。已检查全部 35 个姿势，以及头发、光环、眼睛、粉红嘴部、白衣和金线细节。GIF 调色会引入小幅颜色误差，不改变透明几何和动作时序。

超分工具来源：[Real-ESRGAN ncnn Vulkan v0.2.0](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan/releases/tag/v0.2.0)；模型来源：[Real-ESRGAN v0.2.5.0](https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0)。工具和模型保持各自许可；图像衍生过程不改变原素材来源或授权归属。

旧的袖根、长发、裙边局部修正记录属于上一个阶段；“仅 10 帧改变，其余 60 帧像素不变”不适用于这次统一超分。升级前的 QQ 实发记录也不代表当前高清文件已经部署或实发，本记录只覆盖本地素材、目录和导出验证。
