import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_NAME = "MAPowerLoraLoader";

// ---------------------------------------------------------------------------
// Debug switch (frontend)
// ---------------------------------------------------------------------------
// 用途：在浏览器端打印诊断日志，排查「旧工作流污染」「隐藏 widget 注入」「模式字段错位」等问题。
//
// 开启方式（任选其一）：
// 1) 浏览器控制台执行并刷新页面：
//    localStorage.setItem('MAGIC_ASSISTANT_DEBUG', '1'); location.reload();
// 2) URL 参数（临时）：在 ComfyUI 页面地址后追加：
//    ?MAGIC_ASSISTANT_DEBUG=1
// 3) 代码临时开启：在控制台执行：
//    window.MAGIC_ASSISTANT_DEBUG = true
//
// 关闭方式：
//    localStorage.removeItem('MAGIC_ASSISTANT_DEBUG'); location.reload();
//
// 注意：开启后会打印较多日志，建议仅在排障期间启用。
const MPL_DEBUG_KEY = "MAGIC_ASSISTANT_DEBUG";
function mplIsDebugEnabled() {
    try {
        if (window.MAGIC_ASSISTANT_DEBUG === true) return true;
        const qs = new URLSearchParams(window.location.search || "");
        const qv = (qs.get(MPL_DEBUG_KEY) || "").trim().toLowerCase();
        if (["1", "true", "yes", "y", "on"].includes(qv)) return true;
        const lv = (localStorage.getItem(MPL_DEBUG_KEY) || "").trim().toLowerCase();
        return ["1", "true", "yes", "y", "on"].includes(lv);
    } catch (e) {
        return false;
    }
}
function mplDebugLog(...args) {
    if (mplIsDebugEnabled()) console.log("[MagicAssistant DEBUG]", ...args);
}

// 全局LoRA图片缓存（类似参考代码的loraImages）
let loraImagesCache = {};
let loraNamesCache = null;
let loraNamesOptionsCache = [];
let loraNamesLoadPromise = null;

// 统一的线性 SVG 图标库（stroke=currentColor，跟随文字色，风格统一）
const MPL_ICONS = {
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    download: '<path d="M12 3v12"/><polyline points="6 11 12 17 18 11"/><line x1="4" y1="21" x2="20" y2="21"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    folderPlus: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
    close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
    sort: '<polyline points="7 4 7 20"/><polyline points="3 8 7 4 11 8"/><polyline points="17 20 17 4"/><polyline points="21 16 17 20 13 16"/>',
    chevronDown: '<polyline points="6 9 12 15 18 9"/>',
    chevronRight: '<polyline points="9 18 15 12 9 6"/>',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    paste: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>'
};
function mplIcon(name, size) {
    const body = MPL_ICONS[name];
    if (!body) return "";
    const s = size || 16;
    return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;flex:0 0 auto;">${body}</svg>`;
}

// 颜色来源模式：跟随全局（global）/ 独立固定（custom）。切换只改 UI，确定时写入对象持久化
function mplColorModeSwitch(parent, initial, onChange) {
    let mode = initial === "custom" ? "custom" : "global";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:10px;";
    const lab = document.createElement("span");
    lab.textContent = "颜色来源";
    lab.style.cssText = "font-size:12px;color:#a9adc0;min-width:100px;";
    row.appendChild(lab);
    const mk = (key, text, tip) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.title = tip;
        b.style.cssText = "padding:4px 12px;border-radius:6px;font-size:12px;cursor:pointer;border:1px solid #454856;";
        b.onclick = () => {
            if (mode === key) return;
            mode = key; paint(); onChange(mode);
        };
        row.appendChild(b);
        return b;
    };
    const bGlobal = mk("global", "跟随全局", "改动全局默认颜色时，本条会一起变化");
    const bCustom = mk("custom", "独立固定", "本条使用自己的颜色，不受全局改动影响");
    function paint() {
        const follow = mode === "global";
        bGlobal.style.background = follow ? "#6c8cff" : "#2c2e38";
        bGlobal.style.color = follow ? "#fff" : "#c8cad6";
        bGlobal.style.borderColor = follow ? "#6c8cff" : "#454856";
        bCustom.style.background = follow ? "#2c2e38" : "#6c8cff";
        bCustom.style.color = follow ? "#c8cad6" : "#fff";
        bCustom.style.borderColor = follow ? "#454856" : "#6c8cff";
    }
    paint();
    parent.appendChild(row);
    return { getMode: () => mode };
}


function mplNormalizeLoraName(name) {
    return String(name || "").replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}
function mplClampWeight(v) {
    return Math.max(-10, Math.min(10, Math.round(parseFloat(v) * 100) / 100));
}
function mplLoraWeight(l) {
    const w = parseFloat(l && l.weight);
    return Number.isFinite(w) ? w : 1;
}
function mplClipFollowsWeight(l) {
    if (!l) return true;
    if (typeof l.clipFollow === "boolean") return l.clipFollow;
    const c = parseFloat(l.clipWeight);
    return !Number.isFinite(c) || Math.abs(c - mplLoraWeight(l)) < 0.005;
}
function mplClipWeightValue(l) {
    const c = parseFloat(l && l.clipWeight);
    return Number.isFinite(c) ? c : mplLoraWeight(l);
}
function mplSyncClipWeight(l) {
    if (l && mplClipFollowsWeight(l)) l.clipWeight = mplLoraWeight(l);
}
function mplSetCustomClipWeight(l, v) {
    const n = parseFloat(v);
    if (!l || !Number.isFinite(n)) return false;
    l.clipFollow = false;
    l.clipWeight = mplClampWeight(n);
    return true;
}
function mplToggleClipFollow(l) {
    if (!l) return true;
    const follow = !mplClipFollowsWeight(l);
    l.clipFollow = follow;
    if (follow) mplSyncClipWeight(l);
    return follow;
}
function mplUpdateClipBadgeUI(el, l) {
    if (!el || !l) return;
    mplSyncClipWeight(l);
    const follow = mplClipFollowsWeight(l);
    const cw = mplClipWeightValue(l);
    el.textContent = "C " + cw.toFixed(2);
    el.dataset.mode = follow ? "follow" : "custom";
    const baseStyle = "flex:0 0 56px;width:56px;min-width:56px;height:20px;box-sizing:border-box;padding:2px 4px;border-radius:4px;text-align:center;font:11px Consolas,monospace;line-height:14px;cursor:pointer;";
    if (follow) {
        el.title = `CLIP 权重 ${cw.toFixed(2)}（跟随模型权重）\n右键切换为自定义`;
        el.style.cssText = baseStyle + "border:1px solid #4b3f6b;background:#2a2440;color:#c6a9ff;";
    } else {
        el.title = `CLIP 权重 ${cw.toFixed(2)}（自定义）\n左键修改 / 右键恢复跟随模型权重`;
        el.style.cssText = baseStyle + "border:1px solid #3aa6a1;background:#173a3a;color:#8fe3d2;";
    }
}

// ===== LORA 串解析：兼容「LORA 应用」的 <lora:名称:模型权重:CLIP权重> 格式 =====
// 名称可能只是裸文件名，而本机 LoRA 在子目录里；这里按 basename 自动补全为完整相对路径。
function mplResolveLoraFileName(raw, options) {
    const wanted = String(raw || "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
    if (!wanted) return { name: "", found: false };
    const norm = (s) => String(s || "").replace(/\\/g, "/").replace(/^\.\//, "")
        .toLowerCase().replace(/\.(safetensors|ckpt|pt|pth|bin|gguf|onnx)$/i, "");
    const list = Array.isArray(options) ? options : loraNamesOptionsCache;
    const target = norm(wanted);
    const base = target.split("/").pop();
    if (Array.isArray(list) && list.length) {
        const exact = list.find(f => norm(f) === target);
        if (exact) return { name: exact, found: true };
        const byBase = list.find(f => norm(f).split("/").pop() === base);
        if (byBase) return { name: byBase, found: true };
        const bySuffix = list.find(f => norm(f).endsWith("/" + base));
        if (bySuffix) return { name: bySuffix, found: true };
    }
    return { name: wanted, found: false };
}

function mplParseLoraString(text, options) {
    const src = String(text || "");
    const out = [];
    const seen = new Set();
    const clampW = (v) => Math.max(-10, Math.min(10, Math.round(v * 100) / 100));
    const push = (rawName, rawW, rawC) => {
        const resolved = mplResolveLoraFileName(rawName, options);
        const key = resolved.name.toLowerCase();
        if (!resolved.name || seen.has(key)) return;
        seen.add(key);
        const wNum = parseFloat(rawW);
        const cNum = parseFloat(rawC);
        const mw = Number.isFinite(wNum) ? clampW(wNum) : 1;
        const explicitClip = rawC !== undefined && String(rawC).trim() !== "";
        const cw = Number.isFinite(cNum) ? clampW(cNum) : mw;
        const clipFollow = !explicitClip || Math.abs(cw - mw) < 0.005;
        out.push({
            name: resolved.name,
            weight: mw,
            clipWeight: clipFollow ? mw : cw,
            clipFollow,
            enabled: true,
            tags: "",
            note: "",
            triggerWords: "",
            _found: resolved.found,
        });
    };
    const re = /<lora:([^:>]+)(?::([^:>]+))?(?::([^:>]+))?>/gi;
    let m;
    while ((m = re.exec(src)) !== null) push(m[1], m[2], m[3]);
    if (!out.length) {
        // 兜底：没有 <lora:...> 时，按行/逗号接受「名称:模型权重:CLIP权重」
        src.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean).forEach(line => {
            const parts = line.split(":").map(s => s.trim());
            push(parts[0], parts[1], parts[2]);
        });
    }
    return out;
}

// 唯一的「是否启用」判定：只有显式 false / 0 / "false" 等才算停用，缺省一律启用。
// 所有 UI 判断和序列化都必须走这里，避免两套语义（!enabled vs !== false）打架。
function mplLoraEnabled(item) {
    if (!item) return false;
    const v = item.enabled;
    if (v === undefined || v === null) return true;
    if (typeof v === "string") return !["false", "0", "no", "off", ""].includes(v.trim().toLowerCase());
    return v !== false && v !== 0;
}
// 把整个 loraData 里的 enabled 规范成严格布尔（新增/拖入/预设/旧工作流的所有入口都收敛到这里）
let MPL_LAST_REPAIRS = 0;
function mplNormalizeLoraData(data) {
    MPL_LAST_REPAIRS = 0;
    if (!data || typeof data !== "object") return data;
    const fix = (l) => {
        if (!l || typeof l !== "object") return;
        if (typeof l.enabled !== "boolean") MPL_LAST_REPAIRS++;
        l.enabled = mplLoraEnabled(l);
        if (l.note === undefined) l.note = "";
        if (l.triggerWords === undefined) l.triggerWords = "";
        const w = parseFloat(l.weight);
        const c = parseFloat(l.clipWeight);
        const baseW = Number.isFinite(w) ? w : 1;
        if (!Number.isFinite(c)) {
            l.clipWeight = baseW;
            MPL_LAST_REPAIRS++;
        }
        if (typeof l.clipFollow !== "boolean") {
            l.clipFollow = Math.abs(parseFloat(l.clipWeight) - baseW) < 0.005;
            MPL_LAST_REPAIRS++;
        }
        if (l.clipFollow) l.clipWeight = baseW;
    };
    (Array.isArray(data.loras) ? data.loras : []).forEach(fix);
    (Array.isArray(data.folders) ? data.folders : []).forEach(f => {
        if (!f) return;
        if (!Array.isArray(f.loras)) f.loras = [];
        f.loras.forEach(fix);
    });
    return data;
}

// 预览图按需刷新：爬取到新图后给这张卡片/行加时间戳，绕过浏览器缓存
const MPL_IMG_BUST = new Map();
function mplBumpImage(name) {
    if (name) MPL_IMG_BUST.set(String(name), Date.now());
}
function mplBustSuffix(name) {
    const t = MPL_IMG_BUST.get(String(name || ""));
    return t ? "&t=" + t : "";
}

// 侧边栏全局数据（预设分类 + 收藏夹），所有节点共享同一份
const MPL_SIDEBAR = {
    loaded: false,
    loading: null,
    presets: {},
    categories: [],
    assignments: {},
    preset_order: [],
    favorites: [],
};
// 侧栏分组的展开/折叠状态（全局记忆，刷新后保持）
const MPL_SIDE_OPEN = (() => {
    try {
        const o = JSON.parse(localStorage.getItem("MPL_SIDE_OPEN") || "{}");
        return (o && typeof o === "object") ? o : {};
    } catch (e) { return {}; }
})();
function mplSaveSideOpen(obj) {
    try { localStorage.setItem("MPL_SIDE_OPEN", JSON.stringify(obj || {})); } catch (e) {}
}

async function mplLoadSidebar(force) {
    if (!force && MPL_SIDEBAR.loaded) return MPL_SIDEBAR;
    if (MPL_SIDEBAR.loading) return MPL_SIDEBAR.loading;
    MPL_SIDEBAR.loading = (async () => {
        try {
            const [pRes, mRes, fRes] = await Promise.all([
                api.fetchApi("/malora/lora/get_presets").then(r => r.json()).catch(() => ({})),
                api.fetchApi("/malora/lora/preset_meta").then(r => r.json()).catch(() => ({})),
                api.fetchApi("/malora/lora/favorites").then(r => r.json()).catch(() => ({})),
            ]);
            MPL_SIDEBAR.presets = (pRes && pRes.presets) || {};
            MPL_SIDEBAR.categories = Array.isArray(mRes && mRes.categories) ? mRes.categories : [];
            MPL_SIDEBAR.assignments = (mRes && mRes.assignments) || {};
            MPL_SIDEBAR.preset_order = Array.isArray(mRes && mRes.preset_order) ? mRes.preset_order : [];
            MPL_SIDEBAR.favorites = Array.isArray(fRes && fRes.collections) ? fRes.collections : [];
            MPL_SIDEBAR.loaded = true;
        } catch (e) {
            console.warn("[MA Loader] 侧栏数据加载失败:", e);
        } finally {
            MPL_SIDEBAR.loading = null;
        }
        return MPL_SIDEBAR;
    })();
    return MPL_SIDEBAR.loading;
}
async function mplSavePresetMeta() {
    try {
        await api.fetchApi("/malora/lora/preset_meta", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                categories: MPL_SIDEBAR.categories,
                assignments: MPL_SIDEBAR.assignments,
                preset_order: MPL_SIDEBAR.preset_order,
            }),
        });
    } catch (e) { console.warn("[MA Loader] 保存预设分类失败:", e); }
}
async function mplSaveFavorites() {
    try {
        await api.fetchApi("/malora/lora/favorites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ collections: MPL_SIDEBAR.favorites }),
        });
    } catch (e) { console.warn("[MA Loader] 保存收藏夹失败:", e); }
}
function mplRefreshAllSidebars() {
    (app?.graph?._nodes || []).forEach(n => {
        if (n && typeof n._renderSidebar === "function") n._renderSidebar();
    });
}

// ---------- Lora-Manager 标题/备注 + 按文件名记忆的备注 ----------
const MPL_LM = { info: {}, notes: {}, paths: {}, loaded: false, loading: null };
async function mplLoadExtraInfo(force) {
    if (!force && MPL_LM.loaded) return MPL_LM;
    if (MPL_LM.loading) return MPL_LM.loading;
    MPL_LM.loading = (async () => {
        try {
            const [iRes, nRes, pRes] = await Promise.all([
                api.fetchApi("/malora/lora/lm_info").then(r => r.json()).catch(() => ({})),
                api.fetchApi("/malora/lora/notes").then(r => r.json()).catch(() => ({})),
                api.fetchApi("/malora/lora/paths").then(r => r.json()).catch(() => ({})),
            ]);
            MPL_LM.info = (iRes && iRes.info) || {};
            MPL_LM.notes = (nRes && nRes.notes) || {};
            MPL_LM.paths = (pRes && pRes.paths) || {};
            MPL_LM.loaded = true;
            mplDecorateAllNames();
        } catch (e) { console.warn("[MA Loader] 读取 LoRA 标题/备注失败:", e); }
        finally { MPL_LM.loading = null; }
        return MPL_LM;
    })();
    return MPL_LM.loading;
}
function mplPathFor(name) {
    if (!name) return "";
    const variants = [String(name), String(name).replace(/\\/g, "/"), String(name).replace(/\//g, "\\")];
    for (const v of variants) if (MPL_LM.paths[v]) return MPL_LM.paths[v];
    return "";
}
function mplLmEntry(name) {
    if (!name) return {};
    const variants = [String(name), String(name).replace(/\\/g, "/"), String(name).replace(/\//g, "\\")];
    for (const v of variants) if (MPL_LM.info[v]) return MPL_LM.info[v];
    return {};
}
function mplTitleFor(name) {
    return String(mplLmEntry(name).title || "").trim();
}
// 搜索：匹配文件名/路径/标题；多词时每个词都要命中（顺序无关）
function mplLoraMatchesText(name, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    const raw = `${name}\n${mplTitleFor(name)}`.toLowerCase();
    if (raw.includes(q)) return true;
    const hay = raw.replace(/[_\-\\/.]+/g, " ");
    return q.split(/\s+/).filter(Boolean).every(tok => hay.includes(tok));
}
function mplNoteFor(name) {
    const variants = [String(name || ""), String(name || "").replace(/\\/g, "/"), String(name || "").replace(/\//g, "\\")];
    for (const v of variants) {
        const own = MPL_LM.notes[v];
        if (own !== undefined && String(own).trim()) return String(own);
    }
    return String(mplLmEntry(name).notes || "").trim();
}
async function mplSetNote(name, note, previous) {
    if (!name) return;
    const value = String(note || "");
    // 只有真正改动过才写；单纯点进备注框再失焦（空->空）不清掉记忆
    if (!value.trim() && !(previous && String(previous).trim())) return;
    if (value.trim()) MPL_LM.notes[name] = value;
    else delete MPL_LM.notes[name];
    try {
        await api.fetchApi("/malora/lora/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, note: value }),
        });
    } catch (e) { console.warn("[MA Loader] 保存备注失败:", e); }
}
function mplDecorateName(el, name) {
    if (!el) return;
    const t = mplTitleFor(name);
    el.title = t ? `${name}\n标题：${t}` : name;
}
function mplDecorateAllNames() {
    document.querySelectorAll(".mpl-lora-name[data-lora]").forEach(el => mplDecorateName(el, el.dataset.lora));
}
function mplDecorateNewLora(l) {
    if (!l) return l;
    if (!l.note) l.note = mplNoteFor(l.name) || "";
    if (String(l.tags || "").trim()) l.triggerWords = l.tags;
    else if (String(l.triggerWords || "").trim()) l.tags = l.triggerWords;
    return l;
}
void mplLoadExtraInfo();

function mplPresetFolders(content) {
    if (!content) return [];
    if (Array.isArray(content)) return content.filter(f => f && Array.isArray(f.loras));
    if (Array.isArray(content.folders)) return content.folders.filter(f => f && Array.isArray(f.loras));
    if (Array.isArray(content.loras)) return [{ name: "预设", loras: content.loras }];
    return [];
}

function mplCollectConfiguredLoraNames(node) {
    const names = [];
    const collect = (items) => (items || []).forEach(item => {
        if (item && mplLoraEnabled(item) && item.name) names.push(String(item.name));
    });
    collect(node?.loraData?.loras);
    (node?.loraData?.folders || []).forEach(folder => collect(folder?.loras));

    // Old workflows may not have lora_data_state yet; read the hidden widget
    // as a compatibility fallback.
    if (names.length === 0) {
        try {
            const raw = node?._stackWidget?.value ?? node?.widgets_values?.[2];
            const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
            collect(Array.isArray(parsed) ? parsed : parsed?.loras);
        } catch (e) { /* ignore malformed legacy data */ }
    }
    return [...new Set(names.filter(Boolean))];
}

function mplUpdateMissingLoraState(node) {
    if (!node || !loraNamesCache) return;
    const missing = mplCollectConfiguredLoraNames(node)
        .filter(name => !loraNamesCache.has(mplNormalizeLoraName(name)));
    node._mplMissingLoras = missing;
    node.setDirtyCanvas?.(true, true);
}

function mplSyncModelValidationWidgets(node) {
    if (!node || node.type !== NODE_NAME) return;
    const configured = mplCollectConfiguredLoraNames(node);
    node._mplModelValidationWidgets ||= [];

    configured.forEach((name, index) => {
        const widgetName = "__mpl_lora_model_" + index;
        let widget = node._mplModelValidationWidgets[index];
        if (!widget) {
            widget = node.addWidget("combo", widgetName, name, () => {}, {
                values: loraNamesOptionsCache,
                serialize: false,
            });
            widget.hidden = true;
            widget.serialize = false;
            widget.options.hidden = true;
            widget.options.serialize = false;
            widget.computeSize = () => [0, 0];
            node._mplModelValidationWidgets[index] = widget;
        }
        widget.options.values = loraNamesOptionsCache;
        widget.value = name;
    });

    // Disable stale validation widgets after a LoRA is deleted from the stack.
    for (let index = configured.length; index < node._mplModelValidationWidgets.length; index++) {
        const widget = node._mplModelValidationWidgets[index];
        if (!widget) continue;
        widget.options.values = [];
        widget.value = "";
    }
}

function mplSetLoraNameList(files) {
    loraNamesOptionsCache = Array.isArray(files) ? files : [];
    loraNamesCache = new Set(loraNamesOptionsCache.map(mplNormalizeLoraName));
    mplRefreshMissingLoraStates();
    mplRefreshOfficialMissingModels();
}

function mplRefreshOfficialMissingModels() {
    if (!loraNamesCache) return;
    if (typeof app?.refreshMissingModels !== "function") return;
    void app.refreshMissingModels({ silent: false, reloadDefs: false }).catch(error => {
        console.warn("[MagicPowerLora] 官方模型扫描失败:", error);
    });
}

function mplRefreshMissingLoraStates() {
    const nodes = app?.graph?._nodes || [];
    nodes.forEach(node => {
        if (node?.type === NODE_NAME || node?.constructor?.type === NODE_NAME) {
            mplUpdateMissingLoraState(node);
            mplSyncModelValidationWidgets(node);
        }
    });
}

async function loadLoraNameList() {
    if (loraNamesLoadPromise) return loraNamesLoadPromise;
    loraNamesLoadPromise = (async () => {
        try {
            const resp = await api.fetchApi("/malora/lora/list");
            const data = await resp.json();
            mplSetLoraNameList(data?.files);
        } catch (e) {
            // A failed scan must not mark every node missing.
            loraNamesCache = null;
            console.warn("[MagicPowerLora] LoRA文件列表检查失败:", e);
        } finally {
            loraNamesLoadPromise = null;
        }
    })();
    return loraNamesLoadPromise;
}

// 加载所有LoRA图片列表（类似参考代码的loadImageList）
async function loadLoraImageList() {
    try {
        const resp = await api.fetchApi("/malora/lora/images");
        loraImagesCache = await resp.json();
        mplDebugLog("LoRA图片列表已加载，共", Object.keys(loraImagesCache).length, "个LoRA");
    } catch (e) {
        console.error("[MagicPowerLora] 加载LoRA图片列表时出错:", e);
        loraImagesCache = {};
    }
}

// 初始化时加载图片列表
loadLoraImageList();
// 同步加载工作流缺失检测所需的 LoRA 文件名列表
loadLoraNameList();

// ---------------------------------------------------------------------------
// 全局单例 LoRA 悬停预览浮层
// ---------------------------------------------------------------------------
// 为什么是单例：之前每个 row 各自 new 一个 position:fixed 的 .mpl-lora-preview，
// 依赖各自 mouseleave 清理。一旦重绘/拖拽/快速跨越子元素导致 mouseleave 漏触发，
// 这个 fixed 大图就永久残留在 document.body 上，盖住整个节点内容区 —— 就是
// “一张图把节点铺满”的现象。改为全局唯一浮层后，任何时刻最多一个，
// 且用 document 级 pointermove 判定离开 + 统一 teardown()，杜绝残留。
const MA_LoraPreview = (() => {
    let div = null;         // 唯一浮层元素
    let timer = null;       // 延迟显示定时器
    let activeRow = null;   // 当前触发元素
    let boundDocMove = false;
    let guardTimer = null;  // 显示期间的漂移自检

    function stopGuard() {
        if (guardTimer) { clearInterval(guardTimer); guardTimer = null; }
    }

    function teardown() {
        if (timer) { clearTimeout(timer); timer = null; }
        if (div) { div.remove(); div = null; }
        activeRow = null;
        stopGuard();
    }

    // 显示后启动轻量心跳：若触发元素已不在 DOM / 已不可见，强制收掉浮层。
    // 这是双保险——即便 mouseleave 因重绘、事件顺序等原因漏触发，浮层也不会长期悬挂。
    function startGuard(row) {
        stopGuard();
        guardTimer = setInterval(() => {
            if (!div) { stopGuard(); return; }
            if (activeRow !== row || !row.isConnected) { teardown(); return; }
        }, 250);
    }

    // 全局兜底：任何滚动/缩放/节点删除/窗口变化都强制清理，避免固定浮层悬挂
    function installGlobalGuards() {
        if (boundDocMove) return;
        boundDocMove = true;
        // 滚动或窗口尺寸变化时，固定坐标不再贴合，直接关掉
        window.addEventListener("scroll", teardown, true);
        window.addEventListener("resize", teardown, true);
        // 鼠标/指针离开整个文档也收掉
        document.addEventListener("pointerleave", teardown, true);
        // 切后台标签也收掉
        document.addEventListener("visibilitychange", () => { if (document.hidden) teardown(); });
    }

    function place(rect) {
        if (!div) return;
        const pw = 300, ph = 300, margin = 10;
        let left = rect.right + margin;
        let top = rect.top;
        if (left + pw > window.innerWidth) left = rect.left - pw - margin;
        if (top + ph > window.innerHeight) top = window.innerHeight - ph - margin;
        left = Math.max(margin, left);
        top = Math.max(margin, top);
        div.style.left = left + "px";
        div.style.top = top + "px";
    }

    function bindRowHover(row, lora) {
        installGlobalGuards();
        row.onmouseenter = () => {
            if (timer) { clearTimeout(timer); timer = null; }
            teardown();
            activeRow = row;
            const rect0 = row.getBoundingClientRect();
            timer = setTimeout(() => {
                timer = null;
                // 若期间已离开该行，不显示
                if (activeRow !== row || !document.body.contains(row)) { activeRow = null; return; }
                // 双保险：即便有历史残留也先清
                document.querySelectorAll(".mpl-lora-preview").forEach(p => p.remove());
                div = document.createElement("div");
                div.className = "mpl-lora-preview";
                div.style.cssText =
                    "position:fixed;z-index:10000;background:#2a2a2a;border:2px solid #555;" +
                    "border-radius:4px;padding:8px;box-shadow:0 4px 12px rgba(0,0,0,0.8);" +
                    "pointer-events:none;max-width:300px;max-height:300px;display:block;";
                const img = document.createElement("img");
                img.style.cssText = "max-width:300px;max-height:300px;object-fit:contain;display:block;";
                const safeName = encodeURIComponent(lora.name);
                img.src = api.apiURL(`/malora/lora/image?name=${safeName}&t=${Date.now()}`);
                img.onerror = () => {
                    if (div) div.innerHTML = `<div style="padding:20px;color:#888;text-align:center;">${mplT("无预览图")}</div>`;
                };
                div.appendChild(img);
                document.body.appendChild(div);
                place(rect0);
                startGuard(row);
            }, 300);
        };
        row.onmouseleave = () => {
            if (timer) { clearTimeout(timer); timer = null; }
            teardown();
        };
    }

    return { bindRowHover, teardown, _getDiv: () => div };
})();

// 统一的“清理全部预览”入口：供 render/modal 关闭/节点删除等调用
function mplClearLoraPreview() {
    try { MA_LoraPreview.teardown(); } catch (e) {}
    try { document.querySelectorAll(".mpl-lora-preview").forEach(p => p.remove()); } catch (e) {}
}

// ---------------------------------------------------------------------------
// i18n helpers
// ---------------------------------------------------------------------------
// 内置英文词典：中文系统保持原文，其它系统一律显示英文（不依赖其它插件）
const MPL_I18N_EN = {
    "添加": "Add",
    "群组": "Group",
    "下载": "Download",
    "颜色": "Colors",
    "设置": "Settings",
    "预设分类": "Preset categories",
    "收藏夹": "Favorites",
    "触发词总开关：": "Trigger master: ",
    "开": "ON",
    "关": "OFF",
    "LoRA 信息管理": "LoRA Info Manager",
    "Lora Manager 已有该模型的完整信息": "Lora Manager already has complete info for this model",
    "Lora Manager 里还没有该模型的完整信息，需要下载": "Lora Manager has no complete info for this model yet; download required",
    "下载中…": "Downloading…",
    "下载任务失败": "Download task failed",
    "下载范围": "Download scope",
    "人工确认所选缺项暂不在线补全，不检查来源。可用“恢复自动补全”撤销。": "Manually confirmed missing items are not auto-filled and their sources are not checked. Use “Restore auto-fill” to undo.",
    "仅重试当前可见且勾选的失败项，沿用上次处理方式和失败字段。": "Retry only visible selected failed items, reusing the previous mode and failed fields.",
    "会覆盖所选模型的已有信息文件，节点权重和自定义触发词保持不变。": "Overwrites existing info files of selected models; node weights and custom trigger words stay unchanged.",
    "信息状态筛选": "Info status filter",
    "信息类型：": "Info types: ",
    "共享信息文件：": "Shared info file: ",
    "关闭": "Close",
    "准备就绪": "Ready",
    "包含子目录": "Include subfolders",
    "处理方式": "Processing mode",
    "失败原因：": "Failure reason: ",
    "将更新已有信息的 LoRA：": "LoRAs whose existing info will be updated: ",
    "将更新的已有信息项：": "Existing info items to update: ",
    "开始爬取": "Start fetching",
    "所选 LoRA：": "Selected LoRAs: ",
    "所选信息无需处理。": "No processing needed for the selected items.",
    "搜索文件名、路径或标题…": "Search file name, path or title…",
    "整理标记保存失败": "Failed to save review marks",
    "整理标记处理失败：": "Failed to process review marks: ",
    "整理标记未全部完成，请查看结果。": "Review marks were not fully applied; check the results.",
    "无预览图": "No preview",
    "更新已有信息确认": "Confirm updating existing info",
    "未收到此项的处理结果": "No result received for this item",
    "本地目录": "Local folder",
    "来源请求受限，已暂停后续处理：": "Source requests are rate-limited; remaining processing paused: ",
    "根目录": "Root folder",
    "检查记录未保存：": "Check record not saved: ",
    "正在停止：等待当前文件处理完成…": "Stopping: waiting for the current file to finish…",
    "正在读取本地 LoRA 列表…": "Reading local LoRA list…",
    "爬取失败": "Fetch failed",
    "节点文件夹：": "Node folders: ",
    "请求失败": "Request failed",
    "读取本地 LoRA 列表失败": "Failed to read local LoRA list",
    "选中项包含共享信息文件的同名模型，请每组只选择一个。": "Selection contains models sharing one info file; pick only one per group.",
    "预览图像": "Preview image",
};

// 语言判定：只有中文系统用中文，其它系统一律英文。可用 localStorage MPL_LANG 手动覆盖。
function mplGetCurrentLanguage() {
    try {
        const override = localStorage.getItem("MPL_LANG");
        if (override === "zh" || override === "en") return override;
    } catch (e) { /* ignore */ }
    try {
        const nav = String(navigator.language || (navigator.languages && navigator.languages[0]) || "").toLowerCase();
        return nav.startsWith("zh") ? "zh" : "en";
    } catch (e) {
        return "zh";
    }
}

function mplTranslateText(text, lang) {
    if (!text || lang === "zh") return text;
    return MPL_I18N_EN[text] || text;
}

function mplT(text) {
    return mplTranslateText(text, mplGetCurrentLanguage());
}

let mplMetadataModal = null;

function mplMetadataNameKey(name) {
    return String(name || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function mplCollectMetadataNames(node, scope = "node", localFiles = []) {
    let items;
    if (scope === "all") {
        items = localFiles.map(name => ({ name }));
    } else if (scope.startsWith("folder:")) {
        items = node?.loraData?.folders?.[Number(scope.slice(7))]?.loras || [];
    } else {
        items = [
            ...(node?.loraData?.loras || []),
            ...(node?.loraData?.folders || []).flatMap(folder => folder?.loras || []),
        ];
    }
    const seen = new Set();
    return items.reduce((names, item) => {
        const name = typeof item?.name === "string" ? item.name : "";
        const key = mplMetadataNameKey(name);
        if (key && !seen.has(key)) {
            seen.add(key);
            names.push(name);
        }
        return names;
    }, []);
}

// tags 是生成与行内显示读取的字段，triggerWords 供爬取界面使用；写触发词时两者同步
function mplSetTriggerWords(lora, value) {
    if (!lora) return;
    const v = String(value == null ? "" : value).trim();
    lora.tags = v;
    lora.triggerWords = v;
}

function mplApplyMetadataData(node, name, data) {
    const key = mplMetadataNameKey(name);
    let changed = false;
    const incoming = typeof data?.triggerWords === "string" ? data.triggerWords.trim() : "";
    if (!incoming) return false;
    const items = [
        ...(node?.loraData?.loras || []),
        ...(node?.loraData?.folders || []).flatMap(folder => folder?.loras || []),
    ];
    for (const item of items) {
        if (mplMetadataNameKey(item?.name) !== key) continue;
        if (String(item.tags || "") === incoming && String(item.triggerWords || "") === incoming) continue;
        mplSetTriggerWords(item, incoming);
        changed = true;
    }
    return changed;
}

function mplMetadataTypes(settings) {
    return ["txt", "json", "image"].filter(type => settings[`download_${type}`]);
}

function mplMetadataFieldState(name, type, metadata = {}, fieldStates = {}) {
    const key = mplMetadataNameKey(name);
    const recorded = fieldStates[key]?.[type] || {};
    if (["invalid", "local_error"].includes(recorded.state)) return { ...recorded, needs_fetch: false };
    if (metadata[key]?.[type] === true) return { ...recorded, state: "present", needs_fetch: false };
    if (recorded.state && recorded.state !== "present") {
        return { ...recorded, needs_fetch: ["missing", "error"].includes(recorded.state) && recorded.needs_fetch !== false };
    }
    return { state: "missing", needs_fetch: true };
}

// 已确认拿不到信息的终态（与后端跳过集合一致）：未找到/未提供/未提取/不支持/已整理
const MPL_METADATA_SETTLED_STATES = ["not_found", "unavailable", "unresolved", "unsupported", "user_skipped"];

// 已无更多来源可拿：所有类型都是「已有」或终态，且至少有一项是终态。
// 这类条目再补全只会得到「已跳过/无需重复处理」，归入「未找到来源」单独一类。
function mplMetadataAllSettled(name, settings, metadata = {}, fieldStates = {}) {
    const types = mplMetadataTypes(settings);
    if (!types.length) return false;
    let hasSettled = false;
    const done = types.every(type => {
        const state = mplMetadataFieldState(name, type, metadata, fieldStates).state;
        if (MPL_METADATA_SETTLED_STATES.includes(state)) { hasSettled = true; return true; }
        return state === "present";
    });
    return done && hasSettled;
}

function mplMetadataRequestedTypes(name, settings, metadata = null, fieldStates = {}) {
    const types = mplMetadataTypes(settings);
    if (settings.local_action) {
        return types.filter(type => {
            const field = mplMetadataFieldState(name, type, metadata || {}, fieldStates);
            if (settings.local_action === "adopt") {
                return !field.local_reviewed && !["present", "invalid", "local_error"].includes(field.state);
            }
            return field.local_reviewed === true || field.state === "user_skipped";
        });
    }
    const retry = settings.retry_types?.[mplMetadataNameKey(name)];
    const requested = Array.isArray(retry) ? types.filter(type => retry.includes(type)) : types;
    if (!metadata) return requested;
    // Lora-Manager 里还没有完整信息时，统一交给 LM 下载：本地已有 .txt/.jpeg
    // 不能算「已处理」，否则 LM 界面会一直不显示，两边不同步。
    // 已进入终态（未找到/未提供/已整理等）的条目，只有重新检查/更新时才会再尝试
    const retrySettled = settings.force_refresh === true || settings.update_existing === true;
    // 已确认无更多来源（其余项已有、缺失项均已终态）：直接跳过，不发请求也就不会出现「已跳过」行
    if (!retrySettled && mplMetadataAllSettled(name, settings, metadata || {}, fieldStates)) return [];
    if (!settings.update_existing && !mplMetadataHasLm(name, metadata)) {
        return requested.filter(type => {
            const field = mplMetadataFieldState(name, type, metadata, fieldStates);
            if (["invalid", "local_error"].includes(field.state)) return false;
            return retrySettled || !MPL_METADATA_SETTLED_STATES.includes(field.state);
        });
    }
    return requested.filter(type => {
        const field = mplMetadataFieldState(name, type, metadata, fieldStates);
        if (settings.update_existing) return field.state !== "local_error";
        if (["present", "invalid", "local_error"].includes(field.state)) return false;
        // 终态：单独归类，默认补全时跳过
        if (MPL_METADATA_SETTLED_STATES.includes(field.state)) return retrySettled;
        return settings.force_refresh === true || field.needs_fetch === true;
    });
}

// 该 LoRA 是否已被 Lora-Manager 接管（有 sidecar 即算已有信息）
function mplMetadataHasLm(name, metadata) {
    return !!(metadata && metadata[mplMetadataNameKey(name)]?.lm);
}

function mplMetadataNeeds(name, settings, metadata, fieldStates = {}) {
    // 以 Lora Manager 是否已有完整记录为准；「更新已有信息」模式下全部可选
    if (settings.update_existing) return true;
    // 已确认拿不到信息的单独归类，补全时不再纳入
    if (settings.force_refresh !== true && mplMetadataAllSettled(name, settings, metadata, fieldStates)) return false;
    return !mplMetadataHasLm(name, metadata);
}

function mplMetadataFailureDetails(result, typeLabels) {
    const failedTypes = Array.isArray(result.failed) && result.failed.length
        ? result.failed
        : result.status === "error" ? result.requested_types || [] : [];
    return failedTypes.map(type => {
        const field = result.field_states?.[type] || {};
        const reason = field.last_error || field.reason;
        return reason ? { type, label: typeLabels[`download_${type}`] || type, reason } : null;
    }).filter(Boolean);
}

function mplMetadataLocalIssues(name, settings, metadata, fieldStates = {}) {
    return mplMetadataTypes(settings).some(type => ["invalid", "local_error"].includes(mplMetadataFieldState(name, type, metadata, fieldStates).state));
}

function mplMergeMetadataFieldStates(name, result, metadata, fieldStates, requestedTypes = []) {
    const key = mplMetadataNameKey(name);
    metadata[key] ||= {};
    fieldStates[key] ||= {};
    const requested = new Set(requestedTypes);
    for (const type of result.saved || []) {
        metadata[key][type] = true;
        fieldStates[key][type] = { state: "present", needs_fetch: false };
    }
    const updates = result.field_states || Object.fromEntries((result.unavailable || []).map(type => [type, { state: "unavailable", needs_fetch: false }]));
    for (const [type, update] of Object.entries(updates)) {
        if (!requested.has(type) || !update || typeof update !== "object") continue;
        const previous = fieldStates[key][type];
        if (update.state === "present") metadata[key][type] = true;
        if (["invalid", "local_error"].includes(update.state)) {
            fieldStates[key][type] = { ...previous, ...update, needs_fetch: false };
        } else if (metadata[key][type] === true) {
            fieldStates[key][type] = { ...update, state: "present", needs_fetch: false };
        } else if (update.state === "error" && ["unavailable", "not_found", "unresolved", "unsupported", "user_skipped"].includes(previous?.state)) {
            fieldStates[key][type] = { ...previous, last_error: update.reason, last_attempt_at: update.checked_at };
        } else {
            fieldStates[key][type] = { ...previous, ...update };
        }
    }
}

function mplFilterMetadataNames(names, filters, settings, metadata, fieldStates = {}) {
    const search = String(filters.search || "").trim().toLowerCase();
    return names.filter(name => {
        const key = mplMetadataNameKey(name);
        const directory = key.split("/").slice(0, -1).join("/");
        if (filters.directory === "." && !filters.recursive && directory) return false;
        if (filters.directory && filters.directory !== ".") {
            if (directory !== filters.directory && !(filters.recursive && directory.startsWith(filters.directory + "/"))) return false;
        }
        if (search && !mplLoraMatchesText(name, search)) return false;
        // 有搜索词时不受「仅看待处理」等状态筛选影响，确保搜得到
        if (search) return true;
        const mode = filters.status || (filters.onlyMissing ? "pending" : "all");
        if (mode === "not_found") return mplMetadataAllSettled(name, settings, metadata, fieldStates);
        if (mode === "local_missing") return mplMetadataNeeds(name, settings, metadata, fieldStates);
        if (mode === "pending" && settings.local_action) return mplMetadataNeeds(name, settings, metadata, fieldStates);
        return mode !== "pending" || mplMetadataNeeds(name, settings, metadata, fieldStates) || mplMetadataLocalIssues(name, settings, metadata, fieldStates);
    });
}

function mplMetadataPreflight(names, selected, settings, metadata, fieldStates = {}) {
    const selectedNames = names.filter(name => selected.has(mplMetadataNameKey(name)));
    const actionableNames = selectedNames.filter(name => mplMetadataNeeds(name, settings, metadata, fieldStates));
    const issues = selectedNames.filter(name => mplMetadataLocalIssues(name, settings, metadata, fieldStates)).length;
    const notFound = selectedNames.filter(name => mplMetadataAllSettled(name, settings, metadata, fieldStates)).length;
    const complete = selectedNames.filter(name => !mplMetadataNeeds(name, settings, metadata, fieldStates) && !mplMetadataLocalIssues(name, settings, metadata, fieldStates) && !mplMetadataAllSettled(name, settings, metadata, fieldStates)).length;
    return { scoped: names.length, selected: selectedNames.length, need: actionableNames.length, complete, issues, notFound, names: selectedNames, actionableNames };
}

function mplMetadataHasSharedSelection(names, sharedInfo) {
    const selected = new Set(names.map(mplMetadataNameKey));
    return names.some(name => {
        const group = sharedInfo[mplMetadataNameKey(name)] || [];
        return new Set([name, ...group].map(mplMetadataNameKey).filter(key => selected.has(key))).size > 1;
    });
}

function mplMetadataGraphNodes(origin) {
    const nodes = (app?.graph?._nodes || []).filter(node => node?.type === NODE_NAME || node?.constructor?.type === NODE_NAME);
    return [...new Set([origin, ...nodes])];
}

async function mplRunMetadataQueue(names, settings, state, onProgress, metadata = null, fieldStates = {}) {
    const results = [];
    state.running = true;
    state.pauseResult = null;
    let stopped = false;
    let completed = 0;
    try {
        const runOne = async (name) => {
            if (state.cancelRequested || stopped) return;
            onProgress({ current: name, completed, total: names.length });
            let result;
            const requestedTypes = mplMetadataRequestedTypes(name, settings, metadata, fieldStates);
            if (!requestedTypes.length) { completed++; return; }
            try {
                const response = await api.fetchApi("/malora/lora/fetch_metadata", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        lora_name: name,
                        options: Object.fromEntries(["txt", "json", "image"].map(type => [`download_${type}`, requestedTypes.includes(type)])),
                        save_path_mode: settings.save_path,
                        overwrite: settings.overwrite === true,
                        force_refresh: settings.force_refresh === true,
                        ...(settings.update_existing === true ? { update_existing: true } : {}),
                    }),
                });
                result = await response.json();
                if (!response.ok || !["success", "skipped", "checked", "empty", "not_found", "partial", "error"].includes(result?.status)) {
                    result = { ...result, status: "error", message: result?.message || `${mplT("请求失败")} (${response.status})` };
                }
            } catch (error) {
                result = { status: "error", message: error.message || String(error) };
            }
            const confirmedEmpty = !result.saved?.length && requestedTypes.every(type => result.field_states?.[type] ? ["unavailable", "unresolved", "unsupported"].includes(result.field_states[type].state) : result.unavailable?.includes(type));
            const sourceNotFound = !result.saved?.length && requestedTypes.every(type => result.field_states?.[type]?.state === "not_found");
            let status = result.status;
            if (["success", "skipped", "empty"].includes(status)) {
                if (sourceNotFound) status = "not_found";
                else if (confirmedEmpty || status === "empty") status = "checked";
            }
            const entry = { ...result, status, name, requested_types: requestedTypes };
            results.push(entry);
            completed++;
            onProgress({ current: name, completed, total: names.length, result: entry });
            if (entry.stop_queue) {
                state.pauseResult = entry;
                stopped = true;
            }
        };
        // 并发抓取（每条独立请求），并发上限 3
        let cursor = 0;
        const worker = async () => {
            while (!state.cancelRequested && !stopped && cursor < names.length) {
                const name = names[cursor++];
                await runOne(name);
            }
        };
        await Promise.all(Array.from({ length: Math.min(3, names.length) }, () => worker()));
        return results;
    } finally {
        state.running = false;
    }
}

/** 与「添加 Lora」弹窗相同的目录树（用于检测范围导航） */
function buildMplFolderTree(allFiles) {
    const folderTree = {};
    const rootFiles = [];
    (allFiles || []).forEach(file => {
        const parts = file.split(/[/\\]/);
        if (parts.length === 1) {
            rootFiles.push(file);
        } else {
            let current = folderTree;
            for (let i = 0; i < parts.length - 1; i++) {
                const folderName = parts[i];
                if (!current[folderName]) {
                    current[folderName] = { files: [], folders: {} };
                }
                if (i === parts.length - 2) {
                    current[folderName].files.push(file);
                } else {
                    if (!current[folderName].folders) {
                        current[folderName].folders = {};
                    }
                    current = current[folderName].folders;
                }
            }
        }
    });
    return { folderTree, rootFiles };
}

function mplGetSubfolderNames(folderTree, pathParts) {
    let map = folderTree;
    for (const p of pathParts) {
        if (!map[p] || !map[p].folders) return [];
        map = map[p].folders;
    }
    return Object.keys(map).sort();
}

app.registerExtension({
    name: "MA.Power.Lora",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === NODE_NAME) {
            const MPL_MIN_W = 640; //设置强力lora加载器节点的最小宽高（双栏：左预设/收藏 + 右列表）
            const MPL_MIN_H = 350;

            // 覆盖 computeSize：强制最小尺寸（ComfyUI 前端会调用此方法）
            const origComputeSize = nodeType.prototype.computeSize;
            nodeType.prototype.computeSize = function() {
                const result = origComputeSize ? origComputeSize.apply(this, arguments) : (this.size || [MPL_MIN_W, MPL_MIN_H]);
                // 根据 layoutSettings 计算动态最小宽度
                // 箭头模式控件约 80px，滑条模式约 sliderWidth + 46px
                // 额外加 20px padding 确保按钮完全显示
                let dynMinW = MPL_MIN_W + 20;
                if (this.layoutSettings && this.layoutSettings.weightStyle === "slider") {
                    const sw = this.layoutSettings.sliderWidth ?? 110;
                    const sv = this.layoutSettings.showWeightValue !== false ? 46 : 0;
                    dynMinW = Math.max(MPL_MIN_W + 20, MPL_MIN_W + 20 + Math.max(0, sw + sv - 60));
                }
                // 关键：必须把当前尺寸也算进去。ComfyUI 在点击/应用预设后会重算尺寸并重设节点，
                // 只取 min(计算值, 下限) 会把用户已经拉宽的节点打回下限宽度，侧栏占比骤增、列表被挤没。
                const curW = Array.isArray(this.size) ? (Number(this.size[0]) || 0) : 0;
                const curH = Array.isArray(this.size) ? (Number(this.size[1]) || 0) : 0;
                const w = Math.max(curW, Array.isArray(result) ? result[0] : MPL_MIN_W, dynMinW);
                const h = Math.max(curH, Array.isArray(result) ? result[1] : MPL_MIN_H, MPL_MIN_H);
                return [w, h];
            };

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                if (!this.loraData) {
                    this.loraData = { folders: [], loras: [] };
                }
                if (!this.loraData.loras) this.loraData.loras = [];
                if (!this.loraData.folders) this.loraData.folders = [];

                if (!this.widgets) this.widgets = [];
                let stackWidget = this.widgets.find(w => w.name === "lora_stack");
                if (!stackWidget) {
                    stackWidget = this.addWidget("text", "lora_stack", "[]", () => {}, {});
                }
                // 完全隐藏widget（参考zml代码的方式）
                stackWidget.hidden = true;
                stackWidget.computeSize = () => [0, 0];
                // 移除 lora_stack 的输入端口（防止用户误连接）
                const stackInputIdx = this.inputs?.findIndex(i => i.name === "lora_stack");
                if (stackInputIdx >= 0) {
                    this.removeInput(stackInputIdx);
                }

                // INT8 模式占位（向后兼容）：ComfyUI 官方已在 model_patcher.py 提供 INT8 等量化
                // 权重的 LoRA 支持，不再需要自定义模式。此处仅保留同名 widget 占位，避免旧工作流
                // 的 widgets_values 索引错位；其值固定为 "none"，本节点完全忽略。
                let int8ModeWidget = this.widgets.find(w => w.name === "int8_mode");
                if (!int8ModeWidget) {
                    int8ModeWidget = this.addWidget("text", "int8_mode", "none", () => {}, {});
                }
                int8ModeWidget.hidden = true;
                int8ModeWidget.computeSize = () => [0, 0];
                int8ModeWidget.value = "none"; // 强制覆盖任何旧值
                this._int8ModeWidget = int8ModeWidget;

                // SDNQ 模式设置（隐藏的 widget）
                let sdnqModeWidget = this.widgets.find(w => w.name === "sdnq_mode");
                if (!sdnqModeWidget) {
                    sdnqModeWidget = this.addWidget("text", "sdnq_mode", "none", () => {}, {});
                }
                sdnqModeWidget.hidden = true;
                sdnqModeWidget.computeSize = () => [0, 0];
                this._sdnqModeWidget = sdnqModeWidget;

                // 自适应模式设置（隐藏的 widget）
                let adaptiveModeWidget = this.widgets.find(w => w.name === "adaptive_mode");
                if (!adaptiveModeWidget) {
                    adaptiveModeWidget = this.addWidget("text", "adaptive_mode", "false", () => {}, {});
                }
                adaptiveModeWidget.hidden = true;
                adaptiveModeWidget.computeSize = () => [0, 0];
                this._adaptiveModeWidget = adaptiveModeWidget;

                // Klein 模式设置（隐藏的 widget）
                let kleinModeWidget = this.widgets.find(w => w.name === "klein_mode");
                if (!kleinModeWidget) {
                    kleinModeWidget = this.addWidget("text", "klein_mode", "auto", () => {}, {});
                }
                kleinModeWidget.hidden = true;
                kleinModeWidget.computeSize = () => [0, 0];
                this._kleinModeWidget = kleinModeWidget;

                // Anima 2.9B 模式设置（隐藏的 widget）：none 关闭 / auto 自动检测 40 层 Anima / anima 强制 28→40 层转换
                let animaModeWidget = this.widgets.find(w => w.name === "anima_mode");
                if (!animaModeWidget) {
                    animaModeWidget = this.addWidget("text", "anima_mode", "none", () => {}, {});
                }
                animaModeWidget.hidden = true;
                animaModeWidget.computeSize = () => [0, 0];
                this._animaModeWidget = animaModeWidget;

                // 初始化 SDNQ 模式（从属性中读取）
                if (this.sdnqMode === undefined) {
                    this.sdnqMode = this.properties["sdnq_mode"] || "none";
                }
                // 初始化自适应模式（从属性中读取）
                // 注意：不能用 `if (!this.adaptiveMode)`，否则 false 会被当作“未初始化”
                if (this.adaptiveMode === undefined) {
                    this.adaptiveMode = this.properties["adaptive_mode"] === true || this.properties["adaptive_mode"] === "true";
                }

                // 初始化 Klein 模式（从属性中读取）
                if (this.kleinMode === undefined) {
                    this.kleinMode = this.properties["klein_mode"] || "auto";
                }

                // 初始化 Anima 2.9B 模式（从属性中读取）
                if (this.animaMode === undefined) {
                    this.animaMode = this.properties["anima_mode"] || "none";
                }

                // 初始化布局设置（权重控件样式等）
                if (!this.layoutSettings) {
                    const saved = this.properties["layout_settings"];
                    const defaults = {
                        weightStyle: "arrows",
                        sliderStep: 0.05,
                        sliderMin: -2,
                        sliderMax: 2,
                        sliderWidth: 110,
                        showWeightValue: true,
                        snapToZero: true,
                    };
                    this.layoutSettings = (saved && typeof saved === "object")
                        ? Object.assign({}, defaults, saved)
                        : defaults;
                }

                // 初始化颜色设置（选中态颜色）
                if (!this.colorSettings) {
                    const savedColors = this.properties["color_settings"];
                    const colorDefaults = { selectBg: "#2b3b5e", selectBar: "#6c8cff", selectText: "#eef1ff" };
                    this.colorSettings = (savedColors && typeof savedColors === "object")
                        ? Object.assign({}, colorDefaults, savedColors)
                        : colorDefaults;
                }

                // 初始化文件夹全局默认颜色（外卡片背景 / 里标题栏 / 左侧色条）
                if (!this.folderColorSettings) {
                    const savedFolderColors = this.properties["folder_color_settings"];
                    const folderColorDefaults = { outer: "", inner: "", bar: "" };
                    this.folderColorSettings = (savedFolderColors && typeof savedFolderColors === "object")
                        ? Object.assign({}, folderColorDefaults, savedFolderColors)
                        : folderColorDefaults;
                }

                this._stackWidget = stackWidget;

                // 根据 layoutSettings 计算最小宽度（滑条模式需要更宽）
                // 额外加 20px padding 确保按钮完全显示
                const computeMinWidth = (layout) => {
                    if (layout && layout.weightStyle === "slider") {
                        const sw = layout.sliderWidth ?? 110;
                        const sv = layout.showWeightValue !== false ? 46 : 0;
                        return Math.max(MPL_MIN_W + 20, MPL_MIN_W + 20 + Math.max(0, sw + sv - 60));
                    }
                    return MPL_MIN_W + 20;
                };
                const initMinW = computeMinWidth(this.layoutSettings);
                this.size = [Math.max(initMinW, MPL_MIN_W), MPL_MIN_H];
                this.minWidth = initMinW;
                this.minHeight = MPL_MIN_H;

                // onResize：用户拖拽调整时强制不小于最小尺寸
                this.onResize = function(size) {
                    if (size && size[0] !== undefined && size[1] !== undefined) {
                        const curMinW = computeMinWidth(this.layoutSettings);
                        size[0] = Math.max(size[0], curMinW);
                        size[1] = Math.max(size[1], MPL_MIN_H);
                        // ComfyUI 新版按 (widget.width ?? node.width) 给 DOM 覆盖层算宽度：
                        // 一旦显式给 widget.width 赋值，界面就锁死在该宽度、不再跟随节点，
                        // 表现为节点被拉宽后界面仍停在旧宽度、名字和权重被挤没。
                        // 保持 null，让前端始终用 node.width 自动铺满。
                        if (this._mplDomWidget) {
                            this._mplDomWidget.width = null;
                        }
                    }
                };

                this.createDOMInterface();
                // addDOMWidget registers its resize hook after this node's
                // hook. Calling it once here keeps the DOM widget aligned
                // when a saved workflow restores a different node size.
                this._mplSyncDOMLayout?.();
                // 多时机延迟同步 + ResizeObserver：保证首次启动/刚创建工作流时 DOM widget 即正确铺开
                this._mplScheduleLayoutSync?.();
                return r;
            };

            // 🌟 1. 创建 DOM 界面（使用 addDOMWidget，自动跟随节点缩放）
            nodeType.prototype.createDOMInterface = function() {
                if(this.embeddedDiv) return;

                this.embeddedDiv = document.createElement("div");
                this.embeddedDiv.className = "mpl-embedded-container";
                
                // 🛑 核心修复：全域事件拦截 🛑
                // 必须配合 CSS 中的 pointer-events: auto 才能生效
                
                // A. 拦截滚轮 (防止缩放画布)
                this.embeddedDiv.addEventListener("wheel", (e) => { 
                    e.stopPropagation(); 
                    // 如果列表滚到底了，也不要传给画布
                }, { passive: false });

                // B. 拦截点击 (防止移动画布)
                // 注意：pointermove 和 pointerup 不能 stopPropagation，否则会阻止 document 上的滑块拖动监听器
                const stopProp = (e) => { e.stopPropagation(); };
                this.embeddedDiv.addEventListener("pointerdown", stopProp);
                this.embeddedDiv.addEventListener("mousedown", stopProp);
                this.embeddedDiv.addEventListener("click", stopProp);
                this.embeddedDiv.addEventListener("dblclick", stopProp);

                // --- 列表容器 ---
                this.listContainer = document.createElement("div");
                this.listContainer.className = "mpl-list-scroll";
                
                // 拖拽文件进入的处理
                this.listContainer.ondragover = (e) => e.preventDefault();
                this.listContainer.ondrop = (e) => {
                    e.preventDefault();
                    try {
                        const data = JSON.parse(e.dataTransfer.getData("text/plain"));
                        // 从左栏拖入：预设 → 新建文件夹；收藏 → 添加 LoRA
                        if (data && (data.kind === 'mpl-preset' || data.kind === 'mpl-favorite')) {
                            this._mplNativeDropAt = Date.now();
                            this._mplApplySidePayload(data, this._mplComputeDropTarget(e.clientX, e.clientY));
                            return;
                        }
                        // 拖到列表空白处：把该 LoRA 放到根列表末尾（保持“拖出文件夹”可用）
                        if (data && (data.type === 'sort' || data.type === 'top')) {
                            e.stopPropagation();
                            // 文件夹标题空白处拖动：按鼠标落点插到最近的卡片/行前或后
                            if (data.type === 'top' && typeof data.tok === 'string' && data.tok.startsWith('f:')) {
                                const drop = this._mplComputeTopDropTarget(e.clientX, e.clientY);
                                if (drop && drop.tok && drop.tok !== data.tok) {
                                    this._mplPlaceToken(data.tok, drop.tok, drop.after);
                                } else {
                                    const tl = this._topLayout || [];
                                    const ti = tl.indexOf(data.tok);
                                    if (ti >= 0) tl.splice(ti, 1);
                                    tl.push(data.tok);
                                }
                                this._currentTopDrag = null;
                                this.renderEmbeddedList();
                                this.updateWidget();
                                return;
                            }
                            let item = null;
                            if (data.type === 'top' && typeof data.tok === 'string' && data.tok.startsWith('l:')) {
                                const uid = data.tok.slice(2);
                                item = (this.loraData.loras || []).find(l => this._uidFor(l) === uid) || null;
                                if (!item) {
                                    for (const f of (this.loraData.folders || [])) {
                                        item = (f.loras || []).find(l => this._uidFor(l) === uid) || null;
                                        if (item) break;
                                    }
                                }
                            } else if (data.type === 'sort' && data.sourceLIdx !== undefined) {
                                if (data.sourceType === 'root') item = (this.loraData.loras || [])[data.sourceLIdx] || null;
                                else if (data.sourceType === 'folder') {
                                    const f = (this.loraData.folders || [])[data.sourceFIdx];
                                    item = f ? (f.loras || [])[data.sourceLIdx] : null;
                                }
                            }
                            if (!item) return;
                            const inRoot = (this.loraData.loras || []).includes(item);
                            if (!inRoot) {
                                // 从文件夹移出到根列表末尾
                                for (const f of (this.loraData.folders || [])) {
                                    const i = (f.loras || []).indexOf(item);
                                    if (i >= 0) { f.loras.splice(i, 1); break; }
                                }
                                this.loraData.loras.push(item);
                                const tl = this._topLayout || [];
                                tl.push("l:" + this._uidFor(item));
                            } else {
                                // 已在根列表：只是把显示位置挪到末尾
                                const tl = this._topLayout || [];
                                const tok = "l:" + this._uidFor(item);
                                const i = tl.indexOf(tok);
                                if (i >= 0) tl.splice(i, 1);
                                tl.push(tok);
                            }
                            this._currentTopDrag = null;
                            this._currentSortDrag = null;
                            this.renderEmbeddedList();
                            this.updateWidget();
                            return;
                        }
                        if (data.type === 'folder') {
                            // 检查索引有效性
                            if (data.fIdx >= 0 && data.fIdx < this.loraData.folders.length) {
                            const srcFolder = this.loraData.folders[data.fIdx];
                                if (data.lIdx >= 0 && data.lIdx < srcFolder.loras.length) {
                                    // 深拷贝避免引用问题
                                    const loraItem = JSON.parse(JSON.stringify(srcFolder.loras[data.lIdx]));
                            srcFolder.loras.splice(data.lIdx, 1);
                            this.loraData.loras.push(loraItem);
                            this.renderEmbeddedList();
                            this.updateWidget(); 
                        }
                            }
                        }
                    } catch(err) {
                        console.error("拖拽到根列表错误:", err);
                    }
                };

                this.embeddedDiv.appendChild(this.mainSplit = document.createElement("div"));
                this.mainSplit.className = "mpl-main-split";
                this.sidebarEl = this._buildSidebar();
                this.mainSplit.appendChild(this.sidebarEl);

                this.mainPane = document.createElement("div");
                this.mainPane.className = "mpl-main-pane";
                this.mainPane.appendChild(this.listContainer);
                this.mainSplit.appendChild(this.mainPane);

                // --- Klein 模式提示 Banner（检测到 Klein 模型但未启用对应模式时显示）---
                this._kleinBannerEl = null;
                this._updateKleinBanner();

                // --- 底部按钮区 ---
                const footer = document.createElement("div");
                footer.className = "mpl-footer";
                
                const createBtn = (iconName, txt, cls, cb) => {
                    const b = document.createElement("button");
                    b.innerHTML = mplIcon(iconName, 15) + (txt ? '<span>' + txt + '</span>' : "");
                    b.className = cls; b.onclick = cb; return b;
                };
                footer.append(
                    createBtn("plus", mplT("添加"), "mpl-btn-add", () => this.showAddLoraModal()),
                    createBtn("folderPlus", mplT("群组"), "mpl-btn-preset", () => this.addFolder()),
                    createBtn("download", mplT("下载"), "mpl-btn-metadata", () => this.showBatchMetadataModal()),
                    createBtn("paste", "LORA串", "mpl-btn-lorastring", () => this.showLoraStringModal()),
                    createBtn("palette", mplT("颜色"), "mpl-btn-icon", () => this.showColorPresetModal()),
                    createBtn("settings", mplT("设置"), "mpl-btn-icon", () => this.showSettingsModal())
                );
                this.mainPane.appendChild(footer);

                // 使用 addDOMWidget 将 UI 添加到节点内部，自动跟随节点缩放
                this._mplDomWidget = this.addDOMWidget("mpl_ui", "div", this.embeddedDiv, {
                    serialize: false,
                    hideOnZoom: false,
                });

                this.injectStyles();
                this.renderEmbeddedList();
                this.updateWidget(); 
            };

            nodeType.prototype._mplSyncDOMLayout = function() {
                if (!this.embeddedDiv) return;
                this.embeddedDiv.style.width = "100%";
                this.embeddedDiv.style.maxWidth = "none";
                this.embeddedDiv.style.boxSizing = "border-box";
                // 关键：不要钉死 widget.width。前端用 (widget.width ?? node.width)，
                // 有值就锁死、界面无法跟随节点拉宽；置空才能始终按节点宽度铺满。
                if (this._mplDomWidget) {
                    this._mplDomWidget.width = null;
                }
                // The frontend positions DOM widgets from node.size during
                // the resize callback; saved workflows do not always invoke
                // that callback after configure().
                if (this._mplDomWidget?.options?.afterResize) {
                    this._mplDomWidget.options.afterResize.call(this._mplDomWidget, this);
                }
                this.onResize?.(this.size);
                this.setDirtyCanvas?.(true, true);
            };
            // 多次延迟同步，确保「今天第一次启动」时 DOM widget 也能正确铺开（无需手动刷新）
            nodeType.prototype._mplScheduleLayoutSync = function() {
                if (this._mplLayoutSyncTimers) {
                    this._mplLayoutSyncTimers.forEach(t => clearTimeout(t));
                }
                this._mplLayoutSyncTimers = [];
                const run = () => {
                    try { this._mplSyncDOMLayout(); } catch (e) {}
                    try { this._mplRefreshStatusBar(); } catch (e) {}
                };
                [0, 50, 150, 350, 800].forEach(ms => {
                    this._mplLayoutSyncTimers.push(setTimeout(run, ms));
                });
                // ResizeObserver：浏览器首帧布局后若节点宽度已知但 DOM widget 宽度为 0，自动纠正
                if (!this._mplResizeObserver && typeof ResizeObserver !== "undefined" && this.embeddedDiv) {
                    try {
                        this._mplResizeObserver = new ResizeObserver(() => {
                            if (!this.size?.[0]) return;
                            // 前端按 (widget.width ?? node.width) 算界面宽度。只要 widget.width
                            // 有值，界面就被锁死、无法跟随节点；这里持续把它清空，确保界面
                            // 永远按 node.width 铺满。若曾经被外部写入，也会被这里纠正。
                            if (this._mplDomWidget && this._mplDomWidget.width != null) {
                                this._mplDomWidget.width = null;
                                this.setDirtyCanvas?.(true, true);
                            }
                        });
                        this._mplResizeObserver.observe(this.embeddedDiv);
                    } catch (e) {}
                }
            };

            // 🌟 2. 使用 addDOMWidget 后，不需要手动计算位置和大小，UI会自动跟随节点缩放

            // ================= 左侧栏：预设分类 + 收藏夹 =================
            nodeType.prototype._buildSidebar = function() {
                const side = document.createElement("div");
                side.className = "mpl-sidebar";
                const mkSection = (title, onAdd, addTitle) => {
                    const sec = document.createElement("div");
                    sec.className = "mpl-side-section";
                    const head = document.createElement("div");
                    head.className = "mpl-side-head";
                    const lab = document.createElement("span");
                    lab.textContent = title;
                    const add = document.createElement("button");
                    add.type = "button";
                    add.className = "mpl-side-add";
                    add.textContent = "+";
                    add.title = addTitle;
                    add.addEventListener("pointerdown", (e) => e.stopPropagation());
                    add.onclick = (e) => { e.stopPropagation(); onAdd(); };
                    head.appendChild(lab);
                    head.appendChild(add);
                    const list = document.createElement("div");
                    list.className = "mpl-side-list";
                    sec.appendChild(head);
                    sec.appendChild(list);
                    return { sec, list };
                };
                const presets = mkSection(mplT("预设分类"), () => this._mplNewPresetCategory(), "新建预设分类");
                const favors = mkSection(mplT("收藏夹"), () => this._mplNewFavoriteCollection(), "新建收藏夹");
                presets.list.addEventListener("dragover", (e) => e.preventDefault());
                presets.list.addEventListener("drop", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this._mplDropFolderAsPreset(e, "");
                });
                favors.list.addEventListener("dragover", (e) => e.preventDefault());
                favors.list.addEventListener("drop", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this._mplDropLoraLoose(e);
                });
                side.appendChild(presets.sec);
                side.appendChild(favors.sec);
                this._presetListEl = presets.list;
                this._favListEl = favors.list;
                void mplLoadSidebar().then(() => mplRefreshAllSidebars());
                return side;
            };

            nodeType.prototype._mplSideGroup = function(opts) {
                const { label, count, key, defaultOpen, onDrop, onContext } = opts;
                const open = MPL_SIDE_OPEN;
                const isOpen = open[key] !== undefined ? open[key] : !!defaultOpen;
                const row = document.createElement("div");
                row.className = "mpl-side-group";
                const caret = document.createElement("span");
                caret.className = "mpl-side-caret";
                caret.textContent = isOpen ? "▾" : "▸";
                const name = document.createElement("span");
                name.className = "mpl-side-name";
                name.textContent = label;
                name.title = label;
                const badge = document.createElement("span");
                badge.className = "mpl-side-count";
                badge.textContent = String(count);
                row.append(caret, name, badge);
                row.onclick = (e) => {
                    e.stopPropagation();
                    open[key] = !isOpen;
                    mplSaveSideOpen(open);
                    mplRefreshAllSidebars();
                };
                if (onContext) {
                    row.oncontextmenu = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onContext(e);
                    };
                }
                const wrap = document.createElement("div");
                wrap.className = "mpl-side-group-wrap";
                if (opts.groupKey) wrap.dataset.mplGroup = opts.groupKey;
                wrap.appendChild(row);
                if (isOpen && opts.items && opts.items.length) {
                    const box = document.createElement("div");
                    box.className = "mpl-side-items";
                    opts.items.forEach(it => box.appendChild(this._mplSideItem(it)));
                    wrap.appendChild(box);
                }
                if (onDrop) {
                    // 整个分组（含展开的条目区域）都是投放目标
                    wrap.addEventListener("dragover", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        row.classList.add("mpl-side-drop");
                    });
                    wrap.addEventListener("dragleave", (e) => {
                        if (wrap.contains(e.relatedTarget)) return;
                        row.classList.remove("mpl-side-drop");
                    });
                    wrap.addEventListener("drop", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        row.classList.remove("mpl-side-drop");
                        onDrop(e);
                    });
                }
                return wrap;
            };

            nodeType.prototype._mplSideItem = function(it) {
                const el = document.createElement("div");
                el.className = "mpl-side-item";
                el.textContent = it.label;
                el.title = it.title || it.label;
                if (it.kind) {
                    el.dataset.mplKind = it.kind;
                    el.dataset.mplName = (it.payload && it.payload.name) || "";
                }
                // 左栏条目统一用指针拖拽（节点 DOM 里原生 HTML5 拖拽不稳定）
                this._mplBindSideItemPointerDrag(el, it);
                if (it.onClick) {
                    el.onclick = (e) => {
                        e.stopPropagation();
                        if (Date.now() < (this._mplSideClickBlock || 0)) return;
                        it.onClick();
                    };
                }
                if (it.onContext) {
                    el.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); it.onContext(e); };
                }
                return el;
            };

            nodeType.prototype._renderSidebar = function() {
                if (!this._presetListEl || !this._favListEl) return;
                const st = MPL_SIDEBAR;

                // ---------- 预设 ----------
                this._presetListEl.innerHTML = "";
                const allPresetNames = Object.keys(st.presets);
                // 按全局保存的顺序排列，未记录的预设排在后面
                const presetNames = [];
                (st.preset_order || []).forEach(n => { if (allPresetNames.includes(n)) presetNames.push(n); });
                allPresetNames.forEach(n => { if (!presetNames.includes(n)) presetNames.push(n); });
                const catSet = new Set(st.categories);
                const groups = st.categories.map(c => ({ name: c, items: [] }));
                const byName = new Map(groups.map(g => [g.name, g]));
                const uncat = [];
                presetNames.forEach(n => {
                    const c = st.assignments[n];
                    if (c && byName.has(c)) byName.get(c).items.push(n);
                    else uncat.push(n);
                });
                const presetItem = (n) => ({
                    label: n,
                    title: n + "（拖到右侧可生成文件夹，单击直接放入节点）",
                    kind: "preset",
                    payload: { kind: "mpl-preset", name: n },
                    onClick: () => this._mplApplyPreset(n),
                    onContext: (e) => this._mplPresetMenu(n, e.clientX, e.clientY),
                });
                this._presetListEl.appendChild(this._mplSideGroup({
                    label: "全部分类", count: presetNames.length, key: "preset:all", defaultOpen: false, groupKey: "all:presets",
                    items: presetNames.map(presetItem),
                }));
                const dropIntoCategory = (category) => (e) => this._mplDropFolderAsPreset(e, category);
                groups.forEach(g => {
                    this._presetListEl.appendChild(this._mplSideGroup({
                        label: g.name, count: g.items.length, key: "preset:cat:" + g.name, defaultOpen: true, groupKey: "cat:" + g.name,
                        items: g.items.map(presetItem),
                        onDrop: dropIntoCategory(g.name),
                        onContext: (e) => this._mplCategoryMenu(e, g.name, true),
                    }));
                });
                this._presetListEl.appendChild(this._mplSideGroup({
                    label: "未分类", count: uncat.length, key: "preset:uncat", defaultOpen: true, groupKey: "cat:",
                    items: uncat.map(presetItem),
                    onDrop: dropIntoCategory(""),
                }));

                // ---------- 收藏夹 ----------
                this._favListEl.innerHTML = "";
                const allItems = [];
                const seen = new Set();
                st.favorites.forEach(c => (c.items || []).forEach(n => {
                    if (!seen.has(n)) { seen.add(n); allItems.push({ n, c: c.name }); }
                }));
                const favItem = (n, cname) => ({
                    label: n.replace(/^.*[\\/]/, ""),
                    title: n + (cname ? "（" + cname + "）" : ""),
                    kind: "favorite",
                    payload: { kind: "mpl-favorite", name: n },
                    onClick: () => this._mplAddLoraByName(n),
                    onContext: cname ? () => this._mplRemoveFavorite(n, cname) : null,
                });
                this._favListEl.appendChild(this._mplSideGroup({
                    label: "全部收藏夹", count: allItems.length, key: "fav:all", defaultOpen: false, groupKey: "all:fav",
                    items: allItems.map(x => favItem(x.n, "")),
                }));
                st.favorites.forEach(c => {
                    this._favListEl.appendChild(this._mplSideGroup({
                        label: c.name, count: (c.items || []).length, key: "fav:col:" + c.name, defaultOpen: true, groupKey: "fav:" + c.name,
                        items: (c.items || []).map(n => favItem(n, c.name)),
                        onDrop: (e) => this._mplDropLoraIntoFavorite(e, c.name),
                        onContext: (e) => this._mplFavoriteMenu(e, c.name),
                    }));
                });
            };

            // 计算左栏条目拖到右侧列表时的落点：行内按上下半区精确插入，文件夹处并入该组
            nodeType.prototype._mplComputeDropTarget = function(x, y) {
                const el = document.elementFromPoint(x, y);
                if (!el || !el.closest(".mpl-list-scroll")) return null;
                const rowEl = el.closest(".mpl-lora-row");
                const folderEl = el.closest(".mpl-folder-row");
                if (rowEl) {
                    if (folderEl) {
                        const fIdx = parseInt(folderEl.dataset.fidx, 10);
                        const folder = (this.loraData.folders || [])[fIdx];
                        if (!folder) return null;
                        const rows = Array.from(folderEl.querySelectorAll(":scope > .mpl-lora-row"));
                        const lIdx = rows.indexOf(rowEl);
                        const r = rowEl.getBoundingClientRect();
                        return { kind: "folder", fIdx, lIdx: lIdx < 0 ? (folder.loras || []).length : lIdx, after: y > r.top + r.height / 2, token: "f:" + this._uidFor(folder) };
                    }
                    // 根行按 _topLayout 的 l: 顺序渲染，DOM 下标直接对应 token
                    const rows = Array.from(this.listContainer.querySelectorAll(":scope > .mpl-lora-row"));
                    const idx = rows.indexOf(rowEl);
                    const lTokens = (this._topLayout || []).filter(t => String(t).startsWith("l:"));
                    const token = idx >= 0 ? lTokens[idx] : null;
                    const r = rowEl.getBoundingClientRect();
                    return { kind: "root", idx: idx < 0 ? 0 : idx, after: y > r.top + r.height / 2, token: token || null };
                }
                if (folderEl) {
                    // 落在文件夹头部或组内空白：并入该文件夹末尾
                    const fIdx = parseInt(folderEl.dataset.fidx, 10);
                    const folder = (this.loraData.folders || [])[fIdx];
                    if (!folder) return null;
                    return { kind: "folder", fIdx, lIdx: (folder.loras || []).length, after: false, token: "f:" + this._uidFor(folder) };
                }
                return { kind: "end" };
            };

            // 顶层元素（文件夹卡片/散装行）对应的 _topLayout token
            nodeType.prototype._mplTopTokenForEl = function(el) {
                if (!el) return null;
                if (el.classList.contains("mpl-folder-row")) {
                    const f = (this.loraData.folders || [])[parseInt(el.dataset.fidx, 10)];
                    return f ? "f:" + this._uidFor(f) : null;
                }
                if (el.classList.contains("mpl-lora-row") && this.listContainer && el.parentElement === this.listContainer) {
                    const rows = Array.from(this.listContainer.querySelectorAll(":scope > .mpl-lora-row"));
                    const lTokens = (this._topLayout || []).filter(t => String(t).startsWith("l:"));
                    const idx = rows.indexOf(el);
                    return idx >= 0 && lTokens[idx] ? lTokens[idx] : null;
                }
                return null;
            };

            // 计算顶层排序落点：鼠标压在某卡片/行上按其上下半区，压在空隙则按最近卡片的边界
            nodeType.prototype._mplComputeTopDropTarget = function(x, y) {
                const el = document.elementFromPoint(x, y);
                if (!el || !el.closest(".mpl-list-scroll")) return null;
                const folderEl = el.closest(".mpl-folder-row");
                if (folderEl) {
                    const tok = this._mplTopTokenForEl(folderEl);
                    if (tok) {
                        const r = folderEl.getBoundingClientRect();
                        return { tok, after: y > r.top + r.height / 2 };
                    }
                }
                const rowEl = el.closest(".mpl-lora-row");
                if (rowEl && rowEl.parentElement === this.listContainer) {
                    const tok = this._mplTopTokenForEl(rowEl);
                    if (tok) {
                        const r = rowEl.getBoundingClientRect();
                        return { tok, after: y > r.top + r.height / 2 };
                    }
                }
                // 落在群组之间的空隙：找最近的上/下元素，插到它们之间
                const kids = Array.from(this.listContainer.children).filter(k =>
                    k.classList.contains("mpl-folder-row") || k.classList.contains("mpl-lora-row"));
                for (const k of kids) {
                    const r = k.getBoundingClientRect();
                    if (y < r.top) {
                        const tok = this._mplTopTokenForEl(k);
                        if (tok) return { tok, after: false };
                    } else if (y <= r.bottom) {
                        const tok = this._mplTopTokenForEl(k);
                        if (tok) return { tok, after: y > r.top + r.height / 2 };
                    }
                }
                return null;
            };

            nodeType.prototype._mplApplySidePayload = function(payload, drop) {
                if (!payload) return;
                if (payload.kind === "mpl-preset") this._mplApplyPreset(payload.name, drop);
                else if (payload.kind === "mpl-favorite") this._mplAddLoraByName(payload.name, drop);
            };

            // 指针拖拽兜底：不依赖浏览器原生 dragstart/drop，拖到右侧列表或左栏分组都能识别
            nodeType.prototype._mplSideReorder = function(it, intent) {
                const name = it.payload.name;
                if (!intent || !intent.name || intent.name === name) return;
                if (it.kind === "favorite") {
                    const src = MPL_SIDEBAR.favorites.find(c => (c.items || []).includes(name));
                    const tgt = MPL_SIDEBAR.favorites.find(c => (c.items || []).includes(intent.name));
                    if (!src || !tgt) return;
                    src.items = src.items.filter(x => x !== name);
                    const idx = tgt.items.indexOf(intent.name);
                    tgt.items.splice(intent.after ? idx + 1 : idx, 0, name);
                    mplSaveFavorites().then(() => mplRefreshAllSidebars());
                } else if (it.kind === "preset") {
                    const all = Object.keys(MPL_SIDEBAR.presets);
                    const order = (MPL_SIDEBAR.preset_order || []).filter(n => all.includes(n));
                    all.forEach(n => { if (!order.includes(n)) order.push(n); });
                    if (!order.includes(name) || !order.includes(intent.name)) return;
                    const next = order.filter(n => n !== name);
                    const idx = next.indexOf(intent.name);
                    next.splice(intent.after ? idx + 1 : idx, 0, name);
                    MPL_SIDEBAR.preset_order = next;
                    mplSavePresetMeta().then(() => mplRefreshAllSidebars());
                }
            };

            // 指针拖拽：拖到右侧=添加/生成，拖到分类/收藏夹=归类，拖到同列表条目=排序
            nodeType.prototype._mplBindSideItemPointerDrag = function(el, it) {
                if (!it || !it.payload) return;
                el.addEventListener("pointerdown", (e) => {
                    if (e.button !== 0) return;
                    const startX = e.clientX, startY = e.clientY;
                    let ghost = null, active = false, marked = null, markedCls = null;
                    const clearMark = () => {
                        if (marked) {
                            marked.style.removeProperty("border-top");
                            marked.style.removeProperty("border-bottom");
                            marked = null;
                        }
                        if (markedCls) { markedCls.classList.remove("mpl-top-drop-active"); markedCls = null; }
                    };
                    const intentAt = (x, y) => {
                        clearMark();
                        const t = document.elementFromPoint(x, y);
                        if (!t) return null;
                        if (t.closest(".mpl-list-scroll")) {
                            // 右侧列表落点：行内画上下插入线，文件夹高亮表示并入
                            const drop = this._mplComputeDropTarget(x, y);
                            const rowEl = t.closest(".mpl-lora-row");
                            if (rowEl) {
                                const r = rowEl.getBoundingClientRect();
                                const side = y > r.top + r.height / 2 ? "border-bottom" : "border-top";
                                rowEl.style.setProperty(side, "2px solid #6c8cff", "important");
                                marked = rowEl;
                            } else {
                                const folderEl = t.closest(".mpl-folder-row");
                                if (folderEl) { folderEl.classList.add("mpl-top-drop-active"); markedCls = folderEl; }
                            }
                            return { type: "list", drop };
                        }
                        const itemEl = t.closest(".mpl-side-item");
                        if (itemEl && itemEl !== el) {
                            const r = itemEl.getBoundingClientRect();
                            const after = y > r.top + r.height / 2;
                            itemEl.style[after ? "borderBottom" : "borderTop"] = "2px solid #6c8cff";
                            marked = itemEl;
                            return {
                                type: "reorder",
                                name: itemEl.dataset.mplName,
                                kind: itemEl.dataset.mplKind,
                                after,
                            };
                        }
                        const groupRow = t.closest(".mpl-side-group");
                        const wrap = t.closest(".mpl-side-group-wrap");
                        const gkey = wrap && wrap.dataset ? wrap.dataset.mplGroup : null;
                        if (groupRow && gkey) return { type: "group", key: gkey };
                        return null;
                    };
                    const move = (ev) => {
                        if (!active) {
                            if (Math.abs(ev.clientX - startX) < 6 && Math.abs(ev.clientY - startY) < 6) return;
                            active = true;
                            ghost = document.createElement("div");
                            ghost.textContent = it.label || it.payload.name || "";
                            ghost.style.cssText = "position:fixed;z-index:10090;pointer-events:none;background:rgba(30,31,38,0.96);border:1px solid #6c8cff;color:#e8e8ee;padding:3px 8px;border-radius:6px;font-size:11px;max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 6px 18px rgba(0,0,0,0.5);";
                            document.body.appendChild(ghost);
                        }
                        ghost.style.left = (ev.clientX + 12) + "px";
                        ghost.style.top = (ev.clientY + 12) + "px";
                        intentAt(ev.clientX, ev.clientY);
                    };
                    const cleanup = () => {
                        clearMark();
                        window.removeEventListener("pointermove", move, true);
                        window.removeEventListener("pointerup", onUp, true);
                        window.removeEventListener("pointercancel", onCancel, true);
                        if (ghost) { ghost.remove(); ghost = null; }
                    };
                    const onCancel = () => cleanup();
                    const onUp = (ev) => {
                        const intent = intentAt(ev.clientX, ev.clientY);
                        cleanup();
                        if (!active) return;
                        // 拖拽后短时间内屏蔽 click，避免放手时误触“加进节点”
                        this._mplSideClickBlock = Date.now() + 350;
                        if (this._mplNativeDropAt && Date.now() - this._mplNativeDropAt < 600) return;
                        if (!intent) return;
                        if (intent.type === "list") {
                            this._mplApplySidePayload(it.payload, intent.drop);
                        } else if (intent.type === "reorder" && intent.kind === it.kind) {
                            this._mplSideReorder(it, intent);
                        } else if (intent.type === "group") {
                            const gkey = intent.key;
                            if (it.payload.kind === "mpl-preset" && gkey.startsWith("cat:")) {
                                const cat = gkey.slice(4);
                                if (cat) MPL_SIDEBAR.assignments[it.payload.name] = cat;
                                else delete MPL_SIDEBAR.assignments[it.payload.name];
                                mplSavePresetMeta().then(() => mplRefreshAllSidebars());
                            } else if (it.payload.kind === "mpl-favorite" && gkey.startsWith("fav:")) {
                                const col = MPL_SIDEBAR.favorites.find(c => c.name === gkey.slice(4));
                                if (col) {
                                    col.items = col.items || [];
                                    if (!col.items.includes(it.payload.name)) {
                                        col.items.push(it.payload.name);
                                        mplSaveFavorites().then(() => mplRefreshAllSidebars());
                                    }
                                }
                            }
                        }
                    };
                    window.addEventListener("pointermove", move, true);
                    window.addEventListener("pointerup", onUp, true);
                    window.addEventListener("pointercancel", onCancel, true);
                });
            };

            nodeType.prototype._mplSideMenu = function(x, y, items) {
                const old = document.querySelector(".mpl-ctx-menu");
                if (old) old.remove();
                const menu = document.createElement("div");
                menu.className = "mpl-ctx-menu";
                menu.style.cssText = "position:fixed;z-index:10030;background:#1e1f26;border:1px solid #3b3c46;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.55);padding:5px;min-width:150px;font-size:13px;color:#e8e8ee;";
                menu.style.left = x + "px";
                menu.style.top = y + "px";
                const close = () => { menu.remove(); document.removeEventListener("mousedown", onDown, true); };
                const onDown = (ev) => { if (!menu.contains(ev.target)) close(); };
                items.forEach(it => {
                    const row = document.createElement("div");
                    row.style.cssText = "padding:7px 11px;border-radius:7px;cursor:pointer;white-space:nowrap;" + (it.danger ? "color:#ef6b7d;" : "color:#d6d8e0;");
                    row.textContent = it.label;
                    row.onmouseenter = () => row.style.background = it.danger ? "rgba(239,107,125,0.14)" : "rgba(108,140,255,0.16)";
                    row.onmouseleave = () => row.style.background = "transparent";
                    row.onclick = (ev) => { ev.stopPropagation(); close(); it.fn(); };
                    menu.appendChild(row);
                });
                document.body.appendChild(menu);
                const r = menu.getBoundingClientRect();
                if (r.right > window.innerWidth) menu.style.left = (window.innerWidth - r.width - 6) + "px";
                if (r.bottom > window.innerHeight) menu.style.top = (window.innerHeight - r.height - 6) + "px";
                setTimeout(() => document.addEventListener("mousedown", onDown, true), 0);
            };

            // ---------- 预设操作 ----------
            nodeType.prototype._mplApplyPreset = function(name, drop) {
                const folders = mplPresetFolders(MPL_SIDEBAR.presets[name]);
                if (!folders.length) { alert("该预设没有可用的 LoRA"); return; }
                const added = [];
                folders.forEach(f => {
                    const copy = JSON.parse(JSON.stringify(f));
                    delete copy._uid;
                    copy.name = copy.name || name;
                    (copy.loras || []).forEach(l => { delete l._uid; l.enabled = mplLoraEnabled(l); });
                    this.loraData.folders.push(copy);
                    added.push(copy);
                });
                // 拖到列表落点时，把新文件夹按顺序插到该位置；否则保持追加到末尾
                const refTok = drop && drop.token;
                if (refTok && Array.isArray(this._topLayout) && added.length) {
                    let ref = refTok, after = !!drop.after;
                    added.forEach(f => {
                        const tok = "f:" + this._uidFor(f);
                        this._mplPlaceToken(tok, ref, after);
                        ref = tok; after = true;
                    });
                }
                this.renderEmbeddedList();
                this.updateWidget();
            };

            nodeType.prototype._mplPresetMenu = function(name, x, y) {
                this._mplSideMenu(x || 200, y || 200, [{
                    label: "重命名预设", fn: async () => {
                        const nn = prompt("预设新名称：", name);
                        if (!nn || !nn.trim() || nn.trim() === name) return;
                        const newName = nn.trim();
                        try {
                            const resp = await api.fetchApi("/malora/lora/rename_preset", {
                                method: "POST", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ old: name, new: newName }),
                            });
                            const rj = await resp.json();
                            if (!rj || rj.status !== "success") {
                                alert("重命名失败：" + ((rj && rj.message) || "未知错误"));
                                return;
                            }
                            await mplLoadSidebar(true);
                            mplRefreshAllSidebars();
                        } catch (e) {
                            alert("重命名失败：" + e);
                        }
                    }
                }, {
                    label: "删除预设：" + name, danger: true, fn: async () => {
                        if (!confirm(`确定删除预设 "${name}" 吗？`)) return;
                        await api.fetchApi("/malora/lora/delete_preset", {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ name }),
                        }).catch(() => {});
                        delete MPL_SIDEBAR.presets[name];
                        delete MPL_SIDEBAR.assignments[name];
                        await mplLoadSidebar(true);
                        mplRefreshAllSidebars();
                    }
                }]);
            };

            nodeType.prototype._mplDropFolderAsPreset = function(e, category) {
                // 拖一个已有预设到分类：移动分类
                let presetName = "";
                try {
                    const rawPreset = e.dataTransfer.getData("text/plain");
                    if (rawPreset) {
                        const pj = JSON.parse(rawPreset);
                        if (pj && pj.kind === "mpl-preset") presetName = pj.name || "";
                    }
                } catch (_) {}
                if (presetName) {
                    if (category) MPL_SIDEBAR.assignments[presetName] = category;
                    else delete MPL_SIDEBAR.assignments[presetName];
                    mplSavePresetMeta().then(() => mplRefreshAllSidebars());
                    return;
                }

                let tok = "";
                try {
                    const raw = e.dataTransfer.getData("application/x-mpl-folder");
                    if (raw) tok = JSON.parse(raw).tok || "";
                } catch (_) {}
                if (!tok) return;
                const uid = String(tok).slice(2);
                const folder = (this.loraData.folders || []).find(f => this._uidFor(f) === uid);
                if (!folder) return;
                const def = folder.name || "预设";
                const name = prompt(category ? `保存到「${category}」，预设名称：` : "预设名称：", def);
                if (!name) return;
                const content = { folders: [JSON.parse(JSON.stringify(folder))] };
                delete content.folders[0]._uid;
                (content.folders[0].loras || []).forEach(l => delete l._uid);
                api.fetchApi("/malora/lora/save_preset", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, content, category }),
                }).then(() => mplLoadSidebar(true)).then(() => mplRefreshAllSidebars())
                  .catch((err) => alert("保存预设失败: " + err));
            };

            nodeType.prototype._mplNewPresetCategory = function() {
                const name = prompt("新建预设分类名称：", "");
                if (!name || !name.trim()) return;
                const n = name.trim();
                if (!MPL_SIDEBAR.categories.includes(n)) MPL_SIDEBAR.categories.push(n);
                mplSavePresetMeta().then(() => mplRefreshAllSidebars());
            };

            // ===== LORA 串导入：<lora:名称:模型权重:CLIP权重> =====
            // 解析后逐行显示「名字 + M/C 两个权重」，直接加入节点。
            nodeType.prototype.showLoraStringModal = function() {
                const old = document.querySelector(".mpl-lorastring-overlay");
                if (old) old.remove();

                const overlay = document.createElement("div");
                overlay.className = "mpl-lorastring-overlay";
                overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:10025;display:flex;align-items:center;justify-content:center;";
                const dlg = document.createElement("div");
                dlg.className = "mpl-lorastring-dialog";
                dlg.style.cssText = "background:#1e1f26;border:1px solid #3b3d49;border-radius:12px;padding:18px 20px;width:min(780px,92vw);max-height:86vh;display:flex;flex-direction:column;box-shadow:0 18px 50px rgba(0,0,0,.65);color:#e8e8ee;font-size:13px;";
                const head = document.createElement("div");
                head.textContent = "LORA 串导入（模型权重 / CLIP 权重）";
                head.style.cssText = "font-size:16px;font-weight:700;color:#f2f3f7;margin-bottom:12px;cursor:move;user-select:none;";
                const body = document.createElement("div");
                body.style.cssText = "min-height:0;display:flex;flex-direction:column;gap:10px;";

                const tip = document.createElement("div");
                tip.textContent = "整段粘贴 <lora:名称:模型权重:CLIP权重> 即可；名称会按本机 LoRA 文件自动补全路径。单击 M / C 可改权重。";
                tip.style.cssText = "color:#929ca9;font-size:12px;line-height:1.5;";
                body.appendChild(tip);

                const ta = document.createElement("textarea");
                ta.style.cssText = "width:100%;height:108px;resize:vertical;background:#15161c;border:1px solid #3b3d49;border-radius:8px;color:#dfe3f2;font:12px/1.6 Consolas,monospace;padding:10px;box-sizing:border-box;";
                ta.placeholder = "<lora:wlop_c1-st4000:0.40:0.40> <lora:light_c1-st2000:0.40:1.00>";
                body.appendChild(ta);

                const nameRow = document.createElement("div");
                nameRow.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap;";
                const nameLab = document.createElement("span");
                nameLab.textContent = "预设名称";
                nameLab.style.cssText = "color:#929ca9;";
                const nameInput = document.createElement("input");
                nameInput.type = "text";
                nameInput.value = "LORA串";
                nameInput.style.cssText = "flex:1;min-width:150px;background:#15161c;border:1px solid #3b3d49;border-radius:7px;color:#e8e8ee;padding:6px 9px;";
                nameRow.append(nameLab, nameInput);
                body.appendChild(nameRow);

                const count = document.createElement("div");
                count.style.cssText = "color:#9aa3b2;font-size:12px;";
                body.appendChild(count);

                const list = document.createElement("div");
                list.style.cssText = "flex:1 1 auto;min-height:80px;max-height:38vh;overflow:auto;background:#16171d;border:1px solid #33353f;border-radius:8px;padding:6px;";
                body.appendChild(list);

                let parsed = [];
                const render = () => {
                    list.innerHTML = "";
                    parsed.forEach((it) => {
                        const row = document.createElement("div");
                        row.style.cssText = "display:flex;align-items:center;gap:8px;padding:4px 6px;border-bottom:1px solid #282a33;";
                        const chk = document.createElement("input");
                        chk.type = "checkbox"; chk.checked = it.enabled;
                        chk.addEventListener("pointerdown", e => e.stopPropagation());
                        chk.onchange = () => { it.enabled = chk.checked; };
                        const nm = document.createElement("span");
                        nm.textContent = (it.name.split(/[/\\]/).pop() || it.name).replace(/\.(safetensors|ckpt|pt|pth|bin|gguf|onnx)$/i, "");
                        nm.title = it.name;
                        nm.style.cssText = "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:" + (it._found ? "#e8e8ee" : "#ef8a98") + ";";
                        const mkWeight = (label, value, key, color) => {
                            const el = document.createElement("span");
                            el.className = "mpl-lorastring-weight";
                            el.textContent = label + " " + Number(value).toFixed(2);
                            el.title = key === "clipWeight"
                                ? (mplClipFollowsWeight(it) ? "CLIP 跟随模型权重\n右键改为自定义" : "CLIP 自定义权重\n右键恢复跟随")
                                : "单击修改模型权重";
                            el.style.cssText = "color:" + color + ";min-width:60px;text-align:right;cursor:pointer;";
                            el.onclick = () => {
                                const v = prompt("输入" + (key === "weight" ? "模型" : "CLIP") + "权重：", value);
                                if (v === null) return;
                                if (key === "weight") {
                                    const n = parseFloat(v);
                                    if (!Number.isFinite(n)) return;
                                    it.weight = mplClampWeight(n);
                                    mplSyncClipWeight(it);
                                } else {
                                    mplSetCustomClipWeight(it, v);
                                }
                                render();
                            };
                            if (key === "clipWeight") {
                                el.oncontextmenu = (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    mplToggleClipFollow(it);
                                    render();
                                };
                            }
                            return el;
                        };
                        row.append(chk, nm,
                            mkWeight("M", it.weight, "weight", "#9fc0ff"),
                            mkWeight("C", it.clipWeight, "clipWeight", mplClipFollowsWeight(it) ? "#c6a9ff" : "#8fe3d2"));
                        list.appendChild(row);
                    });
                    const ok = parsed.filter(x => x._found).length;
                    count.textContent = "解析到 " + parsed.length + " 个 LoRA，本机定位 " + ok + " 个" +
                        (parsed.length - ok ? "（未定位的会保留，加载时按缺失提示）" : "");
                };
                const parseAndRender = () => {
                    parsed = mplParseLoraString(ta.value);
                    render();
                };
                ta.addEventListener("input", parseAndRender);
                parseAndRender();

                const btns = document.createElement("div");
                btns.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;";
                const mkBtn = (text, primary, fn) => {
                    const b = document.createElement("button");
                    b.type = "button"; b.textContent = text;
                    b.style.cssText = "padding:7px 15px;border-radius:7px;border:1px solid " + (primary ? "#6c8cff" : "#3b3d49") +
                        ";background:" + (primary ? "#6c8cff" : "#272932") + ";color:" + (primary ? "#fff" : "#d6d8e0") +
                        ";cursor:pointer;font-size:12.5px;font-weight:600;";
                    b.onclick = fn; return b;
                };
                const collect = () => {
                    const items = parsed.filter(x => x.enabled).map(x => {
                        const c = Object.assign({}, x);
                        delete c._found;
                        return mplDecorateNewLora(c);
                    });
                    if (!items.length) { alert("没有可加入的 LoRA"); return null; }
                    return items;
                };
                const addToNode = (presetName, items) => {
                    if (!this.loraData) this.loraData = { folders: [], loras: [] };
                    if (!Array.isArray(this.loraData.folders)) this.loraData.folders = [];
                    this.loraData.folders.push({ name: presetName, loras: items });
                    this.renderEmbeddedList(); this.updateWidget();
                };
                btns.appendChild(mkBtn("取消", false, () => overlay.remove()));
                btns.appendChild(mkBtn("加入节点", true, () => {
                    const items = collect(); if (!items) return;
                    addToNode(nameInput.value.trim() || "LORA串", items);
                    overlay.remove();
                }));
                body.appendChild(btns);
                dlg.append(head, body);
                overlay.appendChild(dlg);
                document.body.appendChild(overlay);
                this.makeDialogDraggable(dlg, head);
                ["pointerdown", "pointerup", "mousedown", "mouseup"].forEach(ev =>
                    dlg.addEventListener(ev, e => e.stopPropagation()));
                overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
                const onKey = (e) => {
                    if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", onKey); }
                };
                document.addEventListener("keydown", onKey);
                setTimeout(() => { try { ta.focus(); } catch (e) {} }, 100);
            };

            nodeType.prototype._mplCategoryMenu = function(e, name, isCat) {
                const idx = MPL_SIDEBAR.categories.indexOf(name);
                const items = [{
                    label: "重命名分类", fn: () => {
                        const nn = prompt("分类新名称：", name);
                        if (!nn || !nn.trim()) return;
                        const v = nn.trim();
                        MPL_SIDEBAR.categories[idx] = v;
                        Object.keys(MPL_SIDEBAR.assignments).forEach(k => {
                            if (MPL_SIDEBAR.assignments[k] === name) MPL_SIDEBAR.assignments[k] = v;
                        });
                        mplSavePresetMeta().then(() => mplRefreshAllSidebars());
                    }
                }, {
                    label: "删除分类（预设保留在未分类）", danger: true, fn: () => {
                        if (!confirm(`删除分类 "${name}"？分类里的预设会移到「未分类」。`)) return;
                        MPL_SIDEBAR.categories.splice(idx, 1);
                        Object.keys(MPL_SIDEBAR.assignments).forEach(k => {
                            if (MPL_SIDEBAR.assignments[k] === name) delete MPL_SIDEBAR.assignments[k];
                        });
                        mplSavePresetMeta().then(() => mplRefreshAllSidebars());
                    }
                }];
                this._mplSideMenu(e.clientX, e.clientY, items);
            };

            // ---------- 收藏夹操作 ----------
            nodeType.prototype._mplAddLoraByName = function(name, drop) {
                if (!name) return;
                // 允许同一个 LoRA 重复加入（右侧列表需要多份同一 LoRA 的场景）
                const lora = mplDecorateNewLora({
                    name, weight: 1.0, enabled: true, tags: "", note: "", triggerWords: "",
                });
                // 拖到文件夹内：按落点插进该组
                if (drop && drop.kind === "folder") {
                    const folder = (this.loraData.folders || [])[drop.fIdx];
                    if (folder) {
                        folder.loras = folder.loras || [];
                        const at = Math.max(0, Math.min(folder.loras.length, (drop.lIdx || 0) + (drop.after ? 1 : 0)));
                        folder.loras.splice(at, 0, lora);
                        folder.collapsed = false;
                        this.renderEmbeddedList();
                        this.updateWidget();
                        return;
                    }
                }
                this.loraData.loras.push(lora);
                // 拖到根列表某行处：按落点插到该行前/后
                if (drop && drop.token && Array.isArray(this._topLayout)) {
                    this._mplPlaceToken("l:" + this._uidFor(lora), drop.token, !!drop.after);
                }
                this.renderEmbeddedList();
                this.updateWidget();
            };

            nodeType.prototype._mplDropLoraIntoFavorite = function(e, collectionName) {
                let name = "";
                try {
                    const raw = e.dataTransfer.getData("application/x-mpl-lora");
                    if (raw) name = JSON.parse(raw).name || "";
                } catch (_) {}
                if (!name) return;
                const col = MPL_SIDEBAR.favorites.find(c => c.name === collectionName);
                if (!col) return;
                col.items = col.items || [];
                if (!col.items.includes(name)) {
                    col.items.push(name);
                    mplSaveFavorites().then(() => mplRefreshAllSidebars());
                }
            };

            nodeType.prototype._mplRemoveFavorite = function(name, collectionName) {
                const col = MPL_SIDEBAR.favorites.find(c => c.name === collectionName);
                if (!col) return;
                col.items = (col.items || []).filter(n => n !== name);
                mplSaveFavorites().then(() => mplRefreshAllSidebars());
            };

            nodeType.prototype._mplDropLoraLoose = function(e) {
                let name = "";
                try {
                    const raw = e.dataTransfer.getData("application/x-mpl-lora");
                    if (raw) name = JSON.parse(raw).name || "";
                } catch (_) {}
                if (!name) return;
                const addTo = (col) => {
                    col.items = col.items || [];
                    if (!col.items.includes(name)) {
                        col.items.push(name);
                        mplSaveFavorites().then(() => mplRefreshAllSidebars());
                    }
                };
                const cols = MPL_SIDEBAR.favorites;
                if (cols.length === 0) {
                    const col = { name: "我的收藏", items: [] };
                    MPL_SIDEBAR.favorites.push(col);
                    addTo(col);
                } else if (cols.length === 1) {
                    addTo(cols[0]);
                } else {
                    this._mplSideMenu(e.clientX, e.clientY, cols.map(c => ({
                        label: "收藏到：" + c.name,
                        fn: () => addTo(c),
                    })));
                }
            };

            nodeType.prototype._mplNewFavoriteCollection = function() {
                const name = prompt("新建收藏夹名称：", "");
                if (!name || !name.trim()) return;
                const n = name.trim();
                if (!MPL_SIDEBAR.favorites.some(c => c.name === n)) {
                    MPL_SIDEBAR.favorites.push({ name: n, items: [] });
                }
                mplSaveFavorites().then(() => mplRefreshAllSidebars());
            };

            nodeType.prototype._mplFavoriteMenu = function(e, name) {
                const items = [{
                    label: "重命名收藏夹", fn: () => {
                        const nn = prompt("收藏夹新名称：", name);
                        if (!nn || !nn.trim()) return;
                        const col = MPL_SIDEBAR.favorites.find(c => c.name === name);
                        if (col) col.name = nn.trim();
                        mplSaveFavorites().then(() => mplRefreshAllSidebars());
                    }
                }, {
                    label: "删除收藏夹", danger: true, fn: () => {
                        if (!confirm(`删除收藏夹 "${name}"？`)) return;
                        MPL_SIDEBAR.favorites = MPL_SIDEBAR.favorites.filter(c => c.name !== name);
                        mplSaveFavorites().then(() => mplRefreshAllSidebars());
                    }
                }];
                this._mplSideMenu(e.clientX, e.clientY, items);
            };

            // 🌟 3. 注入 CSS (修复的重点)
            nodeType.prototype.injectStyles = function() {
                // 注意：不能用通用的 "mpl-styles"。ComfyUI-Magic-Assistant 自带一份同源旧版
                // magic_power_lora.js，同样注入 id="mpl-styles" 但 CSS 里没有 .mpl-lora-thumb
                // 等新规则；谁先加载谁占坑，另一个直接 return，导致缩略图按原图尺寸铺满列表。
                // 用独立 id 让两套样式共存，互不影响。
                if(document.getElementById("mpl-styles-ma-loader")) return;
                const s = document.createElement("style");
                s.id = "mpl-styles-ma-loader";
                s.innerHTML = `
                    /* 🛑 关键修改：pointer-events 必须为 auto，否则鼠标事件会直接穿透到底下的画布 */
                    .mpl-embedded-container { 
                        display: flex; 
                        flex-direction: column; 
                        background: #2a2a2a; 
                        border-radius: 0 0 8px 8px; 
                        border: 1px solid #444; 
                        border-top: 1px solid #555; 
                        pointer-events: auto;  /* 👈 改这里：之前是 none，导致无法拦截事件 */
                        overflow: hidden; 
                        box-sizing: border-box; 
                        font-family: sans-serif; 
                        font-size: 12px; 
                        width: 100%;
                        min-height: 200px;
                    }
                    .mpl-list-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 5px; background: #222; pointer-events: auto; }
                    /* ===== 双栏布局：左侧预设分类 + 收藏夹，右侧 LoRA 列表 ===== */
                    .mpl-main-split { display: flex; flex: 1 1 auto; min-height: 0; }
                    .mpl-main-pane { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
                    .mpl-sidebar {
                        flex: 0 0 158px; width: 158px; display: flex; flex-direction: column;
                        min-height: 0; background: #1b1c21; border-right: 1px solid #3a3b42;
                    }
                    .mpl-side-section { display: flex; flex-direction: column; min-height: 0; flex: 1 1 50%; }
                    .mpl-side-section + .mpl-side-section { border-top: 1px solid #3a3b42; }
                    .mpl-side-head {
                        flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
                        padding: 4px 6px; background: #26272d; color: #aab0bf;
                        font-size: 11px; font-weight: 600; letter-spacing: .02em;
                    }
                    .mpl-side-add {
                        width: 18px; height: 18px; line-height: 15px; padding: 0; border: 1px solid #3b3c46;
                        background: #1e1f26; color: #c8cad6; border-radius: 5px; cursor: pointer; font-size: 13px;
                    }
                    .mpl-side-add:hover { border-color: rgba(108,140,255,0.6); color: #cfd8ff; }
                    .mpl-side-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 3px; }
                    .mpl-side-list::-webkit-scrollbar { width: 6px; }
                    .mpl-side-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 4px; }
                    .mpl-side-group {
                        display: flex; align-items: center; gap: 3px; padding: 2px 4px; border-radius: 5px;
                        cursor: pointer; color: #c8cad6; font-size: 11.5px; user-select: none;
                    }
                    .mpl-side-group:hover { background: rgba(108,140,255,0.14); }
                    .mpl-side-group.mpl-side-drop { outline: 1px dashed #6c8cff; background: rgba(108,140,255,0.2); }
                    .mpl-side-caret { width: 10px; flex: 0 0 10px; color: #8b8d9b; font-size: 10px; }
                    .mpl-side-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                    .mpl-side-count {
                        flex: 0 0 auto; min-width: 16px; text-align: center; padding: 0 4px; border-radius: 8px;
                        background: rgba(255,255,255,0.08); color: #9aa3b2; font-size: 10px; line-height: 14px;
                    }
                    .mpl-side-items { margin: 0 0 2px 10px; border-left: 1px solid #33353c; padding-left: 4px; }
                    .mpl-side-item {
                        padding: 2px 5px; border-radius: 4px; font-size: 11px; color: #b9bdc9; cursor: grab;
                        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                        user-select: none; -webkit-user-select: none;
                    }
                    .mpl-side-item:hover { background: rgba(108,140,255,0.18); color: #eef1ff; }
                    .mpl-footer { height: 36px; background: #2e2e2e; border-top: 1px solid #333; display: flex; align-items: center; padding: 0 5px; gap: 5px; pointer-events: auto; }
                    .mpl-folder-row { background: #383838; margin-bottom: 4px; border-radius: 4px; overflow: hidden; border: 1px solid #444; border-left: 3px solid #5a6b7c; }
                    .mpl-folder-row.drag-over { border: 2px dashed #2196F3; }
                    .mpl-folder-header { 
                        padding: 4px 6px; 
                        color: #eee; 
                        cursor: pointer; 
                        display: flex; 
                        align-items: center; 
                        font-weight: bold; 
                        background: #404040; 
                        font-size: 13px;
                        min-height: 28px;
                    }
                    .mpl-folder-title { margin-left: 5px; border-bottom: 1px dashed transparent; flex: 0 0 auto; max-width: 55%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                    .mpl-folder-title:hover { color: #64b5f6; border-color: #666; }
                    .mpl-folder-controls { 
                        display: flex; 
                        align-items: center; 
                        gap: 4px; 
                        margin-left: auto; 
                    }
                    .mpl-lora-row { display: flex; align-items: center; gap: 5px; padding: 4px; background: #2b2b2b; border-bottom: 1px solid #333; cursor: pointer; border-left: 3px solid transparent; transition: background .12s, border-color .12s; }
                    .mpl-lora-row.root-item { background: #222; border: 1px solid #333; margin-bottom: 2px; }
                    .mpl-lora-row:hover { background: #343434; }
                    .mpl-lora-row.mpl-selected { background: #2f4f6f !important; border-left: 3px solid #4aa3ff; }
                    .mpl-lora-row.mpl-disabled { opacity: 0.5; }
                    .mpl-lora-row.mpl-disabled .mpl-lora-name { color: #888; }
                    .mpl-lora-thumb { width: 34px; height: 34px; flex-shrink: 0; border-radius: 4px; overflow: hidden; background: #151515; border: 1px solid #3a3a3a; display: flex; align-items: center; justify-content: center; cursor: default; }
                    .mpl-lora-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
                    .mpl-lora-thumb.mpl-lora-thumb-empty { background: #202020; }
                    .mpl-lora-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; margin-left: auto; }
                    .mpl-trigger-btn { max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: #33384a; border: 1px solid #4a5568; color: #c9d4e2; border-radius: 4px; font-size: 11px; height: 24px; padding: 0 8px; cursor: pointer; transition: all .15s; }
                    .mpl-trigger-btn:hover { border-color: #6b8cae; color: #eaf3ff; }
                    .mpl-trigger-btn.mpl-trigger-off { background: #3a3436; color: #9a8f8f; border-color: #574a4d; }
                    .mpl-trigger-btn.mpl-trigger-empty { color: #888; font-style: italic; }
                    .mpl-img-preview-overlay { animation: mplFadeIn .15s ease; }
                    @keyframes mplFadeIn { from { opacity: 0; } to { opacity: 1; } }
                    .mpl-lora-name { flex: 1; min-width: 100px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: #ccc; }
                    .mpl-note-input { flex: 1; min-width: 80px; padding: 4px 8px; background: #1a1a1a; border: 1px solid #555; border-radius: 3px; color: #fff; font-size: 12px; }
                    .mpl-weight-container { display: flex; align-items: center; background: #333; border-radius: 3px; border: 1px solid #555; overflow: hidden; }
                    .mpl-weight-display { min-width: 50px; padding: 4px 8px; text-align: center; color: #fff; font-size: 12px; user-select: none; background: #2a2a2a; cursor: pointer; }
                    .mpl-weight-display:hover { background: #333; }
                    .mpl-btn-add { flex: 1; background: #2196F3; border: none; color: white; border-radius: 3px; height: 26px; cursor: pointer; font-size: 12px; }
                    .mpl-btn-metadata { flex: 1; background: #00897b; border: none; color: white; border-radius: 3px; height: 26px; cursor: pointer; font-size: 12px; white-space: nowrap; }
                    .mpl-btn-metadata:hover { background: #009688; }
                    .mpl-btn-icon { 
                        min-width: 40px; 
                        height: 26px; 
                        background: #333; 
                        border: 1px solid #555; 
                        color: #ccc; 
                        border-radius: 3px; 
                        cursor: pointer; 
                        font-size: 12px;
                        padding: 0 8px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .mpl-btn-icon:hover {
                        background: #444;
                        border-color: #666;
                        color: white;
                    }
                    .mpl-mini-input { width: 40px; background: #1a1a1a; border: 1px solid #555; color: white; text-align: center; border-radius: 3px; }
                    .mpl-mini-btn { 
                        background: #333; 
                        border: 1px solid #555; 
                        cursor: pointer; 
                        color: #ccc; 
                        padding: 4px 8px; 
                        border-radius: 4px;
                        font-size: 14px;
                        width: 28px;
                        height: 24px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.2s;
                    }
                    .mpl-mini-btn:hover { 
                        background: #444; 
                        color: white; 
                        border-color: #666;
                    }
                    .mpl-mini-btn.del:hover { 
                        background: #f44336; 
                        color: white; 
                        border-color: #f44336;
                    }
                    .mpl-mini-btn.edit { 
                        background: #2196F3; 
                        color: white; 
                        border-color: #2196F3;
                    }
                    .mpl-mini-btn.edit:hover { 
                        background: #42A5F5; 
                        border-color: #42A5F5;
                    }
                    .mpl-mini-btn.tag { 
                        background: #333; 
                        color: #888;
                    }
                    .mpl-mini-btn.tag.active { 
                        color: #4CAF50; 
                    }
                    .mpl-mini-btn.tag:hover { 
                        color: #4CAF50; 
                    }
                    .mpl-lora-preview { display: none; }
                    .mpl-metadata-dialog {
                        position: fixed; z-index: 9999; display: flex; flex-direction: column;
                        width: 820px; height: 600px; max-width: calc(100vw - 40px); max-height: calc(100vh - 56px);
                        min-width: min(660px, calc(100vw - 40px)); min-height: min(420px, calc(100vh - 56px));
                        background: #191b22; color: #dce1e7; border: 1px solid #2c3040; border-radius: 12px;
                        box-shadow: 0 24px 60px rgba(0,0,0,.6), 0 2px 8px rgba(0,0,0,.4); overflow: hidden; resize: both;
                        box-sizing: border-box; font: 12px/1.45 sans-serif; outline: none;
                    }
                    .mpl-metadata-dialog *, .mpl-metadata-dialog *::before, .mpl-metadata-dialog *::after { box-sizing: border-box; }
                    .mpl-metadata-header { display: flex; align-items: center; gap: 10px; padding: 11px 14px; background: #1f2230; border-bottom: 1px solid #2c3040; flex-shrink: 0; cursor: move; }
                    .mpl-metadata-title { font-size: 14px; font-weight: 600; flex: 1; }
                    .mpl-metadata-lm { display: inline-block; margin-left: 6px; padding: 0 5px; font-size: 10px; line-height: 14px; border-radius: 6px; background: rgba(108,140,255,.18); color: #b9c6ff; vertical-align: middle; font-weight: 600; }
                    .mpl-metadata-header-icon { color: #8cbcf0; font-size: 16px; }
                    .mpl-metadata-close { width: 25px; height: 25px; padding: 0 !important; font-size: 18px !important; background: transparent !important; border-color: transparent !important; }
                    .mpl-metadata-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
                    .mpl-metadata-filters { padding: 11px 14px; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid #2c3040; background: #1c1f27; flex-shrink: 0; }
                    .mpl-metadata-filter-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
                    .mpl-metadata-field { display: flex; align-items: center; gap: 7px; min-width: 0; }
                    .mpl-metadata-field > span { color: #929ca9; white-space: nowrap; font-size: 11px; }
                    .mpl-metadata-scope { width: 230px; flex-shrink: 0; }
                    .mpl-metadata-directory { flex: 1; min-width: 100px; }
                    .mpl-metadata-dialog select, .mpl-metadata-dialog input[type=search] {
                        min-width: 0; width: 100%; height: 30px; margin: 0; padding: 4px 8px;
                        color: #dce1e7; background: #191c21; border: 1px solid #424954; border-radius: 5px;
                        font: inherit; outline: none;
                    }
                    .mpl-metadata-dialog select:focus, .mpl-metadata-dialog input[type=search]:focus { border-color: #659cd4; }
                    .mpl-metadata-dialog input[type=checkbox] { width: 13px; height: 13px; margin: 0; accent-color: #70a8df; flex-shrink: 0; }
                    .mpl-metadata-check { display: flex; align-items: center; gap: 6px; cursor: pointer; white-space: nowrap; font-size: 11px; }
                    .mpl-metadata-dialog .mpl-metadata-search-row { flex-wrap: wrap; }
                    .mpl-metadata-dialog .mpl-metadata-search-row input.mpl-metadata-search { flex: 1 1 260px; width: auto; min-width: min(220px, 100%); max-width: 100%; }
                    .mpl-metadata-dialog .mpl-metadata-search-row select.mpl-metadata-status-filter { flex: 0 0 150px; width: 150px; min-width: 130px; max-width: 100%; }
                    .mpl-metadata-dialog .mpl-metadata-search-row .mpl-metadata-refresh { flex: 0 0 auto; width: auto; }
                    .mpl-metadata-workspace { display: grid; grid-template-columns: 190px minmax(0,1fr); flex: 1; min-height: 0; }
                    .mpl-metadata-settings { padding: 12px; border-right: 1px solid #2c3040; background: #1c1f27; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
                    .mpl-metadata-setting-group { display: flex; flex-direction: column; gap: 7px; }
                    .mpl-metadata-caption { color: #929ca9; font-size: 11px; font-weight: 600; }
                    .mpl-metadata-types { display: flex; flex-direction: column; gap: 6px; }
                    .mpl-metadata-type { display: flex; align-items: center; gap: 7px; padding: 6px 8px; border: 1px solid #3b424c; border-radius: 5px; background: #292e35; cursor: pointer; font-size: 11px; }
                    .mpl-metadata-type:has(input:checked) { border-color: #527aa2; background: #2b3542; color: #c3ddf6; }
                    .mpl-metadata-mode-help { font-size: 11px; color: #97a2b0; line-height: 1.6; }
                    .mpl-metadata-library { min-width: 0; min-height: 0; padding: 10px 12px 0; display: flex; flex-direction: column; gap: 8px; }
                    .mpl-metadata-selection { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; flex-shrink: 0; }
                    .mpl-metadata-counts { margin-left: auto; display: flex; align-items: center; gap: 9px; color: #93a3b6; font-size: 10px; flex-wrap: wrap; }
                    .mpl-metadata-hint { color: #83909f; font-size: 10px; line-height: 1.5; flex-shrink: 0; }
                    .mpl-metadata-warning { color: #e3b46f; font-size: 11px; white-space: pre-wrap; max-height: 65px; overflow: auto; flex-shrink: 0; }
                    .mpl-metadata-warning:empty { display: none; }
                    .mpl-metadata-inventory { flex: 1; min-height: 100px; overflow: auto; overscroll-behavior: contain; border: 1px solid #3a424d; border-radius: 6px; background: #1d2025; }
                    .mpl-metadata-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 11px; }
                    .mpl-metadata-table thead { position: sticky; top: 0; z-index: 1; background: #2b3139; color: #a6b1be; }
                    .mpl-metadata-table th { padding: 8px 7px; text-align: left; font-weight: 500; white-space: nowrap; }
                    .mpl-metadata-table td { padding: 7px; border-bottom: 1px solid #2c323a; vertical-align: middle; }
                    .mpl-metadata-table tr:has(input:checked) { background: #24303d; }
                    .mpl-metadata-table tbody tr:hover { background: #2a333f; }
                    .mpl-metadata-file { overflow: hidden; }
                    .mpl-metadata-file-name { color: #dde5ee; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                    .mpl-metadata-file-path { color: #788797; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
                    .mpl-metadata-status { display: inline-block; padding: 2px 5px; border-radius: 4px; font-size: 10px; white-space: nowrap; }
                    .mpl-metadata-present { color: #93c8b5; background: #263c36; }
                    .mpl-metadata-missing { color: #dcb774; background: #413824; }
                    .mpl-metadata-unavailable { color: #9da7b2; background: #30353c; }
                    .mpl-metadata-progress { padding: 9px 14px; border-top: 1px solid #2c3040; display: flex; align-items: center; gap: 10px; background: #1c1f27; flex-shrink: 0; }
                    .mpl-metadata-progress-text { width: 125px; min-width: 0; font-size: 11px; color: #9eafc2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                    .mpl-metadata-progress-row { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
                    .mpl-metadata-progress progress { flex: 1; min-width: 0; width: 100%; height: 6px; accent-color: #72a9df; }
                    .mpl-metadata-progress-count { color: #a4b2c2; font-size: 10px; white-space: nowrap; }
                    .mpl-metadata-current { color: #8693a3; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px; }
                    .mpl-metadata-results { flex-shrink: 0; margin-bottom: 8px; color: #98a7b9; font-size: 11px; }
                    .mpl-metadata-results summary { cursor: pointer; padding: 5px 0; }
                    .mpl-metadata-stats { display: flex; flex-wrap: wrap; gap: 9px; font-size: 10px; padding-bottom: 5px; }
                    .mpl-metadata-result-list { max-height: 105px; overflow-y: auto; overscroll-behavior: contain; font-size: 10px; }
                    .mpl-metadata-result { padding: 7px 0; border-bottom: 1px solid #343c46; overflow-wrap: anywhere; }
                    .mpl-metadata-result-title { display: flex; align-items: baseline; gap: 7px; color: #becad8; }
                    .mpl-metadata-result-status { color: #93c8b5; white-space: nowrap; }
                    .mpl-metadata-result-status-error { color: #e3b46f; }
                    .mpl-metadata-result-message { color: #8d9cad; margin-top: 3px; white-space: pre-wrap; }
                    .mpl-metadata-footer { padding: 10px 14px; border-top: 1px solid #2c3040; display: flex; align-items: center; gap: 7px; flex-shrink: 0; }
                    .mpl-metadata-footer-spacer { flex: 1; }
                    .mpl-metadata-dialog button { padding: 5px 9px; margin: 0; border: 1px solid #434d5b; border-radius: 5px; background: #2c333d; color: #becad8; cursor: pointer; font: 11px/1.45 sans-serif; white-space: nowrap; }
                    .mpl-metadata-dialog button:hover:not(:disabled) { background: #394353; border-color: #5f7793; color: #eef4fb; }
                    .mpl-metadata-dialog button:disabled { opacity: .4; cursor: default; }
                    .mpl-metadata-dialog .mpl-metadata-primary { background: #3c77ad; border-color: #568aba; color: white; padding: 6px 16px; }
                    .mpl-metadata-dialog .mpl-metadata-primary:hover:not(:disabled) { background: #4988c2; }
                    @media (max-width: 720px) {
                        .mpl-metadata-workspace { grid-template-columns: 155px minmax(0,1fr); }
                        .mpl-metadata-scope { width: 190px; }
                        .mpl-metadata-filter-row { flex-wrap: wrap; }
                        .mpl-metadata-counts { margin-left: 0; }
                        .mpl-metadata-current { display: none; }
                    }
                    .mpl-spinner { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:20px; height:20px; border:2px solid #333; border-top:2px solid #fff; border-radius:50%; animation:mpl-spin 1s linear infinite; }
                    @keyframes mpl-spin { 0% { transform:translate(-50%,-50%) rotate(0deg); } 100% { transform:translate(-50%,-50%) rotate(360deg); } }

                    /* ===================== MA-SKIN : PromptFavorites 风格换肤（纯CSS覆盖） ===================== */
                    .mpl-embedded-container {
                        --ma-panel-bg: #1e1f26;
                        --ma-surface: #2a2b34;
                        --ma-surface-raised: #33343e;
                        --ma-text: #e8e8ee;
                        --ma-muted: #8b8d9b;
                        --ma-border: #3b3c46;
                        --ma-accent: #6c8cff;
                        --ma-accent-soft: rgba(108,140,255,0.16);
                        --ma-danger: #ef6b7d;
                        --ma-warn: #f2b95e;
                        --ma-success: #6fcf97;
                        background: var(--ma-panel-bg) !important;
                        border: 1px solid var(--ma-border) !important;
                        border-radius: 12px !important;
                        color: var(--ma-text);
                        font-family: system-ui, -apple-system, "Segoe UI", sans-serif !important;
                        box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
                    }
                    .mpl-list-scroll {
                        background: var(--ma-panel-bg) !important;
                        padding: 8px !important;
                    }
                    /* 文件夹：卡片式容器 + 左侧强调条 */
                    .mpl-folder-row {
                        background: var(--ma-surface) !important;
                        border: 1px solid var(--ma-border) !important;
                        border-left: 3px solid var(--ma-accent) !important;
                        border-radius: 10px !important;
                        margin-bottom: 8px !important;
                        overflow: hidden;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.28);
                    }
                    .mpl-folder-row.drag-over {
                        border: 1px dashed var(--ma-accent) !important;
                        box-shadow: 0 0 0 2px var(--ma-accent-soft);
                    }
                    .mpl-folder-header {
                        background: linear-gradient(180deg, rgba(255,255,255,0.045), transparent) !important;
                        color: var(--ma-text) !important;
                        font-weight: 650 !important;
                        font-size: 12.5px !important;
                        padding: 7px 9px !important;
                        min-height: 34px !important;
                        border-bottom: 1px solid rgba(255,255,255,0.04);
                    }
                    .mpl-folder-title {
                        color: var(--ma-text) !important;
                        font-weight: 650;
                        flex: 0 0 auto !important;
                        max-width: 55% !important;
                    }
                    .mpl-folder-title:hover {
                        color: var(--ma-accent) !important;
                        border-color: var(--ma-border) !important;
                    }
                    /* lora 行：紧凑卡片 + 圆角 + 悬停/选中态 */
                    .mpl-lora-row {
                        background: transparent !important;
                        border: 1px solid transparent !important;
                        border-left: 3px solid transparent !important;
                        border-radius: 8px !important;
                        padding: 3px 6px !important;
                        margin: 1px 0 !important;
                        gap: 4px !important;
                        transition: background .13s ease, border-color .13s ease !important;
                    }
                    .mpl-lora-row.root-item {
                        background: transparent !important;
                        border: 1px solid transparent !important;
                        margin-bottom: 2px !important;
                    }
                    .mpl-lora-row:hover {
                        background: var(--ma-surface-raised) !important;
                        border-color: var(--ma-border) !important;
                    }
                    /* 选中态：紫蓝柔光 + 左侧色条（对齐参考 .pfs-entry.is-selected） */
                    .mpl-lora-row.mpl-selected {
                        background: var(--ma-accent-soft) !important;
                        border-color: rgba(108,140,255,0.42) !important;
                        border-left: 3px solid var(--ma-accent) !important;
                    }
                    .mpl-lora-row.mpl-disabled {
                        opacity: 0.45 !important;
                    }
                    .mpl-lora-row.mpl-disabled .mpl-lora-name {
                        color: var(--ma-muted) !important;
                    }
                    /* 缩略图：圆角 + 边框，对齐参考 .pfs-thumb */
                    .mpl-lora-thumb {
                        width: 30px !important;
                        height: 30px !important;
                        border-radius: 6px !important;
                        border: 1px solid var(--ma-border) !important;
                        background: linear-gradient(135deg, #3a3f52, #23252e) !important;
                        box-shadow: 0 1px 2px rgba(0,0,0,0.3);
                    }
                    .mpl-lora-thumb:hover {
                        border-color: rgba(108,140,255,0.55) !important;
                        box-shadow: 0 0 0 2px var(--ma-accent-soft);
                    }
                    .mpl-lora-thumb.mpl-lora-thumb-empty {
                        background: var(--ma-surface) !important;
                    }
                    .mpl-lora-name {
                        color: var(--ma-text) !important;
                        font-size: 12px !important;
                        font-weight: 600 !important;
                    }
                    /* 让名称占更多空间，压缩备注/权重区 */
                    .mpl-lora-row .mpl-note-input { max-width: 120px !important; flex: 0 1 120px !important; min-width: 50px !important; }
                    .mpl-lora-name { flex: 1 1 auto !important; min-width: 60px !important; }
                    /* ===== 列对齐：仅名称弹性增长，其余控件固定宽度，使备注/权重/触发词/操作列在行间竖直对齐 ===== */
                    .mpl-lora-row { display: flex !important; align-items: center !important; }
                    .mpl-lora-row .mpl-drag-area { flex: 0 0 10px !important; width: 10px !important; min-width: 0 !important; }
                    .mpl-lora-row .mpl-lora-name { flex: 1 1 auto !important; min-width: 80px !important; }
                    /* 群组内名字右移一点，与群组标题文字对齐；群组外与缩略图稍微拉开空隙 */
                    .mpl-folder-row .mpl-lora-row .mpl-lora-name { margin-left: 6px !important; }
                    .mpl-lora-row.root-item .mpl-lora-name { margin-left: 5px !important; }
                    .mpl-lora-row .mpl-note-input {
                        flex: 0 1 92px !important; width: auto !important;
                        max-width: 92px !important; min-width: 50px !important;
                    }
                    .mpl-lora-row .mpl-weight-container { flex: 0 0 auto !important; min-width: 104px !important; }
                    /* 数值区固定宽度，负号不会挤动右侧 CLIP/按钮 */
                    .mpl-lora-row .mpl-weight-container .mpl-weight-display { flex: 0 0 62px !important; width: 62px !important; min-width: 62px !important; text-align: center !important; }
                    .mpl-lora-row .mpl-trigger-btn {
                        flex: 0 0 60px !important; width: 60px !important;
                        max-width: 60px !important; box-sizing: border-box !important;
                        text-align: center !important;
                    }
                    .mpl-lora-row .mpl-lora-actions { flex: 0 0 auto !important; margin-left: 4px !important; }
                    /* 备注输入：扁平化 */
                    .mpl-note-input, .mpl-mini-input {
                        background: #191a20 !important;
                        border: 1px solid var(--ma-border) !important;
                        border-radius: 6px !important;
                        color: var(--ma-text) !important;
                        font-size: 11.5px !important;
                        transition: border-color .13s ease, box-shadow .13s ease;
                    }
                    .mpl-note-input:focus, .mpl-mini-input:focus {
                        border-color: var(--ma-accent) !important;
                        box-shadow: 0 0 0 2px var(--ma-accent-soft) !important;
                        outline: 0;
                    }
                    /* 触发词文字按钮：药丸形标签 */
                    .mpl-trigger-btn {
                        background: rgba(108,140,255,0.12) !important;
                        border: 1px solid rgba(108,140,255,0.3) !important;
                        color: #a9b8ff !important;
                        border-radius: 999px !important;
                        font-size: 10.5px !important;
                        height: 22px !important;
                        padding: 0 9px !important;
                    }
                    .mpl-trigger-btn:hover {
                        background: rgba(108,140,255,0.2) !important;
                        color: #cfd8ff !important;
                        border-color: rgba(108,140,255,0.5) !important;
                    }
                    .mpl-trigger-btn.mpl-trigger-off {
                        background: rgba(239,107,125,0.1) !important;
                        border-color: rgba(239,107,125,0.28) !important;
                        color: #e59aa6 !important;
                    }
                    .mpl-trigger-btn.mpl-trigger-empty {
                        color: var(--ma-muted) !important;
                        background: transparent !important;
                        border-style: dashed !important;
                    }
                    /* 权重容器：药丸形 */
                    .mpl-weight-container {
                        background: #191a20 !important;
                        border: 1px solid var(--ma-border) !important;
                        border-radius: 7px !important;
                    }
                    .mpl-weight-display {
                        background: transparent !important;
                        color: var(--ma-text) !important;
                        font-size: 11px !important;
                        font-variant-numeric: tabular-nums;
                    }
                    .mpl-weight-display:hover {
                        background: var(--ma-surface-raised) !important;
                    }
                    /* 图标按钮 */
                    .mpl-mini-btn {
                        background: var(--ma-surface) !important;
                        border: 1px solid var(--ma-border) !important;
                        color: var(--ma-muted) !important;
                        border-radius: 7px !important;
                        transition: all .13s ease !important;
                    }
                    .mpl-mini-btn:hover {
                        color: var(--ma-text) !important;
                        border-color: rgba(108,140,255,0.45) !important;
                        background: var(--ma-surface-raised) !important;
                    }
                    .mpl-mini-btn.edit {
                        background: var(--ma-accent) !important;
                        border-color: transparent !important;
                        color: #fff !important;
                    }
                    .mpl-mini-btn.edit:hover {
                        background: #8098ff !important;
                    }
                    .mpl-mini-btn.del {
                        width: 26px !important;
                        height: 22px !important;
                        padding: 0 !important;
                        font-size: 12px !important;
                        line-height: 1 !important;
                    }
                    .mpl-folder-controls { gap: 5px !important; }
                    .mpl-mini-btn.del:hover {
                        background: var(--ma-danger) !important;
                        border-color: transparent !important;
                        color: #fff !important;
                    }
                    .mpl-mini-btn.tag.active { color: var(--ma-success) !important; }
                    .mpl-mini-btn.tag:hover { color: var(--ma-success) !important; }
                    /* ===== 左侧栏（预设分类 / 收藏夹） ===== */
                    .mpl-sidebar {
                        flex: 0 0 164px !important; width: 164px !important;
                        background: var(--ma-panel-bg) !important;
                        border-right: 1px solid var(--ma-border) !important;
                        padding: 2px 0 !important;
                    }
                    .mpl-side-section + .mpl-side-section { border-top: 1px solid var(--ma-border) !important; }
                    .mpl-side-head {
                        background: transparent !important;
                        color: var(--ma-muted) !important;
                        padding: 7px 9px 5px !important;
                        font-size: 11px !important;
                        font-weight: 700 !important;
                        letter-spacing: .04em !important;
                        border-bottom: 1px solid rgba(255,255,255,0.04);
                    }
                    .mpl-side-add {
                        width: 20px !important; height: 20px !important; line-height: 18px !important;
                        background: var(--ma-surface) !important;
                        border: 1px solid var(--ma-border) !important;
                        color: var(--ma-muted) !important;
                        border-radius: 6px !important;
                        font-size: 14px !important;
                        transition: all .13s ease !important;
                    }
                    .mpl-side-add:hover {
                        background: var(--ma-surface-raised) !important;
                        border-color: rgba(108,140,255,0.55) !important;
                        color: #cfd8ff !important;
                    }
                    .mpl-side-list { padding: 4px 5px !important; }
                    .mpl-side-group {
                        padding: 3px 6px !important;
                        border-radius: 6px !important;
                        color: #c9ccd8 !important;
                        font-size: 11.5px !important;
                        gap: 4px !important;
                    }
                    .mpl-side-group:hover { background: var(--ma-accent-soft) !important; }
                    .mpl-side-caret { color: var(--ma-muted) !important; }
                    .mpl-side-count {
                        background: rgba(108,140,255,0.16) !important;
                        color: #b9c2e8 !important;
                        border-radius: 8px !important;
                        line-height: 14px !important;
                    }
                    .mpl-side-items {
                        margin: 1px 0 3px 12px !important;
                        border-left: 1px solid var(--ma-border) !important;
                        padding-left: 5px !important;
                    }
                    .mpl-side-item {
                        padding: 3px 6px !important;
                        border-radius: 5px !important;
                        color: #b9bdc9 !important;
                        font-size: 11px !important;
                    }
                    .mpl-side-item:hover {
                        background: var(--ma-accent-soft) !important;
                        color: var(--ma-text) !important;
                    }
                    /* ===== 行内控件（权重 / 触发词 / 备注 / 小按钮） ===== */
                    .mpl-weight-container {
                        background: var(--ma-surface) !important;
                        border: 1px solid var(--ma-border) !important;
                        border-radius: 7px !important;
                    }
                    .mpl-weight-display {
                        background: transparent !important;
                        color: var(--ma-text) !important;
                        font-size: 11.5px !important;
                        font-variant-numeric: tabular-nums;
                    }
                    .mpl-weight-display:hover { background: rgba(255,255,255,0.06) !important; }
                    .mpl-note-input {
                        background: var(--ma-panel-bg) !important;
                        border: 1px solid var(--ma-border) !important;
                        border-radius: 7px !important;
                        color: var(--ma-text) !important;
                        padding: 3px 7px !important;
                    }
                    .mpl-note-input::placeholder { color: var(--ma-muted) !important; }
                    .mpl-note-input:focus {
                        border-color: rgba(108,140,255,0.6) !important;
                        outline: none !important;
                    }
                    .mpl-trigger-btn {
                        background: var(--ma-surface) !important;
                        border: 1px solid var(--ma-border) !important;
                        border-radius: 7px !important;
                        color: #c9d4e2 !important;
                        height: 24px !important;
                    }
                    .mpl-trigger-btn:hover {
                        border-color: rgba(108,140,255,0.55) !important;
                        color: var(--ma-text) !important;
                    }
                    .mpl-trigger-btn.mpl-trigger-off {
                        background: rgba(239,107,125,0.10) !important;
                        border-color: rgba(239,107,125,0.38) !important;
                        color: #d79aa4 !important;
                    }
                    .mpl-trigger-btn.mpl-trigger-empty { color: var(--ma-muted) !important; }
                    .mpl-mini-btn {
                        background: var(--ma-surface) !important;
                        border: 1px solid var(--ma-border) !important;
                        border-radius: 7px !important;
                        color: var(--ma-muted) !important;
                        height: 24px !important;
                        transition: all .13s ease !important;
                    }
                    .mpl-mini-btn:hover {
                        background: var(--ma-surface-raised) !important;
                        border-color: rgba(108,140,255,0.45) !important;
                        color: var(--ma-text) !important;
                    }
                    /* ===== 底部按钮区 ===== */
                    .mpl-footer {
                        background: var(--ma-panel-bg) !important;
                        border-top: 1px solid var(--ma-border) !important;
                        height: 42px !important;
                        padding: 6px 8px !important;
                        gap: 6px !important;
                    }
                    .mpl-btn-add {
                        background: var(--ma-accent) !important;
                        border: none !important;
                        color: #fff !important;
                        border-radius: 8px !important;
                        height: 30px !important;
                        font-weight: 600 !important;
                        box-shadow: 0 2px 10px rgba(108,140,255,0.3);
                        transition: background .13s ease;
                    }
                    .mpl-btn-add:hover { background: #8098ff !important; }
                    .mpl-btn-metadata, .mpl-btn-preset, .mpl-btn-lorastring {
                        background: var(--ma-surface) !important;
                        border: 1px solid var(--ma-border) !important;
                        color: var(--ma-text) !important;
                        border-radius: 8px !important;
                        height: 30px !important;
                        font-size: 12px !important;
                        font-weight: 500 !important;
                    }
                    .mpl-btn-metadata:hover, .mpl-btn-preset:hover, .mpl-btn-lorastring:hover {
                        background: var(--ma-surface-raised) !important;
                        border-color: rgba(108,140,255,0.4) !important;
                    }
                    .mpl-btn-icon {
                        background: var(--ma-surface) !important;
                        border: 1px solid var(--ma-border) !important;
                        color: var(--ma-muted) !important;
                        border-radius: 8px !important;
                        height: 30px !important;
                        min-width: 0 !important;
                        padding: 0 10px !important;
                        font-size: 12px !important;
                        font-weight: 500 !important;
                        display: inline-flex !important;
                        align-items: center !important;
                        gap: 4px !important;
                        transition: all .13s ease !important;
                    }
                    .mpl-btn-icon:hover {
                        background: var(--ma-surface-raised) !important;
                        border-color: rgba(108,140,255,0.4) !important;
                        color: var(--ma-text) !important;
                    }
                    /* 行内操作按钮（触发词 / 编辑 / 删除） */
                    .mpl-lora-actions { gap: 5px !important; }
                    .mpl-lora-actions .mpl-mini-btn {
                        width: 24px !important; height: 24px !important;
                        padding: 0 !important;
                        background: transparent !important;
                        border: 1px solid transparent !important;
                        border-radius: 7px !important;
                        color: var(--ma-muted) !important;
                    }
                    .mpl-lora-actions .mpl-mini-btn:hover {
                        background: var(--ma-surface-raised) !important;
                        border-color: var(--ma-border) !important;
                        color: var(--ma-text) !important;
                    }
                    .mpl-lora-actions .mpl-mini-btn.edit {
                        background: transparent !important;
                        color: var(--ma-muted) !important;
                    }
                    .mpl-lora-actions .mpl-mini-btn.edit:hover {
                        color: var(--ma-accent) !important;
                        border-color: rgba(108,140,255,0.45) !important;
                    }
                    .mpl-lora-actions .mpl-mini-btn.del:hover {
                        background: rgba(239,107,125,0.14) !important;
                        border-color: rgba(239,107,125,0.45) !important;
                        color: var(--ma-danger) !important;
                    }
                    /* 底部按钮：添加/预设/下载 更宽，颜色/设置 平分剩余 */
                    .mpl-footer .mpl-btn-add,
                    .mpl-footer .mpl-btn-preset,
                    .mpl-footer .mpl-btn-metadata,
                    .mpl-footer .mpl-btn-lorastring { flex: 1.7 1 0 !important; min-width: 0 !important; }
                    .mpl-footer .mpl-btn-icon { flex: 1 1 0 !important; min-width: 0 !important; }
                    /* LORA 串导入弹窗里的权重标签 */
                    .mpl-lorastring-weight { cursor: pointer; font-family: Consolas, monospace; }
                    .mpl-lorastring-weight:hover { filter: brightness(1.25); }
                    .mpl-footer button {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        gap: 6px !important;
                        white-space: nowrap !important;
                        overflow: hidden !important;
                    }
                    .mpl-footer button svg { flex: 0 0 auto !important; }
                    .mpl-footer button span {
                        overflow: hidden; text-overflow: ellipsis;
                    }
                    /* 大图预览遮罩圆角 */
                    .mpl-img-preview-overlay { background: rgba(10,11,16,0.82) !important; }
                    /* 右键菜单（若按通用按钮渲染）统一圆角 */
                    /* 滚动条美化 */
                    .mpl-list-scroll::-webkit-scrollbar { width: 8px; }
                    .mpl-list-scroll::-webkit-scrollbar-thumb {
                        background: rgba(255,255,255,0.14); border-radius: 8px;
                    }
                    .mpl-list-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.24); }
                    .mpl-list-scroll::-webkit-scrollbar-track { background: transparent; }
                    /* =================== end MA-SKIN =================== */

                    /* ===================== MA-SKIN-ADD : 添加Lora弹窗（参考面板风格） ===================== */
                    .mpl-add-pathchip {
                        display:inline-flex;align-items:center;height:24px;padding:0 10px;
                        border:1px solid #3b3c46;border-radius:999px;background:#2a2b34;
                        color:#c8cad6;font-size:11.5px;cursor:pointer;
                        transition:border-color .13s,background-color .13s,color .13s;
                    }
                    .mpl-add-pathchip:hover { border-color:rgba(108,140,255,0.5); background:rgba(108,140,255,0.14); color:#cfd8ff; }
                    .mpl-add-pathchip.is-active { border-color:rgba(108,140,255,0.5); background:rgba(108,140,255,0.16); color:#6c8cff; }
                    .mpl-add-sep { color:#5a5c68; }
                    .mpl-add-scroll::-webkit-scrollbar { width:9px; }
                    .mpl-add-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.14); border-radius:8px; }
                    .mpl-add-scroll::-webkit-scrollbar-thumb:hover { background:rgba(255,255,255,0.24); }
                    /* 添加/替换 LoRA 弹窗网格：固定卡片尺寸，防止单张卡片铺满整窗 */
                    .mpl-add-scroll {
                        display: grid !important;
                        grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)) !important;
                        grid-auto-rows: 150px !important;
                        gap: 10px !important;
                        align-content: start !important;
                    }
                    .mpl-add-scroll > * {
                        min-width: 0 !important;
                        min-height: 0 !important;
                        width: 100% !important;
                        height: 100% !important;
                    }
                    /* =================== end MA-SKIN-ADD =================== */

                    /* ===================== MA-COLOR : 颜色可自定义（选中/文件夹/多选态） ===================== */
                    /* 颜色变量挂到容器，设置界面写入这里 */
                    .mpl-lora-row.mpl-selected {
                        background: var(--lora-sel-bg, var(--ma-color-select-bg, var(--ma-accent-soft))) !important;
                        border-color: var(--lora-sel-border, var(--ma-color-select-border, rgba(108,140,255,0.42))) !important;
                        border-left: 3px solid var(--lora-sel-bar, var(--ma-color-select-bar, var(--ma-accent))) !important;
                    }
                    .mpl-lora-row.mpl-selected .mpl-lora-name {
                        color: var(--lora-sel-text, var(--ma-color-select-text, #eef1ff)) !important;
                    }
                    /* 文件夹自定义颜色：
                       --folder-bg      外文件夹颜色（整个卡片背景）
                       --folder-head-bg 里文件夹颜色（标题栏背景）
                       --folder-c       左侧强调色条
                       均支持全局默认回退（--folder-def-* 由 applyFolderColorSettings 写到容器） */
                    .mpl-folder-row {
                        border-left: 4px solid transparent !important;
                        background: var(--folder-bg, var(--folder-def-outer, transparent)) !important;
                    }
                    /* 文件夹左条：仅当该文件夹内有 LoRA 被选中时才显示 */
                    .mpl-folder-row.has-sel {
                        border-left: 4px solid var(--folder-c, var(--folder-def-bar, var(--ma-accent))) !important;
                    }
                    /* 被忽略的文件夹：靠标题变色、橙色虚线左条与组内变暗表示，不加文字 */
                    .mpl-folder-row.ignored {
                        border-left: 4px dashed #d9822b !important;
                    }
                    .mpl-folder-row.ignored .mpl-folder-title { color: #e0a165 !important; }
                    .mpl-folder-row.ignored .mpl-folder-header input[type="checkbox"] { opacity: .45 !important; }
                    .mpl-folder-row.ignored .mpl-lora-row { opacity: .5 !important; }
                    /* 文件夹内的 LoRA 行左侧缩进，让 LoRA 左条与文件夹左条错开，视觉上分开 */
                    .mpl-folder-row .mpl-lora-row {
                        margin-left: 6px !important;
                    }
                    .mpl-folder-header {
                        background: var(--folder-head-bg, var(--folder-def-inner, linear-gradient(180deg, rgba(255,255,255,0.045), transparent))) !important;
                    }
                    /* 文件夹折叠条自定义（默认用强调色，用户可改） */
                    .mpl-folder-color-swatch {
                        width: 16px; height: 16px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.35);
                        cursor: pointer; margin-right: 2px; flex: 0 0 auto;
                        position: relative; overflow: hidden;
                    }
                    .mpl-folder-color-swatch input[type="color"] {
                        position: absolute; inset: -4px; width: 28px; height: 28px;
                        border: none; padding: 0; background: none; cursor: pointer;
                    }
                    /* 多选计数工具条 */
                    .mpl-multisel-bar {
                        display: none; align-items: center; gap: 8px; flex-wrap: wrap;
                        margin: 2px 2px 4px; padding: 4px 10px; border-radius: 8px;
                        background: rgba(108,140,255,0.12); border: 1px solid rgba(108,140,255,0.32);
                        font-size: 12px; color: #cfd8ff;
                    }
                    .mpl-multisel-bar .mpl-multisel-count { font-weight: 600; color: #fff; }
                    .mpl-multisel-bar button {
                        padding: 3px 10px; font-size: 11.5px; border-radius: 6px; cursor: pointer;
                        background: #2a2b34; border: 1px solid #3b3c46; color: #c8cad6;
                    }
                    .mpl-multisel-bar button:hover { border-color: rgba(108,140,255,0.5); color: #cfd8ff; }
                    .mpl-multisel-bar .mpl-ms-primary { background: #6c8cff; border-color: #6c8cff; color: #fff; }
                    .mpl-ms-status { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 46%; }
                    .mpl-multisel-bar.mpl-bar-detached {
                        background: rgba(239,107,125,0.10); border-color: rgba(239,107,125,0.45);
                    }
                    /* 设置按钮色块 */
                    .mpl-color-swatch-row { display: flex; align-items: center; gap: 10px; }
                    .mpl-color-swatch-row input[type="color"] {
                        width: 44px; height: 28px; border: 1px solid #555; border-radius: 5px;
                        background: #1a1a1a; cursor: pointer; padding: 1px;
                    }
                    /* =================== end MA-COLOR =================== */
                    /* 顶层拖拽排序高亮 / 插入线 */
                    .mpl-top-drop-active { box-shadow: 0 0 0 2px rgba(108,140,255,0.75) inset !important; border-radius: 8px; }
                    .mpl-top-drop-before { box-shadow: inset 0 3px 0 0 #6c8cff !important; }
                    .mpl-top-drop-after { box-shadow: inset 0 -3px 0 0 #6c8cff !important; }
                    .mpl-insert-line { height: 2px; background: #6c8cff; margin: 2px 4px; border-radius: 2px; }
                `;
                document.head.appendChild(s);
            };

            // --- 数据处理与渲染逻辑 ---
            nodeType.prototype.updateWidget = function() {
                // 记住进入时的节点尺寸：本函数末尾会触发官方缺失模型扫描，
                // 那条链可能重算并压缩节点；这里保证更新只增不减，并把 DOM 宽度钉回节点宽度。
                const _mplSizeW = Array.isArray(this.size) ? Number(this.size[0]) : null;
                const _mplSizeH = Array.isArray(this.size) ? Number(this.size[1]) : null;
                const _mplRestoreSize = () => {
                    if (!Array.isArray(this.size)) return;
                    if (_mplSizeW !== null && Number.isFinite(_mplSizeW) && this.size[0] < _mplSizeW) {
                        this.size[0] = _mplSizeW;
                    }
                    if (_mplSizeH !== null && Number.isFinite(_mplSizeH) && this.size[1] < _mplSizeH) {
                        this.size[1] = _mplSizeH;
                    }
                    this._mplSyncDOMLayout?.();
                };

                // 数据入口统一规范化：无论哪条路径新增/改动 LoRA，写 prompt 前都补齐 enabled
                mplNormalizeLoraData(this.loraData);
                if (MPL_LAST_REPAIRS && mplIsDebugEnabled()) {
                    console.warn(`[MA Loader] 已补全 ${MPL_LAST_REPAIRS} 个 LoRA 的 enabled 字段（来源可能有字段缺失）`);
                }
                if (!this._stackWidget) {
                    this._stackWidget = this.widgets?.find(w => w.name === "lora_stack");
                }
                if (this._stackWidget) {
                    const stack = [];
                    // 总开关关闭时，仅在下发数据里屏蔽触发词，不改动 loraData 里各行的小开关状态
                    const masked = this.triggerMaster === false;
                    const pushLora = (l) => {
                        if (!l || !mplLoraEnabled(l)) return;
                        stack.push(masked ? Object.assign({}, l, { triggerEnabled: false }) : l);
                    };
                    if(this.loraData.folders) {
                        this.loraData.folders.forEach(f => {
                            // 忽略的文件夹：内部 LoRA 不参与加载，但各自的 enabled 勾选状态保持不变
                            if (f.ignored) return;
                            (f.loras || []).forEach(pushLora);
                        });
                    }
                    if(this.loraData.loras) {
                        (this.loraData.loras || []).forEach(pushLora);
                    }
                    this._stackWidget.value = JSON.stringify(stack);
                }
                
                // 更新 SDNQ 模式 widget
                if (!this._sdnqModeWidget) {
                    this._sdnqModeWidget = this.widgets?.find(w => w.name === "sdnq_mode");
                }
                if (this._sdnqModeWidget) {
                    const sdnqMode = this.sdnqMode || this.properties["sdnq_mode"] || "none";
                    this._sdnqModeWidget.value = sdnqMode;
                }

                // 更新自适应模式 widget
                if (!this._adaptiveModeWidget) {
                    this._adaptiveModeWidget = this.widgets?.find(w => w.name === "adaptive_mode");
                }
                const adaptiveBool = this.adaptiveMode === true || this.adaptiveMode === "true"
                    || this.properties["adaptive_mode"] === true || this.properties["adaptive_mode"] === "true";
                if (this._adaptiveModeWidget) {
                    this._adaptiveModeWidget.value = String(adaptiveBool);
                }

                // 更新 Klein 模式 widget
                if (!this._kleinModeWidget) {
                    this._kleinModeWidget = this.widgets?.find(w => w.name === "klein_mode");
                }
                if (this._kleinModeWidget) {
                    const kleinMode = this.kleinMode || this.properties["klein_mode"] || "auto";
                    this._kleinModeWidget.value = kleinMode;
                }

                // 更新 Anima 2.9B 模式 widget
                if (!this._animaModeWidget) {
                    this._animaModeWidget = this.widgets?.find(w => w.name === "anima_mode");
                }
                if (this._animaModeWidget) {
                    const animaMode = this.animaMode || this.properties["anima_mode"] || "none";
                    this._animaModeWidget.value = animaMode;
                }

                this.properties["lora_data_state"] = JSON.stringify(this.loraData);
                // 老版本用 loraData.selected 记录多选；现改为 enabled 即选中，清掉遗留字段
                if (this.loraData.selected) delete this.loraData.selected;
                // 持久化顶层穿插顺序（folder/lora 混排）
                this._syncTopLayout && this._syncTopLayout();
                this.properties["top_layout"] = JSON.stringify(this._topLayout || []);
                this.properties["sdnq_mode"] = this.sdnqMode || "none";
                this.properties["klein_mode"] = this.kleinMode || "auto";
                this.properties["anima_mode"] = this.animaMode || "none";
                // 与隐藏 widget、设置弹窗一致：始终用严格布尔，避免 "false" 字符串导致 !adaptiveMode 误判
                this.adaptiveMode = adaptiveBool;
                this.properties["adaptive_mode"] = adaptiveBool;
                this.properties["trigger_master"] = this.triggerMaster !== false;
                // Re-run ComfyUI's official missing-model pipeline immediately
                // after any LoRA list/widget change.
                mplUpdateMissingLoraState(this);
                mplSyncModelValidationWidgets(this);
                mplRefreshOfficialMissingModels();
                // 立即 + 下一帧 + 稍后各恢复一次，覆盖同步/异步两条尺寸重算路径。
                _mplRestoreSize();
                requestAnimationFrame(_mplRestoreSize);
                setTimeout(_mplRestoreSize, 80);
            };

            // 端口定义以当前节点为准：本版本恢复了 clip 输入/输出（CLIP 权重真正生效）。
            // 旧工作流加载时前端会按保存的数据恢复旧端口，这里按名称重建回当前定义。
            nodeType.prototype._mplRepairLegacyPorts = function() {
                if (!this.inputs) this.inputs = [];
                // 确保 clip 输入存在（旧图保存时可能没有该端口）。
                // addInput 第三参在新版前端是 options 对象，这里只用两参数追加到末尾；
                // 输入按 name 连线和执行，顺序无关。
                if (!this.inputs.some(i => i && i.name === "clip")) {
                    if (typeof this.addInput === "function") {
                        this.addInput("clip", "CLIP");
                    }
                }
                const canonical = [
                    ["model", "MODEL"],
                    ["触发词输出", "STRING"],
                    ["lora串输出", "MAGIC_LORA_CHAIN"],
                    ["clip", "CLIP"],
                ];
                if (!Array.isArray(this.outputs)) return;
                const same = this.outputs.length === canonical.length
                    && this.outputs.every((o, i) => o && o.name === canonical[i][0] && o.type === canonical[i][1]);
                if (same) return;
                if (!this.graph) return;

                // 先记下要保留的连接（按名称），重建后再接回去
                const targets = [];
                this.outputs.forEach((o) => {
                    if (!o || !Array.isArray(o.links)) return;
                    o.links.forEach((id) => {
                        const links = this.graph.links;
                        const L = links && (links[id] || (typeof links.get === "function" ? links.get(id) : null));
                        if (!L) return;
                        targets.push({ name: o.name, target_id: L.target_id, target_slot: L.target_slot });
                    });
                });
                while (this.outputs.length) this.removeOutput(this.outputs.length - 1);
                canonical.forEach(([name, type]) => this.addOutput(name, type));
                if (typeof this.connect === "function") {
                    // 旧端口名映射到新端口名，重命名后连线不丢
                    const renameMap = { "tags_output": "触发词输出" };
                    targets.forEach((t) => {
                        const targetName = renameMap[t.name] || t.name;
                        const idx = canonical.findIndex((c) => c[0] === targetName);
                        if (idx < 0) return; // 旧 clip / lora_preview 输出等：直接丢弃
                        const target = this.graph.getNodeById(t.target_id);
                        if (target) this.connect(idx, target, t.target_slot);
                    });
                }
                this.setDirtyCanvas?.(true, true);
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function(w) {
                const r = onConfigure ? onConfigure.apply(this, arguments) : undefined;
                
                // 确保lora_stack widget保持隐藏（参考zml代码的方式）
                if (this.widgets) {
                    const stackWidget = this.widgets.find(w => w.name === "lora_stack");
                    if (stackWidget) {
                        stackWidget.hidden = true;
                        stackWidget.computeSize = () => [0, 0];
                    }
                    // 移除 lora_stack 的输入端口（防止用户误连接）
                    const stackInputIdx = this.inputs?.findIndex(i => i.name === "lora_stack");
                    if (stackInputIdx >= 0) {
                        this.removeInput(stackInputIdx);
                    }
                    // 兼容旧工作流的 int8_mode widget（占位隐藏，节点已忽略其值）
                    const int8ModeWidget = this.widgets.find(w => w.name === "int8_mode");
                    if (int8ModeWidget) {
                        int8ModeWidget.hidden = true;
                        int8ModeWidget.computeSize = () => [0, 0];
                        int8ModeWidget.value = "none";
                    }
                    const sdnqModeWidget = this.widgets.find(w => w.name === "sdnq_mode");
                    if (sdnqModeWidget) {
                        sdnqModeWidget.hidden = true;
                        sdnqModeWidget.computeSize = () => [0, 0];
                    }
                    const adaptiveModeWidget = this.widgets.find(w => w.name === "adaptive_mode");
                    if (adaptiveModeWidget) {
                        adaptiveModeWidget.hidden = true;
                        adaptiveModeWidget.computeSize = () => [0, 0];
                    }
                    const kleinModeWidget = this.widgets.find(w => w.name === "klein_mode");
                    if (kleinModeWidget) {
                        kleinModeWidget.hidden = true;
                        kleinModeWidget.computeSize = () => [0, 0];
                    }
                    const animaModeWidget = this.widgets.find(w => w.name === "anima_mode");
                    if (animaModeWidget) {
                        animaModeWidget.hidden = true;
                        animaModeWidget.computeSize = () => [0, 0];
                    }
                }
                
                // 恢复 SDNQ 模式设置
                if (this.properties["sdnq_mode"] !== undefined) {
                    this.sdnqMode = String(this.properties["sdnq_mode"] || "none");
                } else {
                    this.sdnqMode = "none";
                    this.properties["sdnq_mode"] = "none";
                }

                // 恢复自适应模式设置
                if (this.properties["adaptive_mode"] !== undefined) {
                    this.adaptiveMode = this.properties["adaptive_mode"] === true || this.properties["adaptive_mode"] === "true";
                } else {
                    this.adaptiveMode = false;
                    this.properties["adaptive_mode"] = false;
                }
                // 恢复触发词总开关（缺省为开）
                this.triggerMaster = this.properties["trigger_master"] !== false;
                // 恢复 Klein 模式设置
                if (this.properties["klein_mode"] !== undefined) {
                    this.kleinMode = String(this.properties["klein_mode"] || "auto");
                } else {
                    this.kleinMode = "auto";
                    this.properties["klein_mode"] = "auto";
                }
                // 恢复 Anima 2.9B 模式设置（优先隐藏 widget 的 widgets_values，其次 properties）
                const animaWidgetVal = (this.widgets?.find(w => w.name === "anima_mode") || this._animaModeWidget)?.value;
                if (animaWidgetVal !== undefined && animaWidgetVal !== "") {
                    this.animaMode = String(animaWidgetVal);
                } else if (this.properties["anima_mode"] !== undefined) {
                    this.animaMode = String(this.properties["anima_mode"] || "none");
                } else {
                    this.animaMode = "none";
                }
                this.properties["anima_mode"] = this.animaMode;

                // 恢复布局设置（从 properties 读取，确保刷新浏览器后仍生效）
                const layoutDefaults = {
                    weightStyle: "arrows",
                    sliderStep: 0.05,
                    sliderMin: -2,
                    sliderMax: 2,
                    sliderWidth: 110,
                    showWeightValue: true,
                    snapToZero: true,
                };
                if (this.properties["layout_settings"] && typeof this.properties["layout_settings"] === "object") {
                    this.layoutSettings = Object.assign({}, layoutDefaults, this.properties["layout_settings"]);
                } else {
                    this.layoutSettings = Object.assign({}, layoutDefaults);
                }
                
                if (this.properties["lora_data_state"]) {
                    try { 
                        this.loraData = mplNormalizeLoraData(JSON.parse(this.properties["lora_data_state"]));
                        // 恢复顶层穿插顺序
                        if (this.properties["top_layout"]) {
                            try { this._topLayout = JSON.parse(this.properties["top_layout"]) || []; } catch(e) { this._topLayout = []; }
                        }
                    } catch(e) {}
                } else if (this.widgets_values && this.widgets_values[2]) {
                    try {
                        const stack = JSON.parse(this.widgets_values[2]);
                        this.loraData = { 
                            folders: [], 
                            loras: stack.map(l => ({
                                ...l, 
                                enabled: true, 
                                note: l.note || "",
                                triggerWords: l.triggerWords || "",
                            })) 
                        };
                    } catch(e) {}
                }
                // 兼容旧工作流：旧的 int8_mode widget（widgets_values[3]）保留占位，但其值已被忽略
                // （ComfyUI 官方 model_patcher.py 现在直接处理 INT8/FP8 等量化权重，无需自定义模式）
                if (this.widgets_values && this.widgets_values.length > 3 && this.widgets_values[3] !== undefined && this.widgets_values[3] !== "") {
                    // 不读取 this.widgets_values[3]，仅覆盖占位 widget 的值，确保不污染后续索引
                    if (this._int8ModeWidget) this._int8ModeWidget.value = "none";
                }

                // 从 widgets_values 恢复 SDNQ 模式（如果存在）
                if (this.widgets_values && this.widgets_values.length > 4 && this.widgets_values[4] !== undefined && this.widgets_values[4] !== "") {
                    this.sdnqMode = this.widgets_values[4];
                    this.properties["sdnq_mode"] = this.sdnqMode;
                }

                // 只从 widgets_values 恢复自适应模式（如果存在）
                const wAdaptive = this.widgets_values?.[5];
                const wAdaptiveHasValue = wAdaptive !== undefined && wAdaptive !== "";
                if (this.widgets_values && this.widgets_values.length > 5 && wAdaptiveHasValue) {
                    this.adaptiveMode = wAdaptive === "true" || wAdaptive === true;
                    this.properties["adaptive_mode"] = this.adaptiveMode;
                }

                // 从 widgets_values 恢复 Klein 模式（如果存在）
                const wKlein = this.widgets_values?.[6];
                const wKleinHasValue = wKlein !== undefined && wKlein !== "";
                if (this.widgets_values && this.widgets_values.length > 6 && wKleinHasValue) {
                    this.kleinMode = this.widgets_values[6];
                    this.properties["klein_mode"] = this.kleinMode;
                }

                // 归一化/自动修复旧工作流的模式字段（旧版本可能写入 true/false 等无效值）
                const normalizeSdnq = (v) => v === "sdnq" ? "sdnq" : "none";
                const normalizeKlein = (v) => v === "klein" ? "klein" : (v === "auto" ? "auto" : "none");

                const fixedSdnq = normalizeSdnq(this.sdnqMode ?? this.properties["sdnq_mode"]);
                if (fixedSdnq !== (this.sdnqMode ?? this.properties["sdnq_mode"])) {
                    this.sdnqMode = fixedSdnq;
                    this.properties["sdnq_mode"] = fixedSdnq;
                    if (this._sdnqModeWidget) this._sdnqModeWidget.value = fixedSdnq;
                }

                const fixedKlein = normalizeKlein(this.kleinMode ?? this.properties["klein_mode"]);
                if (fixedKlein !== (this.kleinMode ?? this.properties["klein_mode"])) {
                    this.kleinMode = fixedKlein;
                    this.properties["klein_mode"] = fixedKlein;
                    if (this._kleinModeWidget) this._kleinModeWidget.value = fixedKlein;
                }

                // 自动修复旧工作流：某些旧版本会把 adaptive_mode 错误保存成 true
                // 修复条件：properties 里是 true，但 widgets_values[5] 为空/false（说明不是用户显式选的自适应）
                if ((this.properties["adaptive_mode"] === true || this.properties["adaptive_mode"] === "true")
                    && (!wAdaptiveHasValue || wAdaptive === "false" || wAdaptive === false)) {
                    this.adaptiveMode = false;
                    this.properties["adaptive_mode"] = false;
                    if (this._adaptiveModeWidget) this._adaptiveModeWidget.value = "false";
                }

                // 恢复颜色设置（LoRA 选中色 + 文件夹默认色）：否则重启/重载工作流后颜色被重置
                {
                    const savedColors = this.properties["color_settings"];
                    const colorDefaults = { selectBg: "#2b3b5e", selectBar: "#6c8cff", selectText: "#eef1ff" };
                    this.colorSettings = (savedColors && typeof savedColors === "object")
                        ? Object.assign({}, colorDefaults, savedColors)
                        : colorDefaults;
                    const savedFolderColors = this.properties["folder_color_settings"];
                    const folderColorDefaults = { outer: "", inner: "", bar: "" };
                    this.folderColorSettings = (savedFolderColors && typeof savedFolderColors === "object")
                        ? Object.assign({}, folderColorDefaults, savedFolderColors)
                        : folderColorDefaults;
                }

                // 最后统一同步一次，确保 properties / 隐藏 widget 一致并写回工作流
                this.updateWidget?.();
                this.applyColorSettings?.();
                this.applyFolderColorSettings?.();
                this._mplSyncDOMLayout?.();
                
                setTimeout(() => {
                    this.createDOMInterface();
                    this.renderEmbeddedList();
                    this._updateKleinBanner?.();
                    mplUpdateMissingLoraState(this);
                    mplSyncModelValidationWidgets(this);
                    this._mplSyncDOMLayout?.();
                    this._mplScheduleLayoutSync?.();
                    this._mplRepairLegacyPorts?.();
                    void loadLoraNameList();
                }, 100);
                return r;
            };

            const onNodeRemoved = nodeType.prototype.onRemoved;
            nodeType.prototype.onRemoved = function() {
                const r = onNodeRemoved ? onNodeRemoved.apply(this, arguments) : undefined;
                // 清理布局同步定时器与 ResizeObserver
                if (this._mplLayoutSyncTimers) {
                    this._mplLayoutSyncTimers.forEach(t => clearTimeout(t));
                    this._mplLayoutSyncTimers = null;
                }
                if (this._mplResizeObserver) {
                    try { this._mplResizeObserver.disconnect(); } catch (e) {}
                    this._mplResizeObserver = null;
                }
                // 清理预览图和定时器
                if (this._previewTimeout) {
                    clearTimeout(this._previewTimeout);
                    this._previewTimeout = null;
                }
                if (this._previewDiv) {
                    this._previewDiv.remove();
                    this._previewDiv = null;
                }
                // Removing a node can resolve its missing-LoRA error without
                // touching any widget, so rescan the error record immediately.
                setTimeout(() => mplRefreshOfficialMissingModels(), 0);
                // 额外清理所有预览图（防止遗漏）
                const previews = document.querySelectorAll('.mpl-lora-preview');
                previews.forEach(preview => preview.remove());
                return r;
            };

            // 应用颜色设置到容器（CSS 变量）
            nodeType.prototype.applyColorSettings = function() {
                const c = this.colorSettings || {};
                const root = this.embeddedContainer || (this.listContainer ? this.listContainer.closest(".mpl-embedded-container") : null) || this.listContainer;
                if (!root || !root.style) return;
                if (c.selectBg) root.style.setProperty("--ma-color-select-bg", c.selectBg);
                if (c.selectBar) root.style.setProperty("--ma-color-select-border", c.selectBar + "88");
                if (c.selectBar) root.style.setProperty("--ma-color-select-bar", c.selectBar);
                if (c.selectText) root.style.setProperty("--ma-color-select-text", c.selectText);
            };
            // 全局默认文件夹颜色：写到容器 --folder-def-*（供未单独设置颜色的文件夹回退）
            nodeType.prototype.applyFolderColorSettings = function() {
                const f = this.folderColorSettings || {};
                const root = this.embeddedContainer || (this.listContainer ? this.listContainer.closest(".mpl-embedded-container") : null) || this.listContainer;
                if (!root || !root.style) return;
                if (f.outer) root.style.setProperty("--folder-def-outer", f.outer);
                else root.style.removeProperty("--folder-def-outer");
                if (f.inner) root.style.setProperty("--folder-def-inner", f.inner);
                else root.style.removeProperty("--folder-def-inner");
                if (f.bar) root.style.setProperty("--folder-def-bar", f.bar);
                else root.style.removeProperty("--folder-def-bar");
            };
            // =============== 选中状态 = 是否参与加载（容器级 loraData.selected 仅作旧工作流清理） ===============
            nodeType.prototype._ensureMultiSelectState = function() {
                if (!this.loraData.selected || typeof this.loraData.selected !== "object") {
                    this.loraData.selected = {};
                }
                return this.loraData.selected;
            };
            nodeType.prototype._msKey = function(lora) {
                return String((lora && (lora.name || lora.id)) || "");
            };
            // 选中行 = enabled=true，即参与本次加载
            nodeType.prototype._isMultiSelected = function(container, lora) {
                return !!lora && mplLoraEnabled(lora);
            };
            nodeType.prototype._addMultiSelected = function(container, lora) {
                if (lora) lora.enabled = true;
            };
            nodeType.prototype._removeMultiSelected = function(container, lora) {
                if (lora) lora.enabled = false;
            };
            nodeType.prototype._getMultiSelectedLoras = function() {
                const all = [];
                (this.loraData.loras || []).forEach(l => all.push(l));
                (this.loraData.folders || []).forEach(f => {
                    if (f.ignored) return;
                    (f.loras || []).forEach(l => all.push(l));
                });
                return all.filter(l => l && mplLoraEnabled(l));
            };
            nodeType.prototype._clearMultiSelect = function() {
                this.loraData.selected = {};
            };
            // 刷新多选相关 UI（工具条计数 / 文件夹全选框三态），不整表重绘
            nodeType.prototype._refreshMultiSelectUI = function() {
                const n = this._getMultiSelectedLoras().length;
                const bar = this.listContainer && this.listContainer.querySelector(".mpl-multisel-bar");
                if (bar) {
                    bar.style.display = "flex";
                    // 更新状态文案（固定提示，始终显示）
                    const label = bar.querySelector(".mpl-ms-label");
                    if (label) {
                        if (n > 0) {
                            label.innerHTML = '已启用 <span class="mpl-multisel-count">' + n + '</span> 个 LoRA';
                        } else {
                            label.innerHTML = '<span style="color:#8891a8;">未启用（不会加载）</span>';
                        }
                    }
                }
                // 文件夹全选框三态
                if (this.listContainer) {
                    const fRows = this.listContainer.querySelectorAll(".mpl-folder-row");
                    fRows.forEach((fDiv) => {
                        const cb = fDiv.querySelector(':scope > .mpl-folder-header > input[type="checkbox"]');
                        if (!cb) return;
                        const idx = parseInt(fDiv.dataset.fidx, 10);
                        const folder = this.loraData.folders[idx];
                        if (!folder) return;
                        const total = (folder.loras || []).length;
                        const cnt = (folder.loras || []).filter(l => this._isMultiSelected(folder, l)).length;
                        cb.checked = total > 0 && cnt === total;
                        cb.indeterminate = cnt > 0 && cnt < total;
                        // 文件夹左条：有任一 LoRA 被选中才显示
                        if (cnt > 0) fDiv.classList.add("has-sel");
                        else fDiv.classList.remove("has-sel");
                    });
                }
                if (this.updateWidget) this.updateWidget();
            };
            // 顶部多选工具条
            nodeType.prototype._buildMultiSelectBar = function() {
                const bar = document.createElement("div");
                bar.className = "mpl-multisel-bar";
                const n = this._getMultiSelectedLoras().length;
                bar.style.display = "flex";
                const label = document.createElement("span");
                label.className = "mpl-ms-label";
                if (n > 0) {
                    label.innerHTML = '已启用 <span class="mpl-multisel-count">' + n + '</span> 个 LoRA';
                } else {
                    label.innerHTML = '<span style="color:#8891a8;">未启用（不会加载）</span>';
                }
                bar.appendChild(label);
                // 触发词总开关：只屏蔽/恢复触发词输出，不改动每行小开关的状态
                const masterOn = this.triggerMaster !== false;
                const masterBtn = document.createElement("button");
                masterBtn.type = "button";
                masterBtn.className = "mpl-ms-master";
                masterBtn.innerHTML = mplIcon("tag", 12) + '<span style="margin-left:5px;">' + mplT("触发词总开关：") + (masterOn ? mplT("开") : mplT("关")) + '</span>';
                masterBtn.title = masterOn
                    ? "触发词正在输出。单击屏蔽所有触发词（不影响各行小开关的状态）"
                    : "所有触发词已被屏蔽。单击恢复输出（各行小开关状态保持不变）";
                masterBtn.style.cssText = "margin-left:auto;display:inline-flex;align-items:center;font-size:11px;padding:2px 9px;border-radius:999px;cursor:pointer;white-space:nowrap;" +
                    (masterOn
                        ? "background:rgba(108,140,255,0.16);border:1px solid rgba(108,140,255,0.5);color:#cfd8ff;"
                        : "background:rgba(255,255,255,0.04);border:1px solid #3b3c46;color:#8891a8;");
                masterBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.triggerMaster = (this.triggerMaster === false);
                    this.updateWidget();
                    this.renderEmbeddedList();
                };
                masterBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
                bar.appendChild(masterBtn);
                this._mplRefreshStatusBar(bar);
                return bar;
            };

            // 节点是否真的接进工作流（输出有下游 / model 输入有上游）
            nodeType.prototype._mplLinkStatus = function() {
                const outs = this.outputs || [];
                const outCount = (i) => {
                    const o = outs[i];
                    return o && Array.isArray(o.links) ? o.links.length : 0;
                };
                const anyOut = outs.some((o, i) => outCount(i) > 0);
                const modelIn = (this.inputs || []).find(i => i.name === "model");
                const hasModelIn = !!(modelIn && modelIn.link !== null && modelIn.link !== undefined && modelIn.link !== false);
                let peers = 0, activePeer = null;
                try {
                    const same = (app?.graph?._nodes || []).filter(n => n && n !== this && (n.type === NODE_NAME || n.constructor?.type === NODE_NAME));
                    peers = same.length;
                    activePeer = same.find(n => {
                        const mIn = (n.inputs || []).find(i => i.name === "model");
                        const mOut = (n.outputs || [])[0];
                        return !!(mIn && mIn.link != null && mOut && Array.isArray(mOut.links) && mOut.links.length);
                    }) || null;
                } catch (e) {}
                const idText = this.id === undefined ? "" : `#${this.id}`;
                if (!anyOut) {
                    return {
                        text: `⚠ ${idText} 未接入：输出没有任何连线，改动不会执行`,
                        color: "#ff8b8b",
                        detached: true,
                        activePeer,
                        title: "本节点的所有输出都没连到下游，ComfyUI 不会执行它，在这里勾选/取消 LoRA 不会影响出图。" +
                            (peers > 0 ? `画布上还有 ${peers} 个同类加载器，请确认你改的是接到采样器的那个。` : ""),
                    };
                }
                if (!hasModelIn) {
                    return {
                        text: `⚠ ${idText} 未连接 model 输入，无法加载 LoRA`,
                        color: "#ff8b8b",
                        detached: true,
                        activePeer,
                        title: "链末端需要 model 输入才会应用 LoRA；请把上游模型接到本节点的 model 输入。",
                    };
                }
                if (outCount(0) === 0) {
                    return {
                        text: `⚠ ${idText} model 输出未连接，LoRA 不会进采样器`,
                        color: "#ffc266",
                        detached: true,
                        activePeer,
                        title: "本节点的 model 输出没有下游，LoRA 虽然会加载但不会传到采样器。",
                    };
                }
                return {
                    text: idText,
                    color: "#8891a8",
                    detached: false,
                    title: peers > 0 ? `画布上一共有 ${peers + 1} 个同类加载器，本节点已接入工作流。` : "本节点已接入工作流。",
                };
            };

            nodeType.prototype._mplRefreshStatusBar = function(bar) {
                const target = bar || this.listContainer?.querySelector(".mpl-multisel-bar");
                if (!target) return;
                let el = target.querySelector(".mpl-ms-status");
                if (!el) {
                    el = document.createElement("span");
                    el.className = "mpl-ms-status";
                    target.insertBefore(el, target.querySelector(".mpl-ms-master"));
                }
                const st = this._mplLinkStatus();
                el.textContent = st.text;
                el.style.color = st.color;
                el.title = st.title;
                target.classList.toggle("mpl-bar-detached", !!st.detached);

                let jump = target.querySelector(".mpl-ms-jump");
                if (st.detached && st.activePeer) {
                    if (!jump) {
                        jump = document.createElement("button");
                        jump.className = "mpl-ms-jump";
                        jump.type = "button";
                        jump.textContent = "定位生效节点 #" + st.activePeer.id;
                        jump.title = "画布上还有一个已接入工作流的加载器，点这里选中并居中它";
                        jump.style.cssText = "padding:2px 8px;font-size:11px;color:#ffd7d7;border-color:rgba(239,107,125,0.5);";
                        const peer = st.activePeer;
                        jump.onclick = (e) => {
                            e.stopPropagation();
                            try {
                                app.canvas?.centerOnNode?.(peer);
                                if (typeof app.canvas?.selectNode === "function") app.canvas.selectNode(peer);
                                else if (typeof app.canvas?.selectNodes === "function") app.canvas.selectNodes([peer]);
                                app.canvas?.setDirty?.(true, true);
                            } catch (err) {}
                        };
                        jump.addEventListener("pointerdown", (e) => e.stopPropagation());
                        target.insertBefore(jump, target.querySelector(".mpl-ms-master"));
                    }
                    jump.textContent = "定位生效节点 #" + st.activePeer.id;
                } else if (jump) {
                    jump.remove();
                }
            };

            const onConnectionsChangeOrig = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function() {
                const r = onConnectionsChangeOrig ? onConnectionsChangeOrig.apply(this, arguments) : undefined;
                this._mplRefreshStatusBar();
                return r;
            };

            // ---------- 顶层统一布局（文件夹与散装 LoRA 自由穿插）----------
            // 每个文件夹/散装 lora 用稳定 _uid 标识，_topLayout 记录它们的先后顺序
            nodeType.prototype._uidFor = function(obj) {
                if (!obj._uid) {
                    obj._uid = "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
                }
                return obj._uid;
            };
            // 同步 _topLayout：补齐新对象、清除已删除对象，返回有序 token 列表
            nodeType.prototype._syncTopLayout = function() {
                const folders = this.loraData.folders || [];
                const loras = this.loraData.loras || [];
                if (!Array.isArray(this._topLayout)) this._topLayout = [];
                const valid = new Set();
                folders.forEach(f => valid.add("f:" + this._uidFor(f)));
                loras.forEach(l => valid.add("l:" + this._uidFor(l)));
                // 去除失效 token
                this._topLayout = this._topLayout.filter(tok => valid.has(tok));
                const present = new Set(this._topLayout);
                // 追加缺失（新加的文件夹/散装 lora 默认排到末尾）
                folders.forEach(f => { const k = "f:" + this._uidFor(f); if (!present.has(k)) { this._topLayout.push(k); present.add(k); } });
                loras.forEach(l => { const k = "l:" + this._uidFor(l); if (!present.has(k)) { this._topLayout.push(k); present.add(k); } });
                return this._topLayout;
            };
            // 把某个 token 移动到目标 token 的前/后
            nodeType.prototype._moveTopToken = function(srcTok, dstTok, after) {
                if (!this._topLayout) return;
                const arr = this._topLayout;
                const si = arr.indexOf(srcTok);
                if (si < 0) return;
                arr.splice(si, 1);
                let di = arr.indexOf(dstTok);
                if (di < 0) { arr.push(srcTok); return; }
                if (after) di += 1;
                arr.splice(di, 0, srcTok);
            };
            // 把 token 放到目标 token 前/后（可来自文件夹，先移除再插入）
            nodeType.prototype._mplPlaceToken = function(token, targetToken, after) {
                if (!Array.isArray(this._topLayout)) this._topLayout = [];
                const arr = this._topLayout;
                const si = arr.indexOf(token);
                if (si >= 0) arr.splice(si, 1);
                const di = arr.indexOf(targetToken);
                if (di < 0) { arr.push(token); return; }
                arr.splice(after ? di + 1 : di, 0, token);
            };
            // 在显示布局里把某个 LoRA 移到目标 LoRA 前/后（用于跨文件夹/根列表的精确插入）
            nodeType.prototype._mplInsertLoraByToken = function(movedLora, targetLora, after) {
                if (!movedLora || !targetLora) return;
                this._mplPlaceToken("l:" + this._uidFor(movedLora), "l:" + this._uidFor(targetLora), after);
            };
            // 顶层重排后销毁所有对象的 _uid 缓存？不需要：_uid 稳定即可
            nodeType.prototype.renderEmbeddedList = function() {
                if(!this.listContainer) return;
                mplNormalizeLoraData(this.loraData);
                
                // 清理所有预览图，避免重复显示
                const previews = document.querySelectorAll('.mpl-lora-preview');
                previews.forEach(preview => preview.remove());
                
                const container = this.listContainer;
                // 重绘前记住滚动位置，避免点行/刷新后列表跳回顶部
                const _prevScrollTop = container.scrollTop;
                container.innerHTML = "";
                this._listEl = container;

                // 多选：初始化(this.loraData.selected)与顶部工具条
                this._ensureMultiSelectState();
                this.applyColorSettings();
                this.applyFolderColorSettings();
                container.appendChild(this._buildMultiSelectBar());

                // 统一布局渲染：文件夹与散装 LoRA 按 _topLayout 顺序穿插
                const _layout = this._syncTopLayout();
                const _folderByIdx = this.loraData.folders;
                const _rootLoras = this.loraData.loras;

                // 顶层拖拽排序辅助：给行/文件夹头部绑定拖拽，落到某 token 前/后
                const self = this;
                const _mkTopDragHandle = (handleEl, tok, dimEl, extra) => {
                    handleEl.draggable = true;
                    // 用属性赋值覆盖 createLoraRow 里原有的 ondragstart（避免双重触发）
                    handleEl.ondragstart = (e) => {
                        e.stopPropagation();
                        mplClearLoraPreview();
                        e.dataTransfer.setData("text/plain", JSON.stringify({ type: "top", tok: tok }));
                        e.dataTransfer.setData("application/x-top-drag", "true");
                        e.dataTransfer.effectAllowed = "move";
                        if (String(tok).startsWith("f:")) {
                            try { e.dataTransfer.setData("application/x-mpl-folder", JSON.stringify({ tok })); } catch (_) {}
                        }
                        if (extra) {
                            try { e.dataTransfer.setData(extra.mime, JSON.stringify(extra.value)); } catch (_) {}
                        }
                        self._currentTopDrag = tok;
                        if (dimEl) dimEl.style.opacity = "0.4";
                    };
                    handleEl.ondragend = () => {
                        if (dimEl) dimEl.style.opacity = "1";
                        self._currentTopDrag = null;
                        (self._listEl ? self._listEl.querySelectorAll(".mpl-insert-line") : []).forEach(el => el.remove());
                    };
                };
                const _clearTopMark = (el) => el.classList.remove("mpl-top-drop-active", "mpl-top-drop-before", "mpl-top-drop-after");
                const _bindTopDropTarget = (el, tok) => {
                    el.addEventListener("dragover", (e) => {
                        if (!self._currentTopDrag) return;
                        e.preventDefault();
                        _clearTopMark(el);
                        const rect = el.getBoundingClientRect();
                        el.classList.add((e.clientY - rect.top) > rect.height / 2 ? "mpl-top-drop-after" : "mpl-top-drop-before");
                    });
                    el.addEventListener("dragleave", () => _clearTopMark(el));
                    el.addEventListener("drop", (e) => {
                        const raw = e.dataTransfer.getData("text/plain");
                        if (!raw) return;
                        let data; try { data = JSON.parse(raw); } catch (_) { return; }
                        if (!data || data.type !== "top") return;
                        e.preventDefault(); e.stopPropagation();
                        _clearTopMark(el);
                        if (data.tok === tok) { self._currentTopDrag = null; return; }
                        const rect = el.getBoundingClientRect();
                        const after = (e.clientY - rect.top) > rect.height / 2;
                        self._moveTopToken(data.tok, tok, after);
                        self._currentTopDrag = null;
                        self.renderEmbeddedList();
                        self.updateWidget();
                    });
                };

                // 按布局顺序渲染
                _layout.forEach((tok) => {
                    if (tok.startsWith("f:")) {
                        const uid = tok.slice(2);
                        const fIdx = _folderByIdx.findIndex(f => this._uidFor(f) === uid);
                        if (fIdx < 0) return;
                        const folder = _folderByIdx[fIdx];
                        const fDiv = document.createElement("div");
                        fDiv.className = "mpl-folder-row" + (folder.ignored ? " ignored" : "");
                        fDiv.dataset.fidx = String(fIdx);
                        // 文件夹左条：只有本文件夹内有 LoRA 被选中时才显示
                        if ((folder.loras || []).some(l => this._isMultiSelected(folder, l))) {
                            fDiv.classList.add("has-sel");
                        }
                        // 独立固定模式才用单条色；跟随全局时忽略，交由 --folder-def-* 统一控制
                        if (folder.colorMode !== "global") {
                            if (folder.color) fDiv.style.setProperty("--folder-c", folder.color);
                            if (folder.bgColor) fDiv.style.setProperty("--folder-bg", folder.bgColor);
                            if (folder.headBg) fDiv.style.setProperty("--folder-head-bg", folder.headBg);
                        }
                        // 右键文件夹菜单（颜色设置：强调条色 + 背景色；重命名；删除）
                        fDiv.oncontextmenu = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            this.showFolderContextMenu(folder, fDiv, e.clientX, e.clientY);
                        };
                        // 文件夹本体的顶层拖拽（reorder / 或把散装 lora 拖入）都在 folder 自己的 drop 里处理

                        fDiv.ondragover = (e) => {
                            e.preventDefault();
                            fDiv.classList.add("drag-over");
                            // 拖动文件夹标题时，按卡片上下半区提示将插在前/后
                            if (this._currentTopDrag) {
                                fDiv.classList.remove("mpl-top-drop-before", "mpl-top-drop-after");
                                const r = fDiv.getBoundingClientRect();
                                fDiv.classList.add((e.clientY - r.top) > r.height / 2 ? "mpl-top-drop-after" : "mpl-top-drop-before");
                            }
                        };
                        fDiv.ondragleave = () => { fDiv.classList.remove("drag-over", "mpl-top-drop-before", "mpl-top-drop-after"); };
                        fDiv.ondrop = (e) => {
                            e.preventDefault();
                            fDiv.classList.remove("drag-over", "mpl-top-drop-before", "mpl-top-drop-after");
                            try {
                                const data = JSON.parse(e.dataTransfer.getData("text/plain"));
                                // 顶层拖拽（类型 top）：
                                //  - 源是文件夹 f: → 文件夹间重排（按上下半区插入）
                                //  - 源是散装 lora l: → 把该 lora 拖进本文件夹
                                if (data && data.type === "top" && typeof data.tok === "string") {
                                    e.stopPropagation();
                                    if (data.tok.startsWith("l:")) {
                                        const uid = data.tok.slice(2);
                                        const ri = this.loraData.loras.findIndex(l => this._uidFor(l) === uid);
                                        if (ri >= 0) {
                                            const moved = this.loraData.loras[ri];
                                            this.loraData.loras.splice(ri, 1);
                                            folder.loras.push(moved);
                                            folder.collapsed = false;
                                        }
                                    } else if (data.tok.startsWith("f:") && data.tok !== tok) {
                                        const rect = fDiv.getBoundingClientRect();
                                        const after = (e.clientY - rect.top) > rect.height / 2;
                                        this._moveTopToken(data.tok, tok, after);
                                    }
                                    this._currentTopDrag = null;
                                    this.renderEmbeddedList();
                                    this.updateWidget();
                                    return;
                                }
                                let movedItem = null;
                                if (data.sourceLIdx !== undefined && (data.sourceType === "root" || data.sourceType === "folder")) {
                                    if (data.sourceType === "root") {
                                        const src = this.loraData.loras;
                                        if (data.sourceLIdx >= 0 && data.sourceLIdx < src.length) {
                                            movedItem = src[data.sourceLIdx];
                                            src.splice(data.sourceLIdx, 1);
                                        }
                                    } else {
                                        if (data.sourceFIdx >= 0 && data.sourceFIdx < this.loraData.folders.length) {
                                            const srcFolder = this.loraData.folders[data.sourceFIdx];
                                            if (data.sourceFIdx !== fIdx && data.sourceLIdx >= 0 && data.sourceLIdx < srcFolder.loras.length) {
                                                movedItem = srcFolder.loras[data.sourceLIdx];
                                                srcFolder.loras.splice(data.sourceLIdx, 1);
                                            }
                                        }
                                    }
                                } else if (data.type === "root") {
                                    if (data.lIdx >= 0 && data.lIdx < this.loraData.loras.length) {
                                        movedItem = this.loraData.loras[data.lIdx];
                                        this.loraData.loras.splice(data.lIdx, 1);
                                    }
                                } else if (data.type === "folder") {
                                    if (data.fIdx >= 0 && data.fIdx < this.loraData.folders.length) {
                                        const srcFolder = this.loraData.folders[data.fIdx];
                                        if (data.fIdx !== fIdx && data.lIdx >= 0 && data.lIdx < srcFolder.loras.length) {
                                            movedItem = srcFolder.loras[data.lIdx];
                                            srcFolder.loras.splice(data.lIdx, 1);
                                        }
                                    }
                                }
                                if (movedItem) {
                                    folder.loras.push(movedItem);
                                    folder.collapsed = false;
                                    this.renderEmbeddedList();
                                    this.updateWidget();
                                }
                            } catch (err) {
                                console.error("拖拽到文件夹错误:", err);
                            }
                        };

                        const header = document.createElement("div");
                        header.className = "mpl-folder-header";

                        // 箭头占位已去掉，折叠箭头同时承担顶层排序拖拽，内容直接贴左
                        const collapseIcon = document.createElement("span");
                        collapseIcon.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:16px;color:#8b8d9b;cursor:pointer;";
                        collapseIcon.innerHTML = mplIcon(folder.collapsed ? 'chevronRight' : 'chevronDown', 14);
                        collapseIcon.onclick = (e) => { e.stopPropagation(); folder.collapsed = !folder.collapsed; this.renderEmbeddedList(); };
                        _mkTopDragHandle(collapseIcon, tok, fDiv);
                        collapseIcon.addEventListener("pointerdown", (e)=>e.stopPropagation());
                        collapseIcon.addEventListener("mousedown", (e)=>e.stopPropagation());

                        const folderToggle = document.createElement("input");
                        folderToggle.type = "checkbox";
                        const _fLoras = (folder.loras || []);
                        const _fSelCount = _fLoras.filter(l => this._isMultiSelected(folder, l)).length;
                        folderToggle.checked = _fLoras.length > 0 && _fSelCount === _fLoras.length;
                        folderToggle.indeterminate = _fSelCount > 0 && _fSelCount < _fLoras.length;
                        folderToggle.title = "启用/停用此文件夹内的全部 LoRA";
                        folderToggle.style.cssText = "width:16px;height:16px;cursor:pointer;margin-right:4px;margin-left:4px;";
                        folderToggle.onchange = (e) => {
                            e.stopPropagation();
                            const newState = folderToggle.checked;
                            if (folder.loras && folder.loras.length > 0) {
                                folder.loras.forEach(lora => { newState ? this._addMultiSelected(folder, lora) : this._removeMultiSelected(folder, lora); });
                                this.updateWidget();
                                this.renderEmbeddedList();
                            }
                        };
                        folderToggle.addEventListener("pointerdown", (e)=>e.stopPropagation());
                        folderToggle.addEventListener("mousedown", (e)=>e.stopPropagation());
                        folderToggle.addEventListener("click", (e)=>e.stopPropagation());

                        const title = document.createElement("span");
                        title.className = "mpl-folder-title";
                        title.textContent = folder.name;
                        title.title = folder.ignored
                            ? "已忽略（不参与加载）· 单击恢复 · 右键重命名"
                            : "单击忽略此文件夹（不参与加载，保留组内勾选状态）· 右键重命名";
                        // 可直接把文件夹名字拖到左栏分类里生成预设
                        title.draggable = true;
                        title.ondragstart = (e) => {
                            e.stopPropagation();
                            try {
                                e.dataTransfer.setData("text/plain", JSON.stringify({ type: "top", tok }));
                                e.dataTransfer.setData("application/x-mpl-folder", JSON.stringify({ tok }));
                                e.dataTransfer.effectAllowed = "copy";
                            } catch (_) {}
                        };
                        // 单击标题切换忽略；重命名仍在右键菜单
                        title.onclick = (e) => {
                            e.stopPropagation();
                            folder.ignored = !folder.ignored;
                            this.updateWidget();
                            this.renderEmbeddedList();
                        };

                        // 复选框在左、折叠箭头在右
                        header.appendChild(folderToggle);
                        header.appendChild(collapseIcon);
                        header.appendChild(title);

                        // 中间空白区：拖动可调整位置，单击仍然折叠/展开
                        const titleSpace = document.createElement("div");
                        titleSpace.className = "mpl-folder-title-space";
                        titleSpace.style.cssText = "flex:1 1 auto; min-width:8px; align-self:stretch; cursor:move;";
                        titleSpace.title = "拖动调整位置；单击折叠/展开";
                        titleSpace.onclick = (e) => {
                            e.stopPropagation();
                            folder.collapsed = !folder.collapsed;
                            this.renderEmbeddedList();
                        };
                        _mkTopDragHandle(titleSpace, tok, fDiv);
                        header.appendChild(titleSpace);

                        const controls = document.createElement("div");
                        controls.className = "mpl-folder-controls";
                        const delBtn = document.createElement("button");
                        delBtn.className = "mpl-mini-btn del";
                        delBtn.innerHTML = mplIcon("close", 13);
                        delBtn.title = "删除文件夹";
                        delBtn.onclick = (e) => {
                            e.stopPropagation();
                            if (confirm("Delete folder?")) {
                                if (this._previewTimeout) { clearTimeout(this._previewTimeout); this._previewTimeout = null; }
                                if (this._previewDiv) { this._previewDiv.remove(); this._previewDiv = null; }
                                document.querySelectorAll('.mpl-lora-preview').forEach(p => p.remove());
                                this.loraData.folders.splice(fIdx, 1);
                                this.renderEmbeddedList();
                                this.updateWidget();
                            }
                        };
                        delBtn.addEventListener("pointerdown", (e)=>e.stopPropagation());

                        controls.append(delBtn);
                        header.appendChild(controls);

                        header.onclick = (e) => {
                            // 点击文件夹头部中间空白处（非拖拽区/折叠图标/全选/标题/删除按钮）切换折叠
                            if (e.target === header ||
                                (e.target.classList && e.target.classList.contains("mpl-folder-title-space"))) {
                                folder.collapsed = !folder.collapsed;
                                this.renderEmbeddedList();
                            }
                        };
                        fDiv.appendChild(header);

                        if (!folder.collapsed) {
                            folder.loras.forEach((lora, lIdx) => {
                                const row = this.createLoraRow(lora, 'folder', fIdx, lIdx);
                                row.querySelector(".del").onclick = () => {
                                    if (this._previewTimeout) { clearTimeout(this._previewTimeout); this._previewTimeout = null; }
                                    if (this._previewDiv) { this._previewDiv.remove(); this._previewDiv = null; }
                                    document.querySelectorAll('.mpl-lora-preview').forEach(p => p.remove());
                                    folder.loras.splice(lIdx, 1);
                                    this.renderEmbeddedList();
                                    this.updateWidget();
                                };
                                fDiv.appendChild(row);
                            });
                        }
                        container.appendChild(fDiv);
                    } else if (tok.startsWith("l:")) {
                        const uid = tok.slice(2);
                        const lIdx = _rootLoras.findIndex(l => this._uidFor(l) === uid);
                        if (lIdx < 0) return;
                        const lora = _rootLoras[lIdx];
                        const row = this.createLoraRow(lora, 'root', -1, lIdx);
                        row.classList.add("root-item");
                        // 顶层排序：箭头占位已去掉，改由缩略图承担（同时保留拖到左栏收藏）
                        const topHandle = row.querySelector(".mpl-lora-thumb");
                        if (topHandle) { _mkTopDragHandle(topHandle, tok, row, { mime: "application/x-mpl-lora", value: { name: lora.name } }); }
                        _bindTopDropTarget(row, tok);
                        row.querySelector(".del").onclick = () => {
                            if (this._previewTimeout) { clearTimeout(this._previewTimeout); this._previewTimeout = null; }
                            if (this._previewDiv) { this._previewDiv.remove(); this._previewDiv = null; }
                            document.querySelectorAll('.mpl-lora-preview').forEach(p => p.remove());
                            _rootLoras.splice(lIdx, 1);
                            this.renderEmbeddedList();
                            this.updateWidget();
                        };
                        container.appendChild(row);
                    }
                });
                if (_prevScrollTop > 0) container.scrollTop = _prevScrollTop;
            };

            // 通用的弹窗拖拽功能（一比一参考 magic_resolution.js）
            nodeType.prototype.makeDialogDraggable = function(dialog, titleBar) {
                let isDragging = false;
                let offsetX = 0;
                let offsetY = 0;

                titleBar.style.cursor = "move";
                titleBar.style.userSelect = "none";

                const dragStart = (e) => {
                    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
                        e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                        return;
                    }

                    const rect = dialog.getBoundingClientRect();

                    let mouseX, mouseY;
                    if (e.type === "mousedown") {
                        mouseX = e.clientX;
                        mouseY = e.clientY;
                        isDragging = true;
                    } else if (e.type === "touchstart") {
                        mouseX = e.touches[0].clientX;
                        mouseY = e.touches[0].clientY;
                        isDragging = true;
                    } else {
                        return;
                    }

                    offsetX = mouseX - rect.left;
                    offsetY = mouseY - rect.top;

                    e.preventDefault();
                };

                const drag = (e) => {
                    if (!isDragging) return;

                    e.preventDefault();

                    let mouseX, mouseY;
                    if (e.type === "mousemove") {
                        mouseX = e.clientX;
                        mouseY = e.clientY;
                    } else if (e.type === "touchmove") {
                        mouseX = e.touches[0].clientX;
                        mouseY = e.touches[0].clientY;
                    } else {
                        return;
                    }

                    let newX = mouseX - offsetX;
                    let newY = mouseY - offsetY;

                    const minX = 0;
                    const minY = 0;
                    const maxX = window.innerWidth - dialog.offsetWidth;
                    const maxY = window.innerHeight - dialog.offsetHeight;
                    newX = Math.max(minX, Math.min(newX, maxX));
                    newY = Math.max(minY, Math.min(newY, maxY));

                    // 一比一参考 magic_resolution.js：清除 top/left/right/bottom，用 transform 定位
                    dialog.style.top = '0px';
                    dialog.style.left = '0px';
                    dialog.style.right = '';
                    dialog.style.bottom = '';

                    // 如果父元素是 flex 居中，需要改父样式
                    const parent = dialog.parentElement;
                    if (parent && parent !== document.body && parent.style.display === 'flex') {
                        parent.style.display = 'block';
                        parent.style.position = 'fixed';
                        parent.style.top = '0';
                        parent.style.left = '0';
                        parent.style.width = '100%';
                        parent.style.height = '100%';
                    }

                    // 确保 dialog 使用 fixed 定位
                    dialog.style.position = 'fixed';

                    // 用 transform 移动
                    dialog.style.transform = `translate(${newX}px, ${newY}px)`;
                };

                const dragEnd = () => {
                    if (!isDragging) { return; }
                    isDragging = false;
                    // 拖拽结束：若弹窗提供了位置保存回调，则记录最后一次位置
                    try {
                        if (typeof dialog.__maSaveWinPos === "function") {
                            // transform 定位结束后，改回 top/left，避免下次读取 rect 偏移
                            const r = dialog.getBoundingClientRect();
                            dialog.style.transform = "";
                            dialog.style.top = r.top + "px";
                            dialog.style.left = r.left + "px";
                            dialog.style.right = "";
                            dialog.style.bottom = "";
                            const parent = dialog.parentElement;
                            if (parent && parent !== document.body &&
                                (parent.style.display === 'flex' || parent.style.position === 'fixed')) {
                                // 还原为普通容器
                                parent.style.display = '';
                                parent.style.position = '';
                                parent.style.top = '';
                                parent.style.left = '';
                                parent.style.width = '';
                                parent.style.height = '';
                            }
                            dialog.__maSaveWinPos();
                        }
                    } catch(e) {}
                };

                titleBar.addEventListener("mousedown", dragStart);
                titleBar.addEventListener("touchstart", dragStart);
                document.addEventListener("mousemove", drag);
                document.addEventListener("touchmove", drag);
                document.addEventListener("mouseup", dragEnd);
                document.addEventListener("touchend", dragEnd);
                return () => {
                    isDragging = false;
                    titleBar.removeEventListener("mousedown", dragStart);
                    titleBar.removeEventListener("touchstart", dragStart);
                    document.removeEventListener("mousemove", drag);
                    document.removeEventListener("touchmove", drag);
                    document.removeEventListener("mouseup", dragEnd);
                    document.removeEventListener("touchend", dragEnd);
                };
            };

            // --- Klein 模式提示 Banner ---
            nodeType.prototype._updateKleinBanner = function() {
                const container = this.embeddedDiv;
                if (!container) return;

                // 移除旧 banner
                if (this._kleinBannerEl) {
                    this._kleinBannerEl.remove();
                    this._kleinBannerEl = null;
                }

                // 读取当前 klein_mode 设置
                const kleinMode = this.kleinMode
                    ?? this.properties?.klein_mode
                    ?? this._kleinModeWidget?.value
                    ?? "auto";
                const isKleinActive = String(kleinMode).toLowerCase() === "klein";

                // Klein 模式下不需要提示
                if (isKleinActive) return;

                // 检测是否使用了 Klein Loader（通过检查本节点的 model 输入是否连接了 MagicKleinLoader）
                const isKleinModelConnected = this.inputs?.some(input => {
                    if (!input.link) return false;
                    const link = app.graph.links?.[input.link];
                    if (!link) return false;
                    const originNode = app.graph.getNodeById(link.origin_id);
                    return originNode?.type === "MagicKleinLoader";
                });

                if (!isKleinModelConnected) return;

                // 构建 Banner
                const banner = document.createElement("div");
                banner.style.cssText = `
                    background: #1a3a2a;
                    border-left: 3px solid #4CAF50;
                    border-right: 3px solid #4CAF50;
                    padding: 8px 12px;
                    margin: 4px 6px;
                    border-radius: 4px;
                    font-size: 12px;
                    color: #a5d6a7;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-shrink: 0;
                `;
                banner.innerHTML = `
                    <span style="font-size: 14px;">&#x1F31F;</span>
                    <span style="flex: 1;">
                        已检测到 Klein 模型，请前往 <b>&#x2699;&#xFE0F;设置 &rarr; LoRA 加载模式</b>
                        启用 <b>tonera-Klein-Nunchaku</b> 模式以正确加载 LoRA
                    </span>
                    <button
                        style="background:#2e7d32;border:1px solid #4CAF50;color:#a5d6a7;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:11px;flex-shrink:0;"
                    >前往设置</button>
                `;

                // 前往设置按钮
                banner.querySelector("button").onclick = () => {
                    this.showSettingsModal();
                };

                // 插入到 listContainer 之前（现在是右侧主列内部）
                const listContainer = this.listContainer;
                if (listContainer && listContainer.parentNode) {
                    listContainer.parentNode.insertBefore(banner, listContainer);
                } else if (container) {
                    container.appendChild(banner);
                }

                this._kleinBannerEl = banner;
            };

            nodeType.prototype.showLoraEditModal = async function(lora, type, fIdx, lIdx, filePath) {
                // 先读取本地文件内容
                const loraName = filePath || lora.name;
                let fileContents = {
                    txt: ''
                };
                
                try {
                    // 读取 txt 文件
                    const txtResp = await api.fetchApi('/malora/lora/get_lora_file', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ lora_filename: loraName, file_type: 'txt' })
                    }).catch(() => null);
                    
                    if (txtResp) {
                        const txtData = await txtResp.json();
                        if (txtData.status === 'success' && txtData.content) {
                            fileContents.txt = txtData.content;
                        }
                    }
                } catch (e) {
                    console.error("读取本地文件时出错:", e);
                }
                
                // 创建遮罩层
                const overlay = document.createElement("div");
                overlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(6, 8, 14, 0.62);
                    backdrop-filter: blur(2px);
                    z-index: 10001;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                `;
                
                // 创建弹窗
                const dialog = document.createElement("div");
                dialog.setAttribute("data-magic-i18n", "manual");
                dialog.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: #171922;
                    border: 1px solid #2c3040;
                    border-radius: 14px;
                    padding: 22px 24px;
                    width: 680px;
                    min-width: 540px;
                    max-width: 94vw;
                    max-height: 88vh;
                    box-shadow: 0 24px 60px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.4);
                    z-index: 10002;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
                    color: #e8e8ee;
                `;
                
                // 标题栏
                const header = document.createElement("div");
                header.style.cssText = `
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 14px;
                    padding-bottom: 12px;
                    border-bottom: 1px solid #262a34;
                    cursor: move;
                    user-select: none;
                `;
                
                const title = document.createElement("div");
                title.textContent = `编辑 LoRA 内容: ${lora.name.split(/[/\\]/).pop()}`;
                title.style.cssText = `
                    font-size: 16px;
                    font-weight: 700;
                    color: #f2f3f7;
                    letter-spacing: 0.2px;
                    flex: 1;
                    min-width: 0;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                `;
                
                const deleteBtn = document.createElement("button");
                deleteBtn.textContent = "删除";
                deleteBtn.style.cssText = `
                    padding: 6px 14px;
                    background: transparent;
                    border: 1px solid rgba(244, 67, 54, 0.55);
                    color: #ef6b7d;
                    border-radius: 7px;
                    cursor: pointer;
                    font-size: 12.5px;
                    font-weight: 500;
                    transition: all 0.15s;
                    flex: none;
                `;
                deleteBtn.onclick = async () => {
                    if (confirm("确定要删除这个 LoRA 及其所有相关文件吗？此操作不可恢复！")) {
                        try {
                            const response = await api.fetchApi('/malora/lora/delete_lora_complete', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ lora_name: lora.name })
                            });
                            const result = await response.json();
                            
                            if (result.status === 'success') {
                                const deletedLoraName = lora.name;
                                
                                // 立即清理所有预览图（防止残留）
                                if (this._previewTimeout) {
                                    clearTimeout(this._previewTimeout);
                                    this._previewTimeout = null;
                                }
                                if (this._previewDiv) {
                                    this._previewDiv.remove();
                                    this._previewDiv = null;
                                }
                                // 清理所有可能的预览图（防止遗漏）
                                const allPreviews = document.querySelectorAll('.mpl-lora-preview');
                                allPreviews.forEach(preview => preview.remove());
                                
                                // 从节点数据中移除
                                if (type === 'folder' && fIdx >= 0 && lIdx >= 0) {
                                    if (this.loraData.folders[fIdx] && this.loraData.folders[fIdx].loras[lIdx]) {
                                        this.loraData.folders[fIdx].loras.splice(lIdx, 1);
                                    }
                                } else if (type === 'root' && lIdx >= 0) {
                                    if (this.loraData.loras[lIdx]) {
                                        this.loraData.loras.splice(lIdx, 1);
                                    }
                                } else {
                                    const loraName = lora.name;
                                    const rootIdx = this.loraData.loras.findIndex(l => l.name === loraName);
                                    if (rootIdx >= 0) {
                                        this.loraData.loras.splice(rootIdx, 1);
                                    } else {
                                        for (let fi = 0; fi < this.loraData.folders.length; fi++) {
                                            const folder = this.loraData.folders[fi];
                                            const li = folder.loras.findIndex(l => l.name === loraName);
                                            if (li >= 0) {
                                                folder.loras.splice(li, 1);
                                                break;
                                            }
                                        }
                                    }
                                }
                                
                                // 刷新全局图片列表缓存（类似爬取成功后的逻辑）
                                await loadLoraImageList();
                                
                                // 刷新缓存（重新渲染列表）
                                this.renderEmbeddedList();
                                this.updateWidget();
                                
                                // 刷新所有显示该lora图片的地方（虽然已删除，但需要清理缓存）
                                this.refreshLoraImageCache(deletedLoraName);
                                
                                // 如果"添加Lora"窗口打开，重新获取文件列表并渲染
                                if (this._addLoraModal && this._addLoraModal.parentElement && this._refreshFileListFunc) {
                                    // 调用refreshFileList函数重新获取文件列表并渲染
                                    await this._refreshFileListFunc();
                                } else if (this._addLoraModal && this._addLoraModal.parentElement && this._renderContentFunc) {
                                    // 如果没有refreshFileList，至少调用renderContent
                                    this._renderContentFunc();
                                }
                                
                                document.body.removeChild(overlay);
                                alert(result.message || "删除成功");
                            } else {
                                alert(result.message || "删除失败");
                            }
                        } catch (error) {
                            console.error("删除LoRA时出错:", error);
                            alert("删除失败: " + error.message);
                        }
                    }
                };
                deleteBtn.onmouseenter = () => { deleteBtn.style.background = "rgba(244,67,54,0.14)"; };
                deleteBtn.onmouseleave = () => { deleteBtn.style.background = "transparent"; };
                
                header.appendChild(title);
                
                // 双击标题复制标题
                const lmInfo = mplLmEntry(loraName);
                const loraStem = String(loraName).split(/[/\\]/).pop().replace(/\.(safetensors|ckpt|pt|pth|bin|gguf|onnx)$/i, "");
                const lmTitle = String(lmInfo.title || "").trim();
                title.textContent = lmTitle || loraStem;
                title.style.cssText = "font-size:16px;font-weight:700;color:#f2f3f7;letter-spacing:.2px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

                const absPath = mplPathFor(loraName);
                const dirPath = absPath
                    ? absPath.replace(/\/[^\/]*$/, "/")
                    : (String(loraName).split(/[/\\]/).slice(0, -1).join("/") ? String(loraName).split(/[/\\]/).slice(0, -1).join("/") + "/" : "");

                const copyText = async (text) => {
                    const val = String(text == null ? "" : text);
                    try {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            await navigator.clipboard.writeText(val);
                            return true;
                        }
                    } catch (e) { /* 回退 */ }
                    try {
                        const ta = document.createElement("textarea");
                        ta.value = val;
                        ta.style.cssText = "position:fixed;left:-9999px;top:0;";
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand("copy");
                        ta.remove();
                        return true;
                    } catch (e) { return false; }
                };

                // 单击标题复制
                title.style.cursor = "pointer";
                title.title = (lmTitle || loraStem) + "\n单击复制";
                title.onclick = async (e) => {
                    e.stopPropagation();
                    const ok = await copyText(lmTitle || loraStem);
                    const prev = title.textContent;
                    title.textContent = ok ? "✓ 已复制" : "复制失败";
                    setTimeout(() => { title.textContent = prev; }, 900);
                };

                const mkCopyBtn = (getText) => {                    const b = document.createElement("button");
                    b.type = "button";
                    b.title = "复制";
                    b.style.cssText = "flex:none;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;background:#20222b;border:1px solid #2f3340;border-radius:6px;color:#8b93a8;cursor:pointer;transition:all .12s;";
                    b.innerHTML = mplIcon("copy", 13) || "⧉";
                    b.onmouseenter = () => { b.style.borderColor = "#5a6da8"; b.style.color = "#c8d2ff"; };
                    b.onmouseleave = () => { b.style.borderColor = "#2f3340"; b.style.color = "#8b93a8"; };
                    b.onclick = async (e) => {
                        e.stopPropagation();
                        const text = typeof getText === "function" ? getText() : getText;
                        const ok = await copyText(text);
                        b.innerHTML = ok ? "✓" : "!";
                        setTimeout(() => { b.innerHTML = mplIcon("copy", 13) || "⧉"; }, 900);
                    };
                    return b;
                };

                const body = document.createElement("div");
                body.style.cssText = "display:flex;flex-direction:column;flex:1;min-height:0;overflow:auto;padding-right:2px;";

                const infoRow = (label, value, opts = {}) => {
                    const row = document.createElement("div");
                    row.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:8px;";
                    const lab = document.createElement("div");
                    lab.textContent = label;
                    lab.style.cssText = "width:64px;flex:none;color:#8b93a8;font-size:12px;";
                    const val = document.createElement("div");
                    val.textContent = value;
                    val.style.cssText = "flex:1;min-width:0;padding:6px 10px;background:#1b1d24;border:1px solid #2c2f3a;border-radius:7px;color:#dfe3ee;font-size:12.5px;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
                    if (opts.mono) val.style.fontFamily = "Consolas, 'Courier New', monospace";
                    if (opts.onClick) {
                        val.style.cursor = "pointer";
                        val.title = opts.title || "点击打开";
                        val.onclick = opts.onClick;
                        val.onmouseenter = () => { val.style.borderColor = "#5a6da8"; val.style.background = "#20232d"; };
                        val.onmouseleave = () => { val.style.borderColor = "#2c2f3a"; val.style.background = "#1b1d24"; };
                    }
                    row.appendChild(lab);
                    row.appendChild(val);
                    if (opts.copy !== false) row.appendChild(mkCopyBtn(value));
                    return row;
                };

                const fieldRow = (label, inputEl, copyable) => {
                    const row = document.createElement("div");
                    row.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:8px;";
                    const lab = document.createElement("div");
                    lab.textContent = label;
                    lab.style.cssText = "width:64px;flex:none;color:#8b93a8;font-size:12px;";
                    const val = document.createElement("div");
                    val.style.cssText = "flex:1;min-width:0;display:flex;";
                    val.appendChild(inputEl);
                    row.appendChild(lab);
                    row.appendChild(val);
                    if (copyable !== false) row.appendChild(mkCopyBtn(() => inputEl.value));
                    return row;
                };

                // 顶部操作：仅在不在节点中时提供“添加到节点”
                const actions = document.createElement("div");
                actions.style.cssText = "display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;";
                const addNodeBtn = document.createElement("button");
                addNodeBtn.type = "button";
                addNodeBtn.textContent = "添加到节点";
                addNodeBtn.style.cssText = "padding:6px 13px;background:#6c8cff;border:none;color:#fff;border-radius:7px;cursor:pointer;font-size:12.5px;font-weight:600;";
                addNodeBtn.onmouseenter = () => addNodeBtn.style.background = "#8098ff";
                addNodeBtn.onmouseleave = () => addNodeBtn.style.background = "#6c8cff";
                addNodeBtn.onclick = () => {
                    if (!this.loraData) this.loraData = { loras: [], folders: [] };
                    if (!Array.isArray(this.loraData.loras)) this.loraData.loras = [];
                    this.loraData.loras.push(mplDecorateNewLora({
                        name: loraName, weight: 1.0, enabled: true, tags: "", note: "", triggerWords: "",
                    }));
                    this.renderEmbeddedList();
                    this.updateWidget();
                };
                actions.appendChild(addNodeBtn);
                const civitaiBtn = document.createElement("button");
                civitaiBtn.type = "button";
                civitaiBtn.textContent = "在 CivitAI 查看";
                civitaiBtn.style.cssText = "padding:6px 13px;background:#20222b;border:1px solid #2f3340;color:#c8cad6;border-radius:7px;cursor:pointer;font-size:12.5px;";
                civitaiBtn.onmouseenter = () => { civitaiBtn.style.borderColor = "#5a6da8"; civitaiBtn.style.color = "#e8ecff"; };
                civitaiBtn.onmouseleave = () => { civitaiBtn.style.borderColor = "#2f3340"; civitaiBtn.style.color = "#c8cad6"; };
                civitaiBtn.onclick = () => { try { this.openLoraCivitai(loraName); } catch (e) { console.warn(e); } };
                actions.appendChild(civitaiBtn);
                body.appendChild(actions);

                // 只读信息
                body.appendChild(infoRow("文件名", loraStem));
                body.appendChild(infoRow("位置", dirPath || "—", {
                    mono: true,
                    title: "点击打开所在文件夹",
                    onClick: () => {
                        api.fetchApi("/malora/lora/open_folder", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ lora_name: loraName }),
                        }).catch((e) => console.warn("[MA Loader] 打开文件夹失败:", e));
                    },
                }));
                body.appendChild(infoRow("基础模型", String(lmInfo.base_model || "").trim() || "—"));

                // 触发词（可编辑）
                const triggerInput = document.createElement("input");
                triggerInput.type = "text";
                triggerInput.value = fileContents.txt || "";
                triggerInput.placeholder = "触发词，多个用逗号分隔";
                triggerInput.style.cssText = "width:100%;padding:6px 10px;background:#15161c;border:1px solid #2f3340;border-radius:7px;color:#e6e8f0;font-size:12.5px;outline:none;box-sizing:border-box;line-height:18px;";
                triggerInput.onfocus = () => triggerInput.style.borderColor = "#2196F3";
                triggerInput.onblur = () => triggerInput.style.borderColor = "#2f3340";
                triggerInput.addEventListener("keydown", (e) => e.stopPropagation());
                triggerInput.addEventListener("pointerdown", (e) => e.stopPropagation());
                body.appendChild(fieldRow("触发词", triggerInput));

                // 备注（可编辑）
                const prevNote = String(lora.note || "");
                const noteInput = document.createElement("input");
                noteInput.type = "text";
                noteInput.value = prevNote || mplNoteFor(loraName);
                noteInput.placeholder = "在此添加你的备注...";
                noteInput.style.cssText = triggerInput.style.cssText;
                noteInput.onfocus = () => noteInput.style.borderColor = "#2196F3";
                noteInput.onblur = () => noteInput.style.borderColor = "#2f3340";
                noteInput.addEventListener("keydown", (e) => e.stopPropagation());
                noteInput.addEventListener("pointerdown", (e) => e.stopPropagation());
                body.appendChild(fieldRow("附加备注", noteInput, false));

                // 底部按钮
                const buttonContainer = document.createElement("div");
                buttonContainer.style.cssText = "display:flex;gap:10px;justify-content:flex-end;margin-top:14px;padding-top:14px;border-top:1px solid #262a34;";

                const cancelBtn = document.createElement("button");
                cancelBtn.textContent = "取消";
                cancelBtn.style.cssText = "padding:8px 18px;background:#2a2d38;border:1px solid #3a3f4d;color:#cfd3de;border-radius:7px;cursor:pointer;font-size:13px;";
                cancelBtn.onmouseenter = () => { cancelBtn.style.background = "#333744"; };
                cancelBtn.onmouseleave = () => { cancelBtn.style.background = "#2a2d38"; };
                cancelBtn.onclick = () => { document.body.removeChild(overlay); };

                const fetchBtn = document.createElement("button");
                fetchBtn.textContent = "爬取信息";
                fetchBtn.style.cssText = "padding:8px 18px;background:#2196F3;border:none;color:#fff;border-radius:7px;cursor:pointer;font-size:13px;";
                fetchBtn.onmouseenter = () => fetchBtn.style.background = "#42A5F5";
                fetchBtn.onmouseleave = () => fetchBtn.style.background = "#2196F3";
                fetchBtn.onclick = () => { this.showFetchModal(lora, [{ querySelector: () => triggerInput }], overlay); };

                const saveBtn = document.createElement("button");
                saveBtn.textContent = "保存";
                saveBtn.style.cssText = "padding:8px 20px;background:#4CAF50;border:none;color:#fff;border-radius:7px;cursor:pointer;font-size:13px;font-weight:600;";
                saveBtn.onmouseenter = () => saveBtn.style.background = "#5CBF60";
                saveBtn.onmouseleave = () => saveBtn.style.background = "#4CAF50";
                saveBtn.onclick = async () => {
                    try {
                        const text = triggerInput.value;
                        const probe = await api.fetchApi('/malora/lora/probe_save_targets', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ lora_name: loraName })
                        }).then(r => r.json()).catch(() => null);
                        const targets = ["same"];
                        if (probe && probe.magicloradate_files && probe.magicloradate_files.txt) targets.push("magicloradate");
                        const results = [];
                        for (const t of targets) {
                            results.push(await api.fetchApi('/malora/lora/save_lora_file', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ lora_name: loraName, file_type: "txt", content: text, target: t })
                            }).then(r => r.json()));
                        }
                        if (!results.every(r => r && r.status === "success")) {
                            alert("保存失败：" + results.map(r => (r && r.message) || "未知错误").join("\n"));
                            return;
                        }
                        lora.triggerWords = text;
                        lora.tags = text;
                        const nextNote = noteInput.value;
                        if (nextNote !== prevNote) {
                            lora.note = nextNote;
                            void mplSetNote(loraName, nextNote, prevNote);
                        }
                        if (filePath && fIdx === -1) {
                            const exists = (this.loraData.loras || []).some(l => l && l.name === loraName)
                                || (this.loraData.folders || []).some(f => (f.loras || []).some(l => l && l.name === loraName));
                            if (!exists) {
                                lora.enabled = mplLoraEnabled(lora);
                                if (!lora.weight) lora.weight = 1.0;
                                if (!lora.tags) lora.tags = '';
                                this.loraData.loras.push(lora);
                            }
                        }
                        this.renderEmbeddedList();
                        this.updateWidget();
                        document.body.removeChild(overlay);
                    } catch (error) {
                        console.error("保存LoRA内容时出错:", error);
                        alert("保存时发生错误：" + error.message);
                    }
                };

                deleteBtn.title = "删除该 LoRA 及其相关文件";
                const footerSpacer = document.createElement("div");
                footerSpacer.style.cssText = "flex:1;";
                buttonContainer.appendChild(deleteBtn);
                buttonContainer.appendChild(footerSpacer);
                buttonContainer.appendChild(cancelBtn);
                buttonContainer.appendChild(fetchBtn);
                buttonContainer.appendChild(saveBtn);

                // 阻止事件冒泡
                const stopProp = (e) => { e.stopPropagation(); };
                dialog.addEventListener("pointerdown", stopProp);
                dialog.addEventListener("pointermove", stopProp);
                dialog.addEventListener("pointerup", stopProp);
                dialog.addEventListener("mousedown", stopProp);
                dialog.addEventListener("wheel", stopProp, { passive: false });

                overlay.onclick = (e) => { if (e.target === overlay) document.body.removeChild(overlay); };
                const handleEsc = (e) => {
                    if (e.key === "Escape") {
                        try { document.body.removeChild(overlay); } catch (err) {}
                        document.removeEventListener("keydown", handleEsc);
                    }
                };
                document.addEventListener("keydown", handleEsc);

                dialog.appendChild(header);
                dialog.appendChild(body);
                dialog.appendChild(buttonContainer);
                overlay.appendChild(dialog);
                document.body.appendChild(overlay);

                this.makeDialogDraggable(dialog, header);

                setTimeout(() => { try { triggerInput.focus(); } catch (e) {} }, 100);
            };


            // 批量编辑：为选中的多个 LoRA 批量写入触发词(txt)
            nodeType.prototype.showBatchEditModal = async function(fileList) {
                const files = Array.from(fileList || []);
                if (!files.length) { alert("请先选择要处理的 LoRA"); return; }

                const fetchOverlay = document.createElement("div");
                fetchOverlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:10020;display:flex;align-items:center;justify-content:center;";
                const fetchDialog = document.createElement("div");
                fetchDialog.setAttribute("data-magic-i18n", "manual");
                fetchDialog.style.cssText = "background:#1e1e1e;border:1px solid #3a3a3a;border-radius:12px;padding:24px;min-width:500px;max-width:600px;width:90%;box-shadow:0 12px 40px rgba(0,0,0,0.9);z-index:10021;position:relative;";

                const title = document.createElement("div");
                title.textContent = "批量加载 LoRA 信息（已选 " + files.length + " 个）";
                title.style.cssText = "font-size:18px;font-weight:600;color:#fff;margin-bottom:12px;padding-bottom:16px;border-bottom:2px solid #333;cursor:move;user-select:none;";
                fetchDialog.appendChild(title);

                // 已选文件清单
                const listBox = document.createElement("div");
                listBox.style.cssText = "max-height:92px;overflow:auto;background:#191a20;border:1px solid #3a3a3a;border-radius:8px;padding:8px 10px;font-size:12px;color:#c8cad6;line-height:1.5;margin-bottom:18px;";
                listBox.textContent = files.map(f => String(f).split(/[\\]/).pop()).join("、");
                fetchDialog.appendChild(listBox);

                // 固定全量下载，不再给选项；信息与 Lora-Manager 互通，LM 已有信息会自动复用
                const infoLine = document.createElement("div");
                infoLine.textContent = "将补全触发词与预览图，保存到 LoRA 同目录；与 LoRA Manager 互通，已有信息不会重复下载。";
                infoLine.style.cssText = "font-size:12px;color:#9aa0b5;line-height:1.6;background:#191a20;border:1px solid #3a3a3a;border-radius:6px;padding:8px 10px;margin-bottom:20px;";
                fetchDialog.appendChild(infoLine);

                // 进度行
                const statusLine = document.createElement("div");
                statusLine.style.cssText = "font-size:12px;color:#999;min-height:18px;margin-bottom:6px;";
                fetchDialog.appendChild(statusLine);

                // 按钮区
                const buttonContainer = document.createElement("div");
                buttonContainer.style.cssText = "display:flex;gap:12px;justify-content:flex-end;margin-top:12px;padding-top:20px;border-top:2px solid #2a2a2a;";

                const cancelFetchBtn = document.createElement("button");
                cancelFetchBtn.textContent = "取消";
                cancelFetchBtn.style.cssText = "padding:10px 24px;background:#3a3a3a;border:1px solid #555;color:#fff;border-radius:6px;cursor:pointer;font-size:14px;font-weight:500;transition:all 0.2s;";
                cancelFetchBtn.onmouseenter = () => { cancelFetchBtn.style.background = "#555"; };
                cancelFetchBtn.onmouseleave = () => { cancelFetchBtn.style.background = "#3a3a3a"; };

                const fetchConfirmBtn = document.createElement("button");
                fetchConfirmBtn.textContent = "开始加载";
                fetchConfirmBtn.style.cssText = "padding:10px 24px;background:#4CAF50;border:none;color:white;border-radius:6px;cursor:pointer;font-size:14px;font-weight:500;transition:all 0.2s;";

                buttonContainer.appendChild(cancelFetchBtn);
                buttonContainer.appendChild(fetchConfirmBtn);
                fetchDialog.appendChild(buttonContainer);

                const closeFetch = () => { try { document.body.removeChild(fetchOverlay); } catch (e) {} };
                cancelFetchBtn.onclick = closeFetch;

                for (const ev of ["pointerdown", "pointermove", "pointerup", "mousedown", "wheel", "keydown"]) {
                    fetchDialog.addEventListener(ev, (e) => e.stopPropagation(), ev === "wheel" ? { passive: false } : undefined);
                }
                fetchOverlay.appendChild(fetchDialog);
                document.body.appendChild(fetchOverlay);
                if (this.makeDialogDraggable) this.makeDialogDraggable(fetchDialog, title);

                fetchConfirmBtn.onclick = async () => {
                    const savePathMode = "same_dir";
                    const options = { download_txt: true, download_image: true };
                    let okCount = 0, failCount = 0, tagCount = 0, imgCount = 0;
                    const errs = [];
                    const findLora = (name) => {
                        const list = (this.loraData && this.loraData.loras) ? this.loraData.loras : [];
                        return list.find(l => l && l.name === name);
                    };
                    fetchConfirmBtn.disabled = true;
                    cancelFetchBtn.disabled = true;
                    fetchConfirmBtn.style.opacity = "0.6";
                    fetchConfirmBtn.textContent = "加载中...";
                    // 并发抓取（每条 LoRA 独立请求），显著缩短批量耗时
                    let doneCount = 0;
                    const runOne = async (f) => {
                        const short = String(f).split(/[\\]/).pop();
                        statusLine.textContent = `加载中 ${Math.min(doneCount + 1, files.length)}/${files.length}：${short}`;
                        try {
                            const response = await api.fetchApi('/malora/lora/fetch_metadata', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    lora_name: f,
                                    options: options,
                                    save_path_mode: savePathMode,
                                    overwrite: false,
                                    force_refresh: true,
                                })
                            });
                            const rj = await response.json();
                            if (!(response.ok || ['success','partial','skipped'].includes(rj && rj.status))) {
                                throw new Error((rj && rj.message) || ('HTTP ' + response.status));
                            }
                            // 用后端返回的 data 回填触发词
                            const v = rj && rj.data ? rj.data.triggerWords : "";
                            if (typeof v === "string" && v.trim()) {
                                const lo = findLora(f);
                                if (lo) mplSetTriggerWords(lo, v);
                                tagCount++;
                            }
                            mplBumpImage(f);
                            if (this.refreshLoraImageCache) this.refreshLoraImageCache(f);
                            imgCount++;
                            okCount++;
                        } catch (e) {
                            failCount++;
                            errs.push(`${short}: ${e.message}`);
                        } finally {
                            doneCount++;
                        }
                    };
                    let cursor = 0;
                    const worker = async () => {
                        while (cursor < files.length) {
                            const f = files[cursor++];
                            await runOne(f);
                        }
                    };
                    await Promise.all(Array.from({ length: Math.min(3, files.length) }, () => worker()));
                    statusLine.style.color = "#8b8d9b";
                    statusLine.textContent = `完成：处理 ${okCount} 个（触发词 ${tagCount} 个、预览 ${imgCount} 个），失败 ${failCount} 个`;
                    if (failCount) alert(`部分失败：` + String.fromCharCode(10) + errs.join(String.fromCharCode(10)));
                    await mplLoadExtraInfo(true);
                    if (this.renderEmbeddedList) this.renderEmbeddedList();
                    if (this.updateWidget) this.updateWidget();
                    // 「添加/替换 LoRA」窗口开着时立即重绘，让刚爬到的预览图马上显示
                    if (this._addLoraModal && this._addLoraModal.isConnected && this._refreshFileListFunc) {
                        try { await this._refreshFileListFunc(); } catch (e) { console.error(e); }
                    }
                    fetchConfirmBtn.disabled = false;
                    cancelFetchBtn.disabled = false;
                    fetchConfirmBtn.style.opacity = "1";
                    fetchConfirmBtn.textContent = "完成";
                    setTimeout(closeFetch, 700);
                };
            };

            nodeType.prototype.showBatchMetadataModal = function() {
                if (mplMetadataModal?.isConnected) {
                    mplMetadataModal.focus();
                    return;
                }
                const node = this;
                const state = { running: false, cancelRequested: false };
                const results = new Map();
                let localFiles = [];
                let metadata = {};
                let fieldStates = {};
                let sharedInfo = {};
                let visibleNames = [];
                const selected = new Set();
                let selectionTouched = false;
                let inventoryCheckboxes = [];
                let loadingFiles = true;
                let inventoryReady = false;
                let closed = false;
                let lastSettings = null;
                const el = (tag, text, className, parent) => {
                    const element = document.createElement(tag);
                    if (text) element.textContent = mplT(text);
                    if (className) element.className = className;
                    if (parent) parent.appendChild(element);
                    return element;
                };
                const dialog = el("div", "", "mpl-metadata-dialog");
                dialog.style.left = Math.max(20, (window.innerWidth - Math.min(820, window.innerWidth - 40)) / 2) + "px";
                dialog.style.top = Math.max(28, (window.innerHeight - Math.min(600, window.innerHeight - 56)) / 2) + "px";
                dialog.setAttribute("role", "dialog");
                dialog.setAttribute("aria-modal", "false");
                dialog.setAttribute("aria-label", mplT("LoRA 信息管理"));
                dialog.tabIndex = -1;
                const header = el("div", "", "mpl-metadata-header", dialog);
                const _hdrIcon = el("span", "", "mpl-metadata-header-icon", header);
                _hdrIcon.innerHTML = mplIcon("list", 16);
                _hdrIcon.style.cssText = "display:inline-flex;color:#6c8cff;";
                el("div", "LoRA 信息管理", "mpl-metadata-title", header);
                const headerCloseBtn = el("button", "×", "mpl-metadata-close", header);
                headerCloseBtn.type = "button";
                headerCloseBtn.setAttribute("aria-label", mplT("关闭"));
                headerCloseBtn.title = mplT("关闭");
                const body = el("div", "", "mpl-metadata-body", dialog);
                const filters = el("div", "", "mpl-metadata-filters", body);
                const filterRow = el("div", "", "mpl-metadata-filter-row", filters);
                const scopeRow = el("label", "", "mpl-metadata-field mpl-metadata-scope", filterRow);
                el("span", "下载范围", "", scopeRow);
                const scopeSelect = el("select", "", "", scopeRow);
                scopeSelect.setAttribute("aria-label", mplT("下载范围"));
                const addScope = (value, text, translate = true) => {
                    const option = el("option", "", "", scopeSelect);
                    option.value = value;
                    option.textContent = translate ? mplT(text) : text;
                };
                addScope("all", "全部本地 LoRA");
                addScope("node", "当前节点全部 LoRA（含禁用项）");
                (node.loraData?.folders || []).forEach((folder, index) => {
                    addScope(`folder:${index}`, `${mplT("节点文件夹：")}${folder.name}`, false);
                });
                scopeSelect.value = "all";
                const directoryRow = el("div", "", "mpl-metadata-field mpl-metadata-directory", filterRow);
                el("span", "本地目录", "", directoryRow);
                const directorySelect = el("select", "", "", directoryRow);
                directorySelect.setAttribute("aria-label", mplT("本地目录"));
                const recursiveLabel = el("label", "", "mpl-metadata-check", filterRow);
                const recursiveCheckbox = el("input", "", "", recursiveLabel);
                recursiveCheckbox.type = "checkbox";
                recursiveCheckbox.checked = true;
                recursiveCheckbox.setAttribute("aria-label", mplT("包含子目录"));
                el("span", "包含子目录", "", recursiveLabel);
                const searchRow = el("div", "", "mpl-metadata-filter-row mpl-metadata-search-row", filters);
                const search = el("input", "", "mpl-metadata-search", searchRow);
                search.type = "search";
                search.placeholder = mplT("搜索文件名、路径或标题…");
                search.setAttribute("aria-label", mplT("搜索文件名、路径或标题…"));
                const statusSelect = el("select", "", "mpl-metadata-status-filter", searchRow);
                statusSelect.setAttribute("aria-label", mplT("信息状态筛选"));
                for (const [value, label] of [["pending", "仅看待处理"], ["local_missing", "所有本地缺项"], ["not_found", "未找到来源"], ["all", "全部状态"]]) {
                    const option = el("option", label, "", statusSelect);
                    option.value = value;
                }
                statusSelect.value = "pending";
                const workspace = el("div", "", "mpl-metadata-workspace", body);
                const settingsPanel = el("div", "", "mpl-metadata-settings", workspace);
                const typeLabels = { download_txt: "触发词 (.txt)", download_image: "预览图像" };
                const fixedInfo = el("div", "触发词 (.txt) + 预览图像 固定全量下载；与 LoRA Manager 互通，已有信息不会重复下载。",
                    "mpl-metadata-hint", settingsPanel);
                fixedInfo.style.cssText = "font-size:12px;color:#9aa0b5;line-height:1.6;";
                const modeRow = el("label", "", "mpl-metadata-setting-group", settingsPanel);
                el("span", "处理方式", "mpl-metadata-caption", modeRow);
                const modeSelect = el("select", "", "", modeRow);
                modeSelect.setAttribute("aria-label", mplT("处理方式"));
                for (const [value, label] of [["missing", "补全所选信息"], ["recheck", "重新检查来源"], ["update", "更新已有信息"]]) {
                    const option = el("option", label, "", modeSelect);
                    option.value = value;
                }
                modeSelect.value = "missing";
                const modeHelp = el("div", "", "mpl-metadata-mode-help", settingsPanel);
                const library = el("div", "", "mpl-metadata-library", workspace);
                const sharedWarning = el("div", "", "mpl-metadata-warning", library);
                const selectionRow = el("div", "", "mpl-metadata-selection", library);
                const selectVisibleBtn = el("button", "选择当前可见项", "", selectionRow);
                const clearSelectionBtn = el("button", "清空选择", "", selectionRow);
                const refreshInventoryBtn = el("button", "刷新列表", "mpl-metadata-refresh", searchRow);
                [selectVisibleBtn, clearSelectionBtn, refreshInventoryBtn].forEach(button => { button.type = "button"; });
                const preflightRow = el("div", "", "mpl-metadata-counts", selectionRow);
                const preflightCounters = {};
                for (const [key, label] of [["scoped", "当前范围"], ["selected", "已勾选"], ["need", "将处理"], ["notFound", "未找到来源"], ["complete", "无需获取"], ["issues", "本地异常"]]) {
                    const stat = el("span", "", "", preflightRow);
                    el("span", label, "", stat);
                    preflightCounters[key] = el("span", "", "", stat);
                    preflightCounters[key].style.marginLeft = "4px";
                }
                el("div", "只有当前范围和筛选结果中勾选的 LoRA 会被处理。", "mpl-metadata-hint", library);
                const inventoryErrors = el("div", "", "mpl-metadata-warning", library);
                const inventoryWrap = el("div", "", "mpl-metadata-inventory", library);
                const inventoryTable = el("table", "", "mpl-metadata-table", inventoryWrap);
                const head = el("thead", "", "", inventoryTable);
                const headRow = el("tr", "", "", head);
                for (const [label, width] of [["选择", "42px"], ["LoRA 文件", ""], ["LoRA 信息", "96px"]]) {
                    const cell = el("th", label, "", headRow);
                    if (width) cell.style.width = width;
                }
                const inventoryBody = el("tbody", "", "", inventoryTable);
                const resultDetails = el("details", "", "mpl-metadata-results", library);
                el("summary", "处理结果", "", resultDetails);
                const stats = el("div", "", "mpl-metadata-stats", resultDetails);
                const resultList = el("div", "", "mpl-metadata-result-list", resultDetails);
                const progressPanel = el("div", "", "mpl-metadata-progress", dialog);
                const phase = el("div", "准备就绪", "mpl-metadata-progress-text", progressPanel);
                phase.setAttribute("aria-live", "polite");
                const progressRow = el("div", "", "mpl-metadata-progress-row", progressPanel);
                const progress = el("progress", "", "", progressRow);
                progress.max = 1;
                progress.value = 0;
                const progressCount = el("span", "", "mpl-metadata-progress-count", progressRow);
                progressCount.textContent = "0 / 0";
                const currentName = el("div", "", "mpl-metadata-current", progressPanel);
                const counters = {};
                const statusLabels = { success: "已补充", checked: "检查完成", reviewed: "已整理", restored: "已恢复", skipped: "已跳过", not_found: "未找到来源", partial: "部分完成", error: "失败" };
                const statusCounts = Object.fromEntries(Object.keys(statusLabels).map(status => [status, 0]));
                for (const [status, label] of Object.entries(statusLabels)) {
                    const stat = el("span", "", "", stats);
                    el("span", label, "", stat);
                    counters[status] = el("span", "", "", stat);
                    counters[status].style.marginLeft = "4px";
                    counters[status].textContent = "0";
                }
                const footer = el("div", "", "mpl-metadata-footer", dialog);
                const closeBtn = el("button", "关闭", "", footer);
                el("div", "", "mpl-metadata-footer-spacer", footer);
                const stopBtn = el("button", "停止后续下载", "", footer);
                const retryBtn = el("button", "重试当前范围失败项", "", footer);
                retryBtn.title = mplT("仅重试当前可见且勾选的失败项，沿用上次处理方式和失败字段。");
                const startBtn = el("button", "开始下载", "mpl-metadata-primary", footer);
                [closeBtn, stopBtn, retryBtn, startBtn].forEach(button => { button.type = "button"; });
                stopBtn.disabled = true;
                retryBtn.disabled = true;
                const readSettings = () => ({
                    download_txt: true,
                    download_image: true,
                    save_path: "same_dir",
                    overwrite: modeSelect.value === "update",
                    update_existing: modeSelect.value === "update",
                    force_refresh: ["update", "recheck"].includes(modeSelect.value),
                    local_action: ["adopt", "restore"].includes(modeSelect.value) ? modeSelect.value : null,
                });
                const isLocalAction = () => ["adopt", "restore"].includes(modeSelect.value);
                const scopeNames = () => mplCollectMetadataNames(node, scopeSelect.value, localFiles || []);
                const selectedNames = () => mplMetadataPreflight(visibleNames, selected, readSettings(), metadata, fieldStates).actionableNames;
                const retryNames = () => {
                    const visible = new Set(visibleNames.map(mplMetadataNameKey));
                    return Array.from(results.values()).filter(result => selected.has(mplMetadataNameKey(result.name)) && visible.has(mplMetadataNameKey(result.name)) && ["error", "partial"].includes(result.status)).map(result => result.name);
                };
                const updateControls = () => {
                    const busy = state.running || loadingFiles;
                    for (const control of [scopeSelect, modeSelect, directorySelect, recursiveCheckbox, search, statusSelect, selectVisibleBtn, clearSelectionBtn, refreshInventoryBtn]) control.disabled = busy;
                    inventoryCheckboxes.forEach(checkbox => { checkbox.disabled = busy; });
                    const preflight = mplMetadataPreflight(visibleNames, selected, readSettings(), metadata, fieldStates);
                    const hasSharedSelection = !isLocalAction() && mplMetadataHasSharedSelection(preflight.actionableNames, sharedInfo);
                    sharedWarning.textContent = hasSharedSelection ? mplT("选中项包含共享信息文件的同名模型，请每组只选择一个。") : "";
                    startBtn.disabled = busy || !inventoryReady || !preflight.need || hasSharedSelection;
                    retryBtn.disabled = busy || isLocalAction() || !lastSettings || !retryNames().length;
                    stopBtn.disabled = !state.running || state.cancelRequested || state.localReview;
                    closeBtn.disabled = state.running;
                    headerCloseBtn.disabled = state.running;
                    phase.title = phase.textContent;
                    for (const key of Object.keys(preflightCounters)) preflightCounters[key].textContent = loadingFiles ? "…" : String(preflight[key]);
                };
                const autoSelectPending = () => {
                    selected.clear();
                    for (const name of scopeNames()) {
                        const key = mplMetadataNameKey(name);
                        if (!mplMetadataNeeds(name, readSettings(), metadata, fieldStates)) continue;
                        if (!isLocalAction() && (sharedInfo[key] || []).some(sharedName => selected.has(mplMetadataNameKey(sharedName)))) continue;
                        selected.add(key);
                    }
                };
                const _invRenderToken = { n: 0 };
                const renderInventory = () => {
                    const _tok = ++_invRenderToken.n;
                    visibleNames = mplFilterMetadataNames(scopeNames(), {
                        directory: directorySelect.value,
                        recursive: recursiveCheckbox.checked,
                        search: search.value,
                        status: statusSelect.value,
                    }, readSettings(), metadata, fieldStates);
                    inventoryBody.replaceChildren();
                    inventoryCheckboxes = [];
                    const _labels = { present: "已有", missing: "待获取", unavailable: "未提供", not_found: "未匹配", error: "失败", invalid: "不可用", unsupported: "不支持", unresolved: "未提取", local_error: "读取异常", user_skipped: "已整理" };
                    const _typeLabels = { txt: "txt", image: "预览" };
                    let _i = 0;
                    const _buildRow = (name) => {
                        const key = mplMetadataNameKey(name);
                        const row = el("tr", "", "", null);
                        const selectCell = el("td", "", "", row);
                        const checkbox = el("input", "", "", selectCell);
                        checkbox.type = "checkbox";
                        checkbox.checked = selected.has(key);
                        checkbox.setAttribute("data-lora-name", name);
                        checkbox.setAttribute("aria-label", name);
                        checkbox.onchange = () => {
                            selectionTouched = true;
                            if (checkbox.checked) selected.add(key); else selected.delete(key);
                            updateControls();
                        };
                        inventoryCheckboxes.push(checkbox);
                        const nameCell = el("td", "", "mpl-metadata-file", row);
                        nameCell.title = name;
                        const parts = mplMetadataNameKey(name).split("/");
                        const fileName = el("div", "", "mpl-metadata-file-name", nameCell);
                        fileName.textContent = parts.pop();
                        const filePath = el("div", "", "mpl-metadata-file-path", nameCell);
                        filePath.textContent = parts.join("/") || mplT("根目录");
                        if (sharedInfo[key]?.length) filePath.title = `${mplT("共享信息文件：")}${sharedInfo[key].join(", ")}`;
                        // 只看 Lora Manager 是否已有完整信息
                        const hasLm = !!metadata[key]?.lm;
                        const infoCell = el("td", "", "", row);
                        const infoStatus = el("span", hasLm ? "已有" : "缺",
                            "mpl-metadata-status " + (hasLm ? "mpl-metadata-present" : "mpl-metadata-missing"), infoCell);
                        infoStatus.title = hasLm
                            ? mplT("Lora Manager 已有该模型的完整信息")
                            : mplT("Lora Manager 里还没有该模型的完整信息，需要下载");
                        return row;
                    };
                    // 分批渲染：首屏一批直接出，其余用 rAF 逐帧追加，避免大列表卡顿
                    const _BATCH = 100;
                    const _runBatch = () => {
                        if (_tok !== _invRenderToken.n) return;
                        const frag = document.createDocumentFragment();
                        const end = Math.min(_i + _BATCH, visibleNames.length);
                        for (; _i < end; _i++) frag.appendChild(_buildRow(visibleNames[_i]));
                        inventoryBody.appendChild(frag);
                        if (_i < visibleNames.length) requestAnimationFrame(_runBatch);
                        else if (!visibleNames.length) {
                            const row = el("tr", "", "", inventoryBody);
                            const cell = el("td", "暂无符合条件的 LoRA", "mpl-metadata-hint", row);
                            cell.style.textAlign = "center";
                            cell.style.padding = "20px";
                            cell.colSpan = 3;
                        }
                    };
                    if (!visibleNames.length) {
                        const row = el("tr", "", "", inventoryBody);
                        const cell = el("td", "暂无符合条件的 LoRA", "mpl-metadata-hint", row);
                        cell.style.textAlign = "center";
                        cell.style.padding = "20px";
                        cell.colSpan = 3;
                    } else {
                        _runBatch();
                    }
                    updateControls();
                };
                const saveSettings = () => {
                    if (!selectionTouched) autoSelectPending();
                    renderInventory();
                };
                scopeSelect.onchange = () => {
                    if (!selectionTouched) autoSelectPending();
                    renderInventory();
                };
                directorySelect.onchange = renderInventory;
                recursiveCheckbox.onchange = renderInventory;
                search.oninput = renderInventory;
                statusSelect.onchange = renderInventory;
                const updateModeHelp = () => {
                    const help = {
                        update: ["更新所选类型的现有信息文件（含 .txt）；节点权重和自定义触发词保持不变。", "覆盖所选信息文件，节点设置不变。"],
                        recheck: ["重查未提供、未匹配或未提取的所选字段，保留已有文件和节点设置。", "重查缺项，保留已有内容。"],
                        missing: ["补全未检查或获取失败的所选字段；已确认无内容的字段跳过，保留已有文件和节点设置。", "补全待处理项，已确认空值不重复获取。"],
                        adopt: ["将所选字段标记为用户已整理，普通补全跳过；不检查在线来源，可随时撤销。", "人工标记已整理，不联网。"],
                        restore: ["仅撤销所选字段的人工整理标记，恢复原来的补全判断；不会立即获取在线信息。", "撤销人工标记，不联网。"],
                    }[modeSelect.value];
                    modeHelp.title = mplT(help[0]);
                    modeHelp.textContent = mplT(help[1]);
                    startBtn.textContent = mplT(modeSelect.value === "adopt" ? "保存整理标记" : modeSelect.value === "restore" ? "恢复自动补全" : "开始下载");
                };
                modeSelect.onchange = () => {
                    statusSelect.value = modeSelect.value === "update" ? "all" : modeSelect.value === "recheck" ? "local_missing" : "pending";
                    if (!selectionTouched || isLocalAction()) autoSelectPending();
                    updateModeHelp();
                    renderInventory();
                };
                selectVisibleBtn.onclick = () => {
                    selectionTouched = true;
                    visibleNames.forEach(name => selected.add(mplMetadataNameKey(name)));
                    renderInventory();
                };
                clearSelectionBtn.onclick = () => {
                    selectionTouched = true;
                    selected.clear();
                    renderInventory();
                };
                const loadInventory = async (autoSelect = false, force = false) => {
                    loadingFiles = true;
                    if (!state.running) phase.textContent = mplT("正在读取本地 LoRA 列表…");
                    updateControls();
                    try {
                        const response = await api.fetchApi("/malora/lora/list?include_metadata=true" + (force ? "&force=1" : ""));
                        const data = await response.json();
                        if (!response.ok || data.error || !Array.isArray(data.files)) throw new Error(data.error || data.message || mplT("读取本地 LoRA 列表失败"));
                        if (closed) return;
                        localFiles = data.files;
                        metadata = Object.fromEntries(Object.entries(data.metadata || {}).map(([name, values]) => [mplMetadataNameKey(name), values]));
                        if (data.field_states) fieldStates = Object.fromEntries(Object.entries(data.field_states).map(([name, values]) => [mplMetadataNameKey(name), values]));
                        sharedInfo = Object.fromEntries(Object.entries(data.shared_info || {}).map(([name, group]) => [mplMetadataNameKey(name), group]));
                        inventoryReady = true;
                        mplSetLoraNameList(localFiles);
                        const oldDirectory = directorySelect.value;
                        directorySelect.replaceChildren();
                        for (const [value, label] of [["", "所有目录"], [".", "根目录"]]) {
                            const option = el("option", label, "", directorySelect);
                            option.value = value;
                        }
                        const directories = new Set();
                        for (const name of localFiles) {
                            const parts = mplMetadataNameKey(name).split("/").slice(0, -1);
                            for (let length = 1; length <= parts.length; length++) directories.add(parts.slice(0, length).join("/"));
                        }
                        for (const directory of [...directories].sort((a, b) => a.localeCompare(b))) {
                            const option = el("option", "", "", directorySelect);
                            option.value = directory;
                            option.textContent = directory;
                        }
                        // 记忆上次选中的目录：优先沿用本次会话已选，否则读 localStorage
                        let _savedDir = oldDirectory;
                        if (!_savedDir) {
                            try { _savedDir = localStorage.getItem("MA_META_DIR") || ""; } catch(e) {}
                        }
                        directorySelect.value = [...directorySelect.options].some(option => option.value === _savedDir) ? _savedDir : "";
                        try { localStorage.setItem("MA_META_DIR", directorySelect.value); } catch(e) {}
                        inventoryErrors.replaceChildren();
                        if (Array.isArray(data.errors) && data.errors.length) {
                            el("div", "清单读取异常", "", inventoryErrors);
                            for (const error of data.errors) {
                                const errorLine = el("div", "", "", inventoryErrors);
                                errorLine.textContent = `${error.path || ""}: ${error.error || ""}`;
                            }
                        }
                        if (data.record_warning) {
                            const warning = el("div", "", "", inventoryErrors);
                            warning.textContent = `${mplT("检查记录未保存：")}${data.record_warning}`;
                        }
                        if (autoSelect) autoSelectPending();
                        if (!state.running) phase.textContent = mplT("准备就绪");
                    } catch (error) {
                        inventoryErrors.textContent = `${mplT("读取本地 LoRA 列表失败")}: ${error.message}`;
                        if (!state.running) phase.textContent = mplT("读取本地 LoRA 列表失败");
                    } finally {
                        loadingFiles = false;
                        if (!closed) renderInventory();
                    }
                };
                // 记住用户选中的目录
                directorySelect.addEventListener("change", () => {
                    try { localStorage.setItem("MA_META_DIR", directorySelect.value); } catch(e) {}
                });
                refreshInventoryBtn.onclick = () => loadInventory(false, true);
                const resultRows = new Map();
                const updateResults = (result) => {
                    const key = mplMetadataNameKey(result.name);
                    const previous = results.get(key);
                    if (previous) statusCounts[previous.status]--;
                    statusCounts[result.status]++;
                    results.set(key, result);
                    let row = resultRows.get(key);
                    if (!row) {
                        row = el("div", "", "mpl-metadata-result", resultList);
                        resultRows.set(key, row);
                    }
                    row.replaceChildren();
                    const rowTitle = el("div", "", "mpl-metadata-result-title", row);
                    el("span", statusLabels[result.status], "mpl-metadata-result-status" + (["error", "partial"].includes(result.status) ? " mpl-metadata-result-status-error" : ""), rowTitle);
                    const name = el("span", "", "", rowTitle);
                    name.textContent = result.name;
                    const message = el("div", "", "mpl-metadata-result-message", row);
                    message.textContent = result.message || "";
                    if (result.unavailable?.length) {
                        const unavailable = el("div", "", "mpl-metadata-result-message", row);
                        const explanations = { unavailable: "来源未提供", not_found: "未找到来源", unsupported: "不支持", unresolved: "未提取" };
                        unavailable.textContent = result.unavailable.map(type => `${mplT(typeLabels[`download_${type}`] || type)}: ${mplT(explanations[result.field_states?.[type]?.state] || "来源未提供")}`).join("; ");
                    }
                    const failureDetails = mplMetadataFailureDetails(result, typeLabels)
                        .map(detail => `${mplT(detail.label)}: ${detail.reason}`);
                    if (failureDetails.length) {
                        const failure = el("div", "", "mpl-metadata-result-message mpl-metadata-result-status-error", row);
                        failure.textContent = `${mplT("失败原因：")}${failureDetails.join("; ")}`;
                    }
                    if (result.record_warning) {
                        const warning = el("div", "", "mpl-metadata-warning", row);
                        warning.textContent = `${mplT("检查记录未保存：")}${result.record_warning}`;
                    }
                    for (const status of Object.keys(counters)) {
                        counters[status].textContent = String(statusCounts[status]);
                    }
                    resultDetails.open = true;
                };
                const clearRunResults = () => {
                    results.clear();
                    resultRows.clear();
                    resultList.replaceChildren();
                    for (const status of Object.keys(counters)) {
                        statusCounts[status] = 0;
                        counters[status].textContent = "0";
                    }
                };
                const runLocalReview = async (names, runSettings) => {
                    if (state.running || loadingFiles || !names.length) return;
                    const reviewed = runSettings.local_action === "adopt";
                    const types = mplMetadataTypes(runSettings);
                    state.running = true;
                    state.localReview = true;
                    state.cancelRequested = false;
                    state.pauseResult = null;
                    lastSettings = null;
                    clearRunResults();
                    progress.max = names.length;
                    progress.value = 0;
                    progressCount.textContent = `0 / ${names.length}`;
                    phase.textContent = mplT(reviewed ? "正在保存整理标记…" : "正在恢复自动补全…");
                    updateControls();
                    try {
                        const response = await api.fetchApi("/malora/lora/local_metadata_review", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ lora_names: names, types, reviewed }),
                        });
                        const result = await response.json();
                        if (!["success", "partial", "error"].includes(result?.status) || !Array.isArray(result.updated) || !Array.isArray(result.errors)) {
                            throw new Error(result?.message || `${mplT("请求失败")} (${response.status})`);
                        }
                        const updated = new Set(result.updated.map(mplMetadataNameKey));
                        const errorsByName = new Map();
                        for (const error of result.errors) {
                            const key = mplMetadataNameKey(error.name);
                            const previous = errorsByName.get(key);
                            errorsByName.set(key, [previous, error.error || mplT("整理标记保存失败")].filter(Boolean).join("\n"));
                        }
                        let failed = 0;
                        for (const name of names) {
                            const key = mplMetadataNameKey(name);
                            const error = errorsByName.get(key) || (!updated.has(key) ? result.message || mplT("未收到此项的处理结果") : null);
                            if (error) {
                                failed++;
                                updateResults({ name, status: "error", message: error });
                            } else {
                                updateResults({ name, status: reviewed ? "reviewed" : "restored", message: mplT(reviewed ? "人工整理标记已保存，普通补全跳过所选缺项。" : "人工整理标记已撤销，未获取在线信息。") });
                            }
                        }
                        progress.value = names.length;
                        progressCount.textContent = `${names.length} / ${names.length}`;
                        await loadInventory(false, true);
                        phase.textContent = failed || result.errors.length || !response.ok || result.status === "error"
                            ? mplT("整理标记未全部完成，请查看结果。")
                            : mplT(reviewed ? "整理标记已保存。" : "已恢复自动补全，尚未获取在线信息。");
                    } catch (error) {
                        for (const name of names) updateResults({ name, status: "error", message: error.message || String(error) });
                        phase.textContent = `${mplT("整理标记处理失败：")}${error.message || String(error)}`;
                    } finally {
                        state.running = false;
                        state.localReview = false;
                        currentName.textContent = "";
                        updateControls();
                    }
                };
                const run = async (names, runSettings, clearResults) => {
                    if (state.running || loadingFiles || !names.length) return;
                    state.cancelRequested = false;
                    state.running = true;
                    lastSettings = { ...runSettings };
                    if (clearResults) clearRunResults();
                    phase.textContent = mplT("下载中…");
                    updateControls();
                    const changedNames = new Set();
                    const affectedNodes = new Set([node]);
                    const graphNodes = mplMetadataGraphNodes(node);
                    const referencesByName = new Map();
                    for (const target of graphNodes) {
                        for (const name of mplCollectMetadataNames(target)) {
                            const key = mplMetadataNameKey(name);
                            if (!referencesByName.has(key)) referencesByName.set(key, new Set());
                            referencesByName.get(key).add(target);
                        }
                    }
                    try {
                        await mplRunMetadataQueue(names, runSettings, state, ({ current, completed, total, result }) => {
                            currentName.textContent = current;
                            currentName.title = current;
                            progress.max = total;
                            progress.value = completed;
                            progressCount.textContent = `${completed} / ${total}`;
                            if (result) {
                                mplMergeMetadataFieldStates(result.name, result, metadata, fieldStates, result.requested_types);
                                // 空跑的「已跳过 / 无需重复处理」不写进结果列表，避免和补全结果混在一起
                                const noopSkipped = result.status === "skipped" && !result.saved?.length && !(result.data && result.data.triggerWords);
                                if (!noopSkipped) updateResults(result);
                                if (result.saved?.length || (result.data && result.data.triggerWords)) {
                                    changedNames.add(result.name);
                                    for (const target of referencesByName.get(mplMetadataNameKey(result.name)) || []) {
                                        mplApplyMetadataData(target, result.name, result.data);
                                        affectedNodes.add(target);
                                    }
                                }
                            }
                        }, metadata, fieldStates);
                        state.running = true;
                        if (changedNames.size) {
                            affectedNodes.forEach(target => target.updateWidget());
                            await loadLoraImageList();
                            for (const target of affectedNodes) {
                                target.renderEmbeddedList();
                                if (target._addLoraModal?.isConnected && target._refreshFileListFunc) await target._refreshFileListFunc();
                                changedNames.forEach(name => target.refreshLoraImageCache(name));
                            }
                        }
                        await loadInventory(false, true);
                        if (state.pauseResult) {
                            const retryAfter = state.pauseResult.retry_after;
                            const retryHint = retryAfter == null ? "" : ` ${mplT(/^\d+(\.\d+)?$/.test(String(retryAfter)) ? "重试等待秒数：" : "建议重试时间：")}${retryAfter}`;
                            phase.textContent = `${mplT("来源请求受限，已暂停后续处理：")}${state.pauseResult.message || mplT("请求失败")}${retryHint}`;
                        } else {
                            phase.textContent = mplT(state.cancelRequested ? "已停止，当前文件已处理完成。" : "信息检查与补全完成");
                        }
                    } catch (error) {
                        phase.textContent = `${mplT("下载任务失败")}: ${error.message}`;
                    } finally {
                        state.running = false;
                        currentName.textContent = "";
                        updateControls();
                    }
                };
                const startRun = (names, runSettings, clearResults) => {
                    const snapshot = names.filter(name => mplMetadataRequestedTypes(name, runSettings, metadata, fieldStates).length);
                    if (!snapshot.length) {
                        phase.textContent = mplT("所选信息无需处理。");
                        return;
                    }
                    if (runSettings.local_action) {
                        if (runSettings.local_action === "adopt") {
                            const prompt = [
                                `${mplT("所选 LoRA：")}${snapshot.length}`,
                                `${mplT("信息类型：")}${mplMetadataTypes(runSettings).map(type => mplT(typeLabels[`download_${type}`])).join(", ")}`,
                                mplT("人工确认所选缺项暂不在线补全，不检查来源。可用“恢复自动补全”撤销。"),
                            ].join("\n");
                            if (!confirm(prompt)) return;
                        }
                        return runLocalReview(snapshot, runSettings);
                    }
                    if (mplMetadataHasSharedSelection(snapshot, sharedInfo)) {
                        phase.textContent = mplT("选中项包含共享信息文件的同名模型，请每组只选择一个。");
                        return;
                    }
                    if (runSettings.overwrite) {
                        const types = [...new Set(snapshot.flatMap(name => mplMetadataRequestedTypes(name, runSettings, metadata, fieldStates)))];
                        const existingNames = snapshot.filter(name => mplMetadataRequestedTypes(name, runSettings, metadata, fieldStates).some(type => metadata[mplMetadataNameKey(name)]?.[type] || mplMetadataFieldState(name, type, metadata, fieldStates).state === "invalid"));
                        const existingCount = snapshot.reduce((count, name) => count + mplMetadataRequestedTypes(name, runSettings, metadata, fieldStates).filter(type => metadata[mplMetadataNameKey(name)]?.[type] || mplMetadataFieldState(name, type, metadata, fieldStates).state === "invalid").length, 0);
                        const prompt = [
                            mplT("更新已有信息确认"),
                            `${mplT("所选 LoRA：")}${snapshot.length}`,
                            `${mplT("将更新已有信息的 LoRA：")}${existingNames.length}`,
                            `${mplT("将更新的已有信息项：")}${existingCount}`,
                            `${mplT("信息类型：")}${types.map(type => type === "image" ? mplT("预览图像") : `.${type}`).join(", ")}`,
                            mplT("会覆盖所选模型的已有信息文件，节点权重和自定义触发词保持不变。"),
                        ].join("\n");
                        if (!confirm(prompt)) return;
                    }
                    return run(snapshot, runSettings, clearResults);
                };
                startBtn.onclick = () => {
                    saveSettings();
                    return startRun(selectedNames(), readSettings(), true);
                };
                retryBtn.onclick = () => {
                    if (!lastSettings || isLocalAction()) return;
                    const names = retryNames();
                    const retryTypes = {};
                    for (const name of names) {
                        const result = results.get(mplMetadataNameKey(name));
                        const failed = result?.failed;
                        retryTypes[mplMetadataNameKey(name)] = Array.isArray(failed) && failed.length ? failed : result?.requested_types || mplMetadataTypes(lastSettings || {});
                    }
                    return startRun(names, { ...lastSettings, retry_types: retryTypes }, false);
                };
                const stop = () => {
                    if (!state.running || state.localReview) return;
                    state.cancelRequested = true;
                    phase.textContent = mplT("正在停止：等待当前文件处理完成…");
                    updateControls();
                };
                stopBtn.onclick = stop;
                const close = () => {
                    if (state.running) { stop(); return; }
                    closed = true;
                    releaseDrag?.();
                    dialog.remove();
                    if (mplMetadataModal === dialog) mplMetadataModal = null;
                };
                const handleEsc = event => {
                    event.stopPropagation();
                    if (event.key === "Escape" && !closed) { event.preventDefault(); close(); }
                };
                closeBtn.onclick = close;
                headerCloseBtn.onclick = close;
                for (const eventName of ["pointerdown", "pointermove", "pointerup", "mousedown", "wheel"]) {
                    dialog.addEventListener(eventName, event => event.stopPropagation());
                }
                dialog.addEventListener("keydown", handleEsc);
                dialog.addEventListener("keyup", event => event.stopPropagation());
                header.addEventListener("mousedown", event => {
                    if (!event.target.closest("button")) dialog.focus();
                });
                document.body.appendChild(dialog);
                mplMetadataModal = dialog;
                const releaseDrag = node.makeDialogDraggable(dialog, header);
                updateModeHelp();
                updateControls();
                dialog.focus();
                return loadInventory(true);
            };

            nodeType.prototype.showFetchModal = function(lora, contentAreas, parentOverlay) {
                let fetching = false;

                // 创建遮罩层
                const fetchOverlay = document.createElement("div");
                fetchOverlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.7);
                    z-index: 10003;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                `;
                
                // 创建弹窗
                const fetchDialog = document.createElement("div");
                fetchDialog.setAttribute("data-magic-i18n", "manual");
                fetchDialog.style.cssText = `
                    background: #1e1e1e;
                    border: 1px solid #3a3a3a;
                    border-radius: 12px;
                    padding: 24px;
                    min-width: 500px;
                    max-width: 600px;
                    width: 90%;
                    box-shadow: 0 12px 40px rgba(0,0,0,0.9);
                    z-index: 10004;
                    position: relative;
                `;
                
                // 标题栏（可拖拽）
                const title = document.createElement("div");
                title.textContent = "爬取 LoRA 信息";
                title.style.cssText = `
                    font-size: 18px;
                    font-weight: 600;
                    color: #fff;
                    margin-bottom: 20px;
                    padding-bottom: 16px;
                    border-bottom: 2px solid #333;
                    cursor: move;
                    user-select: none;
                `;
                
                // 固定全量下载，不再给选项；信息与 Lora-Manager 互通，LM 已有信息会自动复用
                const infoLine = document.createElement("div");
                infoLine.textContent = "将补全触发词与预览图，保存到 LoRA 同目录；与 LoRA Manager 互通，已有信息不会重复下载。";
                infoLine.style.cssText = "font-size:12px;color:#9aa0b5;line-height:1.6;background:#191a20;border:1px solid #3a3a3a;border-radius:6px;padding:8px 10px;margin-bottom:20px;";

                // 按钮容器
                const buttonContainer = document.createElement("div");
                buttonContainer.style.cssText = `
                    display: flex;
                    gap: 12px;
                    justify-content: flex-end;
                    margin-top: 20px;
                    padding-top: 20px;
                    border-top: 2px solid #2a2a2a;
                `;
                
                // 取消按钮
                const cancelFetchBtn = document.createElement("button");
                cancelFetchBtn.textContent = "取消";
                cancelFetchBtn.style.cssText = `
                    padding: 10px 24px;
                    background: #3a3a3a;
                    border: 1px solid #555;
                    color: #fff;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    transition: all 0.2s;
                `;
                cancelFetchBtn.onclick = () => {
                    closeFetch();
                };
                cancelFetchBtn.onmouseenter = () => {
                    cancelFetchBtn.style.background = "#555";
                };
                cancelFetchBtn.onmouseleave = () => {
                    cancelFetchBtn.style.background = "#3a3a3a";
                };
                
                // 爬取按钮
                const fetchConfirmBtn = document.createElement("button");
                fetchConfirmBtn.textContent = "开始爬取";
                fetchConfirmBtn.style.cssText = `
                    padding: 10px 24px;
                    background: #4CAF50;
                    border: none;
                    color: white;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    transition: all 0.2s;
                `;
                fetchConfirmBtn.onclick = async () => {
                    fetching = true;
                    const controls = [cancelFetchBtn];
                    controls.forEach(control => { control.disabled = true; });
                    fetchConfirmBtn.disabled = true;
                    fetchConfirmBtn.textContent = "爬取中...";
                    const editors = ["triggerWords"].map((field, index) => ({ field, textarea: contentAreas[index]?.querySelector('textarea') }));
                    const editorValues = new Map(editors.map(({ field, textarea }) => [field, textarea?.value || ""]));
                    
                    try {
                        const options = { download_txt: true, download_image: true };
                        const savePathMode = "same_dir";
                        
                        const response = await api.fetchApi('/malora/lora/fetch_metadata', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                lora_name: lora.name,
                                options: options,
                                save_path_mode: savePathMode,
                                overwrite: false,
                                force_refresh: true,
                            })
                        });
                        
                        const result = await response.json();
                        
                        if (response.ok && ['success', 'partial', 'skipped', 'checked', 'empty', 'not_found'].includes(result.status)) {
                            // Fill empty editors only; retain saved content and edits made while fetching.
                            for (const { field, textarea } of editors) {
                                const value = result.data?.[field];
                                if (typeof value !== "string" || !value.trim()) continue;
                                const previous = editorValues.get(field);
                                if (textarea && (previous.trim() || textarea.value !== previous)) continue;
                                if (textarea) textarea.value = value;
                                if (!String(lora[field] || "").trim()) mplSetTriggerWords(lora, value);
                            }
                            
                            // 刷新全局图片列表缓存（类似参考代码的loadImageList）
                            await loadLoraImageList();
                            await mplLoadExtraInfo(true);
                            
                            // 刷新缓存（重新渲染列表）
                            this.renderEmbeddedList();
                            this.updateWidget();
                            
                            // 刷新所有显示该lora图片的地方
                            mplBumpImage(lora.name);
                            this.refreshLoraImageCache(lora.name);
                            
                            // 如果"添加Lora"窗口打开，重新获取文件列表并渲染
                            if (this._addLoraModal && this._addLoraModal.parentElement && this._refreshFileListFunc) {
                                // 调用refreshFileList函数重新获取文件列表并渲染
                                await this._refreshFileListFunc();
                            } else if (this._addLoraModal && this._addLoraModal.parentElement && this._renderContentFunc) {
                                // 如果没有refreshFileList，至少调用renderContent
                                this._renderContentFunc();
                            }
                            
                            fetching = false;
                            closeFetch();
                            const message = result.message || mplT(result.saved?.length ? "信息检查与补全完成" : "已检查，未新增信息。");
                            alert(message + (result.record_warning ? `\n${mplT("检查记录未保存：")}${result.record_warning}` : ""));
                        } else {
                            alert((result.message || mplT("爬取失败")) + (result.record_warning ? `\n${mplT("检查记录未保存：")}${result.record_warning}` : ""));
                        }
                    } catch (error) {
                        console.error("爬取元数据时出错:", error);
                        alert("爬取失败: " + error.message);
                    } finally {
                        fetching = false;
                        controls.forEach(control => { control.disabled = false; });
                        fetchConfirmBtn.disabled = false;
                        fetchConfirmBtn.textContent = mplT("开始爬取");
                    }
                };
                fetchConfirmBtn.onmouseenter = () => {
                    if (!fetchConfirmBtn.disabled) {
                        fetchConfirmBtn.style.background = "#5CBF60";
                    }
                };
                fetchConfirmBtn.onmouseleave = () => {
                    if (!fetchConfirmBtn.disabled) {
                        fetchConfirmBtn.style.background = "#4CAF50";
                    }
                };
                
                buttonContainer.appendChild(cancelFetchBtn);
                buttonContainer.appendChild(fetchConfirmBtn);
                
                // 阻止事件冒泡
                const stopProp = (e) => { e.stopPropagation(); };
                fetchDialog.addEventListener("pointerdown", stopProp);
                fetchDialog.addEventListener("pointermove", stopProp);
                fetchDialog.addEventListener("pointerup", stopProp);
                fetchDialog.addEventListener("mousedown", stopProp);
                
                // 点击遮罩层关闭
                fetchOverlay.onclick = (e) => {
                    if (e.target === fetchOverlay) {
                        closeFetch();
                    }
                };
                
                // ESC键关闭
                const handleEsc = (e) => {
                    if (e.key === "Escape") {
                        closeFetch();
                    }
                };
                const closeFetch = () => {
                    if (fetching) return;
                    fetchOverlay.remove();
                    document.removeEventListener("keydown", handleEsc);
                };
                document.addEventListener("keydown", handleEsc);
                
                // 组装弹窗
                fetchDialog.appendChild(title);
                fetchDialog.appendChild(infoLine);
                fetchDialog.appendChild(buttonContainer);
                fetchOverlay.appendChild(fetchDialog);
                document.body.appendChild(fetchOverlay);
                
                // 使弹窗可拖拽
                this.makeDialogDraggable(fetchDialog, title);
            };

            nodeType.prototype.refreshLoraImageCache = function(loraName) {
                // 生成时间戳来强制刷新缓存
                const timestamp = new Date().getTime();
                const safeName = encodeURIComponent(loraName);
                const newImageUrl = api.apiURL(`/malora/lora/image?name=${safeName}&t=${timestamp}`);
                
                // 刷新"添加Lora"窗口中的图片 - 直接查找所有卡片
                const allCards = document.querySelectorAll('[title]');
                allCards.forEach(card => {
                    const cardTitle = card.title || card.getAttribute('title');
                    if (cardTitle === loraName) {
                        const img = card.querySelector('img');
                        if (img) {
                            const imgBox = img.parentElement;
                            const spinner = imgBox ? imgBox.querySelector('.mpl-spinner') : null;
                            
                            // 显示加载状态
                            if (spinner) {
                                spinner.style.display = 'block';
                            }
                            img.style.opacity = "0";
                            
                            // 强制重新加载图片
                            const tempImg = new Image();
                            tempImg.onload = () => {
                                img.src = newImageUrl;
                                img.style.opacity = "1";
                                if (spinner) {
                                    spinner.remove();
                                }
                            };
                            tempImg.onerror = () => {
                                // 即使加载失败也更新URL，让浏览器重新尝试
                                img.src = newImageUrl;
                                if (spinner) {
                                    spinner.remove();
                                }
                            };
                            tempImg.src = newImageUrl;
                        }
                    }
                });
                
                // 刷新主节点列表中的预览图
                if (this.listContainer) {
                    const rows = this.listContainer.querySelectorAll('.mpl-lora-row');
                    rows.forEach(row => {
                        // 通过查找包含lora名称的元素来匹配
                        const nameElement = row.querySelector('.mpl-lora-name');
                        if (nameElement && (nameElement.textContent.includes(loraName.split(/[/\\]/).pop()) || nameElement.title === loraName)) {
                            // 如果该行有预览图，刷新它
                            const previewDiv = row.querySelector('.mpl-lora-preview');
                            if (previewDiv) {
                                const previewImg = previewDiv.querySelector('img');
                                if (previewImg) {
                                    previewImg.src = newImageUrl;
                                }
                            }
                        }
                    });
                }
                
                // 刷新所有显示该lora图片的img元素（通过查找包含lora名称的图片URL）
                const allImages = document.querySelectorAll('img');
                allImages.forEach(img => {
                    const imgSrc = img.src || '';
                    if (imgSrc.includes('/malora/lora/image')) {
                        // 提取name参数
                        const nameMatch = imgSrc.match(/[?&]name=([^&]+)/);
                        if (nameMatch) {
                            try {
                                const nameParam = decodeURIComponent(nameMatch[1]);
                                if (nameParam === loraName) {
                                    // 更新URL，添加或更新时间戳
                                    const baseUrl = imgSrc.split('&t=')[0].split('?t=')[0];
                                    const separator = baseUrl.includes('?') ? '&' : '?';
                                    img.src = baseUrl + separator + 't=' + timestamp;
                                }
                            } catch (e) {
                                // 如果解码失败，尝试简单匹配
                                if (imgSrc.includes(encodeURIComponent(loraName))) {
                                    const baseUrl = imgSrc.split('&t=')[0].split('?t=')[0];
                                    const separator = baseUrl.includes('?') ? '&' : '?';
                                    img.src = baseUrl + separator + 't=' + timestamp;
                                }
                            }
                        }
                    }
                });
            };

            nodeType.prototype.createLoraRow = function(lora, type, fIdx, lIdx) {
                // 确保lora对象有所有必需字段
                lora.enabled = mplLoraEnabled(lora);
                if (lora.weight === undefined || lora.weight === null) lora.weight = 1.0;
                if (!lora.tags) lora.tags = "";
                if (!lora.note) lora.note = "";
                if (!lora.triggerWords) lora.triggerWords = "";
                if (!lora.name) lora.name = "";
                
                const row = document.createElement("div");
                row.className = "mpl-lora-row";
                row.title = mplLoraEnabled(lora) ? "已启用：参与加载（点击整行停用）" : "未启用：不会参与加载（点击整行启用）";
                if (!mplLoraEnabled(lora)) row.classList.add("mpl-disabled");
                row.dataset.selected = "false";
                // 单条 LoRA 自定义选中色（独立固定模式才启用；跟随全局时忽略单条色）
                if (lora.colorMode !== "global" && lora.color && typeof lora.color === "object") {
                    if (lora.color.bg) row.style.setProperty("--lora-sel-bg", lora.color.bg);
                    if (lora.color.bar) {
                        row.style.setProperty("--lora-sel-bar", lora.color.bar);
                        row.style.setProperty("--lora-sel-border", lora.color.bar + "88");
                    }
                    if (lora.color.text) row.style.setProperty("--lora-sel-text", lora.color.text);
                }
                // 移除row的draggable，改为在空白区域和排序按钮上才允许拖拽
                row.draggable = false;
                
                // 创建一个可拖拽的空白区域（在name和noteInput之间）
                const dragArea = document.createElement("div");
                dragArea.className = "mpl-drag-area";
                dragArea.style.cssText = `
                    flex: 1;
                    min-width: 20px;
                    cursor: move;
                    user-select: none;
                `;
                dragArea.draggable = true;
                dragArea.ondragstart = (e) => {
                    mplClearLoraPreview();
                    const dragInfo = { type: 'sort', sourceType: type, sourceFIdx: fIdx, sourceLIdx: lIdx };
                    e.dataTransfer.setData("text/plain", JSON.stringify(dragInfo));
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("application/x-sort-drag", "true");
                    e.dataTransfer.setData("application/x-sort-source-type", type);
                    try { e.dataTransfer.setData("application/x-mpl-lora", JSON.stringify({ name: lora.name })); } catch (_) {}
                    this._currentSortDrag = dragInfo;
                    row.style.opacity = "0.3";
                };
                dragArea.ondragend = () => { 
                    row.style.opacity = mplLoraEnabled(lora) ? "1" : "0.5"; 
                };
                
                // 添加拖拽排序功能：拖拽到目标lora上方时插入
                row.ondragover = (e) => {
                    e.preventDefault();
                    // 检查是否是排序拖拽（通过节点级别的变量或自定义数据格式）
                    const isSortDrag = e.dataTransfer.types.includes("application/x-sort-drag") || this._currentSortDrag;
                    
                    if (isSortDrag) {
                        // 从节点级别读取拖拽信息（最可靠的方法）
                        const dragInfo = this._currentSortDrag;
                        if (!dragInfo) return;
                        
                        // 任意 lora（root/folder）拖到任意 lora 行都允许插入，显示橙色插入线
                        if (dragInfo.sourceLIdx !== undefined) {
                            const rect = row.getBoundingClientRect();
                            const mouseY = e.clientY - rect.top;
                            const isTopHalf = mouseY < rect.height / 2;
                            if (isTopHalf) {
                                row.style.borderTop = "2px dashed #FF9800";
                                row.style.borderBottom = "none";
                            } else {
                                row.style.borderBottom = "2px dashed #FF9800";
                                row.style.borderTop = "none";
                            }
                            return;
                        }
                        // 如果是文件夹排序到lora，不显示特效，直接返回
                        return;
                    }
                    
                    // 非排序拖拽：不显示特效（移动操作由文件夹的ondrop处理）
                    row.style.borderTop = "none";
                    row.style.borderBottom = "";
                };
                
                row.ondragleave = () => {
                    row.style.borderTop = "none";
                    row.style.borderBottom = "";
                    // 清除拖拽信息（如果拖拽离开）
                    // 注意：这里不清除_currentSortDrag，因为可能只是暂时离开，ondragend会清除
                };
                
                row.ondrop = (e) => {
                    e.preventDefault();
                    row.style.borderTop = "none";
                    row.style.borderBottom = "";
                    
                    try {
                        const dragData = e.dataTransfer.getData("text/plain");
                        if (!dragData) {
                            // 清除拖拽信息
                            this._currentSortDrag = null;
                            return;
                        }
                        
                        const data = JSON.parse(dragData);
                        // 清除拖拽信息
                        this._currentSortDrag = null;
                        
                        // 顶层拖拽（拖拽手柄）落到某一行：按落点精确插入，而不是追加到容器末尾
                        if (data.type === 'top' && typeof data.tok === 'string' && data.tok.startsWith('l:')) {
                            e.preventDefault();
                            e.stopPropagation();
                            const uid = data.tok.slice(2);
                            let srcArr = this.loraData.loras;
                            let srcIdx = (srcArr || []).findIndex(l => this._uidFor(l) === uid);
                            if (srcIdx < 0) {
                                srcArr = null;
                                for (const f of (this.loraData.folders || [])) {
                                    const i = (f.loras || []).findIndex(l => this._uidFor(l) === uid);
                                    if (i >= 0) { srcArr = f.loras; srcIdx = i; break; }
                                }
                            }
                            if (!srcArr || srcIdx < 0) return;
                            const targetArr = (type === 'folder') ? this.loraData.folders[fIdx].loras : this.loraData.loras;
                            if (!targetArr) return;
                            const rect = row.getBoundingClientRect();
                            const after = (e.clientY - rect.top) >= rect.height / 2;
                            const item = srcArr[srcIdx];
                            const fromRoot = (srcArr === this.loraData.loras);
                            srcArr.splice(srcIdx, 1);
                            if (srcArr === targetArr) {
                                let at = srcArr.indexOf(lora);
                                if (at < 0) at = srcArr.length;
                                srcArr.splice(after ? at + 1 : at, 0, item);
                            } else {
                                const idx = Math.max(0, Math.min(after ? lIdx + 1 : lIdx, targetArr.length));
                                targetArr.splice(idx, 0, item);
                            }
                            if (targetArr === this.loraData.loras) {
                                this._mplInsertLoraByToken(item, lora, after);
                            } else if (fromRoot) {
                                // 从根列表移入文件夹：不再占顶层位置
                                const tok = "l:" + this._uidFor(item);
                                const tl = this._topLayout || [];
                                const ti = tl.indexOf(tok);
                                if (ti >= 0) tl.splice(ti, 1);
                            }
                            if (type === 'folder' && this.loraData.folders[fIdx]) this.loraData.folders[fIdx].collapsed = false;
                            this._currentTopDrag = null;
                            this.renderEmbeddedList();
                            this.updateWidget();
                            return;
                        }

                        // 拖动群组标题空白处，落到散装行：按落点插到该行前/后
                        if (data.type === 'top' && typeof data.tok === 'string' && data.tok.startsWith('f:') && type === 'root') {
                            e.preventDefault();
                            e.stopPropagation();
                            const rect = row.getBoundingClientRect();
                            const after = (e.clientY - rect.top) >= rect.height / 2;
                            this._mplPlaceToken(data.tok, "l:" + this._uidFor(lora), after);
                            this._currentTopDrag = null;
                            this.renderEmbeddedList();
                            this.updateWidget();
                            return;
                        }

                        // 如果是排序拖拽
                        if (data.type === 'sort') {
                            e.stopPropagation();
                            // 统一排序/跨列表移动：任意 lora（root 或 folder）都能拖到任意 lora 行
                            if (data.sourceLIdx !== undefined && (data.sourceType === 'root' || data.sourceType === 'folder')) {
                                // 目标列表（当前行所在）
                                const targetLoras = (type === 'folder') ? this.loraData.folders[fIdx].loras : this.loraData.loras;
                                // 源列表
                                const srcLoras = (data.sourceType === 'folder') ? this.loraData.folders[data.sourceFIdx].loras : this.loraData.loras;
                                if (!srcLoras || !targetLoras) return;
                                const sourceIdx = data.sourceLIdx;
                                const targetIdx = lIdx;
                                // 同列表同位置，不处理
                                if (srcLoras === targetLoras && sourceIdx === targetIdx) return;

                                // 计算插入位置（上/下半区）
                                const rect = row.getBoundingClientRect();
                                const mouseY = e.clientY - rect.top;
                                const isTopHalf = mouseY < rect.height / 2;

                                // 取出要移动的项
                                const targetItem = targetLoras[targetIdx];
                                const movedItem = JSON.parse(JSON.stringify(srcLoras[sourceIdx]));
                                // 从源移除
                                srcLoras.splice(sourceIdx, 1);

                                if (srcLoras === targetLoras) {
                                    // 同一列表：调整插入索引
                                    let insertIdx;
                                    if (sourceIdx < targetIdx) {
                                        insertIdx = isTopHalf ? targetIdx - 1 : targetIdx;
                                    } else {
                                        insertIdx = isTopHalf ? targetIdx : targetIdx + 1;
                                    }
                                    insertIdx = Math.max(0, Math.min(insertIdx, targetLoras.length));
                                    targetLoras.splice(insertIdx, 0, movedItem);
                                    // 根列表的显示顺序由顶层布局决定，需同步位置
                                    if (targetLoras === this.loraData.loras && targetItem) {
                                        this._mplInsertLoraByToken(movedItem, targetItem, !isTopHalf);
                                    }
                                } else {
                                    // 跨列表：插入到目标位置，并同步顶层显示顺序
                                    let insertIdx = isTopHalf ? targetIdx : targetIdx + 1;
                                    insertIdx = Math.max(0, Math.min(insertIdx, targetLoras.length));
                                    targetLoras.splice(insertIdx, 0, movedItem);
                                    if (targetLoras === this.loraData.loras && targetItem) {
                                        this._mplInsertLoraByToken(movedItem, targetItem, !isTopHalf);
                                    } else if (srcLoras === this.loraData.loras) {
                                        const tok = "l:" + this._uidFor(movedItem);
                                        const tl = this._topLayout || [];
                                        const ti = tl.indexOf(tok);
                                        if (ti >= 0) tl.splice(ti, 1);
                                    }
                                }
                                this.renderEmbeddedList();
                                this.updateWidget();
                                return;
                            }
                            if (data.sourceType === type && 
                                (type === 'root' || (type === 'folder' && data.sourceFIdx === fIdx))) {
                                
                                const loras = type === 'folder' ? this.loraData.folders[fIdx].loras : this.loraData.loras;
                                const sourceIdx = data.sourceLIdx;
                                const targetIdx = lIdx;
                                
                                // 如果源和目标相同，不处理
                                if (sourceIdx === targetIdx) return;
                                
                                // 获取要移动的项（深拷贝）
                                const movedItem = JSON.parse(JSON.stringify(loras[sourceIdx]));
                                
                                // 计算鼠标位置，判断是向上还是向下插入
                                const rect = row.getBoundingClientRect();
                                const mouseY = e.clientY - rect.top;
                                const isTopHalf = mouseY < rect.height / 2;
                                
                                // 计算目标插入位置
                                let insertIdx;
                                if (sourceIdx < targetIdx) {
                                    // 向下移动：如果插入到上半部分，插入到targetIdx；如果插入到下半部分，插入到targetIdx+1
                                    insertIdx = isTopHalf ? targetIdx : targetIdx + 1;
                                } else {
                                    // 向上移动：如果插入到上半部分，插入到targetIdx；如果插入到下半部分，插入到targetIdx+1
                                    insertIdx = isTopHalf ? targetIdx : targetIdx + 1;
                                }
                                
                                // 先删除源项
                                loras.splice(sourceIdx, 1);
                                
                                // 如果删除后目标索引发生变化，需要调整
                                if (sourceIdx < targetIdx) {
                                    // 源在目标之前，删除后目标索引已经减1
                                    if (!isTopHalf) {
                                        insertIdx = targetIdx; // 向下插入，目标索引已减1
                                    } else {
                                        insertIdx = targetIdx - 1; // 向上插入
                                    }
                                } else {
                                    // 源在目标之后，删除后目标索引不变
                                    insertIdx = isTopHalf ? targetIdx : targetIdx + 1;
                                }
                                
                                // 确保索引有效
                                insertIdx = Math.max(0, Math.min(insertIdx, loras.length));
                                
                                // 插入到目标位置
                                loras.splice(insertIdx, 0, movedItem);
                                
                                this.renderEmbeddedList();
                                this.updateWidget();
                                return;
                            }
                            
                            // 不允许文件夹和lora之间互相排序，只允许同类型之间排序
                            return; // 排序拖拽处理完毕，不继续处理
                        }
                        
                        // 原有的拖拽到文件夹逻辑保持不变
                        // （这里会被文件夹的ondrop处理，所以不需要在这里处理）
                    } catch(err) {
                        console.error("拖拽排序错误:", err);
                    }
                };

                // 选中行 = 参与加载：高亮即 enabled，点行切换启用/停用
                const setSelected = (on) => {
                    row.dataset.selected = on ? "true" : "false";
                    if (on) row.classList.add("mpl-selected");
                    else row.classList.remove("mpl-selected");
                };
                // 同步初始高亮（渲染时若已启用）
                if (this._isMultiSelected(this.loraData, lora)) setSelected(true);

                // 点击 lora 行（非交互元素）切换是否加载
                row.onclick = (e) => {
                    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON' ||
                        e.target.classList.contains('mpl-mini-btn') ||
                        e.target.classList.contains('mpl-mini-input') ||
                        e.target.closest('.mpl-mini-btn') ||
                        e.target.closest('.mpl-mini-input') ||
                        e.target.closest('.mpl-lora-actions') ||
                        e.target === noteInput || e.target.closest('.mpl-mini-input') ||
                        e.target.closest('.mpl-trigger-btn') ||
                        e.target === weightContainer || e.target.closest('.mpl-weight-container')) {
                        return;
                    }
                    lora.enabled = !mplLoraEnabled(lora);
                    this.renderEmbeddedList();
                    this.updateWidget();
                };

                // 添加鼠标悬停事件：显示缩略图预览
                // 采用「全局单例浮层」管理：所有节点/所有行共享同一个 fixed 浮层，
                // 通过容器级 pointermove 检测是否已离开触发元素来关闭，
                // 不再依赖每行各自的 mouseleave（那会在重绘/拖拽/快速跨越时漏触发，
                // 导致 fixed 大图永久残留在 body 上盖住节点 —— 即“一张图铺满节点”的根因）。
                MA_LoraPreview.bindRowHover(row, lora);

                // 略缩图（放在 lora 最左侧），点击可打开预览
                const thumb = document.createElement("div");
                thumb.className = "mpl-lora-thumb";
                const thumbImg = document.createElement("img");
                const safeThumbName = encodeURIComponent(lora.name);
                thumbImg.loading = "lazy";
                thumbImg.src = api.apiURL(`/malora/lora/image?name=${safeThumbName}${mplBustSuffix(lora.name)}`);
                thumbImg.onerror = () => { thumb.classList.add("mpl-lora-thumb-empty"); thumbImg.remove(); };
                thumb.appendChild(thumbImg);
                thumb.title = lora.name;
                thumb.addEventListener("pointerdown", (e)=>e.stopPropagation());
                thumb.addEventListener("mousedown", (e)=>e.stopPropagation());

                // 箭头占位已去掉：行内排序拖拽由名字与空白区承担
                const name = document.createElement("div");
                name.className = "mpl-lora-name";
                // 提取文件名（隐藏路径），保留完整路径在title中
                const displayName = (lora.name.split(/[/\\]/).pop() || lora.name).replace(/\.(safetensors|ckpt|pt|pth|bin|gguf|onnx)$/i, "");
                name.textContent = displayName;
                name.dataset.lora = lora.name;
                mplDecorateName(name, lora.name);
                // name区域也可以拖拽
                name.draggable = true;
                name.style.cursor = "move";
                name.ondragstart = (e) => {
                    mplClearLoraPreview();
                    const info = { type: "sort", sourceType: type, sourceFIdx: fIdx, sourceLIdx: lIdx };
                    e.dataTransfer.setData("text/plain", JSON.stringify(info));
                    e.dataTransfer.setData("application/x-sort-drag", "true");
                    try { e.dataTransfer.setData("application/x-mpl-lora", JSON.stringify({ name: lora.name })); } catch (_) {}
                    e.dataTransfer.effectAllowed = "move";
                    this._currentSortDrag = info;
                    row.style.opacity = "0.3";
                };
                name.ondragend = () => { 
                    this._currentSortDrag = null;
                    row.style.opacity = mplLoraEnabled(lora) ? "1" : "0.5"; 
                };

                // 备注输入框
                if (!lora.note) lora.note = "";
                const noteInput = document.createElement("input");
                noteInput.type = "text";
                noteInput.className = "mpl-note-input";
                noteInput.value = lora.note || "";
                noteInput.placeholder = "备注...";
                noteInput.style.cssText = `
                    flex: 1;
                    min-width: 80px;
                    padding: 4px 8px;
                    background: #1a1a1a;
                    border: 1px solid #555;
                    border-radius: 3px;
                    color: #fff;
                    font-size: 12px;
                `;
                noteInput.onchange = () => {
                    const previous = lora.note || "";
                    lora.note = noteInput.value;
                    void mplSetNote(lora.name, lora.note, previous);
                    this.updateWidget();
                };
                noteInput.onblur = () => {
                    if (lora.note === noteInput.value) return;
                    const previous = lora.note || "";
                    lora.note = noteInput.value;
                    void mplSetNote(lora.name, lora.note, previous);
                    this.updateWidget();
                };
                noteInput.addEventListener("keydown", (e)=>e.stopPropagation());
                noteInput.addEventListener("pointerdown", (e)=>e.stopPropagation());
                noteInput.addEventListener("mousedown", (e)=>e.stopPropagation());

                let clipBadge = null;
                const refreshClipBadge = () => mplUpdateClipBadgeUI(clipBadge, lora);
                const syncClipWithWeight = () => {
                    mplSyncClipWeight(lora);
                    refreshClipBadge();
                };

                // 权重调节器（带左右箭头按钮）
                const weightContainer = document.createElement("div");
                weightContainer.className = "mpl-weight-container";
                weightContainer.style.cssText = `
                    display: flex;
                    align-items: center;
                    background: #333;
                    border-radius: 3px;
                    border: 1px solid #555;
                    overflow: hidden;
                `;
                
                // 左箭头按钮（减少）
                const decreaseBtn = document.createElement("button");
                decreaseBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
                decreaseBtn.style.cssText = `
                    width: 18px;
                    height: 18px;
                    background: #444;
                    border: none;
                    color: #ccc;
                    cursor: pointer;
                    font-size: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                `;
                decreaseBtn.onclick = (e) => {
                    e.stopPropagation();
                    lora.weight = Math.max(-10, parseFloat((lora.weight - 0.01).toFixed(2)));
                    syncClipWithWeight();
                    weightDisplay.textContent = lora.weight.toFixed(2);
                    this.updateWidget();
                };
                decreaseBtn.onmouseenter = () => decreaseBtn.style.background = "#555";
                decreaseBtn.onmouseleave = () => decreaseBtn.style.background = "#444";
                decreaseBtn.addEventListener("pointerdown", (e)=>e.stopPropagation());
                
                // 权重显示
                const weightDisplay = document.createElement("div");
                weightDisplay.className = "mpl-weight-display";
                weightDisplay.textContent = parseFloat(lora.weight).toFixed(2);
                weightDisplay.style.cssText = `
                    flex: 1 1 auto;
                    min-width: 45px;
                    padding: 2px 6px;
                    text-align: center;
                    color: #fff;
                    font-size: 11px;
                    user-select: none;
                    background: #2a2a2a;
                    height: 18px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                `;
                weightDisplay.onclick = (e) => {
                    e.stopPropagation();
                    const newVal = prompt("输入权重:", lora.weight);
                    if (newVal !== null) {
                        const numVal = parseFloat(newVal);
                        if (!isNaN(numVal)) {
                            lora.weight = Math.max(-10, Math.min(10, numVal));
                            syncClipWithWeight();
                            weightDisplay.textContent = lora.weight.toFixed(2);
                            this.updateWidget();
                        }
                    }
                };
                
                // 右箭头按钮（增加）
                const increaseBtn = document.createElement("button");
                increaseBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
                increaseBtn.style.cssText = `
                    width: 18px;
                    height: 18px;
                    background: #444;
                    border: none;
                    color: #ccc;
                    cursor: pointer;
                    font-size: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                `;
                increaseBtn.onclick = (e) => {
                    e.stopPropagation();
                    lora.weight = Math.min(10, parseFloat((lora.weight + 0.01).toFixed(2)));
                    syncClipWithWeight();
                    weightDisplay.textContent = lora.weight.toFixed(2);
                    this.updateWidget();
                };
                increaseBtn.onmouseenter = () => increaseBtn.style.background = "#555";
                increaseBtn.onmouseleave = () => increaseBtn.style.background = "#444";
                increaseBtn.addEventListener("pointerdown", (e)=>e.stopPropagation());
                
                weightContainer.appendChild(decreaseBtn);
                weightContainer.appendChild(weightDisplay);
                weightContainer.appendChild(increaseBtn);

                // ========== 滑条模式（追加在箭头模式之后） ==========
                const layoutCfg = this.layoutSettings || { weightStyle: "arrows" };
                if (layoutCfg.weightStyle === "slider") {
                    // 清空箭头模式的子元素
                    while (weightContainer.firstChild) weightContainer.removeChild(weightContainer.firstChild);

                    const sliderMin = layoutCfg.sliderMin ?? -2;
                    const sliderMax = layoutCfg.sliderMax ?? 2;
                    const sliderWidth = layoutCfg.sliderWidth ?? 110;
                    const sliderStep = layoutCfg.sliderStep ?? 0.05;
                    const showValue = layoutCfg.showWeightValue !== false;
                    const snapToZero = layoutCfg.snapToZero !== false;

                    // 给 weightContainer 设置固定宽度，防止被 row 的 flex 布局挤压
                    weightContainer.style.flexShrink = "0";
                    weightContainer.style.width = (sliderWidth + (showValue ? 46 : 0)) + "px";

                    // 滑条更新函数
                    const applySliderWeight = (newVal) => {
                        const clamped = Math.max(sliderMin, Math.min(sliderMax, newVal));
                        lora.weight = parseFloat(clamped.toFixed(2));
                        syncClipWithWeight();
                        updateSliderUI();
                        this.updateWidget();
                    };

                    // 滑条轨道
                    const track = document.createElement("div");
                    track.style.cssText = `
                        position: relative;
                        flex: 1 1 0;
                        min-width: 0;
                        height: 20px;
                        background: transparent;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        padding: 0 7px;
                        box-sizing: border-box;
                    `;

                    const rail = document.createElement("div");
                    rail.style.cssText = `
                        position: absolute;
                        left: 7px;
                        right: 7px;
                        top: 50%;
                        height: 4px;
                        transform: translateY(-50%);
                        background: #31343f;
                        border-radius: 3px;
                        pointer-events: none;
                    `;
                    track.appendChild(rail);

                    const zeroLine = document.createElement("div");
                    zeroLine.style.cssText = `
                        position: absolute;
                        left: 50%;
                        top: 5px;
                        bottom: 5px;
                        width: 1px;
                        background: #4a4e5c;
                        pointer-events: none;
                    `;
                    track.appendChild(zeroLine);

                    const fill = document.createElement("div");
                    fill.style.cssText = `
                        position: absolute;
                        top: 8px;
                        height: 4px;
                        background: linear-gradient(90deg,#6c8cff,#8fa6ff);
                        border-radius: 3px;
                        pointer-events: none;
                    `;
                    track.appendChild(fill);

                    const thumb = document.createElement("div");
                    thumb.style.cssText = `
                        position: absolute;
                        top: 50%;
                        width: 12px;
                        height: 16px;
                        background: #e8ecff;
                        border: 1px solid #6c8cff;
                        border-radius: 5px;
                        transform: translate(-50%, -50%);
                        cursor: grab;
                        pointer-events: none;
                        box-shadow: 0 1px 4px rgba(0,0,0,0.55), 0 0 0 2px rgba(108,140,255,0.18);
                    `;
                    track.appendChild(thumb);

                    const valueDisplay = document.createElement("div");
                    valueDisplay.className = "mpl-weight-display";
                    valueDisplay.textContent = parseFloat(lora.weight).toFixed(2);
                    valueDisplay.style.cssText = `
                        min-width: 40px;
                        padding: 2px 5px;
                        text-align: center;
                        color: #e3e7f5;
                        font-size: 11.5px;
                        user-select: none;
                        background: transparent;
                        font-variant-numeric: tabular-nums;
                        height: 20px;
                        display: ${showValue ? "flex" : "none"};
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        border-left: 1px solid #444;
                        flex-shrink: 0;
                    `;
                    valueDisplay.onclick = (e) => {
                        e.stopPropagation();
                        const newVal = prompt("输入权重:", lora.weight);
                        if (newVal !== null) {
                            const numVal = parseFloat(newVal);
                            if (!isNaN(numVal)) {
                                applySliderWeight(numVal);
                            }
                        }
                    };

                    const valueToPercent = (v) => {
                        const range = sliderMax - sliderMin;
                        if (range === 0) return 50;
                        return ((v - sliderMin) / range) * 100;
                    };
                    const percentToValue = (pct) => {
                        const range = sliderMax - sliderMin;
                        return sliderMin + (pct / 100) * range;
                    };

                    const updateSliderUI = () => {
                        const pct = Math.max(0, Math.min(100, valueToPercent(lora.weight)));
                        thumb.style.left = pct + "%";
                        if (lora.weight >= 0) {
                            fill.style.left = "50%";
                            fill.style.width = (pct - 50) + "%";
                            fill.style.background = "linear-gradient(90deg,#6c8cff,#8fa6ff)";
                        } else {
                            fill.style.left = pct + "%";
                            fill.style.width = (50 - pct) + "%";
                            fill.style.background = "linear-gradient(90deg,#ff9aa8,#ef6b7d)";
                        }
                        valueDisplay.textContent = lora.weight.toFixed(2);
                    };

                    let isDragging = false;
                    const onPointerMove = (e) => {
                        if (!isDragging) return;
                        const rect = track.getBoundingClientRect();
                        const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                        let newVal = percentToValue(pct);
                        if (snapToZero && Math.abs(newVal) < 0.02) newVal = 0;
                        newVal = Math.round(newVal / sliderStep) * sliderStep;
                        applySliderWeight(newVal);
                    };
                    const onPointerUp = () => {
                        isDragging = false;
                        document.removeEventListener("pointermove", onPointerMove);
                        document.removeEventListener("pointerup", onPointerUp);
                    };

                    track.addEventListener("pointerdown", (e) => {
                        e.stopPropagation();
                        isDragging = true;
                        const rect = track.getBoundingClientRect();
                        const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                        let newVal = percentToValue(pct);
                        if (snapToZero && Math.abs(newVal) < 0.02) newVal = 0;
                        newVal = Math.round(newVal / sliderStep) * sliderStep;
                        applySliderWeight(newVal);
                        document.addEventListener("pointermove", onPointerMove);
                        document.addEventListener("pointerup", onPointerUp);
                    });

                    track.addEventListener("wheel", (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const delta = e.deltaY > 0 ? -sliderStep : sliderStep;
                        applySliderWeight(lora.weight + delta);
                    }, { passive: false });

                    weightContainer.appendChild(track);
                    weightContainer.appendChild(valueDisplay);
                    updateSliderUI();
                }

                // 触发词按钮：独立开关，只控制触发词是否输出，不影响 LoRA 是否加载
                const tagBtn = document.createElement("button");
                tagBtn.className = "mpl-trigger-btn";
                const _trigText = (lora.tags || "").trim();
                const _trigOn = lora.triggerEnabled !== false;
                if (_trigText) {
                    tagBtn.textContent = _trigText.length > 12 ? _trigText.slice(0, 12) + "…" : _trigText;
                    tagBtn.title = (_trigOn ? "【触发词开】" : "【触发词关】") + _trigText + "\n单击切换触发词开/关";
                } else {
                    // 没有触发词时留空框占位，不显示「触发词」文字；爬取到信息后自动同步
                    tagBtn.textContent = "";
                    tagBtn.classList.add("mpl-trigger-empty");
                    tagBtn.title = "暂无触发词（爬取信息后自动同步）\n单击切换开/关";
                }
                if (!_trigOn) tagBtn.classList.add("mpl-trigger-off");
                tagBtn.onclick = (e) => {
                    e.stopPropagation();
                    lora.triggerEnabled = (lora.triggerEnabled === false);
                    this.renderEmbeddedList();
                    this.updateWidget();
                };
                tagBtn.addEventListener("pointerdown", (e)=>e.stopPropagation());

                // 编辑按钮（蓝色背景，铅笔图标）
                const editBtn = document.createElement("button");
                editBtn.className = "mpl-mini-btn edit";
                editBtn.innerHTML = mplIcon("edit", 13);
                editBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.showLoraEditModal(lora, type, fIdx, lIdx);
                };
                editBtn.addEventListener("pointerdown", (e)=>e.stopPropagation());

                const del = document.createElement("button");
                del.className = "mpl-mini-btn del";
                del.innerHTML = mplIcon("close", 13);
                del.addEventListener("pointerdown", (e)=>e.stopPropagation());
                
                // 阻止在交互元素上拖拽
                const preventDrag = (e) => {
                    e.stopPropagation();
                    if (e.target === noteInput || 
                        e.target === weightContainer || e.target.closest('.mpl-weight-container') ||
                        e.target === clipBadge || e.target === tagBtn || e.target === editBtn || e.target === del ||
                        (typeof decreaseBtn !== 'undefined' && e.target === decreaseBtn) || (typeof increaseBtn !== 'undefined' && e.target === increaseBtn) || (typeof weightDisplay !== 'undefined' && e.target === weightDisplay)) {
                        e.preventDefault();
                        return false;
                    }
                };
                
                // 为交互元素添加阻止拖拽的事件
                noteInput.addEventListener("dragstart", preventDrag);
                weightContainer.addEventListener("dragstart", preventDrag);
                tagBtn.addEventListener("dragstart", preventDrag);
                editBtn.addEventListener("dragstart", preventDrag);
                del.addEventListener("dragstart", preventDrag);

                // CLIP 权重默认跟随模型权重；右键切换自定义/跟随
                mplSyncClipWeight(lora);
                clipBadge = document.createElement("div");
                clipBadge.className = "mpl-lora-clip-weight";
                mplUpdateClipBadgeUI(clipBadge, lora);
                clipBadge.onclick = (e) => {
                    e.stopPropagation();
                    const v = prompt("输入自定义 CLIP 权重：", lora.clipWeight);
                    if (v !== null && mplSetCustomClipWeight(lora, v)) {
                        refreshClipBadge();
                        this.updateWidget();
                    }
                };
                clipBadge.oncontextmenu = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    mplToggleClipFollow(lora);
                    refreshClipBadge();
                    this.updateWidget();
                };
                clipBadge.addEventListener("pointerdown", e => e.stopPropagation());
                clipBadge.addEventListener("mousedown", e => e.stopPropagation());
                clipBadge.addEventListener("dragstart", preventDrag);

                // 操作按钮组
                const actions = document.createElement("div");
                actions.className = "mpl-lora-actions";
                actions.append(tagBtn, editBtn, del);

                row.append(thumb, name, dragArea, noteInput, weightContainer, ...(clipBadge ? [clipBadge] : []), actions);

                // 右键上下文菜单：替换 LoRA / 复制 / 组成文件夹 / 爬取信息 / 颜色 / 删除
                row.oncontextmenu = (e) => {
                    // 若在输入框上右键，保留系统菜单
                    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                    e.preventDefault();
                    e.stopPropagation();
                    this.showLoraRowContextMenu(lora, type, fIdx, lIdx, e.clientX, e.clientY);
                };
                return row;
            };

            // LoRA 颜色设置弹窗（合并：本条颜色 + 全局颜色；单独色优先）
            nodeType.prototype.showLoraColorModal = function(lora) {
                const old = document.querySelector('.mpl-lora-color-overlay');
                if (old) old.remove();
                const DEF = { bg: "#2b3b5e", bar: "#6c8cff", text: "#eef1ff" };
                const overlay = document.createElement("div");
                overlay.className = "mpl-lora-color-overlay";
                overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:10040;display:flex;align-items:center;justify-content:center;";
                const dlg = document.createElement("div");
                dlg.style.cssText = "background:#1e1e1e;border:1px solid #3b3c46;border-radius:12px;padding:18px 20px;min-width:340px;color:#ddd;font-size:13px;box-shadow:0 12px 40px rgba(0,0,0,0.6);";
                const title = document.createElement("div");
                title.textContent = "颜色设置：" + (lora.name || "");
                title.style.cssText = "font-size:14px;font-weight:600;color:#fff;margin-bottom:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:380px;";
                dlg.appendChild(title);

                const cs = this.colorSettings || {};
                const gcur = {
                    bg: cs.selectBg || DEF.bg,
                    bar: cs.selectBar || DEF.bar,
                    text: cs.selectText || DEF.text,
                };
                const hasLocal = !!(lora.color && typeof lora.color === "object");
                const lcur = {
                    bg: (hasLocal && lora.color.bg) || gcur.bg,
                    bar: (hasLocal && lora.color.bar) || gcur.bar,
                    text: (hasLocal && lora.color.text) || gcur.text,
                };
                // 未显式记录过模式的旧数据，按「是否已有单条色」推断
                const initialMode = lora.colorMode || (hasLocal ? "custom" : "global");

                const section = (text, hint) => {
                    const s = document.createElement("div");
                    s.style.cssText = "border:1px solid #383a44;border-radius:8px;padding:10px 12px;margin-bottom:12px;background:#242530;";
                    const h = document.createElement("div");
                    h.textContent = text;
                    h.style.cssText = "font-size:13px;font-weight:600;color:#dfe3ff;margin-bottom:8px;";
                    s.appendChild(h);
                    if (hint) {
                        const p = document.createElement("div");
                        p.textContent = hint;
                        p.style.cssText = "font-size:11px;color:#8b8d9b;margin-bottom:8px;";
                        s.appendChild(p);
                    }
                    dlg.appendChild(s);
                    return s;
                };
                const mkRow = (parent, label, val) => {
                    const w = document.createElement("div");
                    w.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:8px;";
                    const l = document.createElement("div");
                    l.textContent = label;
                    l.style.cssText = "color:#ccc;min-width:100px;font-size:12px;";
                    const inp = document.createElement("input");
                    inp.type = "color"; inp.value = val;
                    inp.style.cssText = "width:44px;height:26px;border:1px solid #444;border-radius:5px;background:#2a2a2a;cursor:pointer;";
                    w.appendChild(l); w.appendChild(inp); parent.appendChild(w);
                    return inp;
                };

                // 本条 LoRA 颜色：开关放在区顶部，先声明回调（点击时才访问后面的色块）
                const localSec = section("本条 LoRA 颜色", "选择颜色来源后，下方色块用于「独立固定」模式");
                let applyLoraMode = () => {};
                const modeSwitch = mplColorModeSwitch(localSec, initialMode, (mode) => applyLoraMode(mode));
                const lbg = mkRow(localSec, "选中背景色", lcur.bg);
                const lbar = mkRow(localSec, "左侧色条", lcur.bar);
                const ltext = mkRow(localSec, "文字色", lcur.text);

                const preview = document.createElement("div");
                preview.style.cssText = "padding:7px 9px;border-radius:8px;font-size:12px;font-weight:600;margin:0 0 12px;";
                const renderPreview = () => {
                    preview.style.background = lbg.value;
                    preview.style.borderLeft = "3px solid " + lbar.value;
                    preview.style.color = ltext.value;
                    preview.textContent = "示例 LoRA 行（选中状态）";
                };
                [lbg, lbar, ltext].forEach(i => i.addEventListener("input", renderPreview));
                renderPreview();
                dlg.appendChild(preview);

                // 全局默认颜色
                const globalSec = section("全局默认颜色", "跟随全局的 LoRA 使用此颜色；改动会同步到所有跟随全局的条目");
                const gbg = mkRow(globalSec, "选中背景色", gcur.bg);
                const gbar = mkRow(globalSec, "左侧色条", gcur.bar);
                const gtext = mkRow(globalSec, "文字色", gcur.text);

                // 模式切换：跟随全局时禁用本条色块并跟随全局值；独立固定时启用本条色块
                applyLoraMode = (mode) => {
                    const follow = mode === "global";
                    if (follow) {
                        lbg.value = gbg.value; lbar.value = gbar.value; ltext.value = gtext.value;
                    }
                    [lbg, lbar, ltext].forEach(i => { i.disabled = follow; i.style.opacity = follow ? "0.45" : "1"; });
                    renderPreview();
                };
                applyLoraMode(modeSwitch.getMode());
                // 跟随全局时，改全局色块，本条预览跟着变
                [gbg, gbar, gtext].forEach(i => i.addEventListener("input", () => {
                    if (modeSwitch.getMode() !== "global") return;
                    lbg.value = gbg.value; lbar.value = gbar.value; ltext.value = gtext.value;
                    renderPreview();
                }));

                const btnRow = document.createElement("div");
                btnRow.style.cssText = "display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;";
                const clearBtn = document.createElement("button");
                clearBtn.textContent = "清除本条色";
                clearBtn.style.cssText = "padding:6px 12px;background:#3a3a3a;border:1px solid #555;color:#ddd;border-radius:6px;cursor:pointer;margin-right:auto;";
                clearBtn.onclick = () => {
                    delete lora.color;
                    lora.colorMode = "global";
                    this.renderEmbeddedList(); this.updateWidget();
                    overlay.remove();
                };
                const resetBtn = document.createElement("button");
                resetBtn.textContent = "恢复默认颜色";
                resetBtn.style.cssText = "padding:6px 12px;background:#3a3a3a;border:1px solid #555;color:#ddd;border-radius:6px;cursor:pointer;";
                resetBtn.onclick = () => {
                    gbg.value = DEF.bg; gbar.value = DEF.bar; gtext.value = DEF.text;
                    if (modeSwitch.getMode() === "global") {
                        lbg.value = DEF.bg; lbar.value = DEF.bar; ltext.value = DEF.text;
                        renderPreview();
                    }
                };
                const cancelBtn = document.createElement("button");
                cancelBtn.textContent = "取消";
                cancelBtn.style.cssText = "padding:6px 14px;background:#3a3a3a;border:1px solid #555;color:#ddd;border-radius:6px;cursor:pointer;";
                cancelBtn.onclick = () => overlay.remove();
                const okBtn = document.createElement("button");
                okBtn.textContent = "确定";
                okBtn.style.cssText = "padding:6px 14px;background:#6c8cff;border:none;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;";
                okBtn.onclick = () => {
                    // 模式持久化到对象：跟随全局则不存单条色，独立固定则写入本条色
                    const mode = modeSwitch.getMode();
                    lora.colorMode = mode;
                    if (mode === "custom") {
                        lora.color = { bg: lbg.value, bar: lbar.value, text: ltext.value };
                    } else {
                        delete lora.color;
                    }
                    // 全局色
                    this.colorSettings = { selectBg: gbg.value, selectBar: gbar.value, selectText: gtext.value };
                    this.properties["color_settings"] = this.colorSettings;
                    this.renderEmbeddedList(); this.updateWidget();
                    this.applyColorSettings?.();
                    this.setDirtyCanvas?.(true, true);
                    overlay.remove();
                };
                btnRow.appendChild(clearBtn); btnRow.appendChild(resetBtn); btnRow.appendChild(cancelBtn); btnRow.appendChild(okBtn);
                dlg.appendChild(btnRow);
                overlay.appendChild(dlg);
                overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
                document.body.appendChild(overlay);
            };

            // 文件夹颜色设置弹窗：外文件夹颜色(卡片背景) / 里文件夹颜色(标题栏背景) / 左侧色条，均有单独与全局
            nodeType.prototype.showFolderColorModal = function(folder, fDiv) {
                const old = document.querySelector('.mpl-folder-color-overlay');
                if (old) old.remove();
                const DEF = { outer: "#23252e", inner: "#2c2e3a", bar: "#6c8cff" };
                const overlay = document.createElement("div");
                overlay.className = "mpl-folder-color-overlay";
                overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:10040;display:flex;align-items:center;justify-content:center;";
                const dlg = document.createElement("div");
                dlg.style.cssText = "background:#1e1e1e;border:1px solid #3b3c46;border-radius:12px;padding:18px 20px;min-width:360px;color:#ddd;font-size:13px;box-shadow:0 12px 40px rgba(0,0,0,0.6);";
                const title = document.createElement("div");
                title.textContent = "文件夹颜色设置：" + (folder.name || "");
                title.style.cssText = "font-size:14px;font-weight:600;color:#fff;margin-bottom:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:400px;";
                dlg.appendChild(title);

                const gcs = this.folderColorSettings || {};
                const gcur = {
                    outer: gcs.outer || "",
                    inner: gcs.inner || "",
                    bar: gcs.bar || "",
                };
                const hasLocal = !!(folder.color || folder.bgColor || folder.headBg);
                const lcur = {
                    outer: folder.bgColor || gcur.outer || DEF.outer,
                    inner: folder.headBg || gcur.inner || DEF.inner,
                    bar: folder.color || gcur.bar || DEF.bar,
                };
                // 未显式记录过模式的旧数据，按「是否已有单条色」推断
                const initialMode = folder.colorMode || (hasLocal ? "custom" : "global");

                const section = (text, hint) => {
                    const s = document.createElement("div");
                    s.style.cssText = "border:1px solid #383a44;border-radius:8px;padding:10px 12px;margin-bottom:12px;background:#242530;";
                    const h = document.createElement("div");
                    h.textContent = text;
                    h.style.cssText = "font-size:13px;font-weight:600;color:#dfe3ff;margin-bottom:8px;";
                    s.appendChild(h);
                    if (hint) {
                        const p = document.createElement("div");
                        p.textContent = hint;
                        p.style.cssText = "font-size:11px;color:#8b8d9b;margin-bottom:8px;";
                        s.appendChild(p);
                    }
                    dlg.appendChild(s);
                    return s;
                };
                const mkRow = (parent, label, val) => {
                    const w = document.createElement("div");
                    w.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:8px;";
                    const l = document.createElement("div");
                    l.textContent = label;
                    l.style.cssText = "color:#ccc;min-width:120px;font-size:12px;";
                    const inp = document.createElement("input");
                    inp.type = "color"; inp.value = val;
                    inp.style.cssText = "width:44px;height:26px;border:1px solid #444;border-radius:5px;background:#2a2a2a;cursor:pointer;";
                    const clearBtn = document.createElement("span");
                    clearBtn.textContent = "✕";
                    clearBtn.title = "清除此项单独颜色（回退全局）";
                    clearBtn.style.cssText = "cursor:pointer;color:#8b8d9b;font-size:12px;padding:0 4px;";
                    w.appendChild(l); w.appendChild(inp); w.appendChild(clearBtn); parent.appendChild(w);
                    inp.__clearBtn = clearBtn;
                    clearBtn.onclick = () => { inp.dataset.cleared = "1"; };
                    inp.addEventListener("input", () => { delete inp.dataset.cleared; });
                    return inp;
                };

                const localSec = section("本条文件夹颜色", "选择颜色来源后，下方色块用于「独立固定」模式");
                let applyFolderMode = () => {};
                const modeSwitch = mplColorModeSwitch(localSec, initialMode, (mode) => applyFolderMode(mode));
                const lInner = mkRow(localSec, "标题栏背景", lcur.inner);
                const lOuter = mkRow(localSec, "卡片背景", lcur.outer);
                const lBar = mkRow(localSec, "左侧色条", lcur.bar);

                const preview = document.createElement("div");
                preview.style.cssText = "border-radius:8px;overflow:hidden;margin:0 0 12px;border:1px solid #3b3c46;";
                const ph = document.createElement("div");
                ph.style.cssText = "padding:6px 9px;font-size:12px;font-weight:600;";
                ph.textContent = "文件夹标题";
                const pb = document.createElement("div");
                pb.style.cssText = "padding:8px 9px;font-size:11px;color:#aaa;";
                pb.textContent = "· 内含 LoRA 行区域";
                preview.appendChild(ph); preview.appendChild(pb);
                const renderPreview = () => {
                    preview.style.background = lOuter.value;
                    preview.style.borderLeft = "4px solid " + lBar.value;
                    ph.style.background = lInner.value;
                    ph.style.color = "#eef1ff";
                };
                [lOuter, lInner, lBar].forEach(i => i.addEventListener("input", renderPreview));
                renderPreview();
                dlg.appendChild(preview);

                const globalSec = section("全局默认文件夹颜色", "跟随全局的文件夹使用此颜色；改动会同步到所有跟随全局的文件夹");
                const gInner = mkRow(globalSec, "标题栏背景", gcur.inner || DEF.inner);
                const gOuter = mkRow(globalSec, "卡片背景", gcur.outer || DEF.outer);
                const gBar = mkRow(globalSec, "左侧色条", gcur.bar || DEF.bar);

                // 模式切换：跟随全局时禁用本条色块并跟随全局值；独立固定时启用本条色块
                applyFolderMode = (mode) => {
                    const follow = mode === "global";
                    if (follow) {
                        lInner.value = gInner.value; lOuter.value = gOuter.value; lBar.value = gBar.value;
                        [lInner, lOuter, lBar].forEach(i => delete i.dataset.cleared);
                    }
                    [lInner, lOuter, lBar].forEach(i => {
                        i.disabled = follow;
                        i.style.opacity = follow ? "0.45" : "1";
                        if (i.__clearBtn) { i.__clearBtn.style.pointerEvents = follow ? "none" : "auto"; i.__clearBtn.style.opacity = follow ? "0.4" : "1"; }
                    });
                    renderPreview();
                };
                applyFolderMode(modeSwitch.getMode());
                // 跟随全局时，改全局色块，本条预览跟着变
                [gInner, gOuter, gBar].forEach(i => i.addEventListener("input", () => {
                    if (modeSwitch.getMode() !== "global") return;
                    lInner.value = gInner.value; lOuter.value = gOuter.value; lBar.value = gBar.value;
                    renderPreview();
                }));

                const btnRow = document.createElement("div");
                btnRow.style.cssText = "display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;";
                const clearBtn = document.createElement("button");
                clearBtn.textContent = "清除本条色";
                clearBtn.style.cssText = "padding:6px 12px;background:#3a3a3a;border:1px solid #555;color:#ddd;border-radius:6px;cursor:pointer;margin-right:auto;";
                clearBtn.onclick = () => {
                    delete folder.color; delete folder.bgColor; delete folder.headBg;
                    folder.colorMode = "global";
                    this.renderEmbeddedList(); this.updateWidget();
                    overlay.remove();
                };
                const resetBtn = document.createElement("button");
                resetBtn.textContent = "恢复默认颜色";
                resetBtn.style.cssText = "padding:6px 12px;background:#3a3a3a;border:1px solid #555;color:#ddd;border-radius:6px;cursor:pointer;";
                resetBtn.onclick = () => {
                    gOuter.value = DEF.outer; gInner.value = DEF.inner; gBar.value = DEF.bar;
                    gOuter.dataset.cleared = "1"; gInner.dataset.cleared = "1"; gBar.dataset.cleared = "1";
                    if (modeSwitch.getMode() === "global") {
                        lOuter.value = DEF.outer; lInner.value = DEF.inner; lBar.value = DEF.bar;
                        renderPreview();
                    }
                };
                const cancelBtn = document.createElement("button");
                cancelBtn.textContent = "取消";
                cancelBtn.style.cssText = "padding:6px 14px;background:#3a3a3a;border:1px solid #555;color:#ddd;border-radius:6px;cursor:pointer;";
                cancelBtn.onclick = () => overlay.remove();
                const okBtn = document.createElement("button");
                okBtn.textContent = "确定";
                okBtn.style.cssText = "padding:6px 14px;background:#6c8cff;border:none;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;";
                okBtn.onclick = () => {
                    // 模式持久化到对象：跟随全局则不存单条色，独立固定则写入本条色
                    const mode = modeSwitch.getMode();
                    folder.colorMode = mode;
                    if (mode === "custom") {
                        if (lOuter.dataset.cleared) delete folder.bgColor; else folder.bgColor = lOuter.value;
                        if (lInner.dataset.cleared) delete folder.headBg; else folder.headBg = lInner.value;
                        if (lBar.dataset.cleared) delete folder.color; else folder.color = lBar.value;
                    } else {
                        delete folder.color; delete folder.bgColor; delete folder.headBg;
                    }
                    // 全局默认（留空/清空则用内置默认）
                    this.folderColorSettings = {
                        outer: gOuter.dataset.cleared ? "" : gOuter.value,
                        inner: gInner.dataset.cleared ? "" : gInner.value,
                        bar: gBar.dataset.cleared ? "" : gBar.value,
                    };
                    this.properties["folder_color_settings"] = this.folderColorSettings;
                    this.renderEmbeddedList(); this.updateWidget();
                    this.applyFolderColorSettings?.();
                    this.setDirtyCanvas?.(true, true);
                    overlay.remove();
                };
                btnRow.appendChild(clearBtn); btnRow.appendChild(resetBtn); btnRow.appendChild(cancelBtn); btnRow.appendChild(okBtn);
                dlg.appendChild(btnRow);
                overlay.appendChild(dlg);
                overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
                document.body.appendChild(overlay);
            };

            // 内置颜色预设（LoRA 选中色 + 文件夹默认色），10 套风格
            // 设计：卡片背景(outer) 很暗低饱和 → 标题栏(inner) 亮一档 → 左条(bar) 高饱和亮色
            //      LoRA 选中底(selectBg) 中等明度、明显区别卡片底 → 选中文字(selectText) 近白亮色
            nodeType.prototype._builtinColorPresets = function() {
                return [
                    { name: "星夜紫蓝", lora: { selectBg: "#3d4d8c", selectBar: "#8ab4ff", selectText: "#f2f6ff" }, folder: { outer: "#1b1e2e", inner: "#272c44", bar: "#6c8cff" } },
                    { name: "极夜青碧", lora: { selectBg: "#0f5148", selectBar: "#3ef0d4", selectText: "#eafffb" }, folder: { outer: "#0c1f1d", inner: "#13322e", bar: "#2fe0c8" } },
                    { name: "暮色玫瑰", lora: { selectBg: "#5c2340", selectBar: "#ff8fc4", selectText: "#fff0f7" }, folder: { outer: "#241019", inner: "#3a1b2a", bar: "#ff7ab6" } },
                    { name: "琥珀暖橙", lora: { selectBg: "#5c3a12", selectBar: "#ffb454", selectText: "#fff6e8" }, folder: { outer: "#241a0c", inner: "#3a2a13", bar: "#ffa94d" } },
                    { name: "森野青绿", lora: { selectBg: "#1f5230", selectBar: "#6ff09a", selectText: "#eafff0" }, folder: { outer: "#101f15", inner: "#1b3322", bar: "#67d98b" } },
                    { name: "深空靛蓝", lora: { selectBg: "#2e2a6e", selectBar: "#9a8bff", selectText: "#f1eeff" }, folder: { outer: "#14132b", inner: "#22204a", bar: "#8aa1ff" } },
                    { name: "赤焰朱红", lora: { selectBg: "#5c1f28", selectBar: "#ff6b78", selectText: "#fff0f1" }, folder: { outer: "#241014", inner: "#3a1b20", bar: "#ff5f6d" } },
                    { name: "薄荷清灰", lora: { selectBg: "#2b4a52", selectBar: "#8fe4ea", selectText: "#f0fdff" }, folder: { outer: "#171f22", inner: "#233036", bar: "#7fd4d8" } },
                    { name: "葡萄奶紫", lora: { selectBg: "#432a66", selectBar: "#c79bff", selectText: "#f8f2ff" }, folder: { outer: "#1d1429", inner: "#2d2040", bar: "#b98bff" } },
                    { name: "石墨单色", lora: { selectBg: "#3c414b", selectBar: "#aeb8c6", selectText: "#fafcff" }, folder: { outer: "#202329", inner: "#2c3037", bar: "#9aa4b2" } },
                ];
            };

            // 读取自定义预设（localStorage，按插件全局）
            nodeType.prototype._loadCustomColorPresets = function() {
                try {
                    const raw = localStorage.getItem("MA_COLOR_PRESETS");
                    const arr = raw ? JSON.parse(raw) : [];
                    return Array.isArray(arr) ? arr : [];
                } catch (e) { return []; }
            };
            nodeType.prototype._saveCustomColorPresets = function(arr) {
                try { localStorage.setItem("MA_COLOR_PRESETS", JSON.stringify(arr)); } catch (e) {}
            };

            // 应用预设：写入 this.colorSettings / folderColorSettings 并落盘、刷新
            nodeType.prototype._applyColorPreset = function(preset) {
                if (!preset) return;
                const l = preset.lora || {};
                const f = preset.folder || {};
                this.colorSettings = {
                    selectBg: l.selectBg || "#2b3b5e",
                    selectBar: l.selectBar || "#6c8cff",
                    selectText: l.selectText || "#eef1ff",
                };
                this.folderColorSettings = {
                    outer: f.outer || "",
                    inner: f.inner || "",
                    bar: f.bar || "",
                };
                this.properties["color_settings"] = this.colorSettings;
                this.properties["folder_color_settings"] = this.folderColorSettings;
                this.renderEmbeddedList();
                this.updateWidget();
                this.applyColorSettings?.();
                this.applyFolderColorSettings?.();
                this.setDirtyCanvas?.(true, true);
            };

            // 颜色预设弹窗
            nodeType.prototype.showColorPresetModal = function() {
                const old = document.querySelector('.mpl-color-preset-overlay');
                if (old) old.remove();
                const overlay = document.createElement("div");
                overlay.className = "mpl-color-preset-overlay";
                overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:10040;display:flex;align-items:center;justify-content:center;";
                const dlg = document.createElement("div");
                dlg.style.cssText = "background:#1e1e1e;border:1px solid #3b3c46;border-radius:12px;padding:18px 20px;width:520px;max-height:80vh;display:flex;flex-direction:column;color:#ddd;font-size:13px;box-shadow:0 12px 40px rgba(0,0,0,0.6);";

                const title = document.createElement("div");
                title.textContent = "颜色预设";
                title.style.cssText = "font-size:15px;font-weight:600;color:#fff;margin-bottom:4px;";
                const sub = document.createElement("div");
                sub.textContent = "点击套用整套配色（LoRA 选中色 + 文件夹默认色）。可另存当前配色为自定义预设。";
                sub.style.cssText = "font-size:11px;color:#8b8d9b;margin-bottom:12px;";
                dlg.appendChild(title); dlg.appendChild(sub);

                const grid = document.createElement("div");
                grid.style.cssText = "display:grid;grid-template-columns:repeat(2,1fr);gap:10px;overflow:auto;padding-right:4px;flex:1 1 auto;";

                const makeCard = (preset, isCustom, idx) => {
                    const l = preset.lora || {}, f = preset.folder || {};
                    const card = document.createElement("div");
                    card.style.cssText = "border:1px solid #3b3c46;border-radius:9px;overflow:hidden;cursor:pointer;background:#24252d;transition:border-color .12s,transform .08s;";
                    card.onmouseenter = () => card.style.borderColor = "#6c8cff";
                    card.onmouseleave = () => card.style.borderColor = "#3b3c46";
                    // 预览：标题栏 + 卡片 + 一行选中LoRA
                    const pv = document.createElement("div");
                    pv.style.cssText = "background:" + (f.outer || "#23252e") + ";border-left:4px solid " + (f.bar || l.selectBar || "#6c8cff") + ";padding:0;";
                    const ph = document.createElement("div");
                    ph.style.cssText = "padding:5px 8px;font-size:11px;font-weight:600;color:#eef1ff;background:" + (f.inner || "#2c2e3a") + ";";
                    ph.textContent = preset.name;
                    const pl = document.createElement("div");
                    pl.style.cssText = "margin:6px;padding:4px 7px;border-radius:6px;font-size:11px;background:" + (l.selectBg || "#2b3b5e") + ";color:" + (l.selectText || "#eef1ff") + ";border-left:3px solid " + (l.selectBar || "#6c8cff") + ";";
                    pl.textContent = "LoRA 行（选中）";
                    pv.appendChild(ph); pv.appendChild(pl);
                    card.appendChild(pv);

                    const bar = document.createElement("div");
                    bar.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:6px 8px;";
                    const nm = document.createElement("span");
                    nm.textContent = preset.name + (isCustom ? "" : "");
                    nm.style.cssText = "font-size:12px;color:#c8cad6;";
                    bar.appendChild(nm);
                    if (isCustom) {
                        const del = document.createElement("span");
                        del.textContent = "✕";
                        del.title = "删除该自定义预设";
                        del.style.cssText = "cursor:pointer;color:#ef6b7d;font-size:12px;padding:0 4px;";
                        del.onclick = (e) => {
                            e.stopPropagation();
                            const arr = this._loadCustomColorPresets();
                            arr.splice(idx, 1);
                            this._saveCustomColorPresets(arr);
                            overlay.remove();
                            this.showColorPresetModal();
                        };
                        bar.appendChild(del);
                    }
                    card.appendChild(bar);
                    card.onclick = () => { this._applyColorPreset(preset); overlay.remove(); };
                    return card;
                };

                this._builtinColorPresets().forEach(p => grid.appendChild(makeCard(p, false, -1)));
                this._loadCustomColorPresets().forEach((p, i) => grid.appendChild(makeCard(p, true, i)));
                dlg.appendChild(grid);

                const btnRow = document.createElement("div");
                btnRow.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:12px;flex-wrap:wrap;";
                const saveBtn = document.createElement("button");
                saveBtn.textContent = "另存当前配色为预设";
                saveBtn.style.cssText = "padding:6px 12px;background:#00897b;border:none;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;margin-right:auto;";
                saveBtn.onclick = () => {
                    const name = prompt("给当前配色起个名字：", "我的配色");
                    if (!name) return;
                    const cs = this.colorSettings || {};
                    const fs = this.folderColorSettings || {};
                    const preset = {
                        name: name,
                        lora: { selectBg: cs.selectBg || "#2b3b5e", selectBar: cs.selectBar || "#6c8cff", selectText: cs.selectText || "#eef1ff" },
                        folder: { outer: fs.outer || "", inner: fs.inner || "", bar: fs.bar || "" },
                    };
                    const arr = this._loadCustomColorPresets();
                    arr.push(preset);
                    this._saveCustomColorPresets(arr);
                    overlay.remove();
                    this.showColorPresetModal();
                };
                const closeBtn = document.createElement("button");
                closeBtn.textContent = "关闭";
                closeBtn.style.cssText = "padding:6px 14px;background:#3a3a3a;border:1px solid #555;color:#ddd;border-radius:6px;cursor:pointer;";
                closeBtn.onclick = () => overlay.remove();
                btnRow.appendChild(saveBtn); btnRow.appendChild(closeBtn);
                dlg.appendChild(btnRow);

                overlay.appendChild(dlg);
                overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
                document.body.appendChild(overlay);
            };

            // 该 LoRA 是否位于已被忽略的群组内（忽略组不参与分组/复制）
            nodeType.prototype._mplLoraInIgnoredFolder = function(lora) {
                if (!lora) return false;
                return (this.loraData.folders || []).some(f => f.ignored && (f.loras || []).includes(lora));
            };

            // 把当前选中的（=启用的）LoRA 合成一个新文件夹，保持原来的上下顺序
            nodeType.prototype._mplGroupSelectedIntoFolder = function(fallbackLora) {
                const folders = this.loraData.folders || [];
                const roots = this.loraData.loras || [];
                this._syncTopLayout();
                const layout = this._topLayout.slice();
                const folderByUid = new Map(folders.map(f => [this._uidFor(f), f]));
                const rootByUid = new Map(roots.map(l => [this._uidFor(l), l]));
                const seen = new Set();
                const picked = [];
                layout.forEach(tok => {
                    if (tok.startsWith("l:")) {
                        const l = rootByUid.get(tok.slice(2));
                        if (l && mplLoraEnabled(l) && !seen.has(l)) {
                            seen.add(l);
                            picked.push({ lora: l, containerTok: tok, isRoot: true });
                        }
                    } else if (tok.startsWith("f:")) {
                        const f = folderByUid.get(tok.slice(2));
                        // 已忽略的群组不参与分组
                        if (f && !f.ignored) (f.loras || []).forEach(l => {
                            if (l && mplLoraEnabled(l) && !seen.has(l)) {
                                seen.add(l);
                                picked.push({ lora: l, containerTok: tok, isRoot: false });
                            }
                        });
                    }
                });
                if (!picked.length && fallbackLora) {
                    if (this._mplLoraInIgnoredFolder(fallbackLora)) {
                        alert("该 LoRA 所在群组已被忽略，不参与分组；请先取消忽略。");
                        return;
                    }
                    const tok = "l:" + this._uidFor(fallbackLora);
                    picked.push({ lora: fallbackLora, containerTok: tok, isRoot: true });
                }
                if (!picked.length) return;

                const pickedSet = new Set(picked.map(p => p.lora));
                const rootTokens = new Set(picked.filter(p => p.isRoot).map(p => p.containerTok));
                const firstTok = picked[0].containerTok;
                const firstOrigIdx = layout.indexOf(firstTok);
                const removedBefore = firstOrigIdx >= 0
                    ? layout.slice(0, firstOrigIdx).filter(t => rootTokens.has(t)).length
                    : 0;

                // 原位置移除（保持数组引用），新文件夹插到第一个选中项原来的位置
                for (let i = roots.length - 1; i >= 0; i--) {
                    if (pickedSet.has(roots[i])) roots.splice(i, 1);
                }
                folders.forEach(f => {
                    if (!Array.isArray(f.loras)) return;
                    for (let i = f.loras.length - 1; i >= 0; i--) {
                        if (pickedSet.has(f.loras[i])) f.loras.splice(i, 1);
                    }
                });

                let num = 1;
                while (folders.some(f => f.name === `新建文件夹${num}`)) num++;
                const folder = {
                    name: `新建文件夹${num}`,
                    collapsed: false,
                    loras: picked.map(p => p.lora),
                };
                folders.push(folder);

                const cleaned = layout.filter(t => !rootTokens.has(t));
                let insertIdx = firstOrigIdx >= 0 ? firstOrigIdx - removedBefore : cleaned.length;
                insertIdx = Math.max(0, Math.min(insertIdx, cleaned.length));
                cleaned.splice(insertIdx, 0, "f:" + this._uidFor(folder));
                this._topLayout = cleaned;

                this.renderEmbeddedList();
                this.updateWidget();
            };

            // 额外群组：把选中（已启用）的 LoRA 按界面顺序各复制一份，放进一个新群组，原条目保留
            nodeType.prototype._mplCopyIntoNewFolder = function(fallbackLora) {
                const folders = this.loraData.folders || [];
                const roots = this.loraData.loras || [];
                this._syncTopLayout();
                const layout = this._topLayout.slice();
                const folderByUid = new Map(folders.map(f => [this._uidFor(f), f]));
                const rootByUid = new Map(roots.map(l => [this._uidFor(l), l]));
                const seen = new Set();
                const picked = [];
                layout.forEach(tok => {
                    if (tok.startsWith("l:")) {
                        const l = rootByUid.get(tok.slice(2));
                        if (l && mplLoraEnabled(l) && !seen.has(l)) { seen.add(l); picked.push({ lora: l, tok }); }
                    } else if (tok.startsWith("f:")) {
                        const f = folderByUid.get(tok.slice(2));
                        // 已忽略的群组不参与额外群组
                        if (f && !f.ignored) (f.loras || []).forEach(l => {
                            if (l && mplLoraEnabled(l) && !seen.has(l)) { seen.add(l); picked.push({ lora: l, tok }); }
                        });
                    }
                });
                if (!picked.length && fallbackLora) {
                    if (this._mplLoraInIgnoredFolder(fallbackLora)) {
                        alert("该 LoRA 所在群组已被忽略，不参与额外群组；请先取消忽略。");
                        return;
                    }
                    picked.push({ lora: fallbackLora, tok: "l:" + this._uidFor(fallbackLora) });
                }
                if (!picked.length) return;

                let num = 1;
                while (folders.some(f => f.name === `新建文件夹${num}`)) num++;
                const folder = {
                    name: `新建文件夹${num}`,
                    collapsed: false,
                    loras: picked.map(p => {
                        const copy = JSON.parse(JSON.stringify(p.lora));
                        delete copy._uid;
                        copy.enabled = mplLoraEnabled(p.lora);
                        return mplDecorateNewLora(copy);
                    }),
                };
                folders.push(folder);
                // 新群组插到最后一个选中项所在位置的后面，便于紧接着看到
                const arr = this._topLayout;
                const folderTok = "f:" + this._uidFor(folder);
                const di = arr.indexOf(picked[picked.length - 1].tok);
                if (di >= 0) arr.splice(di + 1, 0, folderTok);
                else arr.push(folderTok);

                this.renderEmbeddedList();
                this.updateWidget();
            };

            // 批量复制：按界面上下顺序，把副本统一作为散装行放到文件夹外面（列表末尾）
            nodeType.prototype._mplDuplicateLoras = function(sources) {
                const picked = [...new Set((sources || []).filter(Boolean))];
                if (!picked.length) return;
                if (!Array.isArray(this.loraData.loras)) this.loraData.loras = [];
                const roots = this.loraData.loras;
                const folders = this.loraData.folders || [];
                this._syncTopLayout();

                // 按界面显示顺序收集要复制的项（散装行与文件夹内行混排也保持顺序）
                const rootByUid = new Map(roots.map(l => [this._uidFor(l), l]));
                const folderByUid = new Map(folders.map(f => [this._uidFor(f), f]));
                const wanted = new Set(picked);
                const ordered = [];
                const seen = new Set();
                this._topLayout.forEach(tok => {
                    if (tok.startsWith("l:")) {
                        const l = rootByUid.get(tok.slice(2));
                        if (l && wanted.has(l) && !seen.has(l)) { seen.add(l); ordered.push(l); }
                    } else if (tok.startsWith("f:")) {
                        const f = folderByUid.get(tok.slice(2));
                        if (f) (f.loras || []).forEach(l => {
                            if (wanted.has(l) && !seen.has(l)) { seen.add(l); ordered.push(l); }
                        });
                    }
                });
                picked.forEach(l => { if (!seen.has(l)) ordered.push(l); });
                if (!ordered.length) return;

                // 副本一律追加到散装列表，不进任何文件夹；新 _uid 保证身份独立
                ordered.forEach(l => {
                    const copy = JSON.parse(JSON.stringify(l));
                    delete copy._uid;
                    copy.enabled = mplLoraEnabled(l);
                    mplDecorateNewLora(copy);
                    roots.push(copy);
                });
                this._syncTopLayout();
                this.renderEmbeddedList();
                this.updateWidget();
            };

            nodeType.prototype.showLoraRowContextMenu = function(lora, type, fIdx, lIdx, x, y) {
                const old = document.querySelector('.mpl-ctx-menu');
                if (old) old.remove();
                const menu = document.createElement("div");
                menu.className = "mpl-ctx-menu";
                menu.style.cssText = "position:fixed;z-index:10030;background:#1e1f26;border:1px solid #3b3c46;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.55);padding:5px;min-width:158px;font-size:13px;color:#e8e8ee;";
                menu.style.left = x + "px";
                menu.style.top = y + "px";

                const mkItem = (label, fn, danger, icon) => {
                    const it = document.createElement("div");
                    it.style.cssText = "padding:8px 12px;border-radius:7px;cursor:pointer;white-space:nowrap;transition:background .12s,color .12s;display:flex;align-items:center;gap:8px;" + (danger ? "color:#ef6b7d;" : "color:#d6d8e0;");
                    it.innerHTML = (icon ? '<span style="display:inline-flex;opacity:.85;">' + mplIcon(icon, 15) + '</span>' : '') + '<span>' + label + '</span>';
                    it.onmouseenter = () => it.style.background = danger ? "rgba(239,107,125,0.14)" : "rgba(108,140,255,0.16)";
                    it.onmouseleave = () => it.style.background = "transparent";
                    it.onclick = (ev) => { ev.stopPropagation(); menu.remove(); fn(); };
                    menu.appendChild(it);
                    return it;
                };
                mkItem("替换 LoRA", () => {
                    this.showAddLoraModal({ mode: 'replace', replaceTarget: { type, fIdx, lIdx } });
                }, false, 'refresh');
                // 选中（=已启用）多条时统一操作多条，否则只操作右键这一条
                const selectedLoras = this._getMultiSelectedLoras();
                const actionLoras = selectedLoras.length > 1 ? selectedLoras : [lora];
                const many = actionLoras.length > 1;
                mkItem(many ? `复制 LoRA（${actionLoras.length} 个）` : "复制 LoRA", () => {
                    this._mplDuplicateLoras(actionLoras);
                }, false, 'copy');
                if (many) {
                    mkItem("单独复制此项", () => {
                        this._mplDuplicateLoras([lora]);
                    }, false, 'copy');
                }
                const selectedCount = selectedLoras.length;
                mkItem(selectedCount ? `组成文件夹（选中 ${selectedCount} 个）` : "组成文件夹", () => {
                    this._mplGroupSelectedIntoFolder(lora);
                }, false, 'folderPlus');
                mkItem(selectedCount ? `额外群组（复制 ${selectedCount} 个）` : "额外群组（复制）", () => {
                    this._mplCopyIntoNewFolder(lora);
                }, false, 'layers');
                const fetchTargets = actionLoras.filter(l => l && l.name).map(l => l.name);
                if (fetchTargets.length) {
                    mkItem(many ? `爬取信息（${fetchTargets.length} 个）` : "爬取信息", () => {
                        this.showBatchEditModal(fetchTargets);
                    }, false, 'download');
                }
                mkItem("在 Civitai 打开", () => {
                    if (lora && lora.name) this.openLoraCivitai(lora.name);
                }, false, 'link');
                mkItem("颜色设置", () => {
                    this.showLoraColorModal(lora);
                }, false, 'palette');
                mkItem("删除", () => {
                    if (type === 'root') this.loraData.loras.splice(lIdx, 1);
                    else if (type === 'folder' && this.loraData.folders[fIdx]) this.loraData.folders[fIdx].loras.splice(lIdx, 1);
                    this.renderEmbeddedList(); this.updateWidget();
                }, true, 'trash');

                document.body.appendChild(menu);
                // 边界修正
                const r = menu.getBoundingClientRect();
                if (r.right > window.innerWidth) menu.style.left = (window.innerWidth - r.width - 6) + "px";
                if (r.bottom > window.innerHeight) menu.style.top = (window.innerHeight - r.height - 6) + "px";

                const closeHandler = (ev) => {
                    if (menu.contains(ev.target)) return;
                    menu.remove();
                    cleanup();
                };
                const cleanup = () => {
                    document.removeEventListener("mousedown", closeHandler, true);
                    document.removeEventListener("pointerdown", closeHandler, true);
                    document.removeEventListener("wheel", closeHandler, true);
                    window.removeEventListener("blur", onBlur);
                    document.removeEventListener("visibilitychange", onVisibility, true);
                };
                // 失焦/切到其它窗口时，菜单直接关闭（而不是只解绑监听导致菜单永远残留）
                const onBlur = () => { if (menu.parentNode) menu.remove(); cleanup(); };
                const onVisibility = () => { if (document.hidden) { if (menu.parentNode) menu.remove(); cleanup(); } };
                setTimeout(() => {
                    document.addEventListener("mousedown", closeHandler, true);
                    document.addEventListener("pointerdown", closeHandler, true);
                    document.addEventListener("wheel", closeHandler, true);
                    window.addEventListener("blur", onBlur);
                    document.addEventListener("visibilitychange", onVisibility, true);
                }, 0);
            };

            // 「添加或替换 LoRA」网格卡片右键菜单
            // 从添加/替换弹窗的卡片打开「编辑信息/触发词」弹窗（右键菜单与旧编辑按钮共用）
            nodeType.prototype._editCardLora = function(f) {
                // 创建临时lora对象用于编辑
                const tempLora = {
                    name: f,
                    enabled: true,
                    weight: 1.0,
                    tags: '',
                    note: '',
                    triggerWords: '',
                };
                // 检查是否已经在节点中
                let existingLora = null;
                let existingType = null;
                let existingFIdx = -1;
                let existingLIdx = -1;

                // 在根loras中查找
                for (let i = 0; i < this.loraData.loras.length; i++) {
                    if (this.loraData.loras[i].name === f) {
                        existingLora = this.loraData.loras[i];
                        existingType = 'root';
                        existingLIdx = i;
                        break;
                    }
                }

                // 在文件夹中查找
                if (!existingLora) {
                    for (let fi = 0; fi < this.loraData.folders.length; fi++) {
                        const folder = this.loraData.folders[fi];
                        for (let li = 0; li < folder.loras.length; li++) {
                            if (folder.loras[li].name === f) {
                                existingLora = folder.loras[li];
                                existingType = 'folder';
                                existingFIdx = fi;
                                existingLIdx = li;
                                break;
                            }
                        }
                        if (existingLora) break;
                    }
                }

                // 如果找到了，使用现有的lora；否则使用临时的
                const loraToEdit = existingLora || tempLora;

                // 打开编辑弹窗
                this.showLoraEditModal(
                    loraToEdit,
                    existingType || 'root',
                    existingFIdx,
                    existingLIdx,
                    f  // 传递文件路径，用于判断是否需要添加
                );
            };

            nodeType.prototype.showAddLoraCardContextMenu = function(loraName, x, y, fetchTargets) {
                const old = document.querySelector('.mpl-ctx-menu');
                if (old) old.remove();
                const menu = document.createElement("div");
                menu.className = "mpl-ctx-menu";
                menu.style.cssText = "position:fixed;z-index:10030;background:#1e1f26;border:1px solid #3b3c46;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.55);padding:5px;min-width:170px;font-size:13px;color:#e8e8ee;";
                menu.style.left = x + "px";
                menu.style.top = y + "px";

                const mkItem = (label, fn, danger, icon) => {
                    const it = document.createElement("div");
                    it.style.cssText = "padding:8px 12px;border-radius:7px;cursor:pointer;white-space:nowrap;transition:background .12s,color .12s;display:flex;align-items:center;gap:8px;" + (danger ? "color:#ef6b7d;" : "color:#d6d8e0;");
                    it.innerHTML = (icon ? '<span style="display:inline-flex;opacity:.85;">' + mplIcon(icon, 15) + '</span>' : '') + '<span>' + label + '</span>';
                    it.onmouseenter = () => it.style.background = danger ? "rgba(239,107,125,0.14)" : "rgba(108,140,255,0.16)";
                    it.onmouseleave = () => it.style.background = "transparent";
                    it.onclick = (ev) => { ev.stopPropagation(); menu.remove(); cleanup(); fn(); };
                    menu.appendChild(it);
                    return it;
                };
                const targets = (Array.isArray(fetchTargets) ? fetchTargets : []).filter(Boolean);
                if (targets.length) {
                    mkItem(targets.length > 1 ? `爬取信息（已选 ${targets.length} 个）` : "爬取信息", () => {
                        this.showBatchEditModal(targets);
                    }, false, 'download');
                }
                mkItem("在 Civitai 打开", () => {
                    this.openLoraCivitai(loraName);
                }, false, 'link');
                mkItem("编辑信息/触发词", () => {
                    this._editCardLora(loraName);
                }, false, 'edit');

                document.body.appendChild(menu);
                const r = menu.getBoundingClientRect();
                if (r.right > window.innerWidth) menu.style.left = (window.innerWidth - r.width - 6) + "px";
                if (r.bottom > window.innerHeight) menu.style.top = (window.innerHeight - r.height - 6) + "px";

                const closeHandler = (ev) => {
                    if (menu.contains(ev.target)) return;
                    menu.remove();
                    cleanup();
                };
                const cleanup = () => {
                    document.removeEventListener("mousedown", closeHandler, true);
                    document.removeEventListener("pointerdown", closeHandler, true);
                    document.removeEventListener("wheel", closeHandler, true);
                    window.removeEventListener("blur", onBlur);
                    document.removeEventListener("visibilitychange", onVisibility, true);
                };
                // 失焦/切到其它窗口时，菜单直接关闭（而不是只解绑监听导致菜单永远残留）
                const onBlur = () => { if (menu.parentNode) menu.remove(); cleanup(); };
                const onVisibility = () => { if (document.hidden) { if (menu.parentNode) menu.remove(); cleanup(); } };
                setTimeout(() => {
                    document.addEventListener("mousedown", closeHandler, true);
                    document.addEventListener("pointerdown", closeHandler, true);
                    document.addEventListener("wheel", closeHandler, true);
                    window.addEventListener("blur", onBlur);
                    document.addEventListener("visibilitychange", onVisibility, true);
                }, 0);
            };

            // 按哈希反查 Civitai 模型页并打开
            nodeType.prototype.openLoraCivitai = async function(loraName) {
                const toast = document.createElement("div");
                toast.style.cssText = "position:fixed;left:50%;top:20px;transform:translateX(-50%);z-index:10080;background:#2b2b2b;border:1px solid #4a515a;color:#e8e8ee;padding:10px 16px;border-radius:8px;font-size:13px;box-shadow:0 6px 24px rgba(0,0,0,0.6);";
                toast.textContent = "正在查询 Civitai…";
                document.body.appendChild(toast);
                try {
                    const resp = await api.fetchApi("/malora/lora/civitai_url", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ lora_name: loraName }),
                    });
                    let data = {};
                    try { data = await resp.json(); } catch (e) {}
                    if (data && data.ok && data.url) {
                        toast.textContent = "已打开 Civitai";
                        window.open(data.url, "_blank", "noopener,noreferrer");
                    } else {
                        toast.textContent = "未找到 Civitai 地址：" + ((data && data.error) || ("HTTP " + resp.status));
                    }
                } catch (e) {
                    toast.textContent = "查询失败：" + (e && e.message ? e.message : e);
                }
                setTimeout(() => toast.remove(), 2600);
            };

            // 文件夹右键菜单：左侧强调条色 / 背景色 / 重命名 / 删除
            nodeType.prototype.showFolderContextMenu = function(folder, fDiv, x, y) {
                const old = document.querySelector('.mpl-ctx-menu');
                if (old) old.remove();
                const menu = document.createElement("div");
                menu.className = "mpl-ctx-menu";
                menu.style.cssText = "position:fixed;z-index:10030;background:#1e1f26;border:1px solid #3b3c46;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.55);padding:6px;min-width:180px;font-size:13px;color:#e8e8ee;";
                menu.style.left = x + "px";
                menu.style.top = y + "px";

                const mkColorRow = (label, curVal, fallback, onChange, onClear) => {
                    const row = document.createElement("div");
                    row.style.cssText = "display:flex;align-items:center;gap:8px;justify-content:space-between;padding:6px 8px;border-radius:4px;";
                    const lab = document.createElement("span");
                    lab.textContent = label;
                    lab.style.cssText = "color:#c8cad6;";
                    const right = document.createElement("span");
                    right.style.cssText = "display:flex;align-items:center;gap:6px;";
                    const input = document.createElement("input");
                    input.type = "color";
                    input.value = curVal || fallback;
                    input.style.cssText = "width:40px;height:24px;border:1px solid #3b3c46;border-radius:6px;background:#191a20;cursor:pointer;padding:1px;";
                    input.addEventListener("pointerdown", (e)=>e.stopPropagation());
                    input.addEventListener("input", (e) => { onChange(input.value); });
                    const clearBtn = document.createElement("span");
                    clearBtn.textContent = "✕";
                    clearBtn.title = "清除";
                    clearBtn.style.cssText = "cursor:pointer;color:#8b8d9b;font-size:12px;padding:0 3px;";
                    clearBtn.onclick = (ev) => { ev.stopPropagation(); onClear(); };
                    right.appendChild(input);
                    right.appendChild(clearBtn);
                    row.appendChild(lab);
                    row.appendChild(right);
                    return row;
                };


                const mkItem = (label, fn, danger, icon) => {
                    const it = document.createElement("div");
                    it.style.cssText = "padding:8px 10px;border-radius:7px;cursor:pointer;white-space:nowrap;transition:background .12s,color .12s;display:flex;align-items:center;gap:8px;" + (danger ? "color:#ef6b7d;" : "color:#d6d8e0;");
                    it.innerHTML = (icon ? '<span style="display:inline-flex;opacity:.85;">' + mplIcon(icon, 15) + '</span>' : '') + '<span>' + label + '</span>';
                    it.onmouseenter = () => it.style.background = danger ? "rgba(239,107,125,0.14)" : "rgba(108,140,255,0.16)";
                    it.onmouseleave = () => it.style.background = "transparent";
                    it.onclick = (ev) => { ev.stopPropagation(); menu.remove(); fn(); };
                    menu.appendChild(it);
                };
                mkItem("颜色设置", () => {
                    this.showFolderColorModal(folder, fDiv);
                }, false, 'palette');
                mkItem("重命名", () => {
                    const newName = prompt("Rename:", folder.name);
                    if (newName) { folder.name = newName; this.renderEmbeddedList(); this.updateWidget(); }
                }, false, 'edit');
                mkItem("删除文件夹", () => {
                    if (confirm("Delete folder?")) {
                        if (this._previewTimeout) { clearTimeout(this._previewTimeout); this._previewTimeout = null; }
                        if (this._previewDiv) { this._previewDiv.remove(); this._previewDiv = null; }
                        document.querySelectorAll('.mpl-lora-preview').forEach(p => p.remove());
                        const idx = this.loraData.folders.indexOf(folder);
                        if (idx >= 0) this.loraData.folders.splice(idx, 1);
                        this.renderEmbeddedList();
                        this.updateWidget();
                    }
                }, true, 'trash');

                document.body.appendChild(menu);
                const r = menu.getBoundingClientRect();
                if (r.right > window.innerWidth) menu.style.left = (window.innerWidth - r.width - 6) + "px";
                if (r.bottom > window.innerHeight) menu.style.top = (window.innerHeight - r.height - 6) + "px";

                const closeHandler = (ev) => {
                    if (menu.contains(ev.target)) return;
                    menu.remove();
                    cleanup();
                };
                const cleanup = () => {
                    document.removeEventListener("mousedown", closeHandler, true);
                    document.removeEventListener("pointerdown", closeHandler, true);
                    document.removeEventListener("wheel", closeHandler, true);
                    window.removeEventListener("blur", onBlur);
                    document.removeEventListener("visibilitychange", onVisibility, true);
                };
                // 失焦/切到其它窗口时，菜单直接关闭（而不是只解绑监听导致菜单永远残留）
                const onBlur = () => { if (menu.parentNode) menu.remove(); cleanup(); };
                const onVisibility = () => { if (document.hidden) { if (menu.parentNode) menu.remove(); cleanup(); } };
                setTimeout(() => {
                    document.addEventListener("mousedown", closeHandler, true);
                    document.addEventListener("pointerdown", closeHandler, true);
                    document.addEventListener("wheel", closeHandler, true);
                    window.addEventListener("blur", onBlur);
                    document.addEventListener("visibilitychange", onVisibility, true);
                }, 0);
            };

            // 大图预览（替换旧的 hover 浮动预览，改为点击触发）
            nodeType.prototype.showLoraImagePreview = function(lora) {
                const existing = document.querySelector('.mpl-img-preview-overlay');
                if (existing) existing.remove();
                const overlay = document.createElement("div");
                overlay.className = "mpl-img-preview-overlay";
                overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:10020;display:flex;align-items:center;justify-content:center;cursor:zoom-out;";
                const img = document.createElement("img");
                img.src = api.apiURL(`/malora/lora/image?name=${encodeURIComponent(lora.name)}&t=${Date.now()}`);
                img.style.cssText = "max-width:80vw;max-height:80vh;object-fit:contain;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.8);background:#222;";
                img.onerror = () => { overlay.innerHTML = '<div style="color:#ccc;font-size:16px;">无预览图</div>'; };
                overlay.appendChild(img);
                overlay.onclick = () => overlay.remove();
                document.body.appendChild(overlay);
            };

            nodeType.prototype.addFolder = function() {
                // 获取所有现有文件夹名称
                const existingNames = this.loraData.folders.map(f => f.name);
                
                // 查找所有以"空白文件夹"开头的文件夹，提取编号
                const blankFolderPattern = /^空白文件夹(\d+)$/;
                const blankFolderNumbers = existingNames
                    .map(name => {
                        const match = name.match(blankFolderPattern);
                        return match ? parseInt(match[1], 10) : null;
                    })
                    .filter(num => num !== null)
                    .sort((a, b) => a - b);
                
                // 确定新文件夹的编号
                let newNumber = 1;
                if (blankFolderNumbers.length > 0) {
                    // 找到连续编号中的最大编号
                    let maxNumber = blankFolderNumbers[blankFolderNumbers.length - 1];
                    // 检查是否有缺失的编号（比如有1,2,4，缺失3）
                    for (let i = 1; i <= maxNumber; i++) {
                        if (!blankFolderNumbers.includes(i)) {
                            newNumber = i;
                            break;
                        }
                    }
                    // 如果没有缺失的编号，使用最大编号+1
                    if (newNumber === 1 && blankFolderNumbers.includes(1)) {
                        newNumber = maxNumber + 1;
                    }
                }
                
                // 创建新文件夹名称
                const newFolderName = `空白文件夹${newNumber}`;
                
                // 确保不会重名（双重检查）
                if (!existingNames.includes(newFolderName)) {
                    this.loraData.folders.push({ name: newFolderName, loras: [], collapsed: false });
                    this.renderEmbeddedList();
                    this.updateWidget();
                } else {
                    // 如果意外重名，尝试下一个编号
                    let fallbackNumber = newNumber + 1;
                    while (existingNames.includes(`空白文件夹${fallbackNumber}`)) {
                        fallbackNumber++;
                    }
                    this.loraData.folders.push({ name: `空白文件夹${fallbackNumber}`, loras: [], collapsed: false });
                    this.renderEmbeddedList();
                    this.updateWidget();
                }
            };

            nodeType.prototype.showAddLoraModal = async function(opts) {
                opts = opts || {};
                // 单一窗口：窗口内用「➕ 添加 / 🔁 替换」切换；右键入口带 replaceTarget 时默认进入替换态
                const replaceTarget = opts.replaceTarget || null; // {type, fIdx, lIdx}
                try {
                    // 网格卡片图片由 /malora/lora/image?name=...&w= 按需加载，不依赖图片映射表，
                    // 所以这里不再 await loadLoraImageList()，避免打开弹窗被遍历扫描拖慢。
                    
                    // 图片 URL 时间戳用于刷新缓存
                    let cacheTimestamp = new Date().getTime();
                    
                    // 每次打开都实时请求，避免文件重命名后仍显示旧文件名
                    let allFiles = [];
                    let allMtimes = {};
                    {
                        const resp = await api.fetchApi("/malora/lora/list");
                        const data = await resp.json();
                        allFiles = data.files || [];
                        allMtimes = data.mtimes || {};
                        try {
                            nodeType._maListCache = { files: allFiles.slice(), mtimes: allMtimes, t: Date.now() };
                            sessionStorage.setItem("MA_LORA_LIST", JSON.stringify({ files: allFiles, mtimes: allMtimes, t: Date.now() }));
                        } catch (e) {}
                    }
                    // 保证每个文件都有 mtime 键（缺省 0）
                    allFiles.forEach(f => { if (allMtimes[f] === undefined) allMtimes[f] = 0; });
                    mplSetLoraNameList(allFiles);
                    
                    // 构建文件夹树结构
                    const folderTree = {};
                    const rootFiles = [];
                    allFiles.forEach(file => {
                        const parts = String(file).split(/[/\\]/);
                        if (parts.length === 1) { rootFiles.push(file); return; }
                        let current = folderTree;
                        for (let i = 0; i < parts.length - 1; i++) {
                            const folderName = parts[i];
                            if (!current[folderName]) current[folderName] = { files: [], folders: {} };
                            if (i === parts.length - 2) current[folderName].files.push(file);
                            else {
                                if (!current[folderName].folders) current[folderName].folders = {};
                                current = current[folderName].folders;
                            }
                        }
                    });
                    let currentPath = [];
                    try {
                        const _savedPath = JSON.parse(localStorage.getItem("MA_ADD_LORA_PATH") || "null");
                        if (Array.isArray(_savedPath)) currentPath = _savedPath.slice();
                    } catch (e) {}
                    let selectedFiles = new Set();
                    let autoAddTag = true;
                    // 待替换目标 + 当前操作模式（右键入口预设为「替换」）
                    let pendingReplace = replaceTarget || null;
                    let actionMode = replaceTarget ? 'replace' : 'add'; // 'add' | 'replace'
                    let sortMode = "name"; // 排序模式：name(按字母) / time(按修改时间)
                    let sortDir = "desc";  // 排序方向：asc(正序) / desc(倒序)
                    try { const _sp = JSON.parse(localStorage.getItem("MA_LORA_SORT")||"null"); if (_sp){ if(_sp.mode) sortMode=_sp.mode; if(_sp.dir) sortDir=_sp.dir; } } catch(e){}
                    const sortPersist = () => { try { localStorage.setItem("MA_LORA_SORT", JSON.stringify({ mode: sortMode, dir: sortDir })); } catch(e){} };
                    
                    const dialog = document.createElement("div");
                    dialog.setAttribute("data-magic-i18n", "manual");
                    // 记住最后一次打开的窗口位置（localStorage），首次打开居中
                    let _dpos = null;
                    try { _dpos = JSON.parse(localStorage.getItem("MA_ADD_LORA_WIN") || "null"); } catch(e) { _dpos = null; }
                    let _dw = 800, _dh = 800, _dl, _dt;
                    if (_dpos && typeof _dpos.w === "number" && typeof _dpos.left === "number") {
                        _dw = _dpos.w; _dh = _dpos.h; _dl = _dpos.left; _dt = _dpos.top;
                    } else {
                        _dw = 800; _dh = 800;
                        _dl = window.innerWidth / 2 - 400;
                        _dt = window.innerHeight / 2 - 400;
                    }
                    _dl = Math.max(0, Math.min(_dl, window.innerWidth - 120));
                    _dt = Math.max(0, Math.min(_dt, window.innerHeight - 80));
                    dialog.style.cssText = `position:fixed;top:${_dt}px;left:${_dl}px;width:${_dw}px;height:${_dh}px;background:#1e1f26;border:1px solid #3b3c46;z-index:9999;display:flex;flex-direction:column;border-radius:14px;box-shadow:0 26px 64px rgba(0,0,0,0.55),0 2px 8px rgba(0,0,0,0.4);font-family: system-ui,-apple-system,"Segoe UI",sans-serif;color:#e8e8ee;overflow:hidden;`;
                    const _saveWinPos = () => {
                        try {
                            const r = dialog.getBoundingClientRect();
                            localStorage.setItem("MA_ADD_LORA_WIN", JSON.stringify({ left: r.left, top: r.top, w: r.width, h: r.height }));
                        } catch(e) {}
                    };
                    dialog.__maSaveWinPos = _saveWinPos;
                    
                    dialog.addEventListener("wheel", (e) => { e.stopPropagation(); }, { passive: false });
                    const stopEvent = (e) => { e.stopPropagation(); };
                    dialog.addEventListener("pointerdown", stopEvent);
                    dialog.addEventListener("pointermove", stopEvent);
                    dialog.addEventListener("pointerup", stopEvent);
                    dialog.addEventListener("mousedown", stopEvent);
                    dialog.addEventListener("keydown", stopEvent);

                    // 标题栏
                    const header = document.createElement("div");
                    header.style.cssText = "padding:12px 16px;border-bottom:1px solid #3b3c46;display:flex;gap:10px;align-items:center;background:linear-gradient(180deg,rgba(255,255,255,0.05),transparent);cursor:move;user-select:none;";
                    
                    const title = document.createElement("div");
                    title.textContent = "添加或替换 LoRA";
                    title.style.cssText = "color:#e8e8ee;font-weight:700;font-size:14.5px;letter-spacing:.01em;white-space:nowrap;flex:1;";
                    
                    header.appendChild(title);
                    dialog.appendChild(header);

                    // 路径导航栏
                    const pathBar = document.createElement("div");
                    pathBar.style.cssText = "padding:9px 16px;border-bottom:1px solid #3b3c46;background:#1e1f26;display:flex;align-items:center;gap:8px;flex-wrap:wrap;";
                    const pathDisplay = document.createElement("div");
                    pathDisplay.style.cssText = "color:#888;font-size:12px;display:flex;gap:4px;align-items:center;flex-wrap:wrap;";
                    const updatePathDisplay = () => {
                        pathDisplay.innerHTML = "";
                        const makeChip = (text, onClick) => {
                            const s = document.createElement("span");
                            s.textContent = text;
                            s.className = "mpl-add-pathchip";
                            s.onclick = onClick;
                            return s;
                        };
                        const go = (depth) => {
                            currentPath = depth === 0 ? [] : currentPath.slice(0, depth);
                            renderContent();
                        };
                        pathDisplay.appendChild(makeChip("🏠 根目录", () => go(0)));
                        currentPath.forEach((name, index) => {
                            const sep = document.createElement("span");
                            sep.textContent = "›";
                            sep.className = "mpl-add-sep";
                            pathDisplay.appendChild(sep);
                            pathDisplay.appendChild(makeChip(name, () => go(index + 1)));
                        });
                    };
                    pathBar.appendChild(pathDisplay);
                    dialog.appendChild(pathBar);

                    // 搜索和工具栏
                    const toolbar = document.createElement("div");
                    toolbar.style.cssText = "padding:10px 16px;border-bottom:1px solid #3b3c46;background:#1e1f26;display:flex;gap:10px;align-items:center;flex-wrap:wrap;";
                    
                    // 搜索框（缩小）
                    const search = document.createElement("input");
                    search.placeholder = "🔍 搜索当前文件夹（含子文件夹）...";
                    search.style.cssText = "flex:1;min-width:180px;max-width:420px;padding:8px 11px;background:#191a20;color:#e8e8ee;border:1px solid #3b3c46;border-radius:8px;outline:none;font-size:12.5px;transition:border-color .13s,box-shadow .13s;";
                    search.addEventListener("keydown", (e) => { e.stopPropagation(); });
                    search.addEventListener("pointerdown", (e) => { e.stopPropagation(); });
                    
                    // 排序方式选择（按字母 / 按加入时间）
                    const sortContainer = document.createElement("div");
                    sortContainer.style.cssText = "display:flex;align-items:center;gap:6px;";
                    const sortLabel = document.createElement("span");
                    sortLabel.textContent = "排序:";
                    sortLabel.style.cssText = "color:#8b8d9b;font-size:12px;";
                    const sortSelect = document.createElement("select");
                    sortSelect.style.cssText = "padding:8px 10px;background:#191a20;color:#e8e8ee;border:1px solid #3b3c46;border-radius:8px;outline:none;font-size:12px;cursor:pointer;";
                    sortSelect.innerHTML = '<option value="name">按字母</option><option value="time">按修改时间</option>';
                    sortSelect.value = sortMode;
                    const sortDirBtn = document.createElement("button");
                    sortDirBtn.type = "button";
                    sortDirBtn.style.cssText = "padding:8px 10px;background:#191a20;color:#e8e8ee;border:1px solid #3b3c46;border-radius:8px;cursor:pointer;font-size:12px;min-width:70px;transition:border-color .13s;";
                    const _syncSortDirBtn = () => {
                        sortDirBtn.textContent = sortDir === "desc" ? "↓ 倒序" : "↑ 正序";
                    };
                    _syncSortDirBtn();
                    sortDirBtn.onmouseenter = () => { sortDirBtn.style.borderColor = "rgba(108,140,255,0.5)"; };
                    sortDirBtn.onmouseleave = () => { sortDirBtn.style.borderColor = "#3b3c46"; };
                    sortDirBtn.onclick = (e) => {
                        e.stopPropagation();
                        sortDir = (sortDir === "asc") ? "desc" : "asc";
                        sortPersist();
                        _syncSortDirBtn();
                        renderContent();
                    };
                    sortSelect.onchange = () => { sortMode = sortSelect.value; sortPersist(); renderContent(); };
                    sortContainer.appendChild(sortLabel);
                    sortContainer.appendChild(sortSelect);
                    sortContainer.appendChild(sortDirBtn);
                    toolbar.appendChild(sortContainer);

                    // ===== 合并窗口：添加 / 替换 模式切换 =====
                    const modeWrap = document.createElement("div");
                    modeWrap.style.cssText = "display:flex;align-items:center;gap:6px;";
                    const mkModeBtn = (icon, text) => {
                        const b = document.createElement("button");
                        b.type = "button";
                        b.innerHTML = mplIcon(icon, 14) + '<span style="margin-left:5px;">' + text + '</span>';
                        b.style.cssText = "padding:8px 12px;background:transparent;color:#8b8d9b;border:1px solid #3b3c46;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap;transition:all .13s;display:inline-flex;align-items:center;";
                        return b;
                    };
                    const addModeBtn = mkModeBtn("plus", "添加");
                    const replaceModeBtn = mkModeBtn("refresh", "替换");
                    modeWrap.appendChild(addModeBtn);
                    modeWrap.appendChild(replaceModeBtn);
                    toolbar.appendChild(modeWrap);

                    // 替换目标下拉：列出当前节点里已加载的全部 LoRA
                    const replaceTargetWrap = document.createElement("div");
                    replaceTargetWrap.style.cssText = "display:none;align-items:center;gap:6px;";
                    const replaceTargetLabel = document.createElement("span");
                    replaceTargetLabel.textContent = "替换目标:";
                    replaceTargetLabel.style.cssText = "color:#8b8d9b;font-size:12px;white-space:nowrap;";
                    const replaceTargetSelect = document.createElement("select");
                    replaceTargetSelect.style.cssText = "padding:8px 10px;background:#191a20;color:#e8e8ee;border:1px solid #3b3c46;border-radius:8px;outline:none;font-size:12px;cursor:pointer;max-width:260px;";
                    const collectReplaceTargets = () => {
                        const out = [];
                        (this.loraData.loras || []).forEach((l, lIdx) => {
                            out.push({ label: l.name || `(未命名 ${lIdx})`, target: { type: 'root', lIdx } });
                        });
                        (this.loraData.folders || []).forEach((f, fIdx) => {
                            (f.loras || []).forEach((l, lIdx) => {
                                out.push({ label: (f.name ? f.name + " / " : "") + (l.name || `(未命名 ${lIdx})`), target: { type: 'folder', fIdx, lIdx } });
                            });
                        });
                        return out;
                    };
                    const replaceTargets = collectReplaceTargets();
                    replaceTargetSelect.innerHTML = "";
                    if (!replaceTargets.length) {
                        const op = document.createElement("option");
                        op.value = ""; op.textContent = "（节点内暂无 LoRA）";
                        replaceTargetSelect.appendChild(op);
                    } else {
                        replaceTargets.forEach((t, i) => {
                            const op = document.createElement("option");
                            op.value = String(i);
                            op.textContent = t.label;
                            replaceTargetSelect.appendChild(op);
                        });
                        // 右键带入的替换目标 -> 预选
                        if (pendingReplace) {
                            const idx = replaceTargets.findIndex(t =>
                                t.target.type === pendingReplace.type &&
                                t.target.lIdx === pendingReplace.lIdx &&
                                (t.target.fIdx == null || t.target.fIdx === pendingReplace.fIdx));
                            if (idx >= 0) replaceTargetSelect.value = String(idx);
                        }
                    }
                    replaceTargetWrap.appendChild(replaceTargetLabel);
                    replaceTargetWrap.appendChild(replaceTargetSelect);
                    toolbar.appendChild(replaceTargetWrap);

                    // 排序辅助：对文件名/文件夹名数组按当前 sortMode + sortDir 排序
                    const mplSortList = (arr) => {
                        const copy = arr.slice();
                        const dir = (sortDir === "asc") ? 1 : -1;
                        if (sortMode === "time") {
                            // 按文件实际修改时间（mtime）；无 mtime（如文件夹）排到末尾
                            copy.sort((a, b) => {
                                const ma = allMtimes[a] || 0;
                                const mb = allMtimes[b] || 0;
                                if (ma !== mb) return (ma - mb) * dir;
                                return String(a).localeCompare(String(b), "zh");
                            });
                        } else {
                            copy.sort((a, b) => String(a).localeCompare(String(b), "zh") * dir);
                        }
                        return copy;
                    };

                    // “自动添加已获取的触发词”默认永久开启（控件已移除）
                    autoAddTag = true;
                    toolbar.appendChild(search);

                    // 刷新：重新扫描 LoRA 目录（本地新拷贝进来的文件无需重开窗口）
                    const refreshBtn = document.createElement("button");
                    refreshBtn.type = "button";
                    refreshBtn.innerHTML = mplIcon("refresh", 14) + '<span style="margin-left:5px;">刷新</span>';
                    refreshBtn.title = "重新扫描 LoRA 目录，显示新加入的本地文件";
                    refreshBtn.style.cssText = "padding:8px 12px;background:#191a20;color:#c8cad6;border:1px solid #3b3c46;border-radius:8px;cursor:pointer;font-size:12px;white-space:nowrap;transition:all .13s;display:inline-flex;align-items:center;";
                    refreshBtn.onmouseenter = () => { if (!refreshBtn.disabled) refreshBtn.style.borderColor = "rgba(108,140,255,0.5)"; };
                    refreshBtn.onmouseleave = () => { refreshBtn.style.borderColor = "#3b3c46"; };
                    refreshBtn.onclick = async (e) => {
                        e.stopPropagation();
                        if (refreshBtn.disabled) return;
                        refreshBtn.disabled = true;
                        const label = refreshBtn.querySelector("span");
                        if (label) label.textContent = "扫描中…";
                        try { await refreshFileList(); }
                        finally {
                            refreshBtn.disabled = false;
                            if (label) label.textContent = "刷新";
                        }
                    };
                    toolbar.appendChild(refreshBtn);
                    dialog.appendChild(toolbar);
                    
                    // 内容区域
                    const content = document.createElement("div");
                    content.className = "mpl-add-scroll";
                    content.style.cssText = "flex:1;overflow-y:auto;padding:12px;background:#1e1f26;display:grid;grid-template-columns:repeat(auto-fill, minmax(112px, 1fr));grid-auto-rows:150px;gap:10px;align-content:start;overscroll-behavior: contain;";
                    dialog.appendChild(content);
                    
                    // 底部状态栏
                    const footer = document.createElement("div");
                    footer.style.cssText = "padding:10px 16px;border-top:1px solid #3b3c46;background:#1e1f26;display:flex;align-items:center;justify-content:space-between;";
                    
                    const selectedCount = document.createElement("div");
                    selectedCount.style.cssText = "color:#8b8d9b;font-size:12.5px;";
                    selectedCount.textContent = "已选择 0 个 LoRA";
                    
                    const footerButtons = document.createElement("div");
                    footerButtons.style.cssText = "display:flex;gap:8px;align-items:center;";
                    
                    const addBtn = document.createElement("button");
                    addBtn.textContent = "添加选中 LoRA";
                    addBtn.style.cssText = "padding:8px 16px;background:#6c8cff;border:none;color:#fff;border-radius:8px;cursor:pointer;font-size:12.5px;font-weight:600;box-shadow:0 2px 10px rgba(108,140,255,0.3);transition:background .13s;";
                    addBtn.onmouseenter = () => addBtn.style.background = "#8098ff";
                    addBtn.onmouseleave = () => addBtn.style.background = "#6c8cff";
                    
                    const closeBtn = document.createElement("button");
                    closeBtn.textContent = "关闭";
                    closeBtn.style.cssText = "padding:8px 14px;background:transparent;border:1px solid #3b3c46;color:#8b8d9b;border-radius:8px;cursor:pointer;font-size:12.5px;transition:all .13s;";
                    closeBtn.onmouseenter = () => { closeBtn.style.background = "#2a2b34"; closeBtn.style.color = "#e8e8ee"; };
                    closeBtn.onmouseleave = () => { closeBtn.style.background = "transparent"; closeBtn.style.color = "#8b8d9b"; };
                    
                    const applyModeVisuals = () => {
                        const isRep = actionMode === "replace";
                        addModeBtn.style.background = isRep ? "transparent" : "#6c8cff";
                        addModeBtn.style.color = isRep ? "#8b8d9b" : "#fff";
                        addModeBtn.style.borderColor = isRep ? "#3b3c46" : "#6c8cff";
                        replaceModeBtn.style.background = isRep ? "#6c8cff" : "transparent";
                        replaceModeBtn.style.color = isRep ? "#fff" : "#8b8d9b";
                        replaceModeBtn.style.borderColor = isRep ? "#6c8cff" : "#3b3c46";
                        replaceTargetWrap.style.display = isRep ? "flex" : "none";
                    };
                    const updateAddBtn = () => {
                        if (actionMode === "replace" && pendingReplace) {
                            addBtn.textContent = selectedFiles.size > 0 ? "确认替换 LoRA" : "选择要替换成的 LoRA";
                        } else if (actionMode === "replace") {
                            addBtn.textContent = "请先在上方选替换目标";
                        } else {
                            addBtn.textContent = "添加选中 LoRA";
                        }
                    };
                    addModeBtn.onclick = (e) => {
                        e.stopPropagation();
                        actionMode = "add";
                        applyModeVisuals(); updateAddBtn();
                    };
                    replaceModeBtn.onclick = (e) => {
                        e.stopPropagation();
                        actionMode = "replace";
                        if (!pendingReplace && replaceTargets.length) {
                            const i = parseInt(replaceTargetSelect.value, 10) || 0;
                            pendingReplace = replaceTargets[i] ? replaceTargets[i].target : null;
                        }
                        applyModeVisuals(); updateAddBtn();
                    };
                    replaceTargetSelect.onchange = () => {
                        const i = parseInt(replaceTargetSelect.value, 10);
                        pendingReplace = replaceTargets[i] ? replaceTargets[i].target : null;
                        if (actionMode !== "replace") { actionMode = "replace"; applyModeVisuals(); }
                        updateAddBtn();
                    };
                    applyModeVisuals();
                    updateAddBtn();
                    footerButtons.appendChild(addBtn);
                    footerButtons.appendChild(closeBtn);
                    footer.appendChild(selectedCount);
                    footer.appendChild(footerButtons);
                    dialog.appendChild(footer);
                    
                    // 创建Lora卡片
                    const createLoraCard = (f) => {
                            const card = document.createElement("div");
                            const isSelected = selectedFiles.has(f);
                            card.style.cssText = `
                                width:100%;
                                height:100%;
                                background:${isSelected ? 'rgba(108,140,255,0.16)' : '#2a2b34'};
                                border-radius:9px;
                                overflow:hidden;
                                cursor:pointer;
                                border:${isSelected ? '2px solid #6c8cff' : '1px solid #3b3c46'};
                                transition:border-color .13s ease, box-shadow .13s ease, background-color .13s ease;
                                position:relative;
                                display:flex;
                                flex-direction:column;
                                box-shadow:${isSelected ? '0 0 0 2px rgba(108,140,255,0.25), 0 4px 14px rgba(108,140,255,0.28)' : 'none'};
                            `;
                            card.title = f;
                            card.dataset.selected = isSelected;
                        
                        // 点击卡片切换选中状态
                        card.onclick = (e) => {
                            e.stopPropagation();
                            const wasSelected = selectedFiles.has(f);
                            if (wasSelected) {
                                selectedFiles.delete(f);
                            } else {
                                selectedFiles.add(f);
                            }
                            // 更新卡片样式
                            const nowSelected = selectedFiles.has(f);
                            card.dataset.selected = nowSelected;
                            card.style.background = nowSelected ? 'rgba(108,140,255,0.16)' : '#2a2b34';
                            card.style.border = nowSelected ? '2px solid #6c8cff' : '1px solid #3b3c46';
                            card.style.boxShadow = nowSelected ? '0 0 0 2px rgba(108,140,255,0.25), 0 4px 14px rgba(108,140,255,0.28)' : 'none';
                            updateSelectedCount();
                            updateAddBtn();
                        };
                        
                        // 右键：爬取信息（已选中多个时批量）/ 打开 Civitai / 编辑信息
                        card.oncontextmenu = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const targets = selectedFiles.has(f) && selectedFiles.size
                                ? Array.from(selectedFiles)
                                : [f];
                            this.showAddLoraCardContextMenu(f, e.clientX, e.clientY, targets);
                        };

                        card.onmouseover = () => { 
                            if (!selectedFiles.has(f)) {
                                card.style.borderColor = "rgba(108,140,255,0.55)"; 
                                card.style.boxShadow = "0 0 0 2px rgba(108,140,255,0.18)"; 
                            } else {
                                card.style.boxShadow = "0 0 0 2px rgba(108,140,255,0.3), 0 4px 16px rgba(108,140,255,0.35)";
                            }
                        };
                        card.onmouseout = () => { 
                            const isSelected = selectedFiles.has(f);
                            card.style.borderColor = isSelected ? "#6c8cff" : "#3b3c46"; 
                            card.style.boxShadow = isSelected ? "0 0 0 2px rgba(108,140,255,0.25), 0 4px 14px rgba(108,140,255,0.28)" : "none"; 
                        };
                            
                            const imgBox = document.createElement("div");
                            imgBox.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;background:#111;z-index:0;";
                            
                            const img = document.createElement("img");
                            img.style.cssText = "width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 0.3s;display:block;";
                            img.loading = "lazy";
                        const spinner = document.createElement("div"); 
                        spinner.className = "mpl-spinner"; 
                        imgBox.appendChild(spinner);
                            const safeName = encodeURIComponent(f);
                            // 请求缓存缩略图（WebP），去掉 cache-buster 以便浏览器缓存
                            img.decoding = "async";
                            img.src = api.apiURL(`/malora/lora/image?name=${safeName}&w=320${mplBustSuffix(f)}`);
                            img.onload = () => { img.style.opacity = "1"; spinner.remove(); };
                            img.onerror = () => {
                                img.style.display = "none"; spinner.remove();
                            const fallback = document.createElement("div"); 
                            fallback.innerHTML = "No Image";
                                fallback.style.cssText = "width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#444;font-size:12px;background:#252525;";
                                imgBox.appendChild(fallback);
                            };
                            imgBox.appendChild(img);
                            
                            const nameBox = document.createElement("div");
                            nameBox.style.cssText = "position:absolute;bottom:0;left:0;width:100%;padding:4px 6px;font-size:11px;color:#eee;background:rgba(0,0,0,0.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box;z-index:1;text-align:center;backdrop-filter:blur(2px);";
                        nameBox.textContent = f.split(/[/\\]/).pop().replace(/\.(safetensors|pt|ckpt)$/, "");

                        // 编辑按钮已移到右键菜单（卡片上不再显示编辑按钮）
                        card.appendChild(imgBox);
                        card.appendChild(nameBox);
                        return card;
                    };
                    
                    // 搜索：匹配文件名（含子文件夹路径）或 LoRA 标题
                    const matchesSearch = (f, filter) => mplLoraMatchesText(f, filter);

                    // 渲染内容
                    // 分批把卡片追加到内容区：先渲染首批（首屏秒出），其余用 rAF 逐帧追加，避免一次性卡死
                    let _renderToken = 0;
                    // 刷新（爬取/重新扫描）时记住滚动位置，用户一滚动就放弃恢复
                    let _pendingScrollTop = null;
                    const appendCardsChunked = (taskList, batch = 48) => {
                        const token = ++_renderToken;
                        let idx = 0;
                        const runBatch = () => {
                            if (token !== _renderToken) return; // 已被新的渲染取代
                            const end = Math.min(idx + batch, taskList.length);
                            const frag = document.createDocumentFragment();
                            for (; idx < end; idx++) {
                                const card = taskList[idx]();
                                if (card) frag.appendChild(card);
                            }
                            content.appendChild(frag);
                            if (_pendingScrollTop != null) content.scrollTop = _pendingScrollTop;
                            if (idx < taskList.length) {
                                requestAnimationFrame(runBatch);
                            } else {
                                _pendingScrollTop = null;
                            }
                        };
                        runBatch();
                    };
                    const getCurrentFolder = () => {
                        if (currentPath.length === 0) return { files: rootFiles, folders: folderTree };
                        let current = folderTree;
                        for (let i = 0; i < currentPath.length; i++) {
                            const name = currentPath[i];
                            if (!current[name]) return { files: [], folders: {} };
                            if (i === currentPath.length - 1) return { files: current[name].files || [], folders: current[name].folders || {} };
                            current = current[name].folders || {};
                        }
                        return { files: [], folders: {} };
                    };
                    // 当前文件夹及其所有子文件夹下的文件
                    const currentSubtreeFiles = () => {
                        const norm = (s) => String(s).replace(/\\/g, "/");
                        if (!currentPath.length) return allFiles.slice();
                        const prefix = norm(currentPath.join("/")) + "/";
                        return allFiles.filter(f => norm(f).startsWith(prefix));
                    };
                    const pathPersist = () => {
                        try { localStorage.setItem("MA_ADD_LORA_PATH", JSON.stringify(currentPath)); } catch (e) {}
                    };
                    const makeFolderCard = (folderName) => {
                        const folderCard = document.createElement("div");
                        folderCard.style.cssText = "width:100%;height:100%;background:#2a2b34;border-radius:9px;overflow:hidden;cursor:pointer;border:1px solid #3b3c46;transition:border-color .13s ease, box-shadow .13s ease;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;";
                        const folderIcon = document.createElement("div");
                        folderIcon.innerHTML = mplIcon("folder", 40);
                        folderIcon.style.cssText = "margin-bottom:8px;color:#6c8cff;opacity:.85;display:flex;";
                        const folderNameEl = document.createElement("div");
                        folderNameEl.textContent = folderName;
                        folderNameEl.style.cssText = "color:#eee;font-size:11px;text-align:center;padding:0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%;";
                        folderCard.appendChild(folderIcon);
                        folderCard.appendChild(folderNameEl);
                        folderCard.onclick = () => {
                            currentPath.push(folderName);
                            renderContent();
                        };
                        folderCard.onmouseover = () => { folderCard.style.borderColor = "rgba(108,140,255,0.55)"; folderCard.style.boxShadow = "0 0 0 2px rgba(108,140,255,0.15)"; };
                        folderCard.onmouseout = () => { folderCard.style.borderColor = "#3b3c46"; folderCard.style.boxShadow = "none"; };
                        return folderCard;
                    };
                    const renderContent = (preserveScroll = false) => {
                        _renderToken++; // 使旧的批次渲染失效
                        _pendingScrollTop = preserveScroll ? content.scrollTop : null;
                        if (preserveScroll) {
                            // 用户主动滚动/点击时不再强行拉回
                            if (content._scrollAbort) content._scrollAbort.abort();
                            content._scrollAbort = new AbortController();
                            const cancelRestore = () => { _pendingScrollTop = null; };
                            content.addEventListener("wheel", cancelRestore, { passive: true, signal: content._scrollAbort.signal });
                            content.addEventListener("pointerdown", cancelRestore, { signal: content._scrollAbort.signal });
                        }
                        content.innerHTML = "";
                        pathPersist();
                        const filter = search.value.trim().toLowerCase();
                        search.placeholder = "🔍 搜索当前文件夹（含子文件夹）...";
                        updatePathDisplay();

                        const current = getCurrentFolder();
                        if (filter) {
                            // 搜索：只搜当前文件夹及其子文件夹，直接列文件（不显示文件夹磁贴）
                            const hits = mplSortList(currentSubtreeFiles().filter(f => matchesSearch(f, filter)));
                            appendCardsChunked(hits.map(f => () => createLoraCard(f)));
                            return;
                        }
                        mplSortList(Object.keys(current.folders || {})).forEach(folderName => {
                            content.appendChild(makeFolderCard(folderName));
                        });
                        appendCardsChunked(mplSortList(current.files || []).map(f => () => createLoraCard(f)));
                    };
                    
                    // 刷新文件列表的函数（用于删除后刷新）
                    const refreshFileList = async () => {
                        try {
                            // 重新获取文件列表
                            const resp = await api.fetchApi("/malora/lora/list");
                            const data = await resp.json();
                            const newAllFiles = data.files || [];
                            // 同步 mtimes
                            allMtimes = data.mtimes || {};
                            newAllFiles.forEach(f => { if (allMtimes[f] === undefined) allMtimes[f] = 0; });
                            mplSetLoraNameList(newAllFiles);

                            const newFolderTree = {};
                            const newRootFiles = [];
                            newAllFiles.forEach(file => {
                                const parts = String(file).split(/[/\\]/);
                                if (parts.length === 1) { newRootFiles.push(file); return; }
                                let current = newFolderTree;
                                for (let i = 0; i < parts.length - 1; i++) {
                                    const folderName = parts[i];
                                    if (!current[folderName]) current[folderName] = { files: [], folders: {} };
                                    if (i === parts.length - 2) current[folderName].files.push(file);
                                    else {
                                        if (!current[folderName].folders) current[folderName].folders = {};
                                        current = current[folderName].folders;
                                    }
                                }
                            });
                            allFiles.length = 0;
                            allFiles.push(...newAllFiles);
                            Object.keys(folderTree).forEach(key => delete folderTree[key]);
                            Object.assign(folderTree, newFolderTree);
                            rootFiles.length = 0;
                            rootFiles.push(...newRootFiles);
                            cacheTimestamp = Date.now();
                            // 同步刷新缓存
                            nodeType._maListCache = { files: newAllFiles.slice(), mtimes: allMtimes, t: Date.now() };
                            try { sessionStorage.setItem("MA_LORA_LIST", JSON.stringify({ files: newAllFiles, mtimes: allMtimes, t: Date.now() })); } catch(e) {}
                            
                            // 重新渲染（保留当前目录、已选中的卡片和滚动位置）
                            renderContent(true);
                        } catch (e) {
                            console.error("刷新文件列表时出错:", e);
                        }
                    };
                    
                    // 保存renderContent函数引用，以便在爬取成功后可以调用
                    this._renderContentFunc = renderContent;
                    // 保存refreshFileList函数引用，以便在删除后可以调用
                    this._refreshFileListFunc = refreshFileList;
                    this._addLoraModal = dialog;
                    
                    // 更新选中数量
                    const updateSelectedCount = () => {
                        selectedCount.textContent = `已选择 ${selectedFiles.size} 个 LoRA`;
                    };
                    
                    // 搜索功能
                    search.oninput = () => {
                        renderContent();
                    };
                    
                    // 添加按钮（合并窗口：按 actionMode 执行添加或替换）
                    addBtn.onclick = async () => {
                        if (actionMode === "replace") {
                            if (!pendingReplace) { alert("请先在上方【替换目标】里选择要替换的 LoRA"); return; }
                            const first = Array.from(selectedFiles)[0];
                            if (!first) { alert("请选择要替换成的 LoRA"); return; }
                            this.performReplaceLora(pendingReplace, first);
                            document.body.removeChild(dialog);
                            return;
                        }
                        // 辅助函数：从.log文件中解析preferred weight
                        const parsePreferredWeight = (logContent) => {
                            if (!logContent || !logContent.trim()) return null;
                            try {
                                // 首先尝试作为JSON解析
                                try {
                                    const jsonData = JSON.parse(logContent);
                                    // 查找 preferred weight 字段（支持多种可能的字段名）
                                    const preferredWeight = jsonData["preferred weight"] || 
                                                          jsonData["preferredWeight"] || 
                                                          jsonData["preferred_weight"] ||
                                                          jsonData["weight"];
                                    
                                    if (preferredWeight !== undefined && !isNaN(parseFloat(preferredWeight))) {
                                        const weightValue = parseFloat(preferredWeight);
                                        // 确保权重值在合理范围内 (-10 到 10)
                                        if (weightValue >= -10 && weightValue <= 10) {
                                            return weightValue;
                                        }
                                    }
                                } catch (jsonError) {
                                    // 如果不是JSON格式，尝试使用正则表达式匹配
                                    const weightPattern = /preferred\s+weight[:\s=]+([+-]?\d*\.?\d+)/i;
                                    const match = logContent.match(weightPattern);
                                    if (match && match[1]) {
                                        const weight = parseFloat(match[1]);
                                        if (!isNaN(weight)) {
                                            // 限制权重范围在-10到10之间
                                            return Math.max(-10, Math.min(10, weight));
                                        }
                                    }
                                }
                            } catch (e) {
                                console.error("解析preferred weight时出错:", e);
                            }
                            return null;
                        };
                        
                        // 并行读取所有选中lora的.log文件，获取preferred weight
                        const weightPromises = Array.from(selectedFiles).map(async (fileName) => {
                            try {
                                const response = await api.fetchApi('/malora/lora/get_lora_file', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ lora_filename: fileName, file_type: 'log' })
                                });
                                const result = await response.json();
                                if (result.status === 'success' && result.content) {
                                    const preferredWeight = parsePreferredWeight(result.content);
                                    return { fileName, preferredWeight };
                                }
                            } catch (e) {
                                console.error(`读取${fileName}的log文件时出错:`, e);
                            }
                            return { fileName, preferredWeight: null };
                        });
                        
                        const weightResults = await Promise.all(weightPromises);
                        
                        // 创建weight映射，方便查找
                        const weightMap = new Map();
                        weightResults.forEach(({ fileName, preferredWeight }) => {
                            weightMap.set(fileName, preferredWeight);
                        });
                        
                        // 如果启用了自动添加触发词，需要先读取所有选中lora的.txt文件
                        if (autoAddTag) {
                            // 并行读取所有选中lora的.txt文件
                            const readPromises = Array.from(selectedFiles).map(async (fileName) => {
                                try {
                                    const response = await api.fetchApi('/malora/lora/get_lora_file', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ lora_filename: fileName, file_type: 'txt' })
                                    });
                                    const result = await response.json();
                                    if (result.status === 'success' && result.content) {
                                        return { fileName, tags: result.content.trim() };
                                    }
                                } catch (e) {
                                    console.error(`读取${fileName}的txt文件时出错:`, e);
                                }
                                return { fileName, tags: '' };
                            });
                            
                            const tagResults = await Promise.all(readPromises);
                            
                            // 创建tag映射，方便查找
                            const tagMap = new Map();
                            tagResults.forEach(({ fileName, tags }) => {
                                tagMap.set(fileName, tags);
                            });
                            
                            // 添加lora，使用读取到的tags和preferred weight
                            selectedFiles.forEach(fileName => {
                                const preferredWeight = weightMap.get(fileName);
                                this.loraData.loras.push(mplDecorateNewLora({
                                    name: fileName, 
                                    weight: preferredWeight !== null ? preferredWeight : 1.0, 
                                    enabled: true, 
                                    tags: tagMap.get(fileName) || "", 
                                    note: "" 
                                }));
                            });
                        } else {
                            // 不启用自动添加，直接添加lora，但使用preferred weight
                            selectedFiles.forEach(fileName => {
                                const preferredWeight = weightMap.get(fileName);
                                this.loraData.loras.push(mplDecorateNewLora({
                                    name: fileName, 
                                    weight: preferredWeight !== null ? preferredWeight : 1.0, 
                                    enabled: true, 
                                    tags: "", 
                                    note: "" 
                                }));
                            });
                        }
                        
                                this.renderEmbeddedList();
                                this.updateWidget();
                                document.body.removeChild(dialog);
                            };
                    
                    // 关闭按钮
                    closeBtn.onclick = () => {
                        document.body.removeChild(dialog);
                    };
                    
                    // ESC键关闭
                    const handleEsc = (e) => {
                        if (e.key === "Escape") {
                            document.body.removeChild(dialog);
                            document.removeEventListener("keydown", handleEsc);
                        }
                    };
                    document.addEventListener("keydown", handleEsc);
                    
                    // 先挂载窗口（用户立即看到骨架），再在下一帧渲染卡片，避免点击到出现之间卡顿
                    document.body.appendChild(dialog);

                    // 打开后光标直接落在搜索框，可直接输入搜索
                    // 不用 rAF：后台/隐藏标签页里 rAF 不会触发，setTimeout 更稳
                    const focusSearch = () => {
                        try {
                            if (dialog.isConnected && !dialog.contains(document.activeElement)) search.focus();
                        } catch (e) {}
                    };
                    setTimeout(focusSearch, 0);
                    setTimeout(focusSearch, 150);

                    // 使弹窗可拖拽
                    this.makeDialogDraggable(dialog, header);

                    // 初始渲染放进下一帧，让窗口先绘制出来
                    requestAnimationFrame(() => {
                        try { renderContent(); } catch(e) { console.error(e); }
                    });
                } catch(e) { alert("Error: "+e); }
            };

            // 替换指定位置 lora 的 name（保留其 weight/tags/note/enabled 等，仅替换文件）
            nodeType.prototype.performReplaceLora = function(target, newName) {
                if (!target) return;
                let lora = null;
                if (target.type === 'root') {
                    lora = this.loraData.loras[target.lIdx];
                } else if (target.type === 'folder') {
                    const folder = this.loraData.folders[target.fIdx];
                    if (folder) lora = folder.loras[target.lIdx];
                }
                if (!lora) return;
                // 避免重复：若新文件已存在于节点内其他位置，给出提示但不阻止
                lora.name = newName;
                lora.note = mplNoteFor(newName) || "";
                // 尝试刷新触发词（异步，静默）：若本地有 txt 则更新
                api.fetchApi('/malora/lora/get_lora_file', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lora_filename: newName, file_type: 'txt' })
                }).then(r => r.json()).then(res => {
                    if (res && res.status === 'success' && res.content) {
                        mplSetTriggerWords(lora, res.content);
                        this.renderEmbeddedList();
                        this.updateWidget();
                    }
                }).catch(()=>{});
                this.renderEmbeddedList();
                this.updateWidget();
            };

            nodeType.prototype.showLoraDetectModal = async function(opts) {
                opts = opts || {};
                let currentPath = Array.isArray(opts.initialPath) ? opts.initialPath.slice() : [];
                let showAllMode = !!opts.initialShowAll;
                let allFiles = opts.allFiles;
                let folderTree = opts.folderTree;
                try {
                    if (!allFiles || !folderTree) {
                        const resp = await api.fetchApi("/malora/lora/list");
                        const data = await resp.json();
                        allFiles = data.files || [];
                        const built = buildMplFolderTree(allFiles);
                        folderTree = built.folderTree;
                    }

                    // 直接挂 body，不用 overlay（参考 magic_resolution.js 的做法）
                    const dialog = document.createElement("div");
                    dialog.style.cssText = `
                        position: fixed;
                        top: 50%; left: 50%;
                        transform: translate(-50%, -50%);
                        width: min(720px, 96vw);
                        max-height: 88vh;
                        background: #25292d;
                        border: 1px solid #4a515a;
                        border-radius: 8px;
                        box-shadow: 0 8px 32px rgba(0,0,0,0.75);
                        display: flex;
                        flex-direction: column;
                        font-family: sans-serif;
                        color: #e0e0e0;
                        z-index: 10050;
                        overflow: hidden;
                    `;

                    const header = document.createElement("div");
                    header.style.cssText = "padding:12px 16px;border-bottom:1px solid #333;background:#1a1a1a;border-radius:8px 8px 0 0;cursor:move;user-select:none;display:flex;justify-content:space-between;align-items:center;";
                    const title = document.createElement("div");
                    title.textContent = "LoRA 检测（重复 + 更新）";
                    title.style.cssText = "font-weight:bold;font-size:15px;";
                    const closeX = document.createElement("button");
                    closeX.textContent = "✕";
                    closeX.style.cssText = "background:none;border:none;color:#aaa;cursor:pointer;font-size:18px;padding:0 8px;";
                    header.appendChild(title);
                    header.appendChild(closeX);

                    const pathBar = document.createElement("div");
                    pathBar.style.cssText = "padding:8px 16px;border-bottom:1px solid #333;background:#222;display:flex;align-items:center;gap:8px;flex-wrap:wrap;";
                    const allTab = document.createElement("div");
                    allTab.textContent = "全部";
                    allTab.style.cssText = "";
                    const pathDisplay = document.createElement("div");
                    pathDisplay.style.cssText = "color:#888;font-size:12px;display:flex;gap:4px;align-items:center;flex-wrap:wrap;flex:1;";

                    const scopeHint = document.createElement("div");
                    scopeHint.style.cssText = "padding:8px 16px;background:#1e2428;font-size:12px;color:#90caf9;border-bottom:1px solid #333;";

                    const folderRow = document.createElement("div");
                    folderRow.style.cssText = "padding:8px 16px;border-bottom:1px solid #333;background:#1a1a1a;display:flex;flex-wrap:wrap;gap:6px;align-items:center;max-height:100px;overflow-y:auto;";

                    const fmtSize = (n) => {
                        if (n == null) return "";
                        if (n < 1024) return n + " B";
                        if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
                        return (n / 1048576).toFixed(1) + " MB";
                    };
                    const fmtTime = (ts) => {
                        try { return new Date(ts * 1000).toLocaleString(); } catch (_) { return String(ts); }
                    };

                    const updateScopeUI = () => {
                        if (showAllMode) {
                            scopeHint.textContent = "检测范围：全部 LoRA 文件（可能较慢）";
                            allTab.textContent = "取消全部";
                            allTab.style.cssText = ""; allTab.classList.add("is-active");
                            pathDisplay.innerHTML = "";
                            folderRow.innerHTML = "<span style='color:#888;font-size:12px;'>全部模式下可点击下方「开始检测」扫描所有目录。</span>";
                            return;
                        }
                        allTab.textContent = "全部";
                        allTab.style.cssText = "";
                        if (currentPath.length === 0) {
                            scopeHint.textContent = "检测范围：根目录 — 仅 loras 根下的文件（不包含子文件夹内文件）。进入子文件夹可检测该文件夹及其下所有子目录。";
                        } else {
                            scopeHint.textContent = "检测范围：文件夹「" + currentPath.join("/") + "」及其所有子目录内的 LoRA。";
                        }
                        pathDisplay.innerHTML = "";
                        const rootSpan = document.createElement("span");
                        rootSpan.textContent = "根目录";
                        rootSpan.style.cssText = "color:#4CAF50;cursor:pointer;text-decoration:underline;";
                        rootSpan.onclick = () => { showAllMode = false; currentPath = []; updateScopeUI(); };
                        pathDisplay.appendChild(rootSpan);
                        currentPath.forEach((folderName, index) => {
                            const sep = document.createElement("span");
                            sep.textContent = " > ";
                            sep.style.color = "#666";
                            pathDisplay.appendChild(sep);
                            const sp = document.createElement("span");
                            sp.textContent = folderName;
                            sp.style.cssText = "color:#4CAF50;cursor:pointer;text-decoration:underline;";
                            sp.onclick = () => { currentPath = currentPath.slice(0, index + 1); updateScopeUI(); };
                            pathDisplay.appendChild(sp);
                        });
                        folderRow.innerHTML = "";
                        const subs = mplGetSubfolderNames(folderTree, currentPath);
                        if (!subs.length) {
                            const t = document.createElement("span");
                            t.style.cssText = "color:#666;font-size:12px;";
                            t.textContent = "当前层级无子文件夹，可直接开始检测。";
                            folderRow.appendChild(t);
                        } else {
                            subs.forEach(name => {
                                const b = document.createElement("button");
                                b.type = "button";
                                b.innerHTML = mplIcon("folder", 13) + '<span style="margin-left:5px;">' + name + '</span>';
                                b.style.cssText = "padding:4px 10px;background:#333;border:1px solid #555;border-radius:4px;color:#ccc;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;";
                                b.onclick = () => { currentPath = currentPath.concat([name]); updateScopeUI(); };
                                folderRow.appendChild(b);
                            });
                        }
                    };

                    allTab.onclick = () => {
                        if (showAllMode) {
                            showAllMode = false;
                            currentPath = [];
                        } else {
                            showAllMode = true;
                        }
                        updateScopeUI();
                    };

                    pathBar.appendChild(allTab);
                    pathBar.appendChild(pathDisplay);

                    const bodyScroll = document.createElement("div");
                    bodyScroll.style.cssText = "flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:14px;min-height:220px;";

                    const mkSectionTitle = (txt, color) => {
                        const d = document.createElement("div");
                        d.textContent = txt;
                        d.style.cssText = "font-size:13px;font-weight:600;color:" + (color || "#fff") + ";margin-bottom:4px;";
                        return d;
                    };
                    const dupBox = document.createElement("div");
                    dupBox.style.cssText = "min-height:72px;padding:10px;background:#1f2428;border-radius:6px;border:1px solid #444;";
                    dupBox.innerHTML = "<div style='color:#888;font-size:12px;'>点击右下角「开始检测」后显示：内容完全相同（SHA256 一致）的重复 LoRA。</div>";
                    const updBox = document.createElement("div");
                    updBox.style.cssText = "min-height:72px;padding:10px;background:#1f2428;border-radius:6px;border:1px solid #444;";
                    updBox.innerHTML = "<div style='color:#888;font-size:12px;'>点击右下角「检测 LoRA 更新」后，通过 SHA256 查询 Civitai，匹配到则对比本地版本与 Civitai 最新版本号，显示有更新的 LoRA。</div>";

                    bodyScroll.appendChild(mkSectionTitle("① 重复 LoRA（哈希相同）", "#ef9a9a"));
                    bodyScroll.appendChild(dupBox);
                    bodyScroll.appendChild(mkSectionTitle("② LoRA 更新（Civitai）", "#81c784"));
                    bodyScroll.appendChild(updBox);

                    const footer = document.createElement("div");
                    footer.style.cssText = "padding:12px 16px;border-top:1px solid #333;background:#1a1a1a;border-radius:0 0 8px 8px;display:flex;justify-content:flex-end;align-items:center;gap:10px;";

                    const dupBtn = document.createElement("button");
                    dupBtn.type = "button";
                    dupBtn.textContent = "🔍 检测重复 LoRA";
                    dupBtn.style.cssText = "padding:8px 16px;background:#d32f2f;border:none;color:#fff;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600;";

                    const updBtn = document.createElement("button");
                    updBtn.type = "button";
                    updBtn.textContent = "🌐 检测 LoRA 更新";
                    updBtn.style.cssText = "padding:8px 16px;background:#1976D2;border:none;color:#fff;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600;";

                    const allBtn = document.createElement("button");
                    allBtn.type = "button";
                    allBtn.textContent = "🚀 全部检测";
                    allBtn.style.cssText = "padding:8px 16px;background:#4CAF50;border:none;color:#fff;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600;";

                    const parseJsonResp = async (resp) => {
                        const status = resp.status;
                        const text = await resp.text();
                        try {
                            return text ? JSON.parse(text) : null;
                        } catch (je) {
                            const hint = (text || "").replace(/\s+/g, " ").trim().slice(0, 200);
                            throw new Error(
                                (je && je.message ? je.message : String(je)) +
                                (hint ? " · 响应开头: " + hint : "") +
                                " (HTTP " + status + ")"
                            );
                        }
                    };

                    const renderDupResults = (data) => {
                        if (!data || !data.ok) {
                            dupBox.innerHTML = "<div style='color:#f44336;font-size:12px;'>检测失败：" + (data && data.error ? data.error : "未知错误") + "</div>";
                            return;
                        }
                        const summary = "<div style='color:#888;font-size:11px;margin-bottom:8px;'>本次扫描：范围内 " + data.scoped_count + " 个 LoRA 路径，已读取 " + data.scanned + " 个文件。</div>";
                        dupBox.innerHTML = summary;
                        if (!data.duplicates || !data.duplicates.length) {
                            dupBox.innerHTML += "<div style='color:#a5d6a7;font-size:12px;'>未发现内容完全相同的重复文件。</div>";
                        } else {
                            data.duplicates.forEach(g => {
                                const div = document.createElement("div");
                                div.style.cssText = "margin-bottom:10px;padding:8px;background:#332a2a;border-radius:6px;border-left:3px solid #f44336;";
                                const h = document.createElement("div");
                                h.style.cssText = "color:#ffab91;font-size:11px;margin-bottom:6px;word-break:break-all;";
                                h.textContent = "相同 SHA256 · " + (g.hash || "").slice(0, 24) + "…";
                                div.appendChild(h);
                                (g.files || []).forEach(f => {
                                    const row = document.createElement("div");
                                    row.style.cssText = "color:#ccc;font-size:11px;padding:2px 0;word-break:break-all;";
                                    row.textContent = (f.path || "") + "  ·  " + fmtTime(f.mtime) + "  ·  " + fmtSize(f.size);
                                    div.appendChild(row);
                                });
                                dupBox.appendChild(div);
                            });
                        }
                    };

                    const renderUpdResults = (data) => {
                        if (!data || !data.ok) {
                            updBox.innerHTML = "<div style='color:#f44336;font-size:12px;'>检测失败：" + (data && data.error ? data.error : "未知错误") + "</div>";
                            return;
                        }
                        const summary = "<div style='color:#888;font-size:11px;margin-bottom:8px;'>本次扫描：范围内 " + data.scoped_count + " 个 LoRA 路径，已读取 " + data.scanned + " 个文件，查询 Civitai 中…</div>";
                        updBox.innerHTML = summary;
                        if (!data.updates || !data.updates.length) {
                            updBox.innerHTML += "<div style='color:#a5d6a7;font-size:12px;'>所有 LoRA 都已是 Civitai 上的最新版本，或无法在 Civitai 找到匹配记录。</div>";
                        } else {
                            data.updates.forEach(u => {
                                const div = document.createElement("div");
                                div.style.cssText = "margin-bottom:10px;padding:8px;background:#2a332a;border-radius:6px;border-left:3px solid #4CAF50;";
                                const t = document.createElement("div");
                                t.style.cssText = "color:#a5d6a7;font-size:11px;margin-bottom:4px;word-break:break-all;";
                                const lat = (u.latest_label && String(u.latest_label).trim()) ? String(u.latest_label).trim() : ("v" + u.latest_version);
                                const locv = (u.local_label && String(u.local_label).trim()) ? String(u.local_label).trim() : ("v" + u.local_version);
                                t.textContent = (u.model_name || u.path) + "  ·  Civitai 最新: " + lat;
                                div.appendChild(t);
                                const loc = document.createElement("div");
                                loc.style.cssText = "color:#fff;font-size:11px;margin-bottom:2px;";
                                let locText = "本地版本: " + locv + "  ·  文件: " + u.path;
                                if (u.local_base_model) locText += "  ·  Base: " + u.local_base_model;
                                loc.textContent = locText;
                                div.appendChild(loc);
                                div.appendChild(loc);
                                if (u.model_url) {
                                    const lnk = document.createElement("a");
                                    lnk.href = u.model_url;
                                    lnk.target = "_blank";
                                    lnk.style.cssText = "color:#90caf9;font-size:11px;";
                                    lnk.textContent = "在 Civitai 查看 →";
                                    div.appendChild(lnk);
                                }
                                updBox.appendChild(div);
                            });
                        }
                    };

                    const setLoading = (btn, label, loading) => {
                        btn.disabled = loading;
                        btn.textContent = loading ? "处理中…" : label;
                        btn.style.opacity = loading ? "0.7" : "1";
                    };

                    dupBtn.onclick = async () => {
                        setLoading(dupBtn, "🔍 检测重复 LoRA", true);
                        try {
                            const r = await api.fetchApi("/malora/lora/detect_scan", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    scope: showAllMode ? "all" : "folder",
                                    path: currentPath,
                                }),
                            });
                            renderDupResults(await parseJsonResp(r));
                        } catch (err) {
                            renderDupResults({ ok: false, error: String(err) });
                        } finally {
                            setLoading(dupBtn, "🔍 检测重复 LoRA", false);
                        }
                    };

                    updBtn.onclick = async () => {
                        setLoading(updBtn, "🌐 检测 LoRA 更新", true);
                        try {
                            const r = await api.fetchApi("/malora/lora/update_check", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    scope: showAllMode ? "all" : "folder",
                                    path: currentPath,
                                }),
                            });
                            renderUpdResults(await parseJsonResp(r));
                        } catch (err) {
                            renderUpdResults({ ok: false, error: String(err) });
                        } finally {
                            setLoading(updBtn, "🌐 检测 LoRA 更新", false);
                        }
                    };

                    allBtn.onclick = async () => {
                        setLoading(allBtn, "🚀 全部检测", true);
                        dupBtn.disabled = true;
                        updBtn.disabled = true;
                        dupBox.innerHTML = "<div style='color:#888;font-size:12px;'>检测中…</div>";
                        updBox.innerHTML = "<div style='color:#888;font-size:12px;'>检测中…</div>";
                        try {
                            const [dupRes, updRes] = await Promise.all([
                                api.fetchApi("/malora/lora/detect_scan", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        scope: showAllMode ? "all" : "folder",
                                        path: currentPath,
                                    }),
                                }),
                                api.fetchApi("/malora/lora/update_check", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        scope: showAllMode ? "all" : "folder",
                                        path: currentPath,
                                    }),
                                }),
                            ]);
                            try {
                                renderDupResults(await parseJsonResp(dupRes));
                            } catch (e) {
                                dupBox.innerHTML = "<div style='color:#f44336;font-size:12px;'>重复检测失败：" + e + "</div>";
                            }
                            try {
                                renderUpdResults(await parseJsonResp(updRes));
                            } catch (e) {
                                updBox.innerHTML = "<div style='color:#f44336;font-size:12px;'>更新检测失败：" + e + "</div>";
                            }
                        } catch (err) {
                            dupBox.innerHTML = "<div style='color:#f44336;font-size:12px;'>检测失败：" + err + "</div>";
                            updBox.innerHTML = "<div style='color:#f44336;font-size:12px;'>检测失败：" + err + "</div>";
                        } finally {
                            setLoading(allBtn, "🚀 全部检测", false);
                            dupBtn.disabled = false;
                            updBtn.disabled = false;
                        }
                    };

                    footer.appendChild(dupBtn);
                    footer.appendChild(updBtn);
                    footer.appendChild(allBtn);

                    dialog.appendChild(header);
                    dialog.appendChild(pathBar);
                    dialog.appendChild(scopeHint);
                    dialog.appendChild(folderRow);
                    dialog.appendChild(bodyScroll);
                    dialog.appendChild(footer);
                    document.body.appendChild(dialog);

                    updateScopeUI();

                    // 拖拽实现：与 magic_resolution.js 完全一致的策略
                    // 初始居中用 top/left + transform，拖动时切 top/left，不碰 transform
                    let isDragging = false;
                    let offsetX = 0;
                    let offsetY = 0;
                    let hasMovedToFixed = false; // 只在首次拖动时切换一次

                    const dragStart = (e) => {
                        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
                            e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                            return;
                        }
                        const rect = dialog.getBoundingClientRect();
                        let mouseX, mouseY;
                        if (e.type === "mousedown") {
                            mouseX = e.clientX;
                            mouseY = e.clientY;
                        } else if (e.type === "touchstart") {
                            mouseX = e.touches[0].clientX;
                            mouseY = e.touches[0].clientY;
                        } else {
                            return;
                        }
                        offsetX = mouseX - rect.left;
                        offsetY = mouseY - rect.top;
                        isDragging = true;
                        e.preventDefault();
                    };

                    const drag = (e) => {
                        if (!isDragging) return;
                        e.preventDefault();
                        let mouseX, mouseY;
                        if (e.type === "mousemove") {
                            mouseX = e.clientX;
                            mouseY = e.clientY;
                        } else if (e.type === "touchmove") {
                            mouseX = e.touches[0].clientX;
                            mouseY = e.touches[0].clientY;
                        } else {
                            return;
                        }
                        let newX = mouseX - offsetX;
                        let newY = mouseY - offsetY;

                        const minX = 0;
                        const minY = 0;
                        const maxX = window.innerWidth - dialog.offsetWidth;
                        const maxY = window.innerHeight - dialog.offsetHeight;
                        newX = Math.max(minX, Math.min(newX, maxX));
                        newY = Math.max(minY, Math.min(newY, maxY));

                        // 首次拖动：从居中 transform 切换到 top/left 定位（只执行一次）
                        if (!hasMovedToFixed) {
                            hasMovedToFixed = true;
                            dialog.style.transform = '';
                            dialog.style.top = newY + 'px';
                            dialog.style.left = newX + 'px';
                        } else {
                            dialog.style.top = newY + 'px';
                            dialog.style.left = newX + 'px';
                        }
                    };

                    const dragEnd = () => {
                        isDragging = false;
                    };

                    header.addEventListener("mousedown", dragStart);
                    header.addEventListener("touchstart", dragStart);
                    document.addEventListener("mousemove", drag);
                    document.addEventListener("touchmove", drag);
                    document.addEventListener("mouseup", dragEnd);
                    document.addEventListener("touchend", dragEnd);

                    const escHandler = (e) => {
                        if (e.key !== "Escape" || !dialog.parentNode) return;
                        e.preventDefault();
                        e.stopPropagation();
                        closeDetectModal();
                    };
                    const closeDetectModal = () => {
                        document.removeEventListener("keydown", escHandler, true);
                        document.removeEventListener("mousemove", drag);
                        document.removeEventListener("touchmove", drag);
                        document.removeEventListener("mouseup", dragEnd);
                        document.removeEventListener("touchend", dragEnd);
                        if (dialog.parentNode) document.body.removeChild(dialog);
                    };
                    closeX.onclick = () => closeDetectModal();
                    document.addEventListener("keydown", escHandler, true);
                } catch (e) {
                    alert("LoRA 检测: " + e);
                }
            };

            nodeType.prototype.saveFolderPreset = async function(folder) {
                const name = prompt("Save Preset As:", folder.name);
                if(!name) return;
                try {
                    await api.fetchApi("/malora/lora/save_preset", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name, content: { folders: [folder] } })
                    });
                    await mplLoadSidebar(true);
                    this._renderSidebar?.();
                    alert("Saved!");
                } catch(e) { alert(e); }
            };

            nodeType.prototype.showSettingsModal = function() {
                // 从节点 / 属性 / 隐藏 widget 读取并归一化（避免 adaptive_mode 为字符串 "false" 时 !this.adaptiveMode 误判）
                const parseAdaptive = (v) => v === true || v === "true" || v === 1;
                const sdnqRaw = this.sdnqMode ?? this.properties["sdnq_mode"] ?? this._sdnqModeWidget?.value ?? "none";
                const kleinRaw = this.kleinMode ?? this.properties["klein_mode"] ?? this._kleinModeWidget?.value ?? "auto";
                const adaptiveRaw = this.adaptiveMode ?? this.properties["adaptive_mode"] ?? this._adaptiveModeWidget?.value;
                const currentSdnqMode = String(sdnqRaw || "none").toLowerCase();
                const currentKleinMode = String(kleinRaw || "auto").toLowerCase();
                const isAdaptive = parseAdaptive(adaptiveRaw);
                const sdnqOn = currentSdnqMode === "sdnq";
                const kleinOn = currentKleinMode === "klein";
                // 与确定按钮逻辑一致：自适应 > Klein > SDNQ > 默认（标准，与官方 LoraLoader 一致）
                // 注：ComfyUI 官方已在 model_patcher.py 提供 INT8/FP8 等量化权重的 LoRA 支持，
                // 因此本加载器不再需要专门的 INT8 模式选项，默认即可处理 INT8 模型。
                let primaryMode = "default";
                if (isAdaptive) primaryMode = "adaptive";
                else if (kleinOn) primaryMode = "klein";
                else if (sdnqOn) primaryMode = "sdnq";
                
                // 创建遮罩层
                const overlay = document.createElement("div");
                overlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    z-index: 10001;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                `;

                // 创建弹窗（一比一参考 magic_resolution.js：fixed + translate(-50%,-50%) 居中）
                const dialog = document.createElement("div");
                dialog.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: #171922;
                    border: 1px solid #2c3040;
                    border-radius: 14px;
                    padding: 0;
                    width: 640px;
                    max-width: 96vw;
                    max-height: 86vh;
                    box-shadow: 0 24px 60px rgba(0,0,0,.65), 0 2px 8px rgba(0,0,0,.4);
                    z-index: 10002;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
                    color: #e8e8ee;
                `;

                // 标题栏（可拖拽）
                const title = document.createElement("div");
                title.textContent = "设置";
                title.style.cssText = `
                    font-size: 16px;
                    font-weight: 700;
                    color: #f2f3f7;
                    letter-spacing: .2px;
                    padding: 16px 20px;
                    border-bottom: 1px solid #262a34;
                    cursor: move;
                    user-select: none;
                    background: transparent;
                    flex-shrink: 0;
                `;

                // Tab 切换栏
                const tabBar = document.createElement("div");
                tabBar.style.cssText = `
                    display: flex;
                    gap: 6px;
                    padding: 8px 16px 0;
                    background: transparent;
                    border-bottom: 1px solid #262a34;
                    flex-shrink: 0;
                `;
                const tabButtons = {};
                const tabContents = {};
                const tabDefs = [
                    { id: "mode", label: "模式切换" },
                    { id: "layout", label: "布局样式" },
                ];
                let currentTab = "mode";
                tabDefs.forEach((tab) => {
                    const btn = document.createElement("button");
                    btn.textContent = tab.label;
                    btn.dataset.tab = tab.id;
                    const active = currentTab === tab.id;
                    btn.style.cssText = `
                        flex: 1;
                        padding: 9px 14px;
                        background: ${active ? "#20232d" : "transparent"};
                        border: 1px solid ${active ? "#2f3444" : "transparent"};
                        border-bottom: 2px solid ${active ? "#6c8cff" : "transparent"};
                        color: ${active ? "#e8ecff" : "#8b93a8"};
                        border-radius: 8px 8px 0 0;
                        cursor: pointer;
                        font-size: 13px;
                        font-weight: ${active ? "600" : "500"};
                        transition: all 0.15s;
                    `;
                    btn.onmouseenter = () => {
                        if (currentTab !== tab.id) btn.style.color = "#ccc";
                    };
                    btn.onmouseleave = () => {
                        if (currentTab !== tab.id) btn.style.color = "#888";
                    };
                    btn.onclick = () => {
                        currentTab = tab.id;
                        tabDefs.forEach((t) => {
                            const b = tabButtons[t.id];
                            const c = tabContents[t.id];
                            const isActive = t.id === currentTab;
                            b.style.background = isActive ? "#20232d" : "transparent";
                            b.style.borderColor = isActive ? "#2f3444" : "transparent";
                            b.style.borderBottomColor = isActive ? "#6c8cff" : "transparent";
                            b.style.color = isActive ? "#e8ecff" : "#8b93a8";
                            b.style.fontWeight = isActive ? "600" : "500";
                            c.style.display = isActive ? "block" : "none";
                        });
                    };
                    tabButtons[tab.id] = btn;
                    tabBar.appendChild(btn);
                });

                // 内容区域（可滚动）
                const content = document.createElement("div");
                content.style.cssText = "flex: 1; overflow-y: auto; padding: 18px 20px; min-height: 0;";

                // 按钮容器
                const buttonContainer = document.createElement("div");
                buttonContainer.style.cssText = "display: flex; gap: 10px; justify-content: flex-end; padding: 14px 20px; border-top: 1px solid #262a34; flex-shrink: 0; background: transparent;";

                // 设置项容器
                const settingsContainer = document.createElement("div");
                settingsContainer.style.cssText = "display: flex; flex-direction: column; gap: 20px;";
                
                // ========== LoRA 加载模式 ==========
                const defaultSection = document.createElement("div");
                defaultSection.style.cssText = "display: flex; flex-direction: column; gap: 12px; margin-bottom: 10px;";

                const defaultTitle = document.createElement("div");
                defaultTitle.textContent = "LoRA 加载模式";
                defaultTitle.style.cssText = `
                    font-size: 14px;
                    font-weight: 600;
                    color: #fff;
                    margin-bottom: 8px;
                `;

                const defaultModeContainer = document.createElement("div");
                defaultModeContainer.style.cssText = "display: flex; flex-direction: column; gap: 10px;";

                // 自适应模式（单选按钮，排在最前面）
                const adaptiveMode = document.createElement("label");
                adaptiveMode.style.cssText = "display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 10px 12px; background: #1b1d24; border-radius: 9px; border: 2px solid transparent;";
                const radioAdaptive = document.createElement("input");
                radioAdaptive.type = "radio";
                radioAdaptive.name = "global_mode";
                radioAdaptive.value = "adaptive";
                radioAdaptive.checked = primaryMode === "adaptive";
                radioAdaptive.style.cssText = "width: 18px; height: 18px; cursor: pointer;";
                const labelAdaptive = document.createElement("div");
                labelAdaptive.style.cssText = "flex: 1;";
                const labelAdaptiveTitle = document.createElement("div");
                labelAdaptiveTitle.textContent = "自适应模式";
                labelAdaptiveTitle.style.cssText = "color: #eee; font-size: 13px; font-weight: 500;";
                const labelAdaptiveDesc = document.createElement("div");
                labelAdaptiveDesc.textContent = "自动检测模型类型并选择合适的加载模式（Klein→Nunchaku 原生 API，SDNQ→SDNQ，普通→标准；INT8/FP8 等量化模型走标准模式，由 ComfyUI 官方 model_patcher 自动处理）";
                labelAdaptiveDesc.style.cssText = "color: #888; font-size: 11px; margin-top: 2px;";
                labelAdaptive.appendChild(labelAdaptiveTitle);
                labelAdaptive.appendChild(labelAdaptiveDesc);
                adaptiveMode.appendChild(radioAdaptive);
                adaptiveMode.appendChild(labelAdaptive);

                // 默认模式（标准 LoRA）
                const defaultMode = document.createElement("label");
                defaultMode.style.cssText = "display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 10px 12px; background: #1b1d24; border-radius: 9px; border: 2px solid transparent;";
                const radioDefault = document.createElement("input");
                radioDefault.type = "radio";
                radioDefault.name = "global_mode";
                radioDefault.value = "default";
                radioDefault.checked = primaryMode === "default";
                radioDefault.style.cssText = "width: 18px; height: 18px; cursor: pointer;";
                const labelDefault = document.createElement("div");
                labelDefault.style.cssText = "flex: 1;";
                const labelDefaultTitle = document.createElement("div");
                labelDefaultTitle.textContent = "默认模式（标准 LoRA）";
                labelDefaultTitle.style.cssText = "color: #eee; font-size: 13px; font-weight: 500;";
                const labelDefaultDesc = document.createElement("div");
                labelDefaultDesc.textContent = "使用 ComfyUI 标准 LoRA 加载方式，适用于所有模型类型（官方 model_patcher.py 已原生支持 INT8/FP8/INT4 等量化权重的 LoRA 应用）";
                labelDefaultDesc.style.cssText = "color: #888; font-size: 11px; margin-top: 2px;";
                labelDefault.appendChild(labelDefaultTitle);
                labelDefault.appendChild(labelDefaultDesc);
                defaultMode.appendChild(radioDefault);
                defaultMode.appendChild(labelDefault);
                defaultModeContainer.appendChild(defaultMode);

                // 模式选中状态更新
                const updateModeSelection = () => {
                    // 自适应模式
                    if (radioAdaptive.checked) {
                        adaptiveMode.style.borderColor = "#4CAF50";
                        adaptiveMode.style.background = "#2a3a2a";
                    } else {
                        adaptiveMode.style.borderColor = "transparent";
                        adaptiveMode.style.background = "#333";
                    }
                    // 默认模式
                    if (radioDefault.checked) {
                        defaultMode.style.borderColor = "#5a6da8";
                        defaultMode.style.background = "#1e2436";
                    } else {
                        defaultMode.style.borderColor = "transparent";
                        defaultMode.style.background = "#1b1d24";
                    }
                };

                // 选中自适应模式时，取消其他模式
                radioAdaptive.addEventListener("change", () => {
                    updateModeSelection();
                    if (radioAdaptive.checked) {
                        radioSdnqSdnq.checked = false;
                        radioKleinKlein.checked = false;
                        updateSdnqSelection();
                        updateKleinSelection();
                    }
                });

                // 选中默认模式时，取消其他模式
                radioDefault.addEventListener("change", () => {
                    updateModeSelection();
                    if (radioDefault.checked) {
                        radioSdnqSdnq.checked = false;
                        radioKleinKlein.checked = false;
                        updateSdnqSelection();
                        updateKleinSelection();
                    }
                });
                updateModeSelection();

                defaultSection.appendChild(defaultTitle);
                defaultSection.appendChild(defaultModeContainer);
                settingsContainer.appendChild(defaultSection);

                // 注意：ComfyUI 官方已在 model_patcher.py 提供 INT8/FP8 等量化权重的 LoRA 支持
                // （apply_loras 后调用 comfy.float.stochastic_rounding 把权重舍入到 weight.dtype），
                // 因此本加载器不再需要专门的 INT8 模式选项，默认模式即可正确加载 INT8 LoRA。

                // ========== tonera-Klein-Nunchaku 模式设置区域 ==========
                const kleinSection = document.createElement("div");
                kleinSection.style.cssText = "display: flex; flex-direction: column; gap: 12px;";

                const kleinTitle = document.createElement("div");
                kleinTitle.textContent = "tonera-Klein-Nunchaku LoRA 模式";
                kleinTitle.style.cssText = `
                    font-size: 14px;
                    font-weight: 600;
                    color: #fff;
                    margin-bottom: 8px;
                `;

                const kleinDesc = document.createElement("div");
                kleinDesc.textContent = "专用于 tonera/FLUX.2-klein-9B-Nunchaku 量化模型的原生 LoRA 加载（普通 Klein 模型请用默认模式）";
                kleinDesc.style.cssText = `
                    font-size: 12px;
                    color: #aaa;
                    margin-bottom: 12px;
                    line-height: 1.5;
                `;

                const kleinModeContainer = document.createElement("div");
                kleinModeContainer.style.cssText = "display: flex; flex-direction: column; gap: 10px;";

                // tonera-Klein-Nunchaku 模式（选中时激活）
                const kleinModeKlein = document.createElement("label");
                kleinModeKlein.style.cssText = "display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 10px 12px; background: #1b1d24; border-radius: 9px; border: 2px solid transparent;";
                const radioKleinKlein = document.createElement("input");
                radioKleinKlein.type = "radio";
                radioKleinKlein.name = "klein_mode";
                radioKleinKlein.value = "klein";
                radioKleinKlein.checked = primaryMode === "klein";
                radioKleinKlein.style.cssText = "width: 18px; height: 18px; cursor: pointer;";
                const labelKleinKlein = document.createElement("div");
                labelKleinKlein.style.cssText = "flex: 1;";
                const labelKleinKleinTitle = document.createElement("div");
                labelKleinKleinTitle.textContent = "tonera-Klein-Nunchaku 模式";
                labelKleinKleinTitle.style.cssText = "color: #eee; font-size: 13px; font-weight: 500;";
                const labelKleinKleinDesc = document.createElement("div");
                labelKleinKleinDesc.textContent = "使用 Nunchaku 原生 LoRA API（update_lora_params）加载 tonera FLUX.2-klein-9B-Nunchaku 专用 LoRA";
                labelKleinKleinDesc.style.cssText = "color: #888; font-size: 11px; margin-top: 2px;";
                labelKleinKlein.appendChild(labelKleinKleinTitle);
                labelKleinKlein.appendChild(labelKleinKleinDesc);
                kleinModeKlein.appendChild(radioKleinKlein);
                kleinModeKlein.appendChild(labelKleinKlein);

                // Klein 模式选中状态更新
                const updateKleinSelection = () => {
                    [kleinModeKlein].forEach(mode => {
                        const radio = mode.querySelector('input[type="radio"]');
                        if (radio.checked) {
                            mode.style.borderColor = "#2196F3";
                            mode.style.background = "#2a3a4a";
                        } else {
                            mode.style.borderColor = "transparent";
                            mode.style.background = "#333";
                        }
                    });
                };

                radioKleinKlein.addEventListener("change", () => {
                    updateKleinSelection();
                    // 选择 Klein 模式时取消其他特殊模式
                    if (radioKleinKlein.checked) {
                        radioAdaptive.checked = false;
                        radioDefault.checked = false;
                        radioSdnqSdnq.checked = false;
                        updateModeSelection();
                        updateSdnqSelection();
                    }
                });
                updateKleinSelection();

                kleinModeContainer.appendChild(kleinModeKlein);

                kleinSection.appendChild(kleinTitle);
                kleinSection.appendChild(kleinDesc);
                kleinSection.appendChild(kleinModeContainer);


                // ========== SDNQ 模式设置区域 ==========
                const sdnqSection = document.createElement("div");
                sdnqSection.style.cssText = "display: flex; flex-direction: column; gap: 12px;";

                const sdnqTitle = document.createElement("div");
                sdnqTitle.textContent = "SDNQ LoRA 模式";
                sdnqTitle.style.cssText = `
                    font-size: 14px;
                    font-weight: 600;
                    color: #fff;
                    margin-bottom: 8px;
                `;

                const sdnqDesc = document.createElement("div");
                sdnqDesc.textContent = "选择 SDNQ 量化模型（DiffusionPipeline）的 LoRA 加载方式";
                sdnqDesc.style.cssText = `
                    font-size: 12px;
                    color: #aaa;
                    margin-bottom: 12px;
                    line-height: 1.5;
                `;

                // SDNQ 模式选择容器
                const sdnqModeContainer = document.createElement("div");
                sdnqModeContainer.style.cssText = "display: flex; flex-direction: column; gap: 10px;";

                // SDNQ 模式
                const sdnqModeSdnq = document.createElement("label");
                sdnqModeSdnq.style.cssText = "display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 10px 12px; background: #1b1d24; border-radius: 9px; border: 2px solid transparent;";
                const radioSdnqSdnq = document.createElement("input");
                radioSdnqSdnq.type = "radio";
                radioSdnqSdnq.name = "sdnq_mode";
                radioSdnqSdnq.value = "sdnq";
                radioSdnqSdnq.checked = primaryMode === "sdnq";
                radioSdnqSdnq.style.cssText = "width: 18px; height: 18px; cursor: pointer;";
                const labelSdnqSdnq = document.createElement("div");
                labelSdnqSdnq.style.cssText = "flex: 1;";
                const labelSdnqSdnqTitle = document.createElement("div");
                labelSdnqSdnqTitle.textContent = "SDNQ 模式";
                labelSdnqSdnqTitle.style.cssText = "color: #eee; font-size: 13px; font-weight: 500;";
                const labelSdnqSdnqDesc = document.createElement("div");
                labelSdnqSdnqDesc.textContent = "使用 diffusers PEFT adapter 系统加载 LoRA，支持多个 LoRA 并行应用，适用于 SDNQ 量化模型（DiffusionPipeline）";
                labelSdnqSdnqDesc.style.cssText = "color: #888; font-size: 11px; margin-top: 2px;";
                labelSdnqSdnq.appendChild(labelSdnqSdnqTitle);
                labelSdnqSdnq.appendChild(labelSdnqSdnqDesc);
                sdnqModeSdnq.appendChild(radioSdnqSdnq);
                sdnqModeSdnq.appendChild(labelSdnqSdnq);

                // SDNQ 模式选中状态更新
                const updateSdnqSelection = () => {
                    [sdnqModeSdnq].forEach(mode => {
                        const radio = mode.querySelector('input[type="radio"]');
                        if (radio.checked) {
                            mode.style.borderColor = "#2196F3";
                            mode.style.background = "#2a3a4a";
                        } else {
                            mode.style.borderColor = "transparent";
                            mode.style.background = "#333";
                        }
                    });
                };

                radioSdnqSdnq.addEventListener("change", () => {
                    updateSdnqSelection();
                    // 选择 SDNQ 模式时，取消默认模式、Klein 模式和 Anima 模式
                    if (radioSdnqSdnq.checked) {
                        radioAdaptive.checked = false;
                        radioDefault.checked = false;
                        radioKleinKlein.checked = false;
                        updateModeSelection();
                        updateKleinSelection();
                    }
                });
                updateSdnqSelection();

                sdnqModeContainer.appendChild(sdnqModeSdnq);

                sdnqSection.appendChild(sdnqTitle);
                sdnqSection.appendChild(sdnqDesc);
                sdnqSection.appendChild(sdnqModeContainer);


                // ========== 模式切换 Tab 内容 ==========
                const modeTabContent = document.createElement("div");
                modeTabContent.style.cssText = "display: block;";
                modeTabContent.appendChild(settingsContainer);
                tabContents["mode"] = modeTabContent;

                // ========== 布局样式 Tab 内容 ==========
                const layoutTabContent = document.createElement("div");
                layoutTabContent.style.cssText = "display: none;";
                tabContents["layout"] = layoutTabContent;

                const layoutContainer = document.createElement("div");
                layoutContainer.style.cssText = "display: flex; flex-direction: column; gap: 18px;";

                const layoutTitle = document.createElement("div");
                layoutTitle.textContent = "权重控件样式";
                layoutTitle.style.cssText = "font-size: 14px; font-weight: 600; color: #fff; margin-bottom: 4px;";
                const layoutDesc = document.createElement("div");
                layoutDesc.textContent = "选择 LoRA 列表中权重调节控件的样式。滑条模式下可直接拖动调整权重，数值仍可点击编辑。";
                layoutDesc.style.cssText = "font-size: 12px; color: #aaa; margin-bottom: 12px; line-height: 1.5;";

                const styleSection = document.createElement("div");
                styleSection.style.cssText = "display: flex; flex-direction: column; gap: 10px;";

                const buildStyleOption = (value, label, desc) => {
                    const wrap = document.createElement("label");
                    wrap.style.cssText = "display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 10px 12px; background: #1b1d24; border-radius: 9px; border: 2px solid transparent;";
                    const radio = document.createElement("input");
                    radio.type = "radio";
                    radio.name = "mpl_weight_style";
                    radio.value = value;
                    radio.checked = (this.layoutSettings?.weightStyle || "arrows") === value;
                    radio.style.cssText = "width: 18px; height: 18px; cursor: pointer;";
                    const info = document.createElement("div");
                    info.style.cssText = "flex: 1;";
                    const t = document.createElement("div");
                    t.textContent = label;
                    t.style.cssText = "color: #eee; font-size: 13px; font-weight: 500;";
                    const d = document.createElement("div");
                    d.textContent = desc;
                    d.style.cssText = "color: #888; font-size: 11px; margin-top: 2px;";
                    info.appendChild(t);
                    info.appendChild(d);
                    wrap.appendChild(radio);
                    wrap.appendChild(info);
                    return { wrap, radio };
                };

                const styleArrows = buildStyleOption("arrows", "箭头按钮（默认）", "左右两个箭头按钮，每次点击 ±0.01；中间数字可点击直接输入。");
                const styleSlider = buildStyleOption("slider", "滑条", "水平滑条拖动调整权重；右侧显示当前数值，数值仍可点击编辑。");
                styleSection.appendChild(styleArrows.wrap);
                styleSection.appendChild(styleSlider.wrap);

                const sliderParamsSection = document.createElement("div");
                sliderParamsSection.style.cssText = "display: flex; flex-direction: column; gap: 12px; padding: 14px; background: #1b1d24; border-radius: 10px; border: 1px solid #2c2f3a;";

                const sliderParamsTitle = document.createElement("div");
                sliderParamsTitle.textContent = "滑条参数";
                sliderParamsTitle.style.cssText = "color: #fff; font-size: 13px; font-weight: 500; margin-bottom: 4px;";
                sliderParamsSection.appendChild(sliderParamsTitle);

                const buildNumberRow = (labelText, key, min, max, step) => {
                    const row = document.createElement("div");
                    row.style.cssText = "display: flex; align-items: center; gap: 10px;";
                    const lab = document.createElement("div");
                    lab.textContent = labelText;
                    lab.style.cssText = "color: #ccc; font-size: 12px; min-width: 80px;";
                    const input = document.createElement("input");
                    input.type = "number";
                    input.min = String(min);
                    input.max = String(max);
                    input.step = String(step);
                    input.value = String(this.layoutSettings?.[key] ?? 0);
                    input.style.cssText = "flex: 1; padding: 5px 8px; background: #15161c; border: 1px solid #2f3340; border-radius: 6px; color: #e6e8f0; font-size: 12px; outline: none;";
                    row.appendChild(lab);
                    row.appendChild(input);
                    return { row, input };
                };

                const stepRow = buildNumberRow("步长", "sliderStep", 0.01, 1, 0.01);
                const minRow = buildNumberRow("最小值", "sliderMin", -10, 0, 0.1);
                const maxRow = buildNumberRow("最大值", "sliderMax", 0, 10, 0.1);
                const widthRow = buildNumberRow("滑条宽度(px)", "sliderWidth", 60, 300, 5);
                sliderParamsSection.appendChild(stepRow.row);
                sliderParamsSection.appendChild(minRow.row);
                sliderParamsSection.appendChild(maxRow.row);
                sliderParamsSection.appendChild(widthRow.row);

                const buildCheckboxRow = (labelText, key) => {
                    const row = document.createElement("label");
                    row.style.cssText = "display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 6px 0;";
                    const cb = document.createElement("input");
                    cb.type = "checkbox";
                    cb.checked = this.layoutSettings?.[key] ?? true;
                    cb.style.cssText = "width: 16px; height: 16px; cursor: pointer;";
                    const lab = document.createElement("div");
                    lab.textContent = labelText;
                    lab.style.cssText = "color: #ccc; font-size: 12px;";
                    row.appendChild(cb);
                    row.appendChild(lab);
                    return { row, cb };
                };
                const showValueRow = buildCheckboxRow("滑条旁显示当前数值", "showWeightValue");
                const snapRow = buildCheckboxRow("拖动时吸附 0（±0.02 范围内）", "snapToZero");
                sliderParamsSection.appendChild(showValueRow.row);
                sliderParamsSection.appendChild(snapRow.row);

                const updateStyleSelection = () => {
                    [styleArrows, styleSlider].forEach((s) => {
                        if (s.radio.checked) {
                            s.wrap.style.borderColor = "#5a6da8";
                            s.wrap.style.background = "#1e2436";
                        } else {
                            s.wrap.style.borderColor = "transparent";
                            s.wrap.style.background = "#1b1d24";
                        }
                    });
                    sliderParamsSection.style.display = styleSlider.radio.checked ? "flex" : "none";
                };
                styleArrows.radio.addEventListener("change", updateStyleSelection);
                styleSlider.radio.addEventListener("change", updateStyleSelection);
                updateStyleSelection();

                layoutContainer.appendChild(layoutTitle);
                layoutContainer.appendChild(layoutDesc);
                layoutContainer.appendChild(styleSection);
                layoutContainer.appendChild(sliderParamsSection);
                layoutTabContent.appendChild(layoutContainer);

                content.appendChild(modeTabContent);
                content.appendChild(layoutTabContent);

                // 点击遮罩层关闭
                overlay.onclick = (e) => {
                    if (e.target === overlay) {
                        document.body.removeChild(overlay);
                    }
                };

                // ESC键关闭
                const handleEsc = (e) => {
                    if (e.key === "Escape") {
                        document.body.removeChild(overlay);
                        document.removeEventListener("keydown", handleEsc);
                    }
                };
                document.addEventListener("keydown", handleEsc);

                // 只保留“默认模式（标准 LoRA）”，其余模式不再提供
                radioAdaptive.checked = false;
                radioKleinKlein.checked = false;
                radioSdnqSdnq.checked = false;
                radioDefault.checked = true;
                updateModeSelection();

                // 确定按钮
                const confirmBtn = document.createElement("button");
                confirmBtn.textContent = "确定";
                confirmBtn.style.cssText = "padding:8px 20px;background:#4CAF50;border:none;color:#fff;border-radius:7px;cursor:pointer;font-size:13px;font-weight:600;";
                confirmBtn.onclick = () => {
                    const isAdaptiveSelected = radioAdaptive.checked;
                    const isDefaultSelected = radioDefault.checked;
                    const scope = overlay;
                    let selectedSdnqMode = "none";
                    if (!isDefaultSelected && !isAdaptiveSelected) selectedSdnqMode = scope.querySelector('input[name="sdnq_mode"]:checked')?.value || "none";
                    this.sdnqMode = selectedSdnqMode;
                    this.properties["sdnq_mode"] = selectedSdnqMode;
                    this.adaptiveMode = isAdaptiveSelected;
                    this.properties["adaptive_mode"] = isAdaptiveSelected;
                    let selectedKleinMode = "none";
                    if (!isDefaultSelected && !isAdaptiveSelected) selectedKleinMode = scope.querySelector('input[name="klein_mode"]:checked')?.value || "none";
                    this.kleinMode = selectedKleinMode;
                    this.properties["klein_mode"] = selectedKleinMode;
                    if (this._sdnqModeWidget) this._sdnqModeWidget.value = selectedSdnqMode;
                    if (this._kleinModeWidget) this._kleinModeWidget.value = selectedKleinMode;
                    if (this._adaptiveModeWidget) this._adaptiveModeWidget.value = String(isAdaptiveSelected);

                    // Anima 2.9B 模式（独立于加载模式，仅标准加载路径生效）
                    let selectedAnimaMode = scope.querySelector('input[name="anima_mode"]:checked')?.value || "none";
                    this.animaMode = selectedAnimaMode;
                    this.properties["anima_mode"] = selectedAnimaMode;
                    if (this._animaModeWidget) this._animaModeWidget.value = selectedAnimaMode;

                    // 保存布局设置
                    const selectedStyle = scope.querySelector('input[name="mpl_weight_style"]:checked')?.value || "arrows";
                    const newLayout = {
                        weightStyle: selectedStyle,
                        sliderStep: Math.max(0.01, parseFloat(stepRow.input.value) || 0.05),
                        sliderMin: Math.min(0, parseFloat(minRow.input.value) || -2),
                        sliderMax: Math.max(0, parseFloat(maxRow.input.value) || 2),
                        sliderWidth: Math.max(60, Math.min(300, parseInt(widthRow.input.value, 10) || 110)),
                        showWeightValue: showValueRow.cb.checked,
                        snapToZero: snapRow.cb.checked,
                    };
                    if (newLayout.sliderMin >= newLayout.sliderMax) {
                        newLayout.sliderMax = newLayout.sliderMin + 0.1;
                    }
                    this.layoutSettings = newLayout;
                    this.properties["layout_settings"] = newLayout;

                    // 根据布局调整节点最小宽度（仅在用户未手动调大时）
                    // 箭头模式控件宽度约 80px，滑条模式约 sliderWidth + 46px
                    // 额外加 20px padding 确保按钮完全显示
                    const arrowMinW = 490;
                    const sliderMinW = 490 + Math.max(0, (newLayout.sliderWidth ?? 110) + (newLayout.showWeightValue !== false ? 46 : 0) - 60);
                    const targetMinW = newLayout.weightStyle === "slider" ? Math.max(arrowMinW, sliderMinW) : arrowMinW;
                    if (this.minWidth !== undefined && this.minWidth < targetMinW) {
                        this.minWidth = targetMinW;
                    }
                    // 如果当前宽度小于新的最小宽度，自动扩展
                    if (this.size && Array.isArray(this.size) && this.size[0] < targetMinW) {
                        this.size[0] = targetMinW;
                        this.setDirtyCanvas?.(true, true);
                    }

                    this.updateWidget();
                    this._updateKleinBanner?.();
                    this.renderEmbeddedList?.();
                    document.body.removeChild(overlay);
                };

                // 取消按钮
                const cancelBtn = document.createElement("button");
                cancelBtn.textContent = "取消";
                cancelBtn.style.cssText = "padding:8px 18px;background:#2a2d38;border:1px solid #3a3f4d;color:#cfd3de;border-radius:7px;cursor:pointer;font-size:13px;";
                cancelBtn.onclick = () => document.body.removeChild(overlay);

                // 组装弹窗
                buttonContainer.appendChild(cancelBtn);
                buttonContainer.appendChild(confirmBtn);
                dialog.appendChild(title);
                dialog.appendChild(tabBar);
                dialog.appendChild(content);
                dialog.appendChild(buttonContainer);
                overlay.appendChild(dialog);
                document.body.appendChild(overlay);

                // 使弹窗可拖拽
                this.makeDialogDraggable(dialog, title);
            };

            nodeType.prototype.loadPresetModal = async function() {
                // 创建遮罩层
                const overlay = document.createElement("div");
                overlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    z-index: 10001;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                `;
                
                // 创建弹窗
                const dialog = document.createElement("div");
                dialog.style.cssText = `
                    background: #2a2a2a;
                    border: 1px solid #555;
                    border-radius: 8px;
                    min-width: 500px;
                    max-width: 700px;
                    max-height: 600px;
                    box-shadow: 0 8px 25px rgba(0,0,0,0.8);
                    z-index: 10002;
                    display: flex;
                    flex-direction: column;
                `;
                
                // 标题栏
                const header = document.createElement("div");
                header.style.cssText = `
                    padding: 15px 20px;
                    border-bottom: 1px solid #444;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    background: #1a1a1a;
                    border-radius: 8px 8px 0 0;
                    cursor: move;
                    user-select: none;
                `;
                
                const title = document.createElement("div");
                title.textContent = "LoRA预设";
                title.style.cssText = `
                    font-size: 16px;
                    font-weight: bold;
                    color: #eee;
                    flex: 1;
                `;
                
                const headerButtons = document.createElement("div");
                headerButtons.style.cssText = "display: flex; gap: 10px;";
                
                // 刷新按钮
                const refreshBtn = document.createElement("button");
                refreshBtn.textContent = "刷新";
                refreshBtn.style.cssText = `
                    padding: 6px 12px;
                    background: #444;
                    border: 1px solid #555;
                    color: #ccc;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                `;
                refreshBtn.onmouseenter = () => refreshBtn.style.background = "#555";
                refreshBtn.onmouseleave = () => refreshBtn.style.background = "#444";
                
                // 关闭按钮
                const closeBtn = document.createElement("button");
                closeBtn.textContent = "✕";
                closeBtn.style.cssText = `
                    width: 28px;
                    height: 28px;
                    background: #444;
                    border: 1px solid #555;
                    color: #ccc;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                `;
                closeBtn.onmouseenter = () => closeBtn.style.background = "#555";
                closeBtn.onmouseleave = () => closeBtn.style.background = "#444";
                
                headerButtons.appendChild(refreshBtn);
                headerButtons.appendChild(closeBtn);
                header.appendChild(title);
                header.appendChild(headerButtons);
                
                // 内容区域
                const content = document.createElement("div");
                content.style.cssText = `
                    flex: 1;
                    overflow-y: auto;
                    padding: 10px;
                    min-height: 200px;
                `;
                
                // 加载预设列表的函数
                const loadPresets = async () => {
                    try {
                        content.innerHTML = ""; // 清空内容
                        
                    const r = await api.fetchApi(`/malora/lora/get_presets?t=${Date.now()}`);
                    const d = await r.json();
                        const presets = d.presets || {};
                        const keys = Object.keys(presets);
                        
                        if (!keys.length) {
                            const emptyMsg = document.createElement("div");
                            emptyMsg.textContent = "暂无预设";
                            emptyMsg.style.cssText = `
                                text-align: center;
                                color: #888;
                                padding: 40px;
                                font-size: 14px;
                            `;
                            content.appendChild(emptyMsg);
                            return;
                        }
                        
                        // 创建预设列表
                        keys.forEach(presetName => {
                            const presetData = presets[presetName];
                            
                            // 计算LoRA数量
                            let loraCount = 0;
                            if (presetData.folders) {
                                presetData.folders.forEach(folder => {
                                    if (folder.loras) {
                                        loraCount += folder.loras.length;
                                    }
                                });
                            }
                            
                            const item = document.createElement("div");
                            item.style.cssText = `
                        display: flex; 
                                align-items: center;
                                gap: 10px;
                                padding: 10px;
                                background: #333;
                                border-radius: 4px;
                                margin-bottom: 8px;
                        border: 1px solid #444; 
                            `;
                            
                            // 文件夹图标
                            const folderIcon = document.createElement("span");
                            folderIcon.innerHTML = mplIcon("folder", 18);
                            folderIcon.style.cssText = "display:inline-flex;color:#6c8cff;";
                            
                            // 预设信息
                            const info = document.createElement("div");
                            info.style.cssText = "flex: 1;";
                            
                            const nameText = document.createElement("div");
                            nameText.textContent = `${presetName} (${loraCount}个LoRA)`;
                            nameText.style.cssText = `
                                color: #eee;
                                font-size: 14px;
                                margin-bottom: 2px;
                            `;
                            
                            info.appendChild(nameText);
                            
                            // 按钮容器
                            const buttons = document.createElement("div");
                            buttons.style.cssText = "display: flex; gap: 8px;";
                            
                            // 发送到节点按钮
                            const sendBtn = document.createElement("button");
                            sendBtn.textContent = "发送到节点";
                            sendBtn.style.cssText = `
                                padding: 6px 12px;
                                background: #4CAF50;
                                border: none;
                                color: white;
                                border-radius: 4px;
                                cursor: pointer;
                        font-size: 12px; 
                            `;
                            sendBtn.onmouseenter = () => sendBtn.style.background = "#5CBF60";
                            sendBtn.onmouseleave = () => sendBtn.style.background = "#4CAF50";
                            sendBtn.onclick = () => {
                                if (presetData.folders) {
                                    this.loraData.folders.push(...presetData.folders);
                                    this.renderEmbeddedList();
                                    this.updateWidget();
                                }
                                document.body.removeChild(overlay);
                            };
                            
                            // 删除按钮
                            const deleteBtn = document.createElement("button");
                            deleteBtn.textContent = "删除";
                            deleteBtn.style.cssText = `
                                padding: 6px 12px;
                                background: #f44336;
                                border: none;
                                color: white;
                                border-radius: 4px;
                                cursor: pointer;
                                font-size: 12px;
                            `;
                            deleteBtn.onmouseenter = () => deleteBtn.style.background = "#f55";
                            deleteBtn.onmouseleave = () => deleteBtn.style.background = "#f44336";
                            deleteBtn.onclick = async () => {
                                if (confirm(`确定要删除预设 "${presetName}" 吗？`)) {
                                    try {
                                        await api.fetchApi("/malora/lora/delete_preset", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ name: presetName })
                                        });
                                        // 重新加载列表
                                        await loadPresets();
                                    } catch (e) {
                                        alert("删除失败: " + e);
                                    }
                                }
                            };
                            
                            buttons.appendChild(sendBtn);
                            buttons.appendChild(deleteBtn);
                            
                            item.appendChild(folderIcon);
                            item.appendChild(info);
                            item.appendChild(buttons);
                            content.appendChild(item);
                        });
                    } catch (e) {
                        const errorMsg = document.createElement("div");
                        errorMsg.textContent = "加载预设失败: " + e;
                        errorMsg.style.cssText = `
                            text-align: center;
                            color: #f44336;
                            padding: 20px;
                            font-size: 14px;
                        `;
                        content.appendChild(errorMsg);
                    }
                };
                
                // 刷新按钮点击事件
                refreshBtn.onclick = () => {
                    loadPresets();
                };
                
                // 关闭按钮点击事件
                const closeModal = () => {
                    document.body.removeChild(overlay);
                };
                closeBtn.onclick = closeModal;
                
                // 点击遮罩层关闭
                overlay.onclick = (e) => {
                    if (e.target === overlay) {
                        closeModal();
                    }
                };
                
                // ESC键关闭
                const handleEsc = (e) => {
                    if (e.key === "Escape") {
                        closeModal();
                        document.removeEventListener("keydown", handleEsc);
                    }
                };
                document.addEventListener("keydown", handleEsc);
                
                // 阻止事件冒泡
                const stopProp = (e) => { e.stopPropagation(); };
                dialog.addEventListener("pointerdown", stopProp);
                dialog.addEventListener("pointermove", stopProp);
                dialog.addEventListener("pointerup", stopProp);
                dialog.addEventListener("mousedown", stopProp);
                dialog.addEventListener("wheel", stopProp, { passive: false });
                
                // 组装弹窗
                dialog.appendChild(header);
                dialog.appendChild(content);
                overlay.appendChild(dialog);
                document.body.appendChild(overlay);
                
                // 使弹窗可拖拽
                this.makeDialogDraggable(dialog, header);
                
                // 加载预设列表
                await loadPresets();
            };

        }
    },
    // 注入「lora串输出已连接」：根据 prompt 中是否有其他【加载器】引用本节点的 lora串输出 判定链末端
    init(app) {
        const LORA_OUTPUT_INDEX = 2; // RETURN_NAMES: model, 触发词输出, lora串输出
        const MODEL_OUTPUT_INDEX = 0;
        // 只有真正会接手加载的下游节点才算「链继续」。调试/预览节点（PreviewAny 等）也吃
        // MAGIC_LORA_CHAIN，但不会加载，若把它们算成下游，本节点就会静默不加载。
        const CHAIN_LOADER_TYPES = new Set(["MAPowerLoraLoader", "MagicPowerLoraLoader"]);
        const originalQueuePrompt = api.queuePrompt;
        api.queuePrompt = async function (index, prompt, ...args) {
            if (prompt && prompt.output && typeof prompt.output === "object") {
                const output = prompt.output;
                // sourceNodeId -> { chain: 消费者集合, model: 消费者集合 }
                const consumers = new Map();
                for (const nodeId of Object.keys(output)) {
                    const inputs = output[nodeId] && output[nodeId].inputs;
                    if (!inputs) continue;
                    for (const key of Object.keys(inputs)) {
                        const val = inputs[key];
                        if (!Array.isArray(val) || val.length < 2) continue;
                        const src = String(val[0]);
                        let entry = consumers.get(src);
                        if (!entry) consumers.set(src, entry = { chain: new Set(), model: new Set() });
                        if (val[1] === LORA_OUTPUT_INDEX) entry.chain.add(String(nodeId));
                        else if (val[1] === MODEL_OUTPUT_INDEX) entry.model.add(String(nodeId));
                    }
                }
                // 注入「lora串输出已连接」（链末端判定）
                for (const nodeId of Object.keys(output)) {
                    const node = output[nodeId];
                    if (!node || node.class_type !== NODE_NAME) continue;
                    if (!node.inputs) node.inputs = {};
                    const entry = consumers.get(String(nodeId));
                    const continues = !!entry && Array.from(entry.chain).some((consumerId) => {
                        const consumer = output[consumerId];
                        // 同时接收本节点 model 输出的下游，一定是链上的加载器
                        if (entry.model.has(consumerId)) return true;
                        return !!consumer && CHAIN_LOADER_TYPES.has(consumer.class_type);
                    });
                    node.inputs["lora串输出已连接"] = continues;
                }
            }
            return originalQueuePrompt.apply(api, [index, prompt, ...args]);
        };
    }
});
