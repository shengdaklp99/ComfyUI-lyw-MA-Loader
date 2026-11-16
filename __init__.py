# -*- coding: utf-8 -*-
"""ComfyUI-lyw-MA-Loader

由 ComfyUI-Magic-Assistant 的「🚀 强力lora加载器 Magic Power LoRA Loader」节点
单独拆分而来，作为独立插件运行，与原插件互不影响：

- 独立的 Python 模块与类（MAPowerLoraLoader）
- 独立的前端扩展（NODE_NAME = "MAPowerLoraLoader"）
- 独立的后端路由前缀（/malora/lora/*），不与原插件的 /ma/lora/* 冲突
- 独立的 userdata 目录（本插件目录内），预设与 LoRA 元数据独立存储

节点显示名：MA加载器
"""

import os

# 屏蔽 kornia 可选依赖提示（与原插件一致，保持导入安静）
os.environ.setdefault("KORNIA_INSTALLATION_MODE", "skip")
os.environ.setdefault("KORNIA_AUTOINSTALL", "0")

from .nodes.ma_power_lora import MAPowerLoraLoader
from .nodes.llm_style_filter import MALLMStyleFilter

NODE_CLASS_MAPPINGS = {
    "MAPowerLoraLoader": MAPowerLoraLoader,
    "MALLMStyleFilter": MALLMStyleFilter,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MAPowerLoraLoader": "lyw-MA加载器",
    "MALLMStyleFilter": "lyw-风格词过滤",
}

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

print("\n" + "\033[36m" + "=" * 60 + "\033[0m")
print("\033[36m🅼🅰 [MA Loader] 已加载 — MA加载器 (独立插件)\033[0m")
print("\033[36m   👉 Nodes: " + str(list(NODE_CLASS_MAPPINGS.keys())) + "\033[0m")
print("\033[36m" + "=" * 60 + "\033[0m" + "\n")
