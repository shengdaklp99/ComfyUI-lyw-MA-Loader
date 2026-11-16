# ComfyUI-lyw-MA-Loader

A standalone, feature-rich LoRA loader node for ComfyUI — presets, folders, multi-select, Civitai metadata fetching, preview images, trigger words, and optional [Lora Manager](https://github.com/willmiao/ComfyUI-Lora-Manager) integration.

中文说明：[README.zh.md](README.zh.md)

## Features

- **Visual LoRA list** inside the node: thumbnails, weights, notes, trigger words, enable/disable toggle per row
- **Folders (groups)**: group LoRAs, drag to reorder freely, drop onto any position; ignore a whole group without losing per-row selections
- **Presets & favorites** in the left sidebar: drag a preset or favorite into the list and it lands exactly where you drop it
- **Multi-select**: enable several rows, then group them, duplicate them, or copy them into an extra group
- **Civitai metadata**: fetch trigger words and preview images by SHA256, save them next to the model file; works standalone, and syncs with Lora Manager when it is installed
- **Info manager dialog**: batch fill missing info, re-check sources, update existing info, and keep "not found" items in their own category
- **Color themes** per LoRA / per folder, with a "follow global" or "fixed" mode per item
- **Chain support**: connect `lora串输出` to another loader; only the terminal loader applies LoRAs
- **i18n**: node title, ports and dialogs follow the system language (Chinese on Chinese systems, English elsewhere)

## Installation

1. Clone into your ComfyUI custom nodes folder:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/shengdaklp99/ComfyUI-lyw-MA-Loader.git
```

2. Restart ComfyUI. The node appears under **✨ Magic Assistant → lyw-MA Loader**.

No extra Python packages are required beyond what ComfyUI already ships (Pillow, numpy, torch). `opencv-python` is optional and only used to extract a frame from video previews.

## Usage

1. Add the **lyw-MA Loader** node and connect `model`.
2. Click **添加 (Add)** to append LoRAs, or drag from the left sidebar presets/favorites.
3. Click a row to toggle whether it participates in loading; drag rows or group titles to reorder.
4. Right-click a row for replace / duplicate / group / extra group / fetch info / colors / delete.
5. Connect `触发词输出` to a text/CLIP encoder if you want the node to emit trigger words; connect `lora串输出` to chain another loader.

## Lora Manager integration (optional)

If [Lora Manager](https://github.com/willmiao/ComfyUI-Lora-Manager) is installed, the loader reuses its sidecar files (`<model>.metadata.json`) and its Civitai fetch endpoint so both UIs stay in sync. Without Lora Manager the loader falls back to its own Civitai crawl and still downloads previews and trigger words.

## Language

The node follows the system language: Chinese systems show Chinese, every other system shows English. The UI text can be extended by editing `web/ma_power_lora.js` (dictionary `MPL_I18N_EN`) and `locales/<lang>/nodeDefs.json`.

## License

MIT
