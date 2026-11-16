# -*- coding: utf-8 -*-
"""MA 加载器独立插件的最小 utils。

本插件由 ComfyUI-Magic-Assistant 的「强力lora加载器」拆分而来，完全独立运行，
不复用原插件的任何运行时状态。此处仅提供本插件节点所需的最小接口：

- BASE_DIR：本插件根目录
- USER_DIR：本插件私有的 userdata 目录（预设、LoRA 元数据等均落在此处，
  与原插件 userdata 相互独立）
- PRESET_DIR：本插件私有的 savedata 目录
- MagicUtils：兼容原插件访问风格（MagicUtils.USER_DIR 等）
"""

import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PRESET_DIR = os.path.join(BASE_DIR, "savedata")
USER_DIR = os.path.join(BASE_DIR, "userdata")

for _d in (PRESET_DIR, USER_DIR):
    try:
        os.makedirs(_d, exist_ok=True)
    except Exception:
        pass


class MagicUtils:
    BASE_DIR = BASE_DIR
    PRESET_DIR = PRESET_DIR
    USER_DIR = USER_DIR
