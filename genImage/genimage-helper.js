// ==UserScript==
// @name         生图助手 v2
// @version      v2.0.0
// @description  两步LLM串行生图：角色锚点 + 场景描述，内置Z-Image-Turbo ComfyUI工作流
// @author       GenImage Helper
// @match        */*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      localhost
// @connect      *
// ==/UserScript==

(function () {
    'use strict';

    // ========== safeFetch ==========
    function gmFetch(url, options = {}) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: options.method || 'GET',
                url: url,
                headers: options.headers || {},
                data: options.body || undefined,
                timeout: 60000,
                onload: (response) => {
                    const res = {
                        ok: response.status >= 200 && response.status < 300,
                        status: response.status,
                        statusText: response.statusText,
                        headers: {
                            get: (name) => {
                                const header = response.responseHeaders.split('\n')
                                    .find(h => h.toLowerCase().startsWith(name.toLowerCase()));
                                return header ? header.split(': ')[1] : null;
                            }
                        },
                        text: () => Promise.resolve(response.responseText),
                        json: () => {
                            try { return Promise.resolve(JSON.parse(response.responseText)); }
                            catch (e) { return Promise.reject(new Error('Invalid JSON: ' + response.responseText.substring(0, 100))); }
                        }
                    };
                    resolve(res);
                },
                onerror: (error) => reject(new Error(`Network error: ${error.error || 'Unknown'}`)),
                ontimeout: () => reject(new Error('Request timeout (60s)'))
            });
        });
    }

    const safeFetch = (typeof GM_xmlhttpRequest !== 'undefined') ? gmFetch : fetch;
    window.GI_safeFetch = safeFetch;

    // ========== CONSTANTS ==========
    const SCRIPT_ID = 'genimage_helper_v2';
    const STORAGE_KEY = 'genimage_helper_settings';
    const START_TAG = '[IMG_GEN]';
    const END_TAG = '[/IMG_GEN]';
    const NO_GEN_FLAG = '[no_gen]';
    const SCHEDULED_FLAG = '[scheduled]';

    // ========== LOGGING ==========
    const RUNTIME_LOGS = [];
    function addLog(type, msg) {
        const line = `[${new Date().toLocaleTimeString()}] [${type}] ${msg}`;
        RUNTIME_LOGS.push(line);
        if (RUNTIME_LOGS.length > 500) RUNTIME_LOGS.shift();
        console.log(line);
    }

    // ========== I18N ==========
    const I18N = {
        zh: {
            settings: '设置',
            tab_basic: '基本',
            tab_llm: 'LLM配置',
            tab_anchor: '角色锚点',
            tab_comfyui: 'ComfyUI',
            tab_prompt: 'Prompt',
            enabled: '启用脚本',
            language: '界面语言',
            auto_generate: '自动生图',
            debounce_ms: '防抖延迟(ms)',
            llm_base_url: 'API 地址',
            llm_api_key: 'API Key',
            llm_model: '模型名',
            llm_max_tokens: 'Max Tokens',
            llm_temperature: 'Temperature',
            test_llm: '测试LLM连接',
            anchor_enabled: '启用角色锚点',
            anchor_cache: '缓存锚点',
            anchor_template: '锚点提示词模版',
            gen_anchor: '生成角色锚点',
            clear_anchor_cache: '清除锚点缓存',
            worldbook_entries: '世界书条目选择',
            comfyui_host: 'ComfyUI 地址',
            comfyui_port: '端口',
            comfyui_https: '使用 HTTPS',
            test_comfyui: '测试ComfyUI连接',
            active_workflow: '当前工作流',
            upload_workflow: '上传工作流 JSON',
            node_mapping: '节点映射预览',
            param_overrides: '参数覆盖',
            loras: 'LoRA 列表',
            global_prefix: '全局前缀',
            global_suffix: '全局后缀',
            global_negative: '全局负面词',
            scene_template: '场景描述模版',
            history_count: '历史消息数',
            preset_mgmt: '预设管理',
            export_config: '导出配置',
            import_config: '导入配置',
            save: '保存',
            cancel: '取消',
            testing: '测试中...',
            success: '成功',
            failed: '失败',
            anchor_generating: '正在生成角色锚点...',
            scene_generating: '正在生成场景描述...',
            image_generating: '正在生成图片...',
            waiting: '等待生成...',
            requesting: '请求中...',
            manual_gen: '手动生图',
            gen_anchor_btn: '生成锚点',
            char_name: '角色名',
            char_tags: '固定特征标签',
            add_char: '+ 添加角色',
            delete: '删除',
            no_char: '未选择角色',
            anchor_cache_info: '锚点缓存',
            workflow_builtin: '内置 Z-Image-Turbo',
            model_name: '模型文件名',
            steps: '步数',
            cfg: 'CFG',
            width: '宽',
            height: '高',
            sampler: '采样器',
            scheduler: '调度器',
            seed: '种子(-1随机)',
            lora_add: '+ 添加LoRA',
            lora_name: 'LoRA文件名',
            lora_strength: '强度',
        },
        en: {
            settings: 'Settings',
            tab_basic: 'Basic',
            tab_llm: 'LLM Config',
            tab_anchor: 'Char Anchor',
            tab_comfyui: 'ComfyUI',
            tab_prompt: 'Prompt',
            enabled: 'Enable Script',
            language: 'Language',
            auto_generate: 'Auto Generate',
            debounce_ms: 'Debounce (ms)',
            llm_base_url: 'API Base URL',
            llm_api_key: 'API Key',
            llm_model: 'Model',
            llm_max_tokens: 'Max Tokens',
            llm_temperature: 'Temperature',
            test_llm: 'Test LLM',
            anchor_enabled: 'Enable Anchor',
            anchor_cache: 'Cache Anchor',
            anchor_template: 'Anchor Prompt Template',
            gen_anchor: 'Generate Anchor',
            clear_anchor_cache: 'Clear Anchor Cache',
            worldbook_entries: 'Worldbook Entries',
            comfyui_host: 'ComfyUI Host',
            comfyui_port: 'Port',
            comfyui_https: 'Use HTTPS',
            test_comfyui: 'Test ComfyUI',
            active_workflow: 'Active Workflow',
            upload_workflow: 'Upload Workflow JSON',
            node_mapping: 'Node Mapping',
            param_overrides: 'Param Overrides',
            loras: 'LoRA List',
            global_prefix: 'Global Prefix',
            global_suffix: 'Global Suffix',
            global_negative: 'Global Negative',
            scene_template: 'Scene Prompt Template',
            history_count: 'History Count',
            preset_mgmt: 'Presets',
            export_config: 'Export Config',
            import_config: 'Import Config',
            save: 'Save',
            cancel: 'Cancel',
            testing: 'Testing...',
            success: 'Success',
            failed: 'Failed',
            anchor_generating: 'Generating character anchor...',
            scene_generating: 'Generating scene description...',
            image_generating: 'Generating image...',
            waiting: 'Waiting...',
            requesting: 'Requesting...',
            manual_gen: 'Manual Gen',
            gen_anchor_btn: 'Gen Anchor',
            char_name: 'Name',
            char_tags: 'Fixed Visual Tags',
            add_char: '+ Add Character',
            delete: 'Del',
            no_char: 'No character selected',
            anchor_cache_info: 'Anchor Cache',
            workflow_builtin: 'Built-in Z-Image-Turbo',
            model_name: 'Model filename',
            steps: 'Steps',
            cfg: 'CFG',
            width: 'Width',
            height: 'Height',
            sampler: 'Sampler',
            scheduler: 'Scheduler',
            seed: 'Seed (-1=random)',
            lora_add: '+ Add LoRA',
            lora_name: 'LoRA filename',
            lora_strength: 'Strength',
        }
    };

    function t(key) {
        return I18N[settings?.language || 'zh']?.[key] || I18N['en'][key] || key;
    }

    // ========== DEFAULT SETTINGS ==========
    const DEFAULT_SETTINGS = {
        enabled: true,
        language: 'zh',
        autoGenerate: true,
        debounceMs: 1000,

        llmConfig: {
            baseUrl: 'https://api.deepseek.com',
            apiKey: '',
            model: 'deepseek-chat',
            maxTokens: 4096,
            temperature: 0.7,
        },

        anchorConfig: {
            enabled: true,
            cacheEnabled: true,
            template: `你是一个角色视觉特征提取专家。根据以下角色卡描述和世界书信息，提取角色的固定视觉特征，输出为 Stable Diffusion 提示词格式的 JSON。

要求：
1. visual_anchor：角色固定外貌特征的SD标签（英文逗号分隔）
2. personality_tags：性格特征词（英文逗号分隔）
3. outfit_default：默认服装描述的SD标签（英文逗号分隔）

必须以纯JSON格式回复，不要任何其他文字：
{"character_name":"...","visual_anchor":"...","personality_tags":"...","outfit_default":"..."}`
        },

        sceneConfig: {
            historyCount: 4,
            template: `你是一个视觉小说场景描述专家。根据角色视觉锚点和当前剧情，在合适位置生成Stable Diffusion图片提示词。

规则：
1. 角色固定特征标签必须原样使用
2. 每个提示词只描述一个角色
3. after_paragraph对应剧情中[P1][P2]...的编号
4. 必须至少生成1个提示词
5. 只输出JSON，不要任何其他内容

输出格式：
{"insertions":[{"after_paragraph":1,"prompt":"1girl, [固定特征], [场景描述], masterpiece, best quality"}]}`
        },

        comfyuiConfig: {
            host: '127.0.0.1',
            port: 8188,
            useHttps: false,
            activeWorkflow: 'Z-Image-Turbo',
            savedWorkflows: {},
            paramOverrides: {
                ckpt_name: '',
                steps: 20,
                cfg: 7,
                width: 512,
                height: 768,
                sampler_name: 'euler_ancestral',
                scheduler: 'normal',
                seed: -1,
            },
            loras: [],
        },

        promptConfig: {
            globalPrefix: 'best quality, masterpiece',
            globalSuffix: '',
            globalNegative: 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry',
            presets: {
                'Default': {
                    prefix: 'best quality, masterpiece',
                    suffix: '',
                    negative: 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry'
                }
            },
            activePreset: 'Default',
        },

        characters: [],
        worldbookSelections: {},
    };

    // ========== RUNTIME STATE ==========
    let settings = {};
    let anchorCache = {};       // { charName: { hash, anchor } }
    let debounceTimer = null;
    let scheduledTimeoutMap = new Map();

    // ========== CSS ==========
    const GLOBAL_CSS = `
    :root {
        --nm-bg: #1e1e24;
        --nm-shadow-dark: rgba(0,0,0,0.5);
        --nm-shadow-light: rgba(60,60,70,0.3);
        --nm-accent: #6c8cff;
        --nm-accent-glow: rgba(108,140,255,0.3);
        --nm-text: #d4d4dc;
        --nm-text-muted: #8888a0;
        --nm-border: rgba(255,255,255,0.05);
        --nm-radius: 12px;
        --nm-radius-sm: 8px;
    }
    .gi-ui-container * { box-sizing: border-box; user-select: none; font-family: 'Georgia','Times New Roman','Noto Serif SC',serif; }
    .gi-ui-wrap { display:flex; flex-direction:column; background:transparent; border:none; margin:5px 0; width:100%; position:relative; transition:all 0.3s ease; }
    .gi-ui-toggle { text-align:center; cursor:pointer; font-size:0.8em; opacity:0.2; color:var(--nm-text); margin-bottom:2px; transition:opacity 0.2s; line-height:1; }
    .gi-ui-toggle:hover { opacity:1; color:var(--nm-accent); }
    .gi-ui-viewport { position:relative; width:100%; min-height:50px; display:flex; align-items:center; justify-content:center; transition:all 0.3s ease; overflow:hidden; border-radius:var(--nm-radius); }
    .gi-ui-viewport.collapsed { display:none; }
    .gi-ui-image { max-width:100%; max-height:600px; width:auto; height:auto; border-radius:var(--nm-radius); box-shadow:4px 4px 12px var(--nm-shadow-dark),-2px -2px 8px var(--nm-shadow-light); transition:opacity 0.2s; z-index:1; }
    .gi-zone { position:absolute; background:transparent; }
    .gi-zone.delete { bottom:0; left:0; width:40%; height:5%; z-index:100; cursor:no-drop; }
    .gi-zone.left { top:0; left:0; width:20%; height:70%; z-index:90; cursor:w-resize; }
    .gi-zone.right { top:0; right:0; width:20%; height:70%; z-index:90; cursor:e-resize; }
    .gi-zone.right.gen-mode { cursor:alias; }
    .gi-zone.top { top:0; left:0; width:100%; height:20%; z-index:80; cursor:text; }
    .gi-ui-msg { position:absolute; bottom:10px; left:50%; transform:translateX(-50%); background:var(--nm-bg); color:var(--nm-text); padding:6px 12px; border-radius:var(--nm-radius-sm); font-size:11px; pointer-events:none; opacity:0; transition:opacity 0.3s; z-index:15; white-space:nowrap; box-shadow:3px 3px 8px var(--nm-shadow-dark),-2px -2px 6px var(--nm-shadow-light); }
    .gi-ui-msg.show { opacity:1; }
    .gi-placeholder { padding:20px; background:var(--nm-bg); border-radius:var(--nm-radius); color:var(--nm-text-muted); font-size:0.9em; text-align:center; width:100%; box-shadow:inset 3px 3px 6px var(--nm-shadow-dark),inset -2px -2px 5px var(--nm-shadow-light); }
    .gi-placeholder.requesting { color:var(--nm-accent)!important; animation:gi-pulse 1.5s ease-in-out infinite; }
    @keyframes gi-pulse { 0%,100% { opacity:0.6; } 50% { opacity:1; } }
    /* Tabs */
    .gi-tab-nav { display:flex; gap:8px; margin-bottom:20px; padding:8px; background:var(--nm-bg); border-radius:var(--nm-radius); box-shadow:inset 3px 3px 8px var(--nm-shadow-dark),inset -2px -2px 6px var(--nm-shadow-light); }
    .gi-tab-btn { padding:8px 12px; cursor:pointer; opacity:0.7; border-radius:var(--nm-radius-sm); font-weight:600; font-size:0.95em; transition:all 0.25s ease; color:var(--nm-text-muted); background:transparent; font-family:'Georgia','Times New Roman','Noto Serif SC',serif; letter-spacing:0.5px; border:none; }
    .gi-tab-btn:hover { opacity:1; background:rgba(255,255,255,0.03); color:var(--nm-text); }
    .gi-tab-btn.active { opacity:1; color:var(--nm-accent); background:linear-gradient(145deg,#252530,#1a1a20); box-shadow:4px 4px 8px var(--nm-shadow-dark),-2px -2px 6px var(--nm-shadow-light),0 0 10px var(--nm-accent-glow); }
    .gi-tab-content { display:none; animation:gi-fade 0.3s ease; }
    .gi-tab-content.active { display:block; }
    @keyframes gi-fade { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    /* Form rows */
    .gi-row { display:flex; gap:12px; margin-bottom:10px; align-items:center; padding:8px 12px; background:linear-gradient(145deg,#252530,#1e1e24); border-radius:var(--nm-radius-sm); box-shadow:2px 2px 5px var(--nm-shadow-dark),-1px -1px 4px var(--nm-shadow-light); }
    .gi-row label { flex:0 0 110px; font-weight:600; color:var(--nm-text-muted); font-size:0.88em; }
    .gi-row input, .gi-row select, .gi-row textarea { flex:1; background:var(--nm-bg)!important; border:none!important; color:var(--nm-text)!important; padding:8px 10px!important; border-radius:var(--nm-radius-sm)!important; box-shadow:inset 2px 2px 5px var(--nm-shadow-dark),inset -1px -1px 4px var(--nm-shadow-light)!important; font-family:'Georgia','Times New Roman',serif!important; font-size:0.9em; }
    .gi-row input:focus, .gi-row select:focus, .gi-row textarea:focus { outline:none!important; box-shadow:inset 2px 2px 5px var(--nm-shadow-dark),inset -1px -1px 4px var(--nm-shadow-light),0 0 8px var(--nm-accent-glow)!important; }
    .gi-row textarea { resize:vertical; min-height:80px; }
    .gi-range-val { flex:0 0 45px; text-align:center; color:var(--nm-accent); font-family:'Consolas',monospace; font-weight:600; font-size:0.9em; }
    /* Buttons */
    .gi-btn { background:linear-gradient(145deg,var(--nm-accent),#5a78dd); color:#fff; border:none; padding:9px 18px; border-radius:var(--nm-radius-sm); cursor:pointer; transition:all 0.25s; font-family:'Georgia','Times New Roman',serif; font-weight:600; letter-spacing:0.3px; box-shadow:3px 3px 8px var(--nm-shadow-dark),-2px -2px 6px var(--nm-shadow-light),0 0 12px var(--nm-accent-glow); font-size:0.9em; }
    .gi-btn:hover { transform:translateY(-1px); box-shadow:4px 4px 12px var(--nm-shadow-dark),-3px -3px 8px var(--nm-shadow-light),0 0 20px var(--nm-accent-glow); }
    .gi-btn:active { transform:translateY(0); }
    .gi-btn:disabled { opacity:0.5; cursor:not-allowed; transform:none; }
    .gi-btn-sm { padding:6px 12px; font-size:0.82em; }
    .gi-btn-sec { background:linear-gradient(145deg,#2a2a35,#22222a); color:var(--nm-text); border:none; padding:9px 18px; border-radius:var(--nm-radius-sm); cursor:pointer; transition:all 0.25s; font-family:'Georgia','Times New Roman',serif; box-shadow:3px 3px 8px var(--nm-shadow-dark),-2px -2px 6px var(--nm-shadow-light); font-size:0.9em; }
    .gi-btn-sec:hover { color:var(--nm-accent); box-shadow:4px 4px 10px var(--nm-shadow-dark),-3px -3px 8px var(--nm-shadow-light); }
    .gi-btn-danger { background:linear-gradient(145deg,#4a2530,#3a1a22); color:#ff9999; border:none; padding:9px 18px; border-radius:var(--nm-radius-sm); cursor:pointer; transition:all 0.25s; font-family:'Georgia','Times New Roman',serif; box-shadow:3px 3px 8px var(--nm-shadow-dark),-2px -2px 6px var(--nm-shadow-light); font-size:0.9em; }
    .gi-btn-danger:hover { color:#ffbbbb; }
    /* Char list */
    .gi-char-list { max-height:280px; overflow-y:auto; margin-bottom:12px; padding:10px; background:var(--nm-bg); border-radius:var(--nm-radius); box-shadow:inset 4px 4px 10px var(--nm-shadow-dark),inset -3px -3px 8px var(--nm-shadow-light); }
    .gi-char-row { display:flex; gap:8px; margin-bottom:6px; align-items:center; padding:6px 10px; background:linear-gradient(145deg,#252530,#1e1e24); border-radius:var(--nm-radius-sm); box-shadow:3px 3px 6px var(--nm-shadow-dark),-2px -2px 5px var(--nm-shadow-light); }
    .gi-char-name { flex:0 0 100px; }
    .gi-char-tags { flex:1; font-family:'Consolas','Monaco',monospace!important; font-size:0.85em; }
    /* LoRA list */
    .gi-lora-list { max-height:200px; overflow-y:auto; margin-bottom:10px; padding:8px; background:var(--nm-bg); border-radius:var(--nm-radius); box-shadow:inset 3px 3px 8px var(--nm-shadow-dark),inset -2px -2px 6px var(--nm-shadow-light); }
    .gi-lora-row { display:flex; gap:8px; margin-bottom:6px; align-items:center; }
    /* Node mapping */
    .gi-node-map { font-family:'Consolas','Monaco',monospace; font-size:0.8em; padding:10px; background:var(--nm-bg); border-radius:var(--nm-radius-sm); box-shadow:inset 2px 2px 5px var(--nm-shadow-dark); color:var(--nm-text-muted); max-height:180px; overflow-y:auto; white-space:pre; }
    /* Scrollbar */
    .gi-char-list::-webkit-scrollbar, .gi-lora-list::-webkit-scrollbar { width:6px; }
    .gi-char-list::-webkit-scrollbar-track, .gi-lora-list::-webkit-scrollbar-track { background:var(--nm-bg); }
    .gi-char-list::-webkit-scrollbar-thumb, .gi-lora-list::-webkit-scrollbar-thumb { background:linear-gradient(145deg,#3a3a45,#2a2a35); border-radius:3px; }
    /* Settings popup */
    .gi-settings-popup h4 { font-family:'Georgia','Times New Roman','Noto Serif SC',serif!important; color:var(--nm-text)!important; font-weight:600; margin-bottom:10px; }
    .gi-settings-popup small { color:var(--nm-text-muted)!important; }
    .gi-controls { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
    .gi-controls button { flex:1 1 auto; min-width:80px; }
    .gi-section { margin-bottom:16px; }
    .gi-section-title { font-size:0.82em; color:var(--nm-text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; padding-left:4px; }
    /* Toggle switch */
    .gi-toggle { position:relative; display:inline-block; width:42px; height:22px; flex-shrink:0; }
    .gi-toggle input { opacity:0; width:0; height:0; }
    .gi-toggle-slider { position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background:linear-gradient(145deg,#252530,#1e1e24); border-radius:22px; transition:0.3s; box-shadow:inset 2px 2px 4px var(--nm-shadow-dark),inset -1px -1px 3px var(--nm-shadow-light); }
    .gi-toggle-slider:before { position:absolute; content:""; height:16px; width:16px; left:3px; bottom:3px; background:var(--nm-text-muted); border-radius:50%; transition:0.3s; box-shadow:1px 1px 3px var(--nm-shadow-dark); }
    .gi-toggle input:checked + .gi-toggle-slider { background:linear-gradient(145deg,#5a78dd,var(--nm-accent)); box-shadow:inset 1px 1px 3px rgba(0,0,0,0.3),0 0 8px var(--nm-accent-glow); }
    .gi-toggle input:checked + .gi-toggle-slider:before { transform:translateX(20px); background:#fff; }
    `;

    // ========== UTILITIES ==========
    function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    function encodeImageUrl(url) {
        if (!url) return '';
        return url.split('/').map(part => encodeURIComponent(part)).join('/');
    }

    function debounce(fn, ms) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), ms);
        };
    }

    function simpleHash(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
            h = Math.imul(31, h) + str.charCodeAt(i) | 0;
        }
        return h.toString(16);
    }

    function buildImgGenRegex() {
        const s = escapeRegExp(START_TAG);
        const e = escapeRegExp(END_TAG);
        return new RegExp(`${s}((?:(?!${s})[\\s\\S])*?)${e}`, 'g');
    }

    function extractJsonFromText(text) {
        // Try direct parse
        try { return JSON.parse(text.trim()); } catch (_) {}
        // Try extracting from ```json ... ```
        const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fence) {
            try { return JSON.parse(fence[1].trim()); } catch (_) {}
        }
        // Try extracting from first { ... }
        const braceMatch = text.match(/\{[\s\S]*\}/);
        if (braceMatch) {
            try { return JSON.parse(braceMatch[0]); } catch (_) {}
        }
        return null;
    }

    function getSTHeaders() {
        if (typeof SillyTavern !== 'undefined' && typeof SillyTavern.getRequestHeaders === 'function') {
            return SillyTavern.getRequestHeaders();
        }
        return { 'Content-Type': 'application/json' };
    }

    // ========== SETTINGS ==========
    function loadSettings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const saved = JSON.parse(raw);
                settings = deepMerge(DEFAULT_SETTINGS, saved);
            } else {
                settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            }
        } catch (e) {
            settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            addLog('SETTINGS', `加载失败，使用默认设置: ${e.message}`);
        }
        addLog('SETTINGS', '设置已加载');
    }

    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (e) {
            addLog('SETTINGS', `保存失败: ${e.message}`);
        }
    }

    function deepMerge(defaults, saved) {
        const result = JSON.parse(JSON.stringify(defaults));
        if (!saved || typeof saved !== 'object') return result;
        for (const key of Object.keys(saved)) {
            if (saved[key] !== null && typeof saved[key] === 'object' && !Array.isArray(saved[key])
                && result[key] !== null && typeof result[key] === 'object' && !Array.isArray(result[key])) {
                result[key] = deepMerge(result[key], saved[key]);
            } else {
                result[key] = saved[key];
            }
        }
        return result;
    }

    function exportConfig() {
        const config = {
            version: '2.0.0',
            exportDate: new Date().toISOString(),
            settings,
            anchorCache
        };
        const dataStr = JSON.stringify(config, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `genimage-config-${new Date().toISOString().slice(0, 10)}.json`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        if (typeof toastr !== 'undefined') toastr.success('配置已导出');
    }

    function importConfig() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                const config = JSON.parse(text);
                if (!config.settings) throw new Error('配置文件格式不正确');
                if (!confirm(`确定导入配置？导出日期: ${config.exportDate || '未知'}\n当前配置将被覆盖！`)) return;
                settings = deepMerge(DEFAULT_SETTINGS, config.settings);
                if (config.anchorCache) anchorCache = config.anchorCache;
                saveSettings();
                if (typeof toastr !== 'undefined') toastr.success('配置已导入');
                closeSettingsPopup();
                setTimeout(() => openSettingsPopup(), 200);
            } catch (error) {
                if (typeof toastr !== 'undefined') toastr.error(`导入失败: ${error.message}`);
            }
        };
        input.click();
    }

    // ========== LLM MODULE ==========
    function buildLLMRequestBody(messages, config) {
        const body = {
            model: config.model || 'deepseek-chat',
            messages,
            stream: false,
        };
        const temp = parseFloat(config.temperature);
        body.temperature = isNaN(temp) ? 0.7 : temp;
        const maxTok = parseInt(config.maxTokens);
        if (!isNaN(maxTok) && maxTok > 0) body.max_tokens = maxTok;
        return body;
    }

    async function callLLM(messages, configOverride = null) {
        const config = configOverride || settings.llmConfig;
        if (!config.baseUrl || !config.apiKey) {
            throw new Error('请先配置 LLM API 地址和 Key');
        }
        const url = config.baseUrl.replace(/\/$/, '') + '/chat/completions';
        const body = buildLLMRequestBody(messages, config);

        addLog('LLM', `POST ${url} | model=${body.model}`);

        const res = await safeFetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`LLM API ${res.status}: ${errText.substring(0, 200)}`);
        }

        const data = await res.json();

        // Multi-format response parsing
        let content = data.choices?.[0]?.message?.content
            || data.choices?.[0]?.message?.reasoning_content
            || data.choices?.[0]?.text
            || data.response
            || data.content
            || null;

        if (!content) throw new Error('LLM 返回内容为空: ' + JSON.stringify(data).substring(0, 200));
        return content.trim();
    }

    async function testLLMConnection(config) {
        const messages = [{ role: 'user', content: 'Reply with the single word: OK' }];
        const cfg = { ...config, maxTokens: 20, temperature: 0 };
        try {
            const result = await callLLM(messages, cfg);
            return { success: true, message: result.substring(0, 50) };
        } catch (e) {
            return { success: false, message: e.message };
        }
    }

    // ========== STEP 1: CHARACTER ANCHOR ==========

    function getCurrentCharacterName() {
        try {
            if (typeof SillyTavern !== 'undefined') {
                const ctx = SillyTavern.getContext?.() || SillyTavern.context;
                if (ctx?.characters && typeof ctx.this_chid !== 'undefined') {
                    return ctx.characters[ctx.this_chid]?.name || '';
                }
                if (SillyTavern.characters && typeof SillyTavern.this_chid !== 'undefined') {
                    return SillyTavern.characters[SillyTavern.this_chid]?.name || '';
                }
            }
        } catch (_) {}
        return '';
    }

    function getCurrentCharacterDescription() {
        try {
            if (typeof SillyTavern !== 'undefined') {
                const ctx = SillyTavern.getContext?.() || SillyTavern.context;
                if (ctx?.characters && typeof ctx.this_chid !== 'undefined') {
                    const ch = ctx.characters[ctx.this_chid];
                    return [ch?.description, ch?.personality, ch?.scenario].filter(Boolean).join('\n\n');
                }
                if (SillyTavern.characters && typeof SillyTavern.this_chid !== 'undefined') {
                    const ch = SillyTavern.characters[SillyTavern.this_chid];
                    return [ch?.description, ch?.personality, ch?.scenario].filter(Boolean).join('\n\n');
                }
            }
        } catch (_) {}
        return '';
    }

    async function getCharacterWorldbooks() {
        try {
            const TH = window.TavernHelper || window.parent?.TavernHelper;
            if (!TH?.getCharLorebooks) return [];
            const books = await TH.getCharLorebooks({ type: 'all' });
            return books || [];
        } catch (e) {
            addLog('WORLDBOOK', `获取世界书失败: ${e.message}`);
            return [];
        }
    }

    async function getWorldbookEntries(bookName) {
        try {
            const TH = window.TavernHelper || window.parent?.TavernHelper;
            if (!TH?.getLorebookEntries) return [];
            const entries = await TH.getLorebookEntries(bookName);
            return entries || [];
        } catch (e) {
            addLog('WORLDBOOK', `获取条目失败 ${bookName}: ${e.message}`);
            return [];
        }
    }

    async function getSelectedWorldbookContent() {
        const charName = getCurrentCharacterName();
        const selections = settings.worldbookSelections?.[charName] || {};
        const parts = [];
        for (const [bookName, uids] of Object.entries(selections)) {
            if (!uids?.length) continue;
            const entries = await getWorldbookEntries(bookName);
            for (const entry of entries) {
                if (uids.includes(entry.uid) && entry.content) {
                    parts.push(`[${entry.comment || entry.key}]\n${entry.content}`);
                }
            }
        }
        return parts.join('\n\n');
    }

    async function generateCharacterAnchor(forceRefresh = false) {
        if (!settings.anchorConfig.enabled) return null;

        const charName = getCurrentCharacterName();
        if (!charName) {
            addLog('ANCHOR', '未找到当前角色');
            return null;
        }

        // Gather source content for hash
        const charDesc = getCurrentCharacterDescription();
        const wbContent = await getSelectedWorldbookContent();

        // Check characters list for manually entered tags
        const charEntry = settings.characters.find(c => c.name === charName && c.enabled !== false);

        const sourceContent = charDesc + '\n' + wbContent;
        const contentHash = simpleHash(sourceContent);

        // Cache check
        if (!forceRefresh && settings.anchorConfig.cacheEnabled
            && anchorCache[charName]?.hash === contentHash
            && anchorCache[charName]?.anchor) {
            addLog('ANCHOR', `使用缓存锚点: ${charName}`);
            return anchorCache[charName].anchor;
        }

        addLog('ANCHOR', `生成角色锚点: ${charName}`);

        // If character has manual tags, prefer those as base
        if (charEntry?.tags) {
            const anchor = {
                character_name: charName,
                visual_anchor: charEntry.tags,
                personality_tags: '',
                outfit_default: ''
            };
            // Still try LLM to enrich
            if (!charDesc && !wbContent) {
                anchorCache[charName] = { hash: contentHash, anchor };
                return anchor;
            }
        }

        // Build LLM messages
        const systemMsg = settings.anchorConfig.template;
        const userContent = `角色名: ${charName}\n\n角色卡描述:\n${charDesc || '（无）'}\n\n世界书摘要:\n${wbContent || '（无）'}`;

        const messages = [
            { role: 'system', content: systemMsg },
            { role: 'user', content: userContent }
        ];

        try {
            const rawResp = await callLLM(messages);
            const anchor = extractJsonFromText(rawResp);
            if (!anchor || !anchor.visual_anchor) {
                throw new Error('解析锚点JSON失败: ' + rawResp.substring(0, 100));
            }

            // Merge with manual char entry tags if present
            if (charEntry?.tags) {
                anchor.visual_anchor = charEntry.tags + ', ' + anchor.visual_anchor;
            }

            anchorCache[charName] = { hash: contentHash, anchor };
            addLog('ANCHOR', `锚点生成成功: ${anchor.visual_anchor.substring(0, 80)}...`);
            return anchor;
        } catch (e) {
            addLog('ANCHOR', `生成失败: ${e.message}`);
            // Fallback to manual tags if available
            if (charEntry?.tags) {
                const fallback = { character_name: charName, visual_anchor: charEntry.tags, personality_tags: '', outfit_default: '' };
                anchorCache[charName] = { hash: contentHash, anchor: fallback };
                return fallback;
            }
            return null;
        }
    }

    // ========== STEP 2: SCENE DESCRIPTION ==========

    function extractParagraphs(text) {
        // Strip existing IMG_GEN tags
        const clean = text.replace(/\[IMG_GEN\][\s\S]*?\[\/IMG_GEN\]/g, '').trim();
        const paras = clean.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 10);
        if (!paras.length) {
            // Fallback: split by single newlines
            const lines = clean.split('\n').map(l => l.trim()).filter(l => l.length > 5);
            return lines.length ? lines : [clean];
        }
        return paras;
    }

    function getChatHistory(currentMesId, count) {
        try {
            const chat = SillyTavern.chat || SillyTavern.getContext?.()?.chat || SillyTavern.context?.chat;
            if (!chat) return '';
            const start = Math.max(0, currentMesId - count);
            return chat.slice(start, currentMesId).map(m => {
                const role = m.is_user ? 'User' : 'AI';
                const text = (m.mes || '').replace(/\[IMG_GEN\][\s\S]*?\[\/IMG_GEN\]/g, '').trim();
                return `[${role}]: ${text.substring(0, 300)}`;
            }).join('\n');
        } catch (_) {
            return '';
        }
    }

    async function generateSceneDescription(mesId, messageText, anchor) {
        const paragraphs = extractParagraphs(messageText);
        const numberedText = paragraphs.map((p, i) => `[P${i + 1}] ${p}`).join('\n\n');
        const history = getChatHistory(mesId, settings.sceneConfig.historyCount);

        const anchorSummary = anchor
            ? `角色名: ${anchor.character_name}\n固定视觉标签: ${anchor.visual_anchor}\n默认服装: ${anchor.outfit_default || '（无）'}`
            : '（无角色锚点，请根据上下文描述角色）';

        const systemMsg = settings.sceneConfig.template;
        const userContent = [
            '## 角色视觉锚点',
            anchorSummary,
            '',
            history ? '## 历史上下文（参考）\n' + history : '',
            '',
            '## 当前剧情（需要生成图片提示词）',
            numberedText
        ].filter(Boolean).join('\n');

        const messages = [
            { role: 'system', content: systemMsg },
            { role: 'user', content: userContent }
        ];

        addLog('SCENE', `生成场景描述 mesId=${mesId}, 段落数=${paragraphs.length}`);

        const rawResp = await callLLM(messages);
        const result = extractJsonFromText(rawResp);

        if (!result?.insertions?.length) {
            throw new Error('场景描述解析失败: ' + rawResp.substring(0, 100));
        }

        addLog('SCENE', `解析到 ${result.insertions.length} 个插入点`);
        return { insertions: result.insertions, paragraphs };
    }

    // ========== PROMPT COMBINER ==========

    function combinePrompt(anchor, scenePrompt) {
        const parts = [];
        const prefix = settings.promptConfig.globalPrefix;
        const suffix = settings.promptConfig.globalSuffix;

        if (prefix) parts.push(prefix);
        if (anchor?.visual_anchor) parts.push(anchor.visual_anchor);
        if (scenePrompt) parts.push(scenePrompt);
        if (suffix) parts.push(suffix);

        // Deduplicate tags
        const allTags = parts.join(', ').split(',').map(t => t.trim()).filter(Boolean);
        const seen = new Set();
        const deduped = [];
        for (const tag of allTags) {
            const lower = tag.toLowerCase();
            if (!seen.has(lower)) {
                seen.add(lower);
                deduped.push(tag);
            }
        }
        return deduped.join(', ');
    }

    // ========== COMFYUI ==========

    // Built-in Z-Image-Turbo workflow (API format)
    const Z_IMAGE_TURBO_WORKFLOW = {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": { "ckpt_name": "v1-5-pruned-emaonly.safetensors" }
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": { "text": "", "clip": ["1", 1] }
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": { "text": "", "clip": ["1", 1] }
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": { "width": 512, "height": 768, "batch_size": 1 }
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["1", 0],
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["4", 0],
                "seed": 42,
                "steps": 20,
                "cfg": 7,
                "sampler_name": "euler_ancestral",
                "scheduler": "normal",
                "denoise": 1
            }
        },
        "6": {
            "class_type": "VAEDecode",
            "inputs": { "samples": ["5", 0], "vae": ["1", 2] }
        },
        "7": {
            "class_type": "SaveImage",
            "inputs": { "images": ["6", 0], "filename_prefix": "GI-" }
        }
    };

    function getComfyUIBaseUrl() {
        const cfg = settings.comfyuiConfig;
        const proto = cfg.useHttps ? 'https' : 'http';
        return `${proto}://${cfg.host}:${cfg.port}`;
    }

    function autoMapNodes(workflow) {
        const map = {
            positive_node: null,
            negative_node: null,
            sampler_node: null,
            latent_node: null,
            checkpoint_node: null,
            lora_nodes: []
        };

        // Find KSampler
        for (const [id, node] of Object.entries(workflow)) {
            if (node.class_type === 'KSampler' || node.class_type === 'KSamplerAdvanced') {
                map.sampler_node = id;
                // Trace positive/negative
                const posRef = node.inputs?.positive;
                const negRef = node.inputs?.negative;
                if (Array.isArray(posRef)) map.positive_node = posRef[0];
                if (Array.isArray(negRef)) map.negative_node = negRef[0];
            }
            if (node.class_type === 'EmptyLatentImage' || node.class_type === 'EmptySD3LatentImage') {
                map.latent_node = id;
            }
            if (node.class_type === 'CheckpointLoaderSimple' || node.class_type === 'CheckpointLoader') {
                map.checkpoint_node = id;
            }
            if (node.class_type === 'LoraLoader' || node.class_type === 'LoRALoader') {
                map.lora_nodes.push(id);
            }
        }
        return map;
    }

    function buildWorkflowWithParams(prompt, negative) {
        const cfg = settings.comfyuiConfig;
        const overrides = cfg.paramOverrides || {};
        const loras = cfg.loras || [];

        // Get base workflow
        let workflow;
        const activeWF = cfg.activeWorkflow;
        if (activeWF === 'Z-Image-Turbo' || !activeWF) {
            workflow = JSON.parse(JSON.stringify(Z_IMAGE_TURBO_WORKFLOW));
        } else if (cfg.savedWorkflows?.[activeWF]?.json) {
            workflow = JSON.parse(JSON.stringify(cfg.savedWorkflows[activeWF].json));
        } else {
            workflow = JSON.parse(JSON.stringify(Z_IMAGE_TURBO_WORKFLOW));
        }

        const map = autoMapNodes(workflow);

        // Inject positive prompt
        if (map.positive_node && workflow[map.positive_node]) {
            workflow[map.positive_node].inputs.text = prompt;
        }

        // Inject negative prompt
        if (map.negative_node && workflow[map.negative_node]) {
            workflow[map.negative_node].inputs.text = negative || settings.promptConfig.globalNegative;
        }

        // Inject sampler params
        if (map.sampler_node && workflow[map.sampler_node]) {
            const s = workflow[map.sampler_node].inputs;
            const seed = overrides.seed ?? -1;
            s.seed = seed < 0 ? Math.floor(Math.random() * 2 ** 32) : seed;
            if (overrides.steps) s.steps = overrides.steps;
            if (overrides.cfg) s.cfg = overrides.cfg;
            if (overrides.sampler_name) s.sampler_name = overrides.sampler_name;
            if (overrides.scheduler) s.scheduler = overrides.scheduler;
        }

        // Inject latent size
        if (map.latent_node && workflow[map.latent_node]) {
            const l = workflow[map.latent_node].inputs;
            if (overrides.width) l.width = overrides.width;
            if (overrides.height) l.height = overrides.height;
        }

        // Inject checkpoint
        if (map.checkpoint_node && workflow[map.checkpoint_node] && overrides.ckpt_name) {
            workflow[map.checkpoint_node].inputs.ckpt_name = overrides.ckpt_name;
        }

        // Inject LoRAs: chain them between checkpoint and sampler
        if (loras.length > 0 && map.checkpoint_node && map.sampler_node) {
            let prevModelRef = [map.checkpoint_node, 0];
            let prevClipRef = [map.checkpoint_node, 1];
            let loraNodeBase = 100;

            for (const lora of loras) {
                if (!lora.name) continue;
                const nodeId = String(loraNodeBase++);
                workflow[nodeId] = {
                    class_type: 'LoraLoader',
                    inputs: {
                        model: prevModelRef,
                        clip: prevClipRef,
                        lora_name: lora.name,
                        strength_model: lora.strength ?? 1.0,
                        strength_clip: lora.strength ?? 1.0
                    }
                };
                prevModelRef = [nodeId, 0];
                prevClipRef = [nodeId, 1];
            }

            // Update sampler to use last LoRA output
            workflow[map.sampler_node].inputs.model = prevModelRef;

            // Update CLIP text encoders
            if (map.positive_node) workflow[map.positive_node].inputs.clip = prevClipRef;
            if (map.negative_node) workflow[map.negative_node].inputs.clip = prevClipRef;
        }

        return workflow;
    }

    async function testComfyUIConnection() {
        const base = getComfyUIBaseUrl();
        try {
            const res = await safeFetch(`${base}/system_stats`, { method: 'GET' });
            if (!res.ok) return { success: false, message: `HTTP ${res.status}` };
            const data = await res.json();
            return { success: true, message: `ComfyUI ${data.system?.comfyui_version || 'OK'}` };
        } catch (e) {
            return { success: false, message: e.message };
        }
    }

    async function submitComfyUIPrompt(workflow) {
        const base = getComfyUIBaseUrl();
        const body = { prompt: workflow, client_id: SCRIPT_ID };
        const res = await safeFetch(`${base}/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`ComfyUI prompt failed ${res.status}: ${errText.substring(0, 200)}`);
        }
        const data = await res.json();
        if (data.error) throw new Error(`ComfyUI error: ${JSON.stringify(data.error).substring(0, 200)}`);
        return data.prompt_id;
    }

    async function pollComfyUIResult(promptId, maxWaitMs = 120000) {
        const base = getComfyUIBaseUrl();
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitMs) {
            await new Promise(r => setTimeout(r, 1500));
            try {
                const res = await safeFetch(`${base}/history/${promptId}`);
                if (!res.ok) continue;
                const hist = await res.json();
                const entry = hist[promptId];
                if (!entry) continue;
                if (entry.status?.status_str === 'error' || entry.status?.completed === false && Object.keys(entry.outputs || {}).length === 0) {
                    if (entry.status?.status_str === 'error') throw new Error('ComfyUI generation error');
                    continue;
                }
                // Find image outputs
                const images = [];
                for (const nodeOutput of Object.values(entry.outputs || {})) {
                    for (const img of nodeOutput.images || []) {
                        images.push(img);
                    }
                }
                if (images.length > 0) return images[0]; // Return first image
            } catch (e) {
                if (e.message.includes('error')) throw e;
            }
        }
        throw new Error('ComfyUI 生图超时（120s）');
    }

    async function downloadComfyUIImage(imageInfo) {
        const base = getComfyUIBaseUrl();
        const url = `${base}/view?filename=${encodeURIComponent(imageInfo.filename)}&subfolder=${encodeURIComponent(imageInfo.subfolder || '')}&type=${imageInfo.type || 'output'}`;
        const res = await safeFetch(url);
        if (!res.ok) throw new Error(`下载图片失败 ${res.status}`);
        // Convert to base64
        const blob = await new Promise((resolve, reject) => {
            if (typeof res.blob === 'function') {
                res.blob().then(resolve).catch(reject);
            } else {
                // GM_xmlhttpRequest response — re-fetch with blob handling
                safeFetch(url).then(r => r.text()).then(text => {
                    resolve({ type: 'image/png', _text: text });
                }).catch(reject);
            }
        });

        return new Promise((resolve, reject) => {
            if (blob._text !== undefined) {
                // Already text — try as data URL or base64
                resolve(blob._text);
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    async function downloadComfyUIImageDirect(imageInfo) {
        // Use GM fetch with responseType=arraybuffer for binary data
        const base = getComfyUIBaseUrl();
        const url = `${base}/view?filename=${encodeURIComponent(imageInfo.filename)}&subfolder=${encodeURIComponent(imageInfo.subfolder || '')}&type=${imageInfo.type || 'output'}`;

        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'undefined') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    responseType: 'arraybuffer',
                    timeout: 30000,
                    onload: (response) => {
                        try {
                            const bytes = new Uint8Array(response.response);
                            let binary = '';
                            for (let i = 0; i < bytes.byteLength; i++) {
                                binary += String.fromCharCode(bytes[i]);
                            }
                            resolve(btoa(binary));
                        } catch (e) {
                            reject(e);
                        }
                    },
                    onerror: (e) => reject(new Error(`下载图片失败: ${e.error}`)),
                    ontimeout: () => reject(new Error('下载图片超时'))
                });
            } else {
                fetch(url).then(r => r.arrayBuffer()).then(buf => {
                    const bytes = new Uint8Array(buf);
                    let binary = '';
                    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
                    resolve(btoa(binary));
                }).catch(reject);
            }
        });
    }

    async function uploadImageToST(base64Data, format = 'png') {
        const charName = getCurrentCharacterName();
        const now = new Date();
        const pad = (n, len = 2) => String(n).padStart(len, '0');
        const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}@${pad(now.getHours())}h${pad(now.getMinutes())}m${pad(now.getSeconds())}s`;
        const filename = `${charName || 'gi'}_${ts}.${format}`;

        const response = await fetch('/api/images/upload', {
            method: 'POST',
            headers: getSTHeaders(),
            body: JSON.stringify({ image: base64Data, format, ch_name: charName, filename })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`上传图片失败: ${errText}`);
        }
        const result = await response.json();
        addLog('UPLOAD', `图片已保存: ${result.path}`);
        return result.path;
    }

    async function generateComfyUIImage(prompt, negative) {
        addLog('COMFYUI', `开始生图: ${prompt.substring(0, 80)}...`);
        const workflow = buildWorkflowWithParams(prompt, negative);
        const promptId = await submitComfyUIPrompt(workflow);
        addLog('COMFYUI', `任务已提交: ${promptId}`);
        const imageInfo = await pollComfyUIResult(promptId);
        addLog('COMFYUI', `图片生成完成: ${imageInfo.filename}`);
        const base64 = await downloadComfyUIImageDirect(imageInfo);
        const imageUrl = await uploadImageToST(base64, 'png');
        return imageUrl;
    }

    // ========== APPLY INSERTIONS ==========

    async function applyImageInsertions(mesId, originalText, insertions, paragraphs) {
        // Build modified text with [IMG_GEN] tags inserted after paragraphs
        const parts = [...paragraphs];

        // Sort insertions by paragraph descending to insert from end
        const sorted = [...insertions].sort((a, b) => b.after_paragraph - a.after_paragraph);

        for (const ins of sorted) {
            const idx = ins.after_paragraph - 1; // 0-based
            if (idx >= 0 && idx < parts.length) {
                // Extract actual prompt from potential [IMG_GEN] wrapper
                let prompt = ins.prompt;
                const innerMatch = prompt.match(/\[IMG_GEN\]([\s\S]*?)\[\/IMG_GEN\]/);
                if (innerMatch) prompt = innerMatch[1].trim();

                const finalPrompt = combinePrompt(anchorCache[getCurrentCharacterName()]?.anchor, prompt);
                parts.splice(idx + 1, 0, `${START_TAG}${finalPrompt}${END_TAG}`);
            }
        }

        // Rebuild the original text structure
        // We need to replace paragraphs in the original message
        const newText = insertInsertionsIntoOriginal(originalText, paragraphs, insertions);
        return newText;
    }

    function insertInsertionsIntoOriginal(originalText, paragraphs, insertions) {
        // Clean text (remove existing tags)
        let clean = originalText.replace(/\[IMG_GEN\][\s\S]*?\[\/IMG_GEN\]/g, '').trim();

        // Sort insertions descending
        const sorted = [...insertions].sort((a, b) => b.after_paragraph - a.after_paragraph);

        for (const ins of sorted) {
            const idx = ins.after_paragraph - 1;
            if (idx < 0 || idx >= paragraphs.length) continue;
            const paraText = paragraphs[idx];
            const paraPos = findParagraphPosition(clean, paraText);
            if (paraPos === -1) continue;

            let prompt = ins.prompt;
            const innerMatch = prompt.match(/\[IMG_GEN\]([\s\S]*?)\[\/IMG_GEN\]/);
            if (innerMatch) prompt = innerMatch[1].trim();

            const anchor = anchorCache[getCurrentCharacterName()]?.anchor || null;
            const finalPrompt = combinePrompt(anchor, prompt);
            const insertion = `\n${START_TAG}${finalPrompt}${END_TAG}`;
            const insertAt = paraPos + paraText.length;
            clean = clean.slice(0, insertAt) + insertion + clean.slice(insertAt);
        }

        return clean;
    }

    function findParagraphPosition(text, para) {
        const idx = text.indexOf(para);
        return idx;
    }

    async function safeUpdateChatMessage(mesId, newContent) {
        try {
            if (typeof SillyTavern?.setChatMessages === 'function') {
                await SillyTavern.setChatMessages([{ index: mesId, mes: newContent }]);
                return;
            }
            const chat = SillyTavern.chat || SillyTavern.getContext?.()?.chat || SillyTavern.context?.chat;
            if (chat?.[mesId]) {
                chat[mesId].mes = newContent;
                if (typeof SillyTavern.saveChat === 'function') await SillyTavern.saveChat();
                else if (SillyTavern.context?.saveChat) await SillyTavern.context.saveChat();
                // Trigger re-render
                if (SillyTavern.eventSource) {
                    await SillyTavern.eventSource.emit('message_updated', mesId);
                }
            }
        } catch (e) {
            addLog('UPDATE', `消息更新失败: ${e.message}`);
        }
    }

    // ========== MAIN AUTO-GENERATION FLOW ==========

    async function handleAutoGeneration(mesId) {
        if (!settings.enabled || !settings.autoGenerate) return;

        const chat = SillyTavern.chat || SillyTavern.getContext?.()?.chat || SillyTavern.context?.chat;
        if (!chat?.[mesId]) return;

        const msg = chat[mesId];
        if (msg.is_user) return;

        const messageText = msg.mes || '';

        // Skip if already has IMG_GEN tags
        if (messageText.includes(START_TAG)) {
            addLog('AUTO', `mesId=${mesId} 已有IMG_GEN标记，跳过`);
            return;
        }

        addLog('AUTO', `开始自动生图流程 mesId=${mesId}`);

        try {
            // Step 1: Character anchor
            if (typeof toastr !== 'undefined') toastr.info(t('anchor_generating'), null, { timeOut: 3000 });
            const anchor = await generateCharacterAnchor();

            // Step 2: Scene description
            if (typeof toastr !== 'undefined') toastr.info(t('scene_generating'), null, { timeOut: 3000 });
            const { insertions, paragraphs } = await generateSceneDescription(mesId, messageText, anchor);

            // Apply insertions to message (marks with IMG_GEN tags)
            const newText = insertInsertionsIntoOriginal(messageText, paragraphs, insertions);

            // Update message
            await safeUpdateChatMessage(mesId, newText);
            addLog('AUTO', `已插入 ${insertions.length} 个IMG_GEN标记`);

            // processChatDOM will pick up the tags and trigger image generation
            setTimeout(processChatDOM, 500);

        } catch (e) {
            addLog('AUTO', `自动生图失败: ${e.message}`);
            if (typeof toastr !== 'undefined') toastr.error(`生图失败: ${e.message}`, null, { timeOut: 4000 });
        }
    }

    // ========== IMAGE GENERATION STATE ==========

    async function handleGeneration(state) {
        const { $wrap, mesId, blockIdx, prompt } = state;

        const $placeholder = $wrap.find('.gi-placeholder');
        const $img = $wrap.find('.gi-ui-image');
        const $msg = $wrap.find('.gi-ui-msg');

        // Show requesting state
        $placeholder.addClass('requesting').text(t('requesting')).show();
        $img.hide();

        const showMsg = (text) => {
            $msg.text(text).addClass('show');
            setTimeout(() => $msg.removeClass('show'), 3000);
        };

        try {
            const negative = settings.promptConfig.globalNegative;
            const imageUrl = await generateComfyUIImage(prompt, negative);

            // Update chat data with image URL
            await updateChatData(mesId, blockIdx, prompt, [imageUrl], false, false);
            updateWrapperView($wrap, [imageUrl], 0);
            showMsg('1/1');
            addLog('GEN', `图片生成完成: ${imageUrl}`);

        } catch (e) {
            addLog('GEN', `生图失败: ${e.message}`);
            $placeholder.removeClass('requesting').text(`❌ ${e.message.substring(0, 50)}`);
            showMsg('失败');
            // Mark as no_gen to prevent retry loops
            await updateChatData(mesId, blockIdx, prompt, [], true, false);
        }
    }

    function updateWrapperView($wrap, images, idx) {
        const $viewport = $wrap.find('.gi-ui-viewport');
        const $img = $wrap.find('.gi-ui-image');
        const $placeholder = $wrap.find('.gi-placeholder');
        const $left = $wrap.find('.gi-zone.left');
        const $right = $wrap.find('.gi-zone.right');
        const $delete = $wrap.find('.gi-zone.delete');
        const $msg = $wrap.find('.gi-ui-msg');

        if (images.length > 0) {
            $img.attr('src', encodeImageUrl(images[idx])).show();
            $placeholder.hide();
            $left.toggle(idx > 0);
            $right.toggleClass('gen-mode', idx === images.length - 1);
            $delete.show();
            $msg.text(`${idx + 1}/${images.length}`);
        } else {
            $img.attr('src', '').hide();
            $placeholder.removeClass('requesting').text(t('waiting')).show();
            $left.hide();
            $right.addClass('gen-mode');
            $delete.hide();
        }

        $wrap.attr('data-images', encodeURIComponent(JSON.stringify(images)));
        $wrap.attr('data-cur-idx', idx);
    }

    async function updateChatData(mesId, blockIdx, prompt, images, preventAuto, isScheduled) {
        const chat = SillyTavern.chat || SillyTavern.getContext?.()?.chat || SillyTavern.context?.chat;
        if (!chat?.[mesId]) return;

        const regex = buildImgGenRegex();
        let count = 0;
        const newMes = chat[mesId].mes.replace(regex, (m, content) => {
            if (count++ !== blockIdx) return m;
            let base = prompt;
            if (preventAuto) base += NO_GEN_FLAG;
            if (isScheduled) base += SCHEDULED_FLAG;
            if (images.length > 0) base += `|images:${images.join('|')}`;
            return `${START_TAG}${base}${END_TAG}`;
        });

        chat[mesId].mes = newMes;
        try {
            if (typeof SillyTavern.saveChat === 'function') await SillyTavern.saveChat();
            else if (SillyTavern.context?.saveChat) await SillyTavern.context.saveChat();
            if (SillyTavern.eventSource) {
                await SillyTavern.eventSource.emit('message_updated', parseInt(mesId));
            }
        } catch (e) {
            addLog('CHAT', `保存失败: ${e.message}`);
        }
    }

    function parseBlockContent(content) {
        const preventAuto = content.includes(NO_GEN_FLAG);
        const isScheduled = content.includes(SCHEDULED_FLAG);
        let clean = content.replace(NO_GEN_FLAG, '').replace(SCHEDULED_FLAG, '');

        // Extract images
        const images = [];
        const imgMatch = clean.match(/\|images:(.+)$/);
        if (imgMatch) {
            const imgPart = imgMatch[1];
            images.push(...imgPart.split('|').filter(Boolean));
            clean = clean.replace(/\|images:.+$/, '');
        }

        return { prompt: clean.trim(), images, preventAuto, isScheduled };
    }

    // ========== IMAGE UI ==========

    function createUIHtml(prompt, images, preventAuto, blockIdx, initIdx, isScheduled = false) {
        const has = images.length > 0;
        const placeholderText = isScheduled ? `⏳ ${t('requesting')}` : t('waiting');
        const placeholderClass = isScheduled ? 'gi-placeholder requesting' : 'gi-placeholder';
        const imgSrc = has ? encodeImageUrl(images[initIdx]) : '';

        return `
        <div class="gi-ui-container">
            <div class="gi-ui-wrap"
                data-prompt="${encodeURIComponent(prompt)}"
                data-images="${encodeURIComponent(JSON.stringify(images))}"
                data-prevent-auto="${preventAuto}"
                data-block-idx="${blockIdx}"
                data-cur-idx="${initIdx}"
                data-scheduled="${isScheduled}">
                <div class="gi-ui-toggle">▵</div>
                <div class="gi-ui-viewport">
                    <div class="gi-zone top" title="${t('tab_prompt')}"></div>
                    <div class="gi-zone left" style="display:${initIdx > 0 ? 'block' : 'none'}"></div>
                    <div class="gi-zone right ${!has || initIdx === images.length - 1 ? 'gen-mode' : ''}"></div>
                    <div class="gi-zone delete" style="display:${has ? 'block' : 'none'}"></div>
                    <div class="gi-ui-msg">${has ? `${initIdx + 1}/${images.length}` : ''}</div>
                    <img class="gi-ui-image" src="${imgSrc}" style="display:${has ? 'block' : 'none'}" />
                    <div class="${placeholderClass}" style="display:${has ? 'none' : 'block'}">${placeholderText}</div>
                </div>
            </div>
        </div>`;
    }

    function processChatDOM() {
        if (!settings.enabled) return;
        const regex = buildImgGenRegex();

        $('.mes_text').each(function () {
            const $el = $(this);

            // Restore images for existing wrappers
            $el.find('.gi-ui-wrap').each(function () {
                const $w = $(this);
                const imgs = JSON.parse(decodeURIComponent($w.attr('data-images') || '[]'));
                if (imgs.length > 0 && !$w.find('.gi-ui-image').attr('src')) {
                    updateWrapperView($w, imgs, imgs.length - 1);
                }
            });

            // Inject UI where not yet done
            const html = $el.html();
            if (html.indexOf(START_TAG) === -1 || $el.find('.gi-ui-wrap').length > 0) return;

            let blockIdx = 0;
            $el.html(html.replace(regex, (m, content) => {
                const p = parseBlockContent(content);
                return createUIHtml(p.prompt, p.images, p.preventAuto, blockIdx++, Math.max(0, p.images.length - 1), p.isScheduled);
            }));

            // Trigger generation for empty blocks
            $el.find('.gi-ui-wrap').each(function () {
                const $w = $(this);
                const bIdx = parseInt($w.attr('data-block-idx'));
                const mesId = $w.closest('.mes').attr('mesid');
                const imgs = JSON.parse(decodeURIComponent($w.attr('data-images') || '[]'));
                const content = $w.attr('data-prompt') ? decodeURIComponent($w.attr('data-prompt')) : '';
                const isScheduled = $w.attr('data-scheduled') === 'true';
                const preventAuto = $w.attr('data-prevent-auto') === 'true';

                if (isScheduled || preventAuto || imgs.length > 0) return;

                // Auto-generate
                updateChatData(mesId, bIdx, content, [], false, true).then(() => {
                    setTimeout(() => {
                        handleGeneration({
                            $wrap: $w,
                            mesId,
                            blockIdx: bIdx,
                            prompt: content
                        });
                    }, 500 + bIdx * 500);
                });
            });
        });
    }

    // ========== GLOBAL LISTENERS ==========

    function initGlobalListeners() {
        const $chat = $('#chat');

        // Toggle collapse
        $chat.on('click', '.gi-ui-toggle', function (e) {
            e.stopPropagation();
            $(this).siblings('.gi-ui-viewport').toggleClass('collapsed');
            $(this).text($(this).siblings('.gi-ui-viewport').hasClass('collapsed') ? '▿' : '▵');
        });

        // Previous image
        $chat.on('click', '.gi-zone.left', function (e) {
            e.stopPropagation();
            const $w = $(this).closest('.gi-ui-wrap');
            const imgs = JSON.parse(decodeURIComponent($w.attr('data-images') || '[]'));
            let idx = parseInt($w.attr('data-cur-idx') || 0);
            if (idx > 0) updateWrapperView($w, imgs, --idx);
        });

        // Next image or re-generate
        $chat.on('click', '.gi-zone.right', function (e) {
            e.stopPropagation();
            const $w = $(this).closest('.gi-ui-wrap');
            const imgs = JSON.parse(decodeURIComponent($w.attr('data-images') || '[]'));
            let idx = parseInt($w.attr('data-cur-idx') || 0);

            if (!$(this).hasClass('gen-mode') && idx < imgs.length - 1) {
                updateWrapperView($w, imgs, ++idx);
            } else {
                // Re-generate
                const mesId = $w.closest('.mes').attr('mesid');
                const bIdx = parseInt($w.attr('data-block-idx'));
                const prompt = decodeURIComponent($w.attr('data-prompt') || '');
                handleGeneration({ $wrap: $w, mesId, blockIdx: bIdx, prompt });
            }
        });

        // Delete image
        $chat.on('click', '.gi-zone.delete', async function (e) {
            e.stopPropagation();
            const $w = $(this).closest('.gi-ui-wrap');
            const mesId = $w.closest('.mes').attr('mesid');
            const bIdx = parseInt($w.attr('data-block-idx'));
            const prompt = decodeURIComponent($w.attr('data-prompt') || '');
            updateWrapperView($w, [], 0);
            await updateChatData(mesId, bIdx, prompt, [], false, false);
        });

        // Edit prompt
        $chat.on('click', '.gi-zone.top', function (e) {
            e.stopPropagation();
            const $w = $(this).closest('.gi-ui-wrap');
            const prompt = decodeURIComponent($w.attr('data-prompt') || '');
            const newPrompt = prompt ? window.prompt('编辑提示词:', prompt) : null;
            if (newPrompt !== null && newPrompt !== prompt) {
                $w.attr('data-prompt', encodeURIComponent(newPrompt));
                const mesId = $w.closest('.mes').attr('mesid');
                const bIdx = parseInt($w.attr('data-block-idx'));
                updateChatData(mesId, bIdx, newPrompt, [], false, false);
            }
        });

        // Lightbox on image click
        $chat.on('click', '.gi-ui-image', function () {
            const src = $(this).attr('src');
            if (!src) return;
            const overlay = $(`<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:zoom-out"><img src="${src}" style="max-width:90vw;max-height:90vh;border-radius:8px;box-shadow:0 0 40px rgba(0,0,0,0.8)"></div>`);
            overlay.on('click', () => overlay.remove());
            $('body').append(overlay);
        });
    }

    // ========== SETTINGS PANEL ==========

    function addMenuItem() {
        if ($('#extensionsMenu').length === 0) { setTimeout(addMenuItem, 1000); return; }
        if ($(`#${SCRIPT_ID}-menu`).length) return;
        const $item = $(`<div class="list-group-item flex-container flexGap5 interactable" id="${SCRIPT_ID}-menu">
            <div class="fa-fw fa-solid fa-image"></div><span>生图助手 v2</span></div>`);
        $item.on('click', openSettingsPopup);
        $('#extensionsMenu').append($item);
    }

    let settingsPopupOpen = false;

    function closeSettingsPopup() {
        $('#gi-settings-overlay').remove();
        settingsPopupOpen = false;
    }

    function openSettingsPopup() {
        if (settingsPopupOpen) { closeSettingsPopup(); return; }
        settingsPopupOpen = true;

        // Build character options for worldbook
        const charName = getCurrentCharacterName();

        const popup = $(`
        <div id="gi-settings-overlay" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:99998;display:flex;align-items:center;justify-content:center;">
            <div class="gi-settings-popup" style="background:var(--nm-bg);border-radius:var(--nm-radius);padding:24px;width:min(700px,95vw);max-height:90vh;overflow-y:auto;box-shadow:8px 8px 20px var(--nm-shadow-dark),-4px -4px 12px var(--nm-shadow-light);position:relative;font-family:'Georgia','Times New Roman','Noto Serif SC',serif;color:var(--nm-text);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                    <h3 style="margin:0;color:var(--nm-accent);font-size:1.2em;letter-spacing:1px;">🎨 生图助手 v2</h3>
                    <button id="gi-close-popup" style="background:none;border:none;color:var(--nm-text-muted);font-size:1.4em;cursor:pointer;padding:4px 8px;">✕</button>
                </div>

                <!-- Tabs -->
                <div class="gi-tab-nav">
                    <button class="gi-tab-btn active" data-tab="basic">${t('tab_basic')}</button>
                    <button class="gi-tab-btn" data-tab="llm">${t('tab_llm')}</button>
                    <button class="gi-tab-btn" data-tab="anchor">${t('tab_anchor')}</button>
                    <button class="gi-tab-btn" data-tab="comfyui">${t('tab_comfyui')}</button>
                    <button class="gi-tab-btn" data-tab="prompt">${t('tab_prompt')}</button>
                </div>

                <!-- Tab: Basic -->
                <div class="gi-tab-content active" data-tab="basic">
                    <div class="gi-row">
                        <label>${t('enabled')}</label>
                        <label class="gi-toggle"><input type="checkbox" id="gi-enabled" ${settings.enabled ? 'checked' : ''}><span class="gi-toggle-slider"></span></label>
                    </div>
                    <div class="gi-row">
                        <label>${t('language')}</label>
                        <select id="gi-language">
                            <option value="zh" ${settings.language === 'zh' ? 'selected' : ''}>中文</option>
                            <option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option>
                        </select>
                    </div>
                    <div class="gi-row">
                        <label>${t('auto_generate')}</label>
                        <label class="gi-toggle"><input type="checkbox" id="gi-auto-gen" ${settings.autoGenerate ? 'checked' : ''}><span class="gi-toggle-slider"></span></label>
                    </div>
                    <div class="gi-row">
                        <label>${t('debounce_ms')}</label>
                        <input type="number" id="gi-debounce" value="${settings.debounceMs}" min="200" max="5000" step="100" style="width:100px;flex:none!important;">
                    </div>
                    <div class="gi-controls">
                        <button class="gi-btn gi-btn-sec" id="gi-export">${t('export_config')}</button>
                        <button class="gi-btn gi-btn-sec" id="gi-import">${t('import_config')}</button>
                    </div>
                </div>

                <!-- Tab: LLM -->
                <div class="gi-tab-content" data-tab="llm">
                    <div class="gi-row">
                        <label>${t('llm_base_url')}</label>
                        <input type="text" id="gi-llm-url" value="${settings.llmConfig.baseUrl}" placeholder="https://api.deepseek.com">
                    </div>
                    <div class="gi-row">
                        <label>${t('llm_api_key')}</label>
                        <input type="password" id="gi-llm-key" value="${settings.llmConfig.apiKey}" placeholder="sk-...">
                    </div>
                    <div class="gi-row">
                        <label>${t('llm_model')}</label>
                        <input type="text" id="gi-llm-model" value="${settings.llmConfig.model}" placeholder="deepseek-chat">
                    </div>
                    <div class="gi-row">
                        <label>${t('llm_max_tokens')}</label>
                        <input type="number" id="gi-llm-tokens" value="${settings.llmConfig.maxTokens}" min="256" max="32768" step="256">
                    </div>
                    <div class="gi-row">
                        <label>${t('llm_temperature')}</label>
                        <input type="range" id="gi-llm-temp" value="${settings.llmConfig.temperature}" min="0" max="2" step="0.1" style="flex:1">
                        <span class="gi-range-val" id="gi-llm-temp-val">${settings.llmConfig.temperature}</span>
                    </div>
                    <div class="gi-controls">
                        <button class="gi-btn" id="gi-test-llm">${t('test_llm')}</button>
                    </div>
                    <div id="gi-llm-status" style="margin-top:10px;padding:8px;border-radius:6px;display:none;font-size:0.85em;"></div>
                </div>

                <!-- Tab: Anchor -->
                <div class="gi-tab-content" data-tab="anchor">
                    <div class="gi-row">
                        <label>${t('anchor_enabled')}</label>
                        <label class="gi-toggle"><input type="checkbox" id="gi-anchor-enabled" ${settings.anchorConfig.enabled ? 'checked' : ''}><span class="gi-toggle-slider"></span></label>
                    </div>
                    <div class="gi-row">
                        <label>${t('anchor_cache')}</label>
                        <label class="gi-toggle"><input type="checkbox" id="gi-anchor-cache" ${settings.anchorConfig.cacheEnabled ? 'checked' : ''}><span class="gi-toggle-slider"></span></label>
                    </div>
                    <h4>${t('char_name')} / ${t('char_tags')}</h4>
                    <div class="gi-char-list" id="gi-char-list"></div>
                    <button class="gi-btn gi-btn-sec" id="gi-add-char" style="width:100%;margin-bottom:12px;">${t('add_char')}</button>
                    <h4>${t('anchor_template')}</h4>
                    <div class="gi-row" style="flex-direction:column;align-items:stretch;">
                        <textarea id="gi-anchor-tpl" style="width:100%;min-height:120px;font-size:0.82em!important;font-family:'Consolas','Monaco',monospace!important;">${escapeHtml(settings.anchorConfig.template)}</textarea>
                    </div>
                    <div class="gi-controls">
                        <button class="gi-btn" id="gi-gen-anchor">${t('gen_anchor')}</button>
                        <button class="gi-btn gi-btn-sec" id="gi-clear-anchor-cache">${t('clear_anchor_cache')}</button>
                    </div>
                    <div id="gi-anchor-status" style="margin-top:10px;font-size:0.85em;color:var(--nm-text-muted);"></div>
                </div>

                <!-- Tab: ComfyUI -->
                <div class="gi-tab-content" data-tab="comfyui">
                    <div class="gi-row">
                        <label>${t('comfyui_host')}</label>
                        <input type="text" id="gi-comfyui-host" value="${settings.comfyuiConfig.host}" placeholder="127.0.0.1">
                    </div>
                    <div class="gi-row">
                        <label>${t('comfyui_port')}</label>
                        <input type="number" id="gi-comfyui-port" value="${settings.comfyuiConfig.port}" min="1" max="65535">
                    </div>
                    <div class="gi-row">
                        <label>${t('comfyui_https')}</label>
                        <label class="gi-toggle"><input type="checkbox" id="gi-comfyui-https" ${settings.comfyuiConfig.useHttps ? 'checked' : ''}><span class="gi-toggle-slider"></span></label>
                    </div>
                    <div class="gi-controls" style="margin-bottom:12px;">
                        <button class="gi-btn" id="gi-test-comfyui">${t('test_comfyui')}</button>
                    </div>
                    <div id="gi-comfyui-status" style="margin-bottom:10px;font-size:0.85em;display:none;padding:6px 10px;border-radius:6px;"></div>
                    <h4>${t('active_workflow')}</h4>
                    <div class="gi-row">
                        <label>${t('active_workflow')}</label>
                        <select id="gi-workflow-select">${buildWorkflowOptions()}</select>
                    </div>
                    <div class="gi-controls" style="margin-bottom:12px;">
                        <button class="gi-btn gi-btn-sec" id="gi-upload-workflow">${t('upload_workflow')}</button>
                        <input type="file" id="gi-workflow-file" accept=".json" style="display:none">
                    </div>
                    <h4>${t('param_overrides')}</h4>
                    ${buildParamOverridesHtml()}
                    <h4 style="margin-top:16px;">${t('loras')}</h4>
                    <div class="gi-lora-list" id="gi-lora-list"></div>
                    <button class="gi-btn gi-btn-sec" id="gi-add-lora" style="width:100%;">${t('lora_add')}</button>
                </div>

                <!-- Tab: Prompt -->
                <div class="gi-tab-content" data-tab="prompt">
                    <div class="gi-row">
                        <label>${t('global_prefix')}</label>
                        <input type="text" id="gi-prefix" value="${escapeHtmlAttr(settings.promptConfig.globalPrefix)}">
                    </div>
                    <div class="gi-row">
                        <label>${t('global_suffix')}</label>
                        <input type="text" id="gi-suffix" value="${escapeHtmlAttr(settings.promptConfig.globalSuffix)}">
                    </div>
                    <div class="gi-row" style="flex-direction:column;align-items:stretch;">
                        <label style="margin-bottom:6px;font-weight:600;color:var(--nm-text-muted);font-size:0.88em;">${t('global_negative')}</label>
                        <textarea id="gi-negative" style="width:100%;min-height:80px;font-size:0.82em!important;font-family:'Consolas','Monaco',monospace!important;">${escapeHtml(settings.promptConfig.globalNegative)}</textarea>
                    </div>
                    <div class="gi-row">
                        <label>${t('history_count')}</label>
                        <input type="number" id="gi-history-count" value="${settings.sceneConfig.historyCount}" min="0" max="20">
                    </div>
                    <h4>${t('scene_template')}</h4>
                    <div class="gi-row" style="flex-direction:column;align-items:stretch;">
                        <textarea id="gi-scene-tpl" style="width:100%;min-height:140px;font-size:0.82em!important;font-family:'Consolas','Monaco',monospace!important;">${escapeHtml(settings.sceneConfig.template)}</textarea>
                    </div>
                </div>

                <!-- Save/Cancel -->
                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:15px;border-top:1px solid var(--nm-border);">
                    <button class="gi-btn gi-btn-sec" id="gi-cancel">${t('cancel')}</button>
                    <button class="gi-btn" id="gi-save">${t('save')}</button>
                </div>
            </div>
        </div>`);

        $('body').append(popup);
        renderCharList();
        renderLoraList();

        // Tab switching
        popup.on('click', '.gi-tab-btn', function () {
            const tab = $(this).data('tab');
            popup.find('.gi-tab-btn').removeClass('active');
            popup.find('.gi-tab-content').removeClass('active');
            $(this).addClass('active');
            popup.find(`.gi-tab-content[data-tab="${tab}"]`).addClass('active');
        });

        // Range display
        $('#gi-llm-temp').on('input', function () {
            $('#gi-llm-temp-val').text($(this).val());
        });

        // Test LLM
        $('#gi-test-llm').on('click', async function () {
            const btn = $(this);
            btn.prop('disabled', true).text(t('testing'));
            const cfg = {
                baseUrl: $('#gi-llm-url').val(),
                apiKey: $('#gi-llm-key').val(),
                model: $('#gi-llm-model').val(),
                maxTokens: 20,
                temperature: 0
            };
            const result = await testLLMConnection(cfg);
            const $status = $('#gi-llm-status');
            $status.show().css({
                background: result.success ? 'rgba(80,200,80,0.15)' : 'rgba(200,80,80,0.15)',
                color: result.success ? '#80ff80' : '#ff8080'
            }).text(result.success ? `✓ ${result.message}` : `✗ ${result.message}`);
            btn.prop('disabled', false).text(t('test_llm'));
        });

        // Test ComfyUI
        $('#gi-test-comfyui').on('click', async function () {
            const btn = $(this);
            btn.prop('disabled', true).text(t('testing'));
            // Apply current field values to settings temporarily
            settings.comfyuiConfig.host = $('#gi-comfyui-host').val();
            settings.comfyuiConfig.port = parseInt($('#gi-comfyui-port').val());
            settings.comfyuiConfig.useHttps = $('#gi-comfyui-https').is(':checked');
            const result = await testComfyUIConnection();
            const $status = $('#gi-comfyui-status');
            $status.show().css({
                background: result.success ? 'rgba(80,200,80,0.15)' : 'rgba(200,80,80,0.15)',
                color: result.success ? '#80ff80' : '#ff8080'
            }).text(result.success ? `✓ ${result.message}` : `✗ ${result.message}`);
            btn.prop('disabled', false).text(t('test_comfyui'));
        });

        // Generate anchor
        $('#gi-gen-anchor').on('click', async function () {
            const btn = $(this);
            btn.prop('disabled', true).text(t('anchor_generating'));
            try {
                const anchor = await generateCharacterAnchor(true);
                $('#gi-anchor-status').text(anchor
                    ? `✓ ${anchor.character_name}: ${anchor.visual_anchor.substring(0, 80)}...`
                    : '✗ 生成失败');
            } catch (e) {
                $('#gi-anchor-status').text(`✗ ${e.message}`);
            }
            btn.prop('disabled', false).text(t('gen_anchor'));
        });

        // Clear anchor cache
        $('#gi-clear-anchor-cache').on('click', function () {
            anchorCache = {};
            $('#gi-anchor-status').text('✓ 缓存已清除');
        });

        // Add character
        $('#gi-add-char').on('click', function () {
            settings.characters.push({ name: '', tags: '', enabled: true });
            renderCharList();
        });

        // Add LoRA
        $('#gi-add-lora').on('click', function () {
            if (!settings.comfyuiConfig.loras) settings.comfyuiConfig.loras = [];
            settings.comfyuiConfig.loras.push({ name: '', strength: 1.0 });
            renderLoraList();
        });

        // Upload workflow
        $('#gi-upload-workflow').on('click', () => $('#gi-workflow-file').click());
        $('#gi-workflow-file').on('change', function (e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const json = JSON.parse(ev.target.result);
                    const name = file.name.replace('.json', '');
                    if (!settings.comfyuiConfig.savedWorkflows) settings.comfyuiConfig.savedWorkflows = {};
                    settings.comfyuiConfig.savedWorkflows[name] = { json };
                    settings.comfyuiConfig.activeWorkflow = name;
                    if (typeof toastr !== 'undefined') toastr.success(`工作流 "${name}" 已上传`);
                    // Update select
                    $('#gi-workflow-select').html(buildWorkflowOptions());
                    $('#gi-workflow-select').val(name);
                } catch (err) {
                    if (typeof toastr !== 'undefined') toastr.error(`JSON解析失败: ${err.message}`);
                }
            };
            reader.readAsText(file);
        });

        // Export/Import
        $('#gi-export').on('click', exportConfig);
        $('#gi-import').on('click', importConfig);

        // Close
        $('#gi-close-popup, #gi-cancel').on('click', closeSettingsPopup);

        // Save
        $('#gi-save').on('click', function () {
            collectSettingsFromUI();
            saveSettings();
            closeSettingsPopup();
            if (typeof toastr !== 'undefined') toastr.success('✓ 设置已保存');
        });

        // Click outside to close
        $('#gi-settings-overlay').on('click', function (e) {
            if ($(e.target).is('#gi-settings-overlay')) closeSettingsPopup();
        });
    }

    function escapeHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function escapeHtmlAttr(str) {
        return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function buildWorkflowOptions() {
        const active = settings.comfyuiConfig.activeWorkflow || 'Z-Image-Turbo';
        let opts = `<option value="Z-Image-Turbo" ${active === 'Z-Image-Turbo' ? 'selected' : ''}>${t('workflow_builtin')}</option>`;
        for (const name of Object.keys(settings.comfyuiConfig.savedWorkflows || {})) {
            opts += `<option value="${escapeHtmlAttr(name)}" ${active === name ? 'selected' : ''}>${escapeHtml(name)}</option>`;
        }
        return opts;
    }

    function buildParamOverridesHtml() {
        const o = settings.comfyuiConfig.paramOverrides || {};
        return `
        <div class="gi-row"><label>${t('model_name')}</label><input type="text" id="gi-ckpt" value="${escapeHtmlAttr(o.ckpt_name || '')}" placeholder="v1-5-pruned-emaonly.safetensors"></div>
        <div class="gi-row"><label>${t('steps')}</label><input type="number" id="gi-steps" value="${o.steps || 20}" min="1" max="150"></div>
        <div class="gi-row"><label>${t('cfg')}</label><input type="number" id="gi-cfg" value="${o.cfg || 7}" min="1" max="30" step="0.5"></div>
        <div class="gi-row"><label>${t('width')}</label><input type="number" id="gi-width" value="${o.width || 512}" min="64" max="2048" step="64"></div>
        <div class="gi-row"><label>${t('height')}</label><input type="number" id="gi-height" value="${o.height || 768}" min="64" max="2048" step="64"></div>
        <div class="gi-row"><label>${t('sampler')}</label>
            <select id="gi-sampler">
                ${['euler','euler_ancestral','heun','dpm_2','dpm_2_ancestral','lms','dpm_fast','dpm_adaptive','dpmpp_2s_ancestral','dpmpp_sde','dpmpp_2m','dpmpp_2m_sde','ddim','uni_pc'].map(s => `<option value="${s}" ${o.sampler_name === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
        </div>
        <div class="gi-row"><label>${t('scheduler')}</label>
            <select id="gi-scheduler">
                ${['normal','karras','exponential','sgm_uniform','simple','ddim_uniform'].map(s => `<option value="${s}" ${o.scheduler === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
        </div>
        <div class="gi-row"><label>${t('seed')}</label><input type="number" id="gi-seed" value="${o.seed ?? -1}" min="-1"></div>`;
    }

    function renderCharList() {
        const $list = $('#gi-char-list').empty();
        settings.characters.forEach((ch, i) => {
            const row = $(`
            <div class="gi-char-row" data-idx="${i}">
                <label class="gi-toggle" style="flex-shrink:0;"><input type="checkbox" class="gi-char-enabled" ${ch.enabled !== false ? 'checked' : ''}><span class="gi-toggle-slider"></span></label>
                <input type="text" class="gi-char-name text_pole" placeholder="${t('char_name')}" value="${escapeHtmlAttr(ch.name || '')}">
                <input type="text" class="gi-char-tags text_pole" placeholder="${t('char_tags')}" value="${escapeHtmlAttr(ch.tags || '')}">
                <button class="gi-btn gi-btn-danger gi-btn-sm gi-char-del">${t('delete')}</button>
            </div>`);
            row.find('.gi-char-enabled').on('change', function () {
                settings.characters[i].enabled = $(this).is(':checked');
            });
            row.find('.gi-char-name').on('input', function () {
                settings.characters[i].name = $(this).val();
            });
            row.find('.gi-char-tags').on('input', function () {
                settings.characters[i].tags = $(this).val();
            });
            row.find('.gi-char-del').on('click', function () {
                settings.characters.splice(i, 1);
                renderCharList();
            });
            $list.append(row);
        });
    }

    function renderLoraList() {
        const $list = $('#gi-lora-list').empty();
        const loras = settings.comfyuiConfig.loras || [];
        loras.forEach((lora, i) => {
            const row = $(`
            <div class="gi-lora-row" data-idx="${i}">
                <input type="text" class="gi-lora-name text_pole" placeholder="${t('lora_name')}" value="${escapeHtmlAttr(lora.name || '')}" style="flex:1;background:var(--nm-bg)!important;border:none!important;color:var(--nm-text)!important;padding:6px!important;border-radius:6px!important;">
                <input type="number" class="gi-lora-str text_pole" value="${lora.strength ?? 1.0}" min="0" max="2" step="0.05" style="width:70px;background:var(--nm-bg)!important;border:none!important;color:var(--nm-text)!important;padding:6px!important;border-radius:6px!important;">
                <button class="gi-btn gi-btn-danger gi-btn-sm gi-lora-del" style="flex-shrink:0;">${t('delete')}</button>
            </div>`);
            row.find('.gi-lora-name').on('input', function () { loras[i].name = $(this).val(); });
            row.find('.gi-lora-str').on('input', function () { loras[i].strength = parseFloat($(this).val()); });
            row.find('.gi-lora-del').on('click', function () {
                loras.splice(i, 1);
                renderLoraList();
            });
            $list.append(row);
        });
    }

    function collectSettingsFromUI() {
        settings.enabled = $('#gi-enabled').is(':checked');
        settings.language = $('#gi-language').val();
        settings.autoGenerate = $('#gi-auto-gen').is(':checked');
        settings.debounceMs = parseInt($('#gi-debounce').val()) || 1000;

        settings.llmConfig.baseUrl = $('#gi-llm-url').val().trim();
        settings.llmConfig.apiKey = $('#gi-llm-key').val().trim();
        settings.llmConfig.model = $('#gi-llm-model').val().trim();
        settings.llmConfig.maxTokens = parseInt($('#gi-llm-tokens').val()) || 4096;
        settings.llmConfig.temperature = parseFloat($('#gi-llm-temp').val()) || 0.7;

        settings.anchorConfig.enabled = $('#gi-anchor-enabled').is(':checked');
        settings.anchorConfig.cacheEnabled = $('#gi-anchor-cache').is(':checked');
        settings.anchorConfig.template = $('#gi-anchor-tpl').val();

        settings.comfyuiConfig.host = $('#gi-comfyui-host').val().trim();
        settings.comfyuiConfig.port = parseInt($('#gi-comfyui-port').val()) || 8188;
        settings.comfyuiConfig.useHttps = $('#gi-comfyui-https').is(':checked');
        settings.comfyuiConfig.activeWorkflow = $('#gi-workflow-select').val();
        settings.comfyuiConfig.paramOverrides = {
            ckpt_name: $('#gi-ckpt').val().trim(),
            steps: parseInt($('#gi-steps').val()) || 20,
            cfg: parseFloat($('#gi-cfg').val()) || 7,
            width: parseInt($('#gi-width').val()) || 512,
            height: parseInt($('#gi-height').val()) || 768,
            sampler_name: $('#gi-sampler').val(),
            scheduler: $('#gi-scheduler').val(),
            seed: parseInt($('#gi-seed').val()) ?? -1,
        };

        settings.promptConfig.globalPrefix = $('#gi-prefix').val();
        settings.promptConfig.globalSuffix = $('#gi-suffix').val();
        settings.promptConfig.globalNegative = $('#gi-negative').val();
        settings.sceneConfig.historyCount = parseInt($('#gi-history-count').val()) || 4;
        settings.sceneConfig.template = $('#gi-scene-tpl').val();
    }

    // ========== EVENT SYSTEM ==========

    function registerSTEvents() {
        if (typeof eventOn !== 'function' || typeof tavern_events === 'undefined') {
            addLog('EVENTS', '酒馆事件系统不可用，跳过事件注册');
            return;
        }

        let autoGenDebounced = null;

        // MESSAGE_RECEIVED → auto-generate
        eventOn(tavern_events.MESSAGE_RECEIVED, (mesId) => {
            if (!settings.autoGenerate) return;
            if (!autoGenDebounced) {
                autoGenDebounced = debounce((id) => handleAutoGeneration(id), settings.debounceMs);
            }
            autoGenDebounced(mesId);
        });

        // CHAT_CHANGED → invalidate anchor cache for new char
        if (tavern_events.CHAT_CHANGED) {
            eventOn(tavern_events.CHAT_CHANGED, () => {
                addLog('EVENT', 'CHAT_CHANGED: 清除锚点缓存');
                // Don't clear all cache, but let hash mismatch handle it
                setTimeout(processChatDOM, 800);
            });
        }

        // CHARACTER_MESSAGE_RENDERED → process DOM
        if (tavern_events.CHARACTER_MESSAGE_RENDERED) {
            eventOn(tavern_events.CHARACTER_MESSAGE_RENDERED, () => {
                setTimeout(processChatDOM, 300);
            });
        }

        addLog('EVENTS', '事件已注册: MESSAGE_RECEIVED, CHAT_CHANGED, CHARACTER_MESSAGE_RENDERED');
    }

    // ========== BUTTONS ==========

    function registerButtons() {
        if (typeof appendInexistentScriptButtons !== 'function' || typeof getButtonEvent !== 'function') return;

        appendInexistentScriptButtons([
            { name: t('gen_anchor_btn'), visible: true },
            { name: t('manual_gen'), visible: true }
        ]);

        eventOn(getButtonEvent(t('gen_anchor_btn')), async () => {
            if (typeof toastr !== 'undefined') toastr.info(t('anchor_generating'));
            try {
                const anchor = await generateCharacterAnchor(true);
                if (anchor) {
                    if (typeof toastr !== 'undefined') toastr.success(`✓ 锚点: ${anchor.visual_anchor.substring(0, 60)}...`);
                } else {
                    if (typeof toastr !== 'undefined') toastr.warning('锚点生成为空');
                }
            } catch (e) {
                if (typeof toastr !== 'undefined') toastr.error(`锚点生成失败: ${e.message}`);
            }
        });

        eventOn(getButtonEvent(t('manual_gen')), async () => {
            // Get latest AI message ID
            try {
                const chat = SillyTavern.chat || SillyTavern.getContext?.()?.chat || SillyTavern.context?.chat;
                if (!chat) return;
                let latestAiMesId = -1;
                for (let i = chat.length - 1; i >= 0; i--) {
                    if (!chat[i].is_user) { latestAiMesId = i; break; }
                }
                if (latestAiMesId >= 0) {
                    await handleAutoGeneration(latestAiMesId);
                }
            } catch (e) {
                if (typeof toastr !== 'undefined') toastr.error(`手动生图失败: ${e.message}`);
            }
        });
    }

    // ========== INIT ==========

    function injectCSS() {
        if ($('#gi-global-css').length) return;
        $('<style id="gi-global-css">').text(GLOBAL_CSS).appendTo('head');
    }

    async function ensureImgGenFilterRegex() {
        if (typeof getTavernRegexes !== 'function' || typeof updateTavernRegexesWith !== 'function') return;
        const REGEX_NAME = '过滤上下文[IMG_GEN]';
        const REGEX_PATTERN = '/\\[IMG_GEN\\]((?:(?!\\[IMG_GEN\\])[\\s\\S])*?)\\[\\/IMG_GEN\\]/gsi';
        try {
            const existing = getTavernRegexes({ scope: 'global' });
            if (existing.some(r => r.script_name === REGEX_NAME)) return;
            await updateTavernRegexesWith(regexes => {
                regexes.push({
                    id: crypto.randomUUID ? crypto.randomUUID() : `gi-${Date.now()}`,
                    script_name: REGEX_NAME,
                    enabled: true,
                    run_on_edit: true,
                    scope: 'global',
                    find_regex: REGEX_PATTERN,
                    replace_string: '',
                    source: { user_input: false, ai_output: true, slash_command: false, world_info: false },
                    destination: { display: false, prompt: true },
                    min_depth: null,
                    max_depth: null
                });
                return regexes;
            });
            addLog('REGEX', '已添加 IMG_GEN 过滤正则');
        } catch (e) {
            addLog('REGEX', `添加正则失败: ${e.message}`);
        }
    }

    function initScript() {
        loadSettings();
        injectCSS();
        addMenuItem();
        initGlobalListeners();
        registerSTEvents();
        registerButtons();
        ensureImgGenFilterRegex();
        setTimeout(processChatDOM, 1200);

        if (typeof toastr !== 'undefined') {
            toastr.success('🎨 生图助手 v2 已启动', '插件加载', {
                timeOut: 1500,
                positionClass: 'toast-top-center'
            });
        }
        addLog('INIT', '生图助手 v2 启动成功');
    }

    // Entry point — wait for SillyTavern to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(initScript, 500));
    } else {
        setTimeout(initScript, 500);
    }

})();
