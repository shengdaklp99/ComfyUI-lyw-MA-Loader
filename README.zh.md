# ComfyUI-lyw-MA-Loader

ComfyUI 的独立强力 LoRA 加载器：预设、群组、多选、Civitai 信息爬取、预览图、触发词，并可选与 [Lora Manager](https://github.com/willmiao/ComfyUI-Lora-Manager) 互通。

English: [README.md](README.md)

## 功能

- 节点内可视化 LoRA 列表：缩略图、权重、备注、触发词、逐行启用/停用
- **群组**：任意拖拽排序，鼠标落点插入；整组可一键忽略（忽略期间组内勾选保持不变）
- **左侧预设与收藏**：拖到右侧列表任意位置即可落点插入
- **多选**：选中多行后可组成群组、批量复制，或复制到一个额外群组（原条目保留）
- **Civitai 信息**：按 SHA256 获取触发词与预览图并保存到模型同目录；没装 Lora Manager 也能独立工作
- **信息管理弹窗**：批量补全、重新检查来源、更新已有信息；「未找到来源」的条目单独归类，不混进补全
- **颜色设置**：单条 LoRA / 单个文件夹可设独立配色，并可选「跟随全局」或「独立固定」
- **链式加载**：`lora串输出` 接到下一个加载器时，只在链末端加载
- **多语言**：节点标题、端口与弹窗跟随系统语言（中文系统中文，其它系统英文）

## 安装

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/<用户名>/ComfyUI-lyw-MA-Loader.git
```

重启 ComfyUI，节点位于 **✨ Magic Assistant → lyw-MA加载器**。

除 ComfyUI 自带的 Pillow / numpy / torch 外无需额外依赖；`opencv-python` 为可选项，仅用于从视频预览中提取首帧。

## 使用

1. 添加 **lyw-MA加载器** 节点并连接 `model`。
2. 点击底部「添加」加入 LoRA，或从左侧预设/收藏拖入。
3. 点击行切换是否参与加载；拖动行或群组标题可调整顺序。
4. 右键行：替换 / 复制 / 组成文件夹 / 额外群组 / 爬取信息 / 颜色设置 / 删除。
5. 需要输出触发词就把 `触发词输出` 接到文本或 CLIP；需要串联就接 `lora串输出`。

## 与 Lora Manager 的关系

安装了 [Lora Manager](https://github.com/willmiao/ComfyUI-Lora-Manager) 时，会复用它的 sidecar（`<模型名>.metadata.json`）与下载接口，两边显示保持同步；未安装时回退到插件自身的 Civitai 爬取，同样可以下载预览图和触发词。

## 语言

按系统语言自动切换：中文系统中显示中文，其它系统一律显示英文。要补充界面文案，改 `web/ma_power_lora.js` 里的 `MPL_I18N_EN` 词典和 `locales/<lang>/nodeDefs.json`。

## 许可

MIT
