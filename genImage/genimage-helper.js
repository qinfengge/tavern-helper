// ==UserScript==
// @name         生图助手 v2
// @version      v2.2.0
// @description  两步LLM串行生图：角色锚点(自然语言) + 场景描述，内置Z-Image ComfyUI工作流
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
                                const h = response.responseHeaders.split('\n')
                                    .find(l => l.toLowerCase().startsWith(name.toLowerCase()));
                                return h ? h.split(': ')[1]?.trim() : null;
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
                onerror: (e) => reject(new Error(`Network error: ${e.error || 'Unknown'}`)),
                ontimeout: () => reject(new Error('Request timeout (60s)'))
            });
        });
    }

    const safeFetch = (typeof GM_xmlhttpRequest !== 'undefined') ? gmFetch : fetch;
    window.GI_safeFetch = safeFetch;

    // ========== CONSTANTS ==========
    const SCRIPT_ID = 'genimage_helper_v2';
    const STORAGE_KEY = 'genimage_helper_settings';
    const ANCHOR_CACHE_KEY = 'genimage_anchor_cache';
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
            llm_model: '模型',
            llm_fetch_models: '获取模型列表',
            llm_fetching: '获取中...',
            llm_max_tokens: 'Max Tokens',
            llm_temperature: 'Temperature',
            test_llm: '测试连接',
            anchor_enabled: '启用角色锚点',
            anchor_cache: '缓存锚点',
            anchor_template: '锚点生成提示词',
            gen_anchor: '重新生成锚点',
            clear_anchor_cache: '清除缓存',
            anchor_current: '当前角色锚点',
            anchor_empty: '（尚未生成，切换角色卡后自动触发）',
            anchor_char_name: '角色名',
            comfyui_host: 'ComfyUI 地址',
            comfyui_port: '端口',
            comfyui_https: '使用 HTTPS',
            test_comfyui: '测试连接',
            active_workflow: '当前工作流',
            upload_workflow: '上传工作流 JSON',
            workflow_preview: '工作流节点预览',
            workflow_no_preview: '（选择工作流后显示）',
            loras: 'LoRA 列表',
            lora_fetch: '从 ComfyUI 获取',
            lora_fetching: '获取中...',
            lora_available: '可用 LoRA',
            lora_active: '已启用 LoRA',
            lora_add_selected: '添加选中',
            lora_strength: '强度',
            global_negative: '负面描述（自然语言）',
            scene_template: '场景描述提示词',
            history_count: '历史消息数',
            export_config: '导出配置',
            import_config: '导入配置',
            save: '保存',
            cancel: '取消',
            testing: '测试中...',
            anchor_generating: '正在生成角色锚点...',
            scene_generating: '正在生成场景描述...',
            waiting: '等待生成...',
            requesting: '请求中...',
            manual_gen: '手动生图',
            gen_anchor_btn: '生成锚点',
            delete: '删除',
            workflow_builtin: '内置 Z-Image',
            model_name: '模型文件名',
            steps: '步数',
            cfg: 'CFG',
            width: '宽',
            height: '高',
            sampler: '采样器',
            scheduler: '调度器',
            seed: '种子(-1随机)',
            prompt_language: '提示词语言',
            prompt_lang_zh: '中文',
            prompt_lang_en: '英文',
            gen_all_anchors: '生成全部角色锚点',
            anchor_all_chars: '全部角色锚点',
            regen: '重新生成',
            anchor_ops: '操作',
            anchor_desc: '外貌描述',
            model_fetch: '获取模型列表',
            fetch_workflows: '从服务器获取',
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
            llm_fetch_models: 'Fetch Model List',
            llm_fetching: 'Fetching...',
            llm_max_tokens: 'Max Tokens',
            llm_temperature: 'Temperature',
            test_llm: 'Test Connection',
            anchor_enabled: 'Enable Anchor',
            anchor_cache: 'Cache Anchor',
            anchor_template: 'Anchor Prompt Template',
            gen_anchor: 'Regenerate Anchor',
            clear_anchor_cache: 'Clear Cache',
            anchor_current: 'Current Anchor',
            anchor_empty: '(Not generated yet, triggers on character switch)',
            anchor_char_name: 'Character Name',
            comfyui_host: 'ComfyUI Host',
            comfyui_port: 'Port',
            comfyui_https: 'Use HTTPS',
            test_comfyui: 'Test Connection',
            active_workflow: 'Active Workflow',
            upload_workflow: 'Upload Workflow JSON',
            workflow_preview: 'Workflow Node Preview',
            workflow_no_preview: '(Select a workflow to preview)',
            loras: 'LoRA List',
            lora_fetch: 'Fetch from ComfyUI',
            lora_fetching: 'Fetching...',
            lora_available: 'Available LoRAs',
            lora_active: 'Enabled LoRAs',
            lora_add_selected: 'Add Selected',
            lora_strength: 'Strength',
            global_negative: 'Negative Description (natural language)',
            scene_template: 'Scene Prompt Template',
            history_count: 'History Count',
            export_config: 'Export Config',
            import_config: 'Import Config',
            save: 'Save',
            cancel: 'Cancel',
            testing: 'Testing...',
            anchor_generating: 'Generating character anchor...',
            scene_generating: 'Generating scene description...',
            waiting: 'Waiting...',
            requesting: 'Requesting...',
            manual_gen: 'Manual Gen',
            gen_anchor_btn: 'Gen Anchor',
            delete: 'Del',
            workflow_builtin: 'Built-in Z-Image',
            model_name: 'Model filename',
            steps: 'Steps',
            cfg: 'CFG',
            width: 'Width',
            height: 'Height',
            sampler: 'Sampler',
            scheduler: 'Scheduler',
            seed: 'Seed (-1=random)',
            prompt_language: 'Prompt Language',
            prompt_lang_zh: 'Chinese',
            prompt_lang_en: 'English',
            gen_all_anchors: 'Generate All Anchors',
            anchor_all_chars: 'All Character Anchors',
            regen: 'Regen',
            anchor_ops: 'Actions',
            anchor_desc: 'Description',
            model_fetch: 'Fetch Models',
            fetch_workflows: 'Fetch from Server',
        }
    };

    function t(key) {
        return I18N[settings?.language || 'zh']?.[key] || I18N['en'][key] || key;
    }

    // ========== DEFAULT SETTINGS ==========
    const DEFAULT_SETTINGS = {
        enabled: true,
        language: 'zh',
        promptLanguage: 'zh',   // 'zh' | 'en' — 生成提示词的语言
        autoGenerate: true,
        debounceMs: 1000,

        llmConfig: {
            baseUrl: 'https://api.deepseek.com',
            apiKey: '',
            model: '',
            modelList: [],           // 从API获取的模型列表
            maxTokens: 4096,
            temperature: 0.7,
        },

        // 角色锚点：从世界书提取所有角色的固定外貌描述
        anchorConfig: {
            enabled: true,
            cacheEnabled: true,
            // 提示词：要求LLM识别世界书中所有角色并输出外貌描述数组
            template: `你是一个角色视觉描述专家，服务于AI图像生成工作流（Z-Image）。
根据以下世界书信息，识别所有主要角色，并为每个角色生成一段自然语言外貌描述。

要求：
1. 识别世界书中所有主要角色（包括主角、配角、重要NPC）
2. 使用自然语言，不使用逗号分隔的关键词标签
3. 描述每个角色的固定视觉特征：体型、发色发型、眼睛颜色、皮肤、面部特征、默认服装
4. 专注于视觉可描述的外貌，避免性格/背景描述
5. 语言根据用户设置输出（中文或英文）

必须以纯JSON数组格式回复（不要任何其他内容）：
[{"character_name":"角色名","description":"对角色外貌的完整自然语言描述"},...]`
        },

        sceneConfig: {
            historyCount: 4,
            // 提示词：要求LLM输出Z-Image自然语言场景描述（详细版）
            template: `你是一个顶级AI图像生成提示词专家，专为Z-Image工作流（Flux/SD3类自然语言模型）创作高质量图像描述。

核心规则：
1. 使用流畅的自然语言段落，禁止使用逗号堆叠关键词
2. 必须将角色锚点中的固定外貌描述原样融入（不可省略或改写）
3. 每条提示词必须包含以下全部要素，形成完整的画面：
   - 【人物】锚点外貌 + 当前表情/神态 + 当前姿势动作 + 服装细节（若有变化则更新）
   - 【场景】具体环境（室内/室外、地点特征、细节布置）
   - 【光线】光源类型、方向、色温（如正午阳光、夜间烛光、阴天漫射光）
   - 【构图】景别（全身/半身/特写）、镜头角度（正面/侧面/俯视）
   - 【氛围】整体情绪基调和画面风格感
4. 提示词长度目标：120~250个词，不得少于80词
5. after_paragraph 对应剧情段落编号 [P1][P2]...，选择情绪转折或视觉最丰富的位置
6. 每次生成1~2个插入点（不要超过2个）
7. 只输出纯JSON，不要解释或其他内容

输出格式：
{"insertions":[{"after_paragraph":1,"prompt":"详细的完整场景描述..."}]}`
        },

        comfyuiConfig: {
            host: '127.0.0.1',
            port: 8188,
            useHttps: false,
            activeWorkflow: 'Z-Image',
            savedWorkflows: {},
            paramOverrides: {
                ckpt_name: '',       // CheckpointLoaderSimple 用（传统SD）
                unet_name: '',       // UNETLoader 用（Z-Image / Flux）
                steps: 20,
                cfg: 7,
                width: 832,
                height: 1216,
                sampler_name: 'euler',
                scheduler: 'normal',
                seed: -1,
            },
            loras: [],               // [{ name, strength }]
            availableLoras: [],      // 从ComfyUI获取的可用LoRA列表（仅运行时）
            availableModels: { checkpoints: [], unets: [] }, // 从ComfyUI获取（仅运行时）
        },

        promptConfig: {
            // Z-Image 使用自然语言，negative也用自然语言
            globalNegative: 'blurry, low quality, distorted, deformed, ugly, bad anatomy, watermark, text',
            // 前缀/后缀可选，会附加到自然语言描述前后
            globalPrefix: '',
            globalSuffix: 'high quality, detailed, 8k',
        },

        worldbookSelections: {},
    };

    // ========== RUNTIME STATE ==========
    let settings = {};
    let anchorCache = {};       // { charName: { anchor: { character_name, description } } } — persistent, generate once
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
    .gi-ui-container * { box-sizing:border-box; user-select:none; font-family:'Georgia','Times New Roman','Noto Serif SC',serif; }
    .gi-ui-wrap { display:flex; flex-direction:column; background:transparent; border:none; margin:5px 0; width:100%; position:relative; }
    .gi-ui-toggle { text-align:center; cursor:pointer; font-size:0.8em; opacity:0.2; color:var(--nm-text); margin-bottom:2px; transition:opacity 0.2s; line-height:1; }
    .gi-ui-toggle:hover { opacity:1; color:var(--nm-accent); }
    .gi-ui-viewport { position:relative; width:100%; min-height:50px; display:flex; align-items:center; justify-content:center; overflow:hidden; border-radius:var(--nm-radius); }
    .gi-ui-viewport.collapsed { display:none; }
    .gi-ui-image { max-width:100%; max-height:600px; width:auto; height:auto; border-radius:var(--nm-radius); box-shadow:4px 4px 12px var(--nm-shadow-dark),-2px -2px 8px var(--nm-shadow-light); z-index:1; }
    .gi-zone { position:absolute; background:transparent; }
    .gi-zone.delete { bottom:0; left:0; width:40%; height:5%; z-index:100; cursor:no-drop; }
    .gi-zone.left  { top:0; left:0; width:20%; height:70%; z-index:90; cursor:w-resize; }
    .gi-zone.right { top:0; right:0; width:20%; height:70%; z-index:90; cursor:e-resize; }
    .gi-zone.right.gen-mode { cursor:alias; }
    .gi-zone.top   { top:0; left:0; width:100%; height:20%; z-index:80; cursor:text; }
    .gi-ui-msg { position:absolute; bottom:10px; left:50%; transform:translateX(-50%); background:var(--nm-bg); color:var(--nm-text); padding:6px 12px; border-radius:var(--nm-radius-sm); font-size:11px; pointer-events:none; opacity:0; transition:opacity 0.3s; z-index:15; white-space:nowrap; box-shadow:3px 3px 8px var(--nm-shadow-dark); }
    .gi-ui-msg.show { opacity:1; }
    .gi-placeholder { padding:20px; background:var(--nm-bg); border-radius:var(--nm-radius); color:var(--nm-text-muted); font-size:0.9em; text-align:center; width:100%; box-shadow:inset 3px 3px 6px var(--nm-shadow-dark),inset -2px -2px 5px var(--nm-shadow-light); }
    .gi-placeholder.requesting { color:var(--nm-accent)!important; animation:gi-pulse 1.5s ease-in-out infinite; }
    @keyframes gi-pulse { 0%,100%{opacity:0.6}50%{opacity:1} }
    /* Tabs */
    .gi-tab-nav { display:flex; gap:6px; margin-bottom:18px; padding:6px; background:var(--nm-bg); border-radius:var(--nm-radius); box-shadow:inset 3px 3px 8px var(--nm-shadow-dark),inset -2px -2px 6px var(--nm-shadow-light); flex-wrap:wrap; }
    .gi-tab-btn { padding:7px 12px; cursor:pointer; opacity:0.7; border-radius:var(--nm-radius-sm); font-weight:600; font-size:0.88em; transition:all 0.25s; color:var(--nm-text-muted); background:transparent; font-family:'Georgia','Times New Roman','Noto Serif SC',serif; letter-spacing:0.3px; border:none; }
    .gi-tab-btn:hover { opacity:1; color:var(--nm-text); }
    .gi-tab-btn.active { opacity:1; color:var(--nm-accent); background:linear-gradient(145deg,#252530,#1a1a20); box-shadow:4px 4px 8px var(--nm-shadow-dark),-2px -2px 6px var(--nm-shadow-light),0 0 10px var(--nm-accent-glow); }
    .gi-tab-content { display:none; animation:gi-fade 0.3s ease; }
    .gi-tab-content.active { display:block; }
    @keyframes gi-fade { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)} }
    /* Form rows */
    .gi-row { display:flex; gap:10px; margin-bottom:9px; align-items:center; padding:8px 12px; background:linear-gradient(145deg,#252530,#1e1e24); border-radius:var(--nm-radius-sm); box-shadow:2px 2px 5px var(--nm-shadow-dark),-1px -1px 4px var(--nm-shadow-light); }
    .gi-row label { flex:0 0 100px; font-weight:600; color:var(--nm-text-muted); font-size:0.85em; line-height:1.4; }
    .gi-row input[type=text],.gi-row input[type=password],.gi-row input[type=number],.gi-row select,.gi-row textarea {
        flex:1; background:var(--nm-bg)!important; border:none!important; color:var(--nm-text)!important;
        padding:8px 10px!important; border-radius:var(--nm-radius-sm)!important;
        box-shadow:inset 2px 2px 5px var(--nm-shadow-dark),inset -1px -1px 4px var(--nm-shadow-light)!important;
        font-family:'Georgia','Times New Roman',serif!important; font-size:0.88em;
    }
    .gi-row input:focus,.gi-row select:focus,.gi-row textarea:focus { outline:none!important; box-shadow:inset 2px 2px 5px var(--nm-shadow-dark),inset -1px -1px 4px var(--nm-shadow-light),0 0 8px var(--nm-accent-glow)!important; }
    .gi-row textarea { resize:vertical; min-height:80px; }
    .gi-range-val { flex:0 0 40px; text-align:center; color:var(--nm-accent); font-family:'Consolas',monospace; font-weight:600; font-size:0.88em; }
    /* Buttons */
    .gi-btn { background:linear-gradient(145deg,var(--nm-accent),#5a78dd); color:#fff; border:none; padding:8px 16px; border-radius:var(--nm-radius-sm); cursor:pointer; transition:all 0.25s; font-family:'Georgia','Times New Roman',serif; font-weight:600; box-shadow:3px 3px 8px var(--nm-shadow-dark),-2px -2px 6px var(--nm-shadow-light),0 0 10px var(--nm-accent-glow); font-size:0.88em; }
    .gi-btn:hover { transform:translateY(-1px); box-shadow:4px 4px 12px var(--nm-shadow-dark),-3px -3px 8px var(--nm-shadow-light),0 0 18px var(--nm-accent-glow); }
    .gi-btn:active { transform:translateY(0); }
    .gi-btn:disabled { opacity:0.5; cursor:not-allowed; transform:none; }
    .gi-btn-sm { padding:5px 10px; font-size:0.8em; }
    .gi-btn-sec { background:linear-gradient(145deg,#2a2a35,#22222a); color:var(--nm-text); border:none; padding:8px 16px; border-radius:var(--nm-radius-sm); cursor:pointer; transition:all 0.25s; font-family:'Georgia','Times New Roman',serif; box-shadow:3px 3px 8px var(--nm-shadow-dark),-2px -2px 6px var(--nm-shadow-light); font-size:0.88em; }
    .gi-btn-sec:hover { color:var(--nm-accent); }
    .gi-btn-sec:disabled { opacity:0.5; cursor:not-allowed; }
    .gi-btn-danger { background:linear-gradient(145deg,#4a2530,#3a1a22); color:#ff9999; border:none; padding:8px 16px; border-radius:var(--nm-radius-sm); cursor:pointer; transition:all 0.25s; font-family:'Georgia','Times New Roman',serif; box-shadow:3px 3px 8px var(--nm-shadow-dark),-2px -2px 6px var(--nm-shadow-light); font-size:0.88em; }
    .gi-btn-danger:hover { color:#ffbbbb; }
    /* Controls bar */
    .gi-controls { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
    .gi-controls button { flex:1 1 auto; min-width:80px; }
    /* Anchor preview */
    .gi-anchor-box { margin-top:10px; padding:12px 14px; background:var(--nm-bg); border-radius:var(--nm-radius-sm); box-shadow:inset 2px 2px 5px var(--nm-shadow-dark),inset -1px -1px 4px var(--nm-shadow-light); color:var(--nm-text); font-size:0.85em; line-height:1.6; min-height:60px; word-break:break-word; border-left:3px solid var(--nm-accent); }
    .gi-anchor-name { font-size:0.78em; color:var(--nm-text-muted); margin-bottom:6px; }
    .gi-anchor-desc { font-style:italic; color:var(--nm-text); font-family:'Georgia',serif; }
    /* Workflow preview */
    .gi-workflow-preview { margin-top:10px; padding:10px; background:var(--nm-bg); border-radius:var(--nm-radius-sm); box-shadow:inset 2px 2px 5px var(--nm-shadow-dark); max-height:200px; overflow-y:auto; }
    .gi-wf-node { display:flex; gap:8px; align-items:center; padding:5px 8px; margin-bottom:4px; background:linear-gradient(145deg,#252530,#1e1e24); border-radius:6px; font-size:0.8em; }
    .gi-wf-node-type { color:var(--nm-accent); font-family:'Consolas',monospace; font-weight:600; flex:0 0 auto; min-width:160px; }
    .gi-wf-node-params { color:var(--nm-text-muted); font-family:'Consolas',monospace; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    /* LoRA section */
    .gi-lora-available { max-height:160px; overflow-y:auto; margin:8px 0; padding:8px; background:var(--nm-bg); border-radius:var(--nm-radius-sm); box-shadow:inset 2px 2px 5px var(--nm-shadow-dark); }
    .gi-lora-item { display:flex; align-items:center; gap:8px; padding:4px 6px; border-radius:4px; cursor:pointer; font-size:0.82em; transition:background 0.15s; }
    .gi-lora-item:hover { background:rgba(108,140,255,0.1); }
    .gi-lora-item input[type=checkbox] { accent-color:var(--nm-accent); flex-shrink:0; }
    .gi-lora-item span { color:var(--nm-text); font-family:'Consolas',monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .gi-lora-active { margin:8px 0; }
    .gi-lora-active-row { display:flex; gap:8px; align-items:center; padding:5px 8px; background:linear-gradient(145deg,#252530,#1e1e24); border-radius:6px; margin-bottom:4px; }
    .gi-lora-active-name { flex:1; color:var(--nm-text); font-family:'Consolas',monospace; font-size:0.82em; overflow:hidden; text-overflow:ellipsis; }
    .gi-lora-active-strength { width:60px; background:var(--nm-bg)!important; border:none!important; color:var(--nm-text)!important; padding:4px 6px!important; border-radius:4px!important; text-align:center; font-size:0.82em; }
    /* Scrollbar */
    .gi-lora-available::-webkit-scrollbar,.gi-workflow-preview::-webkit-scrollbar { width:5px; }
    .gi-lora-available::-webkit-scrollbar-track,.gi-workflow-preview::-webkit-scrollbar-track { background:var(--nm-bg); }
    .gi-lora-available::-webkit-scrollbar-thumb,.gi-workflow-preview::-webkit-scrollbar-thumb { background:linear-gradient(145deg,#3a3a45,#2a2a35); border-radius:3px; }
    /* Toggle */
    .gi-toggle { position:relative; display:inline-block; width:42px; height:22px; flex-shrink:0; }
    .gi-toggle input { opacity:0; width:0; height:0; }
    .gi-toggle-slider { position:absolute; cursor:pointer; top:0;left:0;right:0;bottom:0; background:linear-gradient(145deg,#252530,#1e1e24); border-radius:22px; transition:0.3s; box-shadow:inset 2px 2px 4px var(--nm-shadow-dark),inset -1px -1px 3px var(--nm-shadow-light); }
    .gi-toggle-slider:before { position:absolute; content:""; height:16px; width:16px; left:3px; bottom:3px; background:var(--nm-text-muted); border-radius:50%; transition:0.3s; box-shadow:1px 1px 3px var(--nm-shadow-dark); }
    .gi-toggle input:checked + .gi-toggle-slider { background:linear-gradient(145deg,#5a78dd,var(--nm-accent)); box-shadow:inset 1px 1px 3px rgba(0,0,0,0.3),0 0 8px var(--nm-accent-glow); }
    .gi-toggle input:checked + .gi-toggle-slider:before { transform:translateX(20px); background:#fff; }
    /* Section titles */
    .gi-sec-title { font-size:0.78em; color:var(--nm-text-muted); text-transform:uppercase; letter-spacing:1px; margin:14px 0 8px; padding-left:4px; }
    /* Status bar */
    .gi-status { margin-top:8px; padding:8px 12px; border-radius:var(--nm-radius-sm); font-size:0.82em; display:none; }
    .gi-status.ok  { display:block; background:rgba(80,200,80,0.12); color:#80ff80; border-left:2px solid #80ff80; }
    .gi-status.err { display:block; background:rgba(200,80,80,0.12); color:#ff8080; border-left:2px solid #ff8080; }
    /* Settings popup */
    .gi-settings-popup h4 { color:var(--nm-text)!important; font-weight:600; margin:14px 0 8px; font-size:0.92em; }
    /* Anchor table */
    .gi-anchor-table { margin:8px 0; }
    .gi-anchor-table-header { display:grid; grid-template-columns:90px 1fr 110px; gap:8px; padding:5px 8px; font-size:0.75em; color:var(--nm-text-muted); text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid var(--nm-border); margin-bottom:4px; }
    .gi-anchor-table-row { display:grid; grid-template-columns:90px 1fr 110px; gap:8px; align-items:start; padding:7px 8px; background:linear-gradient(145deg,#252530,#1e1e24); border-radius:6px; margin-bottom:4px; }
    .gi-anchor-table-name { color:var(--nm-accent); font-size:0.82em; font-weight:600; font-family:'Consolas',monospace; word-break:break-all; padding-top:2px; }
    .gi-anchor-table-desc { color:var(--nm-text); font-size:0.8em; line-height:1.5; font-style:italic; }
    .gi-anchor-table-ops { display:flex; flex-direction:column; gap:4px; }
    `;

    // ========== UTILITIES ==========
    function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function escapeHtml(s)   { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function escapeAttr(s)   { return String(s||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

    function encodeImageUrl(url) {
        if (!url) return '';
        return url.split('/').map(p => encodeURIComponent(p)).join('/');
    }

    function debounce(fn, ms) {
        let t;
        return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    }

    function simpleHash(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
        return h.toString(16);
    }

    function buildImgGenRegex() {
        const s = escapeRegExp(START_TAG);
        const e = escapeRegExp(END_TAG);
        return new RegExp(`${s}((?:(?!${s})[\\s\\S])*?)${e}`, 'g');
    }

    function extractJsonFromText(text) {
        try { return JSON.parse(text.trim()); } catch (_) {}
        const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fence) { try { return JSON.parse(fence[1].trim()); } catch (_) {} }
        const brace = text.match(/\{[\s\S]*\}/);
        if (brace) { try { return JSON.parse(brace[0]); } catch (_) {} }
        return null;
    }

    function getSTHeaders() {
        if (typeof SillyTavern !== 'undefined' && typeof SillyTavern.getRequestHeaders === 'function') {
            return SillyTavern.getRequestHeaders();
        }
        return { 'Content-Type': 'application/json' };
    }

    // ========== SETTINGS ==========
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

    function loadSettings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            settings = raw ? deepMerge(DEFAULT_SETTINGS, JSON.parse(raw)) : JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        } catch (e) {
            settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            addLog('SETTINGS', `加载失败，使用默认: ${e.message}`);
        }
        // 运行时列表不持久化
        settings.comfyuiConfig.availableLoras = [];
        settings.comfyuiConfig.availableModels = { checkpoints: [], unets: [] };
        // 加载锚点缓存（独立存储，持久化）
        try {
            const rawAnchor = localStorage.getItem(ANCHOR_CACHE_KEY);
            if (rawAnchor) anchorCache = JSON.parse(rawAnchor);
        } catch (_) {}
        addLog('SETTINGS', '设置已加载');
    }

    function saveAnchorCache() {
        try {
            localStorage.setItem(ANCHOR_CACHE_KEY, JSON.stringify(anchorCache));
        } catch (e) { addLog('ANCHOR', `缓存保存失败: ${e.message}`); }
    }

    function saveSettings() {
        try {
            // 不保存运行时列表
            const toSave = JSON.parse(JSON.stringify(settings));
            toSave.comfyuiConfig.availableLoras = [];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
        } catch (e) { addLog('SETTINGS', `保存失败: ${e.message}`); }
    }

    function exportConfig() {
        const data = JSON.stringify({ version:'2.1.0', exportDate:new Date().toISOString(), settings, anchorCache }, null, 2);
        const a = Object.assign(document.createElement('a'), {
            href: URL.createObjectURL(new Blob([data], { type:'application/json' })),
            download: `genimage-config-${new Date().toISOString().slice(0,10)}.json`,
            style: 'display:none'
        });
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        if (typeof toastr !== 'undefined') toastr.success('配置已导出');
    }

    function importConfig() {
        const input = Object.assign(document.createElement('input'), { type:'file', accept:'.json' });
        input.onchange = async (e) => {
            try {
                const config = JSON.parse(await e.target.files[0].text());
                if (!config.settings) throw new Error('格式不正确');
                if (!confirm(`确定导入？导出日期: ${config.exportDate||'未知'}\n当前配置将被覆盖`)) return;
                settings = deepMerge(DEFAULT_SETTINGS, config.settings);
                if (config.anchorCache) anchorCache = config.anchorCache;
                saveSettings();
                if (typeof toastr !== 'undefined') toastr.success('配置已导入');
                closeSettingsPopup();
                setTimeout(openSettingsPopup, 200);
            } catch (e) {
                if (typeof toastr !== 'undefined') toastr.error(`导入失败: ${e.message}`);
            }
        };
        input.click();
    }

    // ========== LLM MODULE ==========
    function buildLLMRequestBody(messages, config) {
        const body = { model: config.model || 'deepseek-chat', messages, stream: false };
        const temp = parseFloat(config.temperature);
        body.temperature = isNaN(temp) ? 0.7 : temp;
        const maxTok = parseInt(config.maxTokens);
        if (!isNaN(maxTok) && maxTok > 0) body.max_tokens = maxTok;
        return body;
    }

    async function callLLM(messages, configOverride = null) {
        const config = configOverride || settings.llmConfig;
        if (!config.baseUrl || !config.apiKey) throw new Error('请先配置 LLM API 地址和 Key');
        const url = config.baseUrl.replace(/\/$/, '') + '/chat/completions';
        const body = buildLLMRequestBody(messages, config);
        addLog('LLM', `POST ${url} | model=${body.model}`);
        const res = await safeFetch(url, {
            method: 'POST',
            headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${config.apiKey}` },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`LLM API ${res.status}: ${err.substring(0, 200)}`);
        }
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content
            || data.choices?.[0]?.message?.reasoning_content
            || data.choices?.[0]?.text
            || data.response || data.content || null;
        if (!content) throw new Error('LLM 返回内容为空: ' + JSON.stringify(data).substring(0, 200));
        return content.trim();
    }

    async function testLLMConnection(config) {
        try {
            const r = await callLLM([{ role:'user', content:'Reply with the single word: OK' }],
                { ...config, maxTokens:20, temperature:0 });
            return { success:true, message: r.substring(0, 50) };
        } catch (e) {
            return { success:false, message: e.message };
        }
    }

    /**
     * 获取模型列表（OpenAI /models 端点）
     * 输入 url + apiKey，返回模型名数组
     */
    async function fetchLLMModels(baseUrl, apiKey) {
        const url = baseUrl.replace(/\/$/, '') + '/models';
        const res = await safeFetch(url, {
            method: 'GET',
            headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        // OpenAI: { data: [{ id }] }  / 其他格式也兼容
        const list = data.data || data.models || data;
        if (!Array.isArray(list)) throw new Error('返回格式不支持');
        return list.map(m => typeof m === 'string' ? m : (m.id || m.name || String(m))).filter(Boolean);
    }

    // ========== STEP 1: CHARACTER ANCHOR ==========

    function getSTContext() {
        try {
            if (typeof SillyTavern !== 'undefined') {
                return SillyTavern.getContext?.() || SillyTavern.context || SillyTavern;
            }
        } catch (_) {}
        return null;
    }

    function getCurrentCharacterName() {
        try {
            const ctx = getSTContext();
            if (!ctx) return '';
            const chid = ctx.this_chid ?? ctx.characterId;
            if (chid === undefined || chid === null) return '';
            return (ctx.characters?.[chid]?.name) || '';
        } catch (_) { return ''; }
    }

    /**
     * 自动读取当前角色绑定的所有世界书条目（primary + additional），无需手动选择
     */
    async function getAllCharacterWorldbookContent() {
        const TH = window.TavernHelper || window.parent?.TavernHelper;
        if (!TH?.getCharLorebooks) {
            addLog('WORLDBOOK', 'TavernHelper.getCharLorebooks 不可用');
            return '';
        }
        try {
            const lorebooks = await TH.getCharLorebooks({ type: 'all' });
            // lorebooks = { primary: "bookname", additional: ["book1", ...] }
            const bookNames = [];
            if (lorebooks?.primary) bookNames.push(lorebooks.primary);
            if (lorebooks?.additional?.length) bookNames.push(...lorebooks.additional);
            if (!bookNames.length) {
                addLog('WORLDBOOK', '当前角色未绑定任何世界书');
                return '';
            }
            const parts = [];
            for (const bookName of bookNames) {
                const entries = await TH.getLorebookEntries(bookName);
                for (const entry of (entries || [])) {
                    if (entry.content?.trim()) {
                        const title = entry.comment || entry.name || `条目${entry.uid}`;
                        parts.push(`【${title}】\n${entry.content.trim()}`);
                    }
                }
            }
            addLog('WORLDBOOK', `已读取 ${bookNames.length} 本世界书，${parts.length} 条条目`);
            return parts.join('\n\n');
        } catch (e) {
            addLog('WORLDBOOK', `读取失败: ${e.message}`);
            return '';
        }
    }

    /** 返回提示词语言指令，注入到 LLM system prompt 末尾 */
    function getLangInstruction() {
        const lang = settings.promptLanguage || 'zh';
        return lang === 'zh'
            ? '\n\n【语言要求】所有 description 字段必须使用中文自然语言描述。'
            : '\n\n【Language】All description fields must be written in English natural language.';
    }

    /**
     * Step 1: 生成全部角色锚点（一次性从世界书识别所有角色）
     * - 返回所有新生成的锚点数组
     * - 只生成一次并持久化，forceRefresh=true 时强制重新生成所有
     */
    async function generateAllCharacterAnchors(forceRefresh = false) {
        if (!settings.anchorConfig.enabled) return [];

        const wbContent = await getAllCharacterWorldbookContent();
        if (!wbContent.trim()) {
            addLog('ANCHOR', '世界书为空，无法生成角色锚点');
            return [];
        }

        addLog('ANCHOR', `生成全部角色锚点 (forceRefresh=${forceRefresh})`);

        const sysPrompt = settings.anchorConfig.template + getLangInstruction();
        const userContent = `世界书资料：\n\n${wbContent}`;
        const messages = [
            { role:'system', content: sysPrompt },
            { role:'user',   content: userContent }
        ];

        try {
            const raw = await callLLM(messages);
            // 期望 LLM 返回 JSON 数组
            let parsed = extractJsonFromText(raw);
            // 兼容：LLM 可能返回单对象或包在 "characters" 键里
            if (parsed && !Array.isArray(parsed)) {
                parsed = parsed.characters || parsed.anchors || [parsed];
            }
            if (!Array.isArray(parsed) || !parsed.length) {
                throw new Error('解析锚点数组失败: ' + raw.substring(0, 120));
            }

            const results = [];
            for (const item of parsed) {
                if (!item?.description) continue;
                const name = (item.character_name || item.name || '').trim();
                if (!name) continue;
                // 如果未强制刷新且已有缓存，跳过该角色
                if (!forceRefresh && anchorCache[name]?.description) {
                    addLog('ANCHOR', `跳过(已缓存): ${name}`);
                    results.push(anchorCache[name]);
                    continue;
                }
                const anchor = { character_name: name, description: item.description.trim() };
                anchorCache[name] = anchor;
                results.push(anchor);
                addLog('ANCHOR', `锚点已生成: ${name} — ${anchor.description.substring(0, 60)}...`);
            }
            saveAnchorCache();
            addLog('ANCHOR', `共生成/更新 ${results.length} 个角色锚点`);
            return results;
        } catch (e) {
            addLog('ANCHOR', `生成失败: ${e.message}`);
            return [];
        }
    }

    /**
     * 重新生成单个角色锚点（用于设置面板"重新生成"按钮）
     */
    async function generateCharacterAnchor(charName, forceRefresh = false) {
        if (!settings.anchorConfig.enabled) return null;

        charName = charName || getCurrentCharacterName();
        if (!charName) { addLog('ANCHOR', '未找到角色名'); return null; }

        if (!forceRefresh && anchorCache[charName]?.description) {
            addLog('ANCHOR', `命中缓存: ${charName}`);
            return anchorCache[charName];
        }

        const wbContent = await getAllCharacterWorldbookContent();
        if (!wbContent.trim()) {
            addLog('ANCHOR', `${charName}: 世界书为空`);
            return null;
        }

        const sysPrompt = settings.anchorConfig.template + getLangInstruction();
        // 单角色版本：要求只描述指定角色，返回单对象
        const userContent = `只描述角色"${charName}"的外貌。\n\n世界书资料：\n${wbContent}\n\n必须以单个JSON对象回复：{"character_name":"${charName}","description":"..."}`;
        const messages = [
            { role:'system', content: sysPrompt },
            { role:'user',   content: userContent }
        ];

        try {
            const raw = await callLLM(messages);
            let parsed = extractJsonFromText(raw);
            if (Array.isArray(parsed)) parsed = parsed.find(x => x.character_name === charName) || parsed[0];
            if (!parsed?.description) throw new Error('解析失败: ' + raw.substring(0, 120));

            const anchor = { character_name: charName, description: parsed.description.trim() };
            anchorCache[charName] = anchor;
            saveAnchorCache();
            addLog('ANCHOR', `单角色锚点完成: ${charName}`);
            return anchor;
        } catch (e) {
            addLog('ANCHOR', `生成失败: ${e.message}`);
            return null;
        }
    }

    /**
     * 从消息文本中检测提及了哪些已缓存角色，返回对应锚点数组
     * senderName: 消息发送方（总是包含）
     */
    function detectCharactersInText(text, senderName) {
        const anchors = [];
        const seen = new Set();
        // 发送方锚点优先
        if (senderName && anchorCache[senderName]) {
            anchors.push(anchorCache[senderName]);
            seen.add(senderName);
        }
        // 遍历缓存，检测文本中出现的角色名
        for (const [name, anchor] of Object.entries(anchorCache)) {
            if (seen.has(name)) continue;
            if (text.includes(name)) {
                anchors.push(anchor);
                seen.add(name);
            }
        }
        return anchors;
    }

    // ========== STEP 2: SCENE DESCRIPTION ==========

    function extractParagraphs(text) {
        const clean = text.replace(/\[IMG_GEN\][\s\S]*?\[\/IMG_GEN\]/g, '').trim();
        const paras = clean.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 10);
        if (!paras.length) {
            const lines = clean.split('\n').map(l => l.trim()).filter(l => l.length > 5);
            return lines.length ? lines : [clean];
        }
        return paras;
    }

    function getChatHistory(currentMesId, count) {
        try {
            const ctx = getSTContext();
            const chat = ctx?.chat;
            if (!chat) return '';
            const start = Math.max(0, currentMesId - count);
            return chat.slice(start, currentMesId).map(m => {
                const role = m.is_user ? 'User' : 'AI';
                const text = (m.mes || '').replace(/\[IMG_GEN\][\s\S]*?\[\/IMG_GEN\]/g, '').trim();
                return `[${role}]: ${text.substring(0, 400)}`;
            }).join('\n');
        } catch (_) { return ''; }
    }

    // anchors 参数：{ character_name, description }[] 或单个对象或 null
    async function generateSceneDescription(mesId, messageText, anchors) {
        const paragraphs = extractParagraphs(messageText);
        const numberedText = paragraphs.map((p, i) => `[P${i+1}] ${p}`).join('\n\n');
        const history = getChatHistory(mesId, settings.sceneConfig.historyCount);

        // 支持数组或单个锚点
        const anchorList = Array.isArray(anchors) ? anchors : (anchors ? [anchors] : []);
        const anchorInfo = anchorList.length
            ? anchorList.map(a => `【${a.character_name}】${a.description}`).join('\n')
            : '（无角色锚点，根据上下文描述角色外貌）';

        const userContent = [
            '## 角色外貌锚点（固定特征，必须原样融入相关角色的prompt）',
            anchorInfo,
            '',
            history ? '## 历史上下文（仅供参考）\n' + history : '',
            '',
            '## 当前剧情（需要生成图片描述）',
            numberedText
        ].filter(Boolean).join('\n');

        const sysPrompt = settings.sceneConfig.template + getLangInstruction();
        const messages = [
            { role:'system', content: sysPrompt },
            { role:'user',   content: userContent }
        ];

        addLog('SCENE', `生成场景描述 mesId=${mesId}, 段落数=${paragraphs.length}`);
        const raw = await callLLM(messages);
        const result = extractJsonFromText(raw);
        if (!result?.insertions?.length) throw new Error('场景描述解析失败: ' + raw.substring(0, 120));

        addLog('SCENE', `解析到 ${result.insertions.length} 个插入点`);
        return { insertions: result.insertions, paragraphs };
    }

    // ========== PROMPT COMBINER (Z-Image 自然语言) ==========

    /**
     * 组合最终prompt：自然语言格式
     * globalPrefix + 场景描述(已含锚点) + globalSuffix
     */
    function combinePrompt(scenePrompt) {
        const parts = [];
        if (settings.promptConfig.globalPrefix?.trim())
            parts.push(settings.promptConfig.globalPrefix.trim());
        if (scenePrompt?.trim())
            parts.push(scenePrompt.trim());
        if (settings.promptConfig.globalSuffix?.trim())
            parts.push(settings.promptConfig.globalSuffix.trim());
        return parts.join(', ');
    }

    // ========== COMFYUI ==========

    // 内置 Z-Image 工作流（自然语言文本条件，适合 Flux/SD3 等模型）
    const Z_IMAGE_WORKFLOW = {
        "1": { "class_type":"CheckpointLoaderSimple", "inputs":{ "ckpt_name":"flux1-dev-fp8.safetensors" } },
        "2": { "class_type":"CLIPTextEncode", "inputs":{ "text":"", "clip":["1",1] } },
        "3": { "class_type":"CLIPTextEncode", "inputs":{ "text":"", "clip":["1",1] } },
        "4": { "class_type":"EmptyLatentImage", "inputs":{ "width":832, "height":1216, "batch_size":1 } },
        "5": { "class_type":"KSampler", "inputs":{ "model":["1",0], "positive":["2",0], "negative":["3",0], "latent_image":["4",0], "seed":42, "steps":20, "cfg":7, "sampler_name":"euler", "scheduler":"normal", "denoise":1 } },
        "6": { "class_type":"VAEDecode", "inputs":{ "samples":["5",0], "vae":["1",2] } },
        "7": { "class_type":"SaveImage", "inputs":{ "images":["6",0], "filename_prefix":"GI-" } }
    };

    function getComfyUIBaseUrl() {
        const { host, port, useHttps } = settings.comfyuiConfig;
        return `${useHttps ? 'https' : 'http'}://${host}:${port}`;
    }

    function autoMapNodes(workflow) {
        const map = { positive_node:null, negative_node:null, sampler_node:null, latent_node:null, checkpoint_node:null, unet_node:null, lora_nodes:[] };
        for (const [id, node] of Object.entries(workflow)) {
            if (node.class_type === 'KSampler' || node.class_type === 'KSamplerAdvanced') {
                map.sampler_node = id;
                const p = node.inputs?.positive, n = node.inputs?.negative;
                if (Array.isArray(p)) map.positive_node = p[0];
                if (Array.isArray(n)) map.negative_node = n[0];
            }
            if (/EmptyLatentImage|EmptySD3LatentImage|EmptyHunyuanLatentVideo/.test(node.class_type)) map.latent_node = id;
            if (/CheckpointLoaderSimple|CheckpointLoader/.test(node.class_type)) map.checkpoint_node = id;
            if (/UNETLoader/.test(node.class_type)) map.unet_node = id;
            if (/LoraLoader|LoRALoader/.test(node.class_type)) map.lora_nodes.push(id);
        }
        return map;
    }

    function buildWorkflowWithParams(positivePrompt, negativePrompt) {
        const cfg = settings.comfyuiConfig;
        const ov = cfg.paramOverrides || {};
        const loras = (cfg.loras || []).filter(l => l.name);

        let workflow;
        const wf = cfg.activeWorkflow;
        if (!wf || wf === 'Z-Image') {
            workflow = JSON.parse(JSON.stringify(Z_IMAGE_WORKFLOW));
        } else if (cfg.savedWorkflows?.[wf]?.json) {
            workflow = JSON.parse(JSON.stringify(cfg.savedWorkflows[wf].json));
        } else {
            throw new Error(`工作流 "${wf}" 未加载JSON，请在设置中重新获取或上传工作流文件`);
        }

        const map = autoMapNodes(workflow);

        if (map.positive_node) workflow[map.positive_node].inputs.text = positivePrompt;
        if (map.negative_node) workflow[map.negative_node].inputs.text = negativePrompt || settings.promptConfig.globalNegative;

        if (map.sampler_node) {
            const s = workflow[map.sampler_node].inputs;
            const seed = ov.seed ?? -1;
            s.seed = seed < 0 ? Math.floor(Math.random() * 2**32) : seed;
            if (ov.steps)        s.steps        = ov.steps;
            if (ov.cfg)          s.cfg           = ov.cfg;
            if (ov.sampler_name) s.sampler_name  = ov.sampler_name;
            if (ov.scheduler)    s.scheduler     = ov.scheduler;
        }
        if (map.latent_node) {
            const l = workflow[map.latent_node].inputs;
            if (ov.width)  l.width  = ov.width;
            if (ov.height) l.height = ov.height;
        }
        if (map.checkpoint_node && ov.ckpt_name) {
            workflow[map.checkpoint_node].inputs.ckpt_name = ov.ckpt_name;
        }
        if (map.unet_node && ov.unet_name) {
            workflow[map.unet_node].inputs.unet_name = ov.unet_name;
        }

        // LoRA 链式注入
        if (loras.length > 0 && map.checkpoint_node && map.sampler_node) {
            let modelRef = [map.checkpoint_node, 0];
            let clipRef  = [map.checkpoint_node, 1];
            let nodeBase = 100;
            for (const lora of loras) {
                const nid = String(nodeBase++);
                workflow[nid] = { class_type:'LoraLoader', inputs:{ model:modelRef, clip:clipRef, lora_name:lora.name, strength_model:lora.strength??1, strength_clip:lora.strength??1 } };
                modelRef = [nid, 0]; clipRef = [nid, 1];
            }
            workflow[map.sampler_node].inputs.model = modelRef;
            if (map.positive_node) workflow[map.positive_node].inputs.clip = clipRef;
            if (map.negative_node) workflow[map.negative_node].inputs.clip = clipRef;
        }

        return workflow;
    }

    /** 构建工作流节点预览 HTML */
    function buildWorkflowPreviewHtml(workflow) {
        if (!workflow || typeof workflow !== 'object') return `<div style="color:var(--nm-text-muted);font-size:0.82em;padding:8px;">${t('workflow_no_preview')}</div>`;
        const map = autoMapNodes(workflow);
        const lines = [];
        for (const [id, node] of Object.entries(workflow)) {
            const type = node.class_type || '?';
            let params = '';
            if (id === map.positive_node) params = 'positive prompt';
            else if (id === map.negative_node) params = 'negative prompt';
            else {
                const inp = node.inputs || {};
                const show = [];
                if (inp.ckpt_name)  show.push(`ckpt=${inp.ckpt_name}`);
                if (inp.unet_name)  show.push(`unet=${inp.unet_name}`);
                if (inp.steps !== undefined) show.push(`steps=${inp.steps}`);
                if (inp.cfg   !== undefined) show.push(`cfg=${inp.cfg}`);
                if (inp.width !== undefined) show.push(`${inp.width}×${inp.height}`);
                if (inp.seed  !== undefined) show.push(`seed=${inp.seed}`);
                if (inp.lora_name) show.push(`lora=${inp.lora_name}`);
                if (inp.sampler_name) show.push(`sampler=${inp.sampler_name}`);
                params = show.join('  ');
            }
            lines.push(`<div class="gi-wf-node"><span class="gi-wf-node-type">[${id}] ${escapeHtml(type)}</span><span class="gi-wf-node-params">${escapeHtml(params)}</span></div>`);
        }
        return lines.join('');
    }

    async function testComfyUIConnection() {
        try {
            const res = await safeFetch(`${getComfyUIBaseUrl()}/system_stats`);
            if (!res.ok) return { success:false, message:`HTTP ${res.status}` };
            const data = await res.json();
            return { success:true, message:`ComfyUI ${data.system?.comfyui_version || 'OK'}` };
        } catch (e) {
            return { success:false, message: e.message };
        }
    }

    /**
     * 从 ComfyUI 获取可用模型（Checkpoint）列表
     */
    async function fetchComfyUIModels() {
        const base = getComfyUIBaseUrl();
        // 并发获取 Checkpoint 和 UNET 两种模型列表
        const [ckptRes, unetRes] = await Promise.all([
            safeFetch(`${base}/object_info/CheckpointLoaderSimple`).catch(() => null),
            safeFetch(`${base}/object_info/UNETLoader`).catch(() => null),
        ]);
        const checkpoints = (ckptRes?.ok
            ? (await ckptRes.json().catch(() => {}))?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0]
            : null) || [];
        const unets = (unetRes?.ok
            ? (await unetRes.json().catch(() => {}))?.UNETLoader?.input?.required?.unet_name?.[0]
            : null) || [];
        if (!checkpoints.length && !unets.length) throw new Error('未找到任何模型');
        return {
            checkpoints: checkpoints.filter(Boolean),
            unets: unets.filter(Boolean),
        };
    }

    /**
     * 从 ComfyUI 下载单个工作流 JSON（API格式）
     * ComfyUI 将用户数据文件通过 GET /userdata/{rel_path} 直接提供
     */
    async function fetchWorkflowJson(filename) {
        const base = getComfyUIBaseUrl();
        // ComfyUI 要求路径中的 "/" 也要编码为 "%2F"，整条路径作为单个路由参数
        const encodedPath = `workflows%2F${encodeURIComponent(filename)}`;
        const attempts = [
            `${base}/userdata/${encodedPath}`,
            `${base}/userdata/workflows/${encodeURIComponent(filename)}`,
        ];
        for (const url of attempts) {
            try {
                const res = await safeFetch(url);
                if (!res.ok) continue;
                const json = await res.json();
                // ComfyUI 工作流 JSON：节点以数字/字符串ID为键，每个节点有 class_type 字段
                if (json && typeof json === 'object' && !Array.isArray(json)) return json;
            } catch (_) {}
        }
        return null;
    }

    /**
     * 从 ComfyUI 获取工作流列表并同时下载每个工作流的 JSON
     * 返回 [{ name, path, json }]
     */
    async function fetchComfyUIWorkflows() {
        const res = await safeFetch(`${getComfyUIBaseUrl()}/userdata?dir=workflows&recurse=true`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('格式不支持');

        const paths = data
            .map(x => (typeof x === 'string' ? x : x.path || x.name || ''))
            .filter(x => x.endsWith('.json'))
            .map(x => x.replace(/\\/g, '/'));

        // 并发下载所有工作流的 JSON 内容
        const results = await Promise.all(paths.map(async path => {
            const name = path.split('/').pop().replace(/\.json$/i, '');
            const json = await fetchWorkflowJson(path);
            return { name, path, json };
        }));

        return results;
    }

    /**
     * 从 ComfyUI 获取可用 LoRA 列表
     * 调用 /object_info/LoraLoader
     */
    async function fetchComfyUILoras() {
        const res = await safeFetch(`${getComfyUIBaseUrl()}/object_info/LoraLoader`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        // 格式: { LoraLoader: { input: { required: { lora_name: [["a.safetensors",...], {}] } } } }
        const loraList = data?.LoraLoader?.input?.required?.lora_name?.[0];
        if (!Array.isArray(loraList)) throw new Error('未找到LoRA列表');
        return loraList.filter(Boolean);
    }

    async function submitComfyUIPrompt(workflow) {
        const res = await safeFetch(`${getComfyUIBaseUrl()}/prompt`, {
            method:'POST',
            headers:{ 'Content-Type':'application/json' },
            body: JSON.stringify({ prompt:workflow, client_id:SCRIPT_ID })
        });
        if (!res.ok) { const e = await res.text(); throw new Error(`提交失败 ${res.status}: ${e.substring(0,200)}`); }
        const data = await res.json();
        if (data.error) throw new Error(`ComfyUI error: ${JSON.stringify(data.error).substring(0,200)}`);
        return data.prompt_id;
    }

    async function pollComfyUIResult(promptId, maxWaitMs = 120000) {
        const base = getComfyUIBaseUrl();
        const t0 = Date.now();
        while (Date.now() - t0 < maxWaitMs) {
            await new Promise(r => setTimeout(r, 1500));
            try {
                const res = await safeFetch(`${base}/history/${promptId}`);
                if (!res.ok) continue;
                const hist = await res.json();
                const entry = hist[promptId];
                if (!entry) continue;
                if (entry.status?.status_str === 'error') throw new Error('ComfyUI generation error');
                for (const out of Object.values(entry.outputs || {})) {
                    if (out.images?.length) return out.images[0];
                }
            } catch (e) { if (e.message.includes('error')) throw e; }
        }
        throw new Error('ComfyUI 生图超时（120s）');
    }

    async function downloadComfyUIImage(info) {
        const url = `${getComfyUIBaseUrl()}/view?filename=${encodeURIComponent(info.filename)}&subfolder=${encodeURIComponent(info.subfolder||'')}&type=${info.type||'output'}`;
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'undefined') {
                GM_xmlhttpRequest({ method:'GET', url, responseType:'arraybuffer', timeout:30000,
                    onload: r => {
                        const b = new Uint8Array(r.response);
                        let s = '';
                        for (let i = 0; i < b.byteLength; i++) s += String.fromCharCode(b[i]);
                        resolve(btoa(s));
                    },
                    onerror: e => reject(new Error(`下载失败: ${e.error}`)),
                    ontimeout: () => reject(new Error('下载超时'))
                });
            } else {
                fetch(url).then(r => r.arrayBuffer()).then(buf => {
                    const b = new Uint8Array(buf);
                    let s = '';
                    for (let i = 0; i < b.byteLength; i++) s += String.fromCharCode(b[i]);
                    resolve(btoa(s));
                }).catch(reject);
            }
        });
    }

    async function uploadImageToST(base64Data, format = 'png') {
        const charName = getCurrentCharacterName();
        const now = new Date();
        const pad = (n, l=2) => String(n).padStart(l, '0');
        const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}@${pad(now.getHours())}h${pad(now.getMinutes())}m${pad(now.getSeconds())}s`;
        const filename = `${charName||'gi'}_${ts}.${format}`;
        const res = await fetch('/api/images/upload', {
            method:'POST', headers: getSTHeaders(),
            body: JSON.stringify({ image:base64Data, format, ch_name:charName, filename })
        });
        if (!res.ok) throw new Error(`上传图片失败: ${await res.text()}`);
        const result = await res.json();
        addLog('UPLOAD', `图片已保存: ${result.path}`);
        return result.path;
    }

    async function generateComfyUIImage(positivePrompt, negativePrompt) {
        addLog('COMFYUI', `开始生图...`);
        const workflow = buildWorkflowWithParams(positivePrompt, negativePrompt);
        const promptId = await submitComfyUIPrompt(workflow);
        addLog('COMFYUI', `任务已提交: ${promptId}`);
        const info = await pollComfyUIResult(promptId);
        const base64 = await downloadComfyUIImage(info);
        const url = await uploadImageToST(base64, 'png');
        addLog('COMFYUI', `完成: ${url}`);
        return url;
    }

    // ========== APPLY INSERTIONS ==========

    function insertInsertionsIntoOriginal(originalText, paragraphs, insertions) {
        let clean = originalText.replace(/\[IMG_GEN\][\s\S]*?\[\/IMG_GEN\]/g, '').trim();
        const sorted = [...insertions].sort((a, b) => b.after_paragraph - a.after_paragraph);
        for (const ins of sorted) {
            const idx = ins.after_paragraph - 1;
            if (idx < 0 || idx >= paragraphs.length) continue;
            let prompt = ins.prompt;
            const inner = prompt.match(/\[IMG_GEN\]([\s\S]*?)\[\/IMG_GEN\]/);
            if (inner) prompt = inner[1].trim();
            const finalPrompt = combinePrompt(prompt);
            const paraPos = clean.indexOf(paragraphs[idx]);
            if (paraPos === -1) continue;
            const insertAt = paraPos + paragraphs[idx].length;
            clean = clean.slice(0, insertAt) + `\n${START_TAG}${finalPrompt}${END_TAG}` + clean.slice(insertAt);
        }
        return clean;
    }

    async function safeUpdateChatMessage(mesId, newContent) {
        try {
            const ctx = getSTContext();
            if (!ctx) return;
            if (typeof SillyTavern?.setChatMessages === 'function') {
                await SillyTavern.setChatMessages([{ index:mesId, mes:newContent }]);
                return;
            }
            if (ctx.chat?.[mesId]) {
                ctx.chat[mesId].mes = newContent;
                if (typeof ctx.saveChat === 'function') await ctx.saveChat();
                if (ctx.eventSource) await ctx.eventSource.emit('message_updated', mesId);
            }
        } catch (e) { addLog('UPDATE', `消息更新失败: ${e.message}`); }
    }

    // ========== MAIN AUTO-GENERATION FLOW ==========

    async function handleAutoGeneration(mesId) {
        if (!settings.enabled || !settings.autoGenerate) return;
        const ctx = getSTContext();
        const chat = ctx?.chat;
        if (!chat?.[mesId]) return;
        const msg = chat[mesId];
        if (msg.is_user) return;
        const messageText = msg.mes || '';
        if (messageText.includes(START_TAG)) return;

        // 取消息发送方名字（多角色支持）
        const senderName = msg.name || getCurrentCharacterName();
        addLog('AUTO', `自动生图 mesId=${mesId} sender=${senderName}`);
        try {
            // 如果还没有任何缓存，先生成全部角色锚点
            if (settings.anchorConfig.enabled && Object.keys(anchorCache).length === 0) {
                if (typeof toastr !== 'undefined') toastr.info(t('anchor_generating'), null, { timeOut:5000 });
                await generateAllCharacterAnchors();
            }

            // 检测当前消息涉及哪些角色，组合多角色锚点
            const anchors = detectCharactersInText(messageText, senderName);
            addLog('AUTO', `检测到 ${anchors.length} 个角色锚点`);

            if (typeof toastr !== 'undefined') toastr.info(t('scene_generating'), null, { timeOut:3000 });
            const { insertions, paragraphs } = await generateSceneDescription(mesId, messageText, anchors);

            const newText = insertInsertionsIntoOriginal(messageText, paragraphs, insertions);
            await safeUpdateChatMessage(mesId, newText);
            addLog('AUTO', `已插入 ${insertions.length} 个IMG_GEN标记`);
            setTimeout(processChatDOM, 500);
        } catch (e) {
            addLog('AUTO', `失败: ${e.message}`);
            if (typeof toastr !== 'undefined') toastr.error(`生图失败: ${e.message}`, null, { timeOut:4000 });
        }
    }

    // ========== IMAGE GENERATION ==========

    async function handleGeneration(state) {
        const { $wrap, mesId, blockIdx, prompt } = state;
        const $placeholder = $wrap.find('.gi-placeholder');
        const $img = $wrap.find('.gi-ui-image');
        const $msg = $wrap.find('.gi-ui-msg');
        $placeholder.addClass('requesting').text(t('requesting')).show();
        $img.hide();
        const showMsg = (txt) => { $msg.text(txt).addClass('show'); setTimeout(() => $msg.removeClass('show'), 3000); };
        try {
            const negative = settings.promptConfig.globalNegative;
            const imageUrl = await generateComfyUIImage(prompt, negative);
            await updateChatData(mesId, blockIdx, prompt, [imageUrl], false, false);
            updateWrapperView($wrap, [imageUrl], 0);
            showMsg('1/1');
        } catch (e) {
            addLog('GEN', `失败: ${e.message}`);
            $placeholder.removeClass('requesting').text(`❌ ${e.message.substring(0,50)}`);
            showMsg('失败');
            await updateChatData(mesId, blockIdx, prompt, [], true, false);
        }
    }

    function updateWrapperView($wrap, images, idx) {
        const $img = $wrap.find('.gi-ui-image');
        const $ph  = $wrap.find('.gi-placeholder');
        $wrap.attr('data-images', encodeURIComponent(JSON.stringify(images))).attr('data-cur-idx', idx);
        if (images.length > 0) {
            $img.attr('src', encodeImageUrl(images[idx])).show();
            $ph.hide();
            $wrap.find('.gi-zone.left').toggle(idx > 0);
            $wrap.find('.gi-zone.right').toggleClass('gen-mode', idx === images.length - 1);
            $wrap.find('.gi-zone.delete').show();
            $wrap.find('.gi-ui-msg').text(`${idx+1}/${images.length}`);
        } else {
            $img.attr('src', '').hide();
            $ph.removeClass('requesting').text(t('waiting')).show();
            $wrap.find('.gi-zone.left').hide();
            $wrap.find('.gi-zone.right').addClass('gen-mode');
            $wrap.find('.gi-zone.delete').hide();
        }
    }

    async function updateChatData(mesId, blockIdx, prompt, images, preventAuto, isScheduled) {
        const ctx = getSTContext();
        const chat = ctx?.chat;
        if (!chat?.[mesId]) return;
        const regex = buildImgGenRegex();
        let count = 0;
        chat[mesId].mes = chat[mesId].mes.replace(regex, (m, content) => {
            if (count++ !== blockIdx) return m;
            let base = prompt;
            if (preventAuto) base += NO_GEN_FLAG;
            if (isScheduled) base += SCHEDULED_FLAG;
            if (images.length > 0) base += `|images:${images.join('|')}`;
            return `${START_TAG}${base}${END_TAG}`;
        });
        try {
            if (typeof ctx.saveChat === 'function') await ctx.saveChat();
            if (ctx.eventSource) await ctx.eventSource.emit('message_updated', parseInt(mesId));
        } catch (e) { addLog('CHAT', `保存失败: ${e.message}`); }
    }

    function parseBlockContent(content) {
        const preventAuto = content.includes(NO_GEN_FLAG);
        const isScheduled = content.includes(SCHEDULED_FLAG);
        let clean = content.replace(NO_GEN_FLAG, '').replace(SCHEDULED_FLAG, '');
        const images = [];
        const m = clean.match(/\|images:(.+)$/);
        if (m) { images.push(...m[1].split('|').filter(Boolean)); clean = clean.replace(/\|images:.+$/, ''); }
        return { prompt:clean.trim(), images, preventAuto, isScheduled };
    }

    // ========== IMAGE UI ==========

    function createUIHtml(prompt, images, preventAuto, blockIdx, initIdx, isScheduled=false) {
        const has = images.length > 0;
        const phClass = isScheduled ? 'gi-placeholder requesting' : 'gi-placeholder';
        const phText  = isScheduled ? `⏳ ${t('requesting')}` : t('waiting');
        return `<div class="gi-ui-container"><div class="gi-ui-wrap"
            data-prompt="${encodeURIComponent(prompt)}"
            data-images="${encodeURIComponent(JSON.stringify(images))}"
            data-prevent-auto="${preventAuto}" data-block-idx="${blockIdx}"
            data-cur-idx="${initIdx}" data-scheduled="${isScheduled}">
            <div class="gi-ui-toggle">▵</div>
            <div class="gi-ui-viewport">
                <div class="gi-zone top"></div>
                <div class="gi-zone left" style="display:${initIdx>0?'block':'none'}"></div>
                <div class="gi-zone right ${!has||initIdx===images.length-1?'gen-mode':''}"></div>
                <div class="gi-zone delete" style="display:${has?'block':'none'}"></div>
                <div class="gi-ui-msg">${has?`${initIdx+1}/${images.length}`:''}</div>
                <img class="gi-ui-image" src="${has?encodeImageUrl(images[initIdx]):''}" style="display:${has?'block':'none'}"/>
                <div class="${phClass}" style="display:${has?'none':'block'}">${phText}</div>
            </div>
        </div></div>`;
    }

    function processChatDOM() {
        if (!settings.enabled) return;
        const regex = buildImgGenRegex();
        $('.mes_text').each(function () {
            const $el = $(this);
            // 恢复已有wrapper的图片
            $el.find('.gi-ui-wrap').each(function () {
                const $w = $(this);
                const imgs = JSON.parse(decodeURIComponent($w.attr('data-images')||'[]'));
                if (imgs.length > 0 && !$w.find('.gi-ui-image').attr('src')) updateWrapperView($w, imgs, imgs.length-1);
            });
            // 注入新的UI
            const html = $el.html();
            if (!html.includes(START_TAG) || $el.find('.gi-ui-wrap').length > 0) return;
            let blockIdx = 0;
            $el.html(html.replace(regex, (m, content) => {
                const p = parseBlockContent(content);
                return createUIHtml(p.prompt, p.images, p.preventAuto, blockIdx++, Math.max(0, p.images.length-1), p.isScheduled);
            }));
            // 触发空块生图
            $el.find('.gi-ui-wrap').each(function () {
                const $w = $(this);
                const bIdx = parseInt($w.attr('data-block-idx'));
                const mesId = $w.closest('.mes').attr('mesid');
                const imgs = JSON.parse(decodeURIComponent($w.attr('data-images')||'[]'));
                const content = decodeURIComponent($w.attr('data-prompt')||'');
                if ($w.attr('data-scheduled')==='true' || $w.attr('data-prevent-auto')==='true' || imgs.length>0) return;
                updateChatData(mesId, bIdx, content, [], false, true).then(() => {
                    setTimeout(() => handleGeneration({ $wrap:$w, mesId, blockIdx:bIdx, prompt:content }), 500 + bIdx*500);
                });
            });
        });
    }

    // ========== GLOBAL LISTENERS ==========

    function initGlobalListeners() {
        const $chat = $('#chat');
        $chat.on('click', '.gi-ui-toggle', function (e) {
            e.stopPropagation();
            const $vp = $(this).siblings('.gi-ui-viewport');
            $vp.toggleClass('collapsed');
            $(this).text($vp.hasClass('collapsed') ? '▿' : '▵');
        });
        $chat.on('click', '.gi-zone.left', function (e) {
            e.stopPropagation();
            const $w = $(this).closest('.gi-ui-wrap');
            const imgs = JSON.parse(decodeURIComponent($w.attr('data-images')||'[]'));
            let idx = parseInt($w.attr('data-cur-idx')||0);
            if (idx > 0) updateWrapperView($w, imgs, --idx);
        });
        $chat.on('click', '.gi-zone.right', function (e) {
            e.stopPropagation();
            const $w = $(this).closest('.gi-ui-wrap');
            const imgs = JSON.parse(decodeURIComponent($w.attr('data-images')||'[]'));
            let idx = parseInt($w.attr('data-cur-idx')||0);
            if (!$(this).hasClass('gen-mode') && idx < imgs.length-1) {
                updateWrapperView($w, imgs, ++idx);
            } else {
                const mesId = $w.closest('.mes').attr('mesid');
                const bIdx  = parseInt($w.attr('data-block-idx'));
                const prompt = decodeURIComponent($w.attr('data-prompt')||'');
                handleGeneration({ $wrap:$w, mesId, blockIdx:bIdx, prompt });
            }
        });
        $chat.on('click', '.gi-zone.delete', async function (e) {
            e.stopPropagation();
            const $w = $(this).closest('.gi-ui-wrap');
            const mesId = $w.closest('.mes').attr('mesid');
            const bIdx  = parseInt($w.attr('data-block-idx'));
            updateWrapperView($w, [], 0);
            await updateChatData(mesId, bIdx, decodeURIComponent($w.attr('data-prompt')||''), [], false, false);
        });
        $chat.on('click', '.gi-zone.top', function (e) {
            e.stopPropagation();
            const $w = $(this).closest('.gi-ui-wrap');
            const cur = decodeURIComponent($w.attr('data-prompt')||'');
            const np = window.prompt('编辑提示词:', cur);
            if (np !== null && np !== cur) {
                $w.attr('data-prompt', encodeURIComponent(np));
                const mesId = $w.closest('.mes').attr('mesid');
                updateChatData(mesId, parseInt($w.attr('data-block-idx')), np, [], false, false);
            }
        });
        $chat.on('click', '.gi-ui-image', function () {
            const src = $(this).attr('src');
            if (!src) return;
            const ov = $(`<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:zoom-out"><img src="${src}" style="max-width:90vw;max-height:90vh;border-radius:8px"></div>`);
            ov.on('click', () => ov.remove());
            $('body').append(ov);
        });
    }

    // ========== SETTINGS PANEL ==========

    function addMenuItem() {
        if (!$('#extensionsMenu').length) { setTimeout(addMenuItem, 1000); return; }
        if ($(`#${SCRIPT_ID}-menu`).length) return;
        $(`<div class="list-group-item flex-container flexGap5 interactable" id="${SCRIPT_ID}-menu">
            <div class="fa-fw fa-solid fa-image"></div><span>生图助手 v2</span></div>`)
            .on('click', openSettingsPopup)
            .appendTo('#extensionsMenu');
    }

    let settingsOpen = false;

    function closeSettingsPopup() {
        $('#gi-settings-overlay').remove();
        settingsOpen = false;
    }

    function openSettingsPopup() {
        if (settingsOpen) { closeSettingsPopup(); return; }
        settingsOpen = true;

        const popup = $(`
        <div id="gi-settings-overlay" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:99998;display:flex;align-items:center;justify-content:center;">
          <div class="gi-settings-popup" style="background:var(--nm-bg);border-radius:var(--nm-radius);padding:22px;width:min(720px,96vw);max-height:92vh;overflow-y:auto;box-shadow:8px 8px 20px var(--nm-shadow-dark),-4px -4px 12px var(--nm-shadow-light);color:var(--nm-text);font-family:'Georgia','Times New Roman','Noto Serif SC',serif;position:relative;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
                <span style="font-size:1.15em;font-weight:700;color:var(--nm-accent);letter-spacing:1px;">🎨 生图助手 v2</span>
                <button id="gi-close" style="background:none;border:none;color:var(--nm-text-muted);font-size:1.3em;cursor:pointer;padding:2px 8px;">✕</button>
            </div>
            <div class="gi-tab-nav">
                <button class="gi-tab-btn active" data-tab="basic">${t('tab_basic')}</button>
                <button class="gi-tab-btn" data-tab="llm">${t('tab_llm')}</button>
                <button class="gi-tab-btn" data-tab="anchor">${t('tab_anchor')}</button>
                <button class="gi-tab-btn" data-tab="comfyui">${t('tab_comfyui')}</button>
                <button class="gi-tab-btn" data-tab="prompt">${t('tab_prompt')}</button>
            </div>

            <!-- ===== BASIC ===== -->
            <div class="gi-tab-content active" data-tab="basic">
                <div class="gi-row"><label>${t('enabled')}</label>
                    <label class="gi-toggle"><input type="checkbox" id="gi-enabled" ${settings.enabled?'checked':''}><span class="gi-toggle-slider"></span></label></div>
                <div class="gi-row"><label>${t('language')}</label>
                    <select id="gi-language"><option value="zh" ${settings.language==='zh'?'selected':''}>中文</option><option value="en" ${settings.language==='en'?'selected':''}>English</option></select></div>
                <div class="gi-row"><label>${t('prompt_language')}</label>
                    <select id="gi-prompt-lang"><option value="zh" ${(settings.promptLanguage||'zh')==='zh'?'selected':''}>${t('prompt_lang_zh')}</option><option value="en" ${(settings.promptLanguage||'zh')==='en'?'selected':''}>${t('prompt_lang_en')}</option></select></div>
                <div class="gi-row"><label>${t('auto_generate')}</label>
                    <label class="gi-toggle"><input type="checkbox" id="gi-auto-gen" ${settings.autoGenerate?'checked':''}><span class="gi-toggle-slider"></span></label></div>
                <div class="gi-row"><label>${t('debounce_ms')}</label>
                    <input type="number" id="gi-debounce" value="${settings.debounceMs}" min="200" max="5000" step="100" style="max-width:100px;"></div>
                <div class="gi-controls">
                    <button class="gi-btn gi-btn-sec" id="gi-export">${t('export_config')}</button>
                    <button class="gi-btn gi-btn-sec" id="gi-import">${t('import_config')}</button>
                </div>
            </div>

            <!-- ===== LLM ===== -->
            <div class="gi-tab-content" data-tab="llm">
                <div class="gi-row"><label>${t('llm_base_url')}</label>
                    <input type="text" id="gi-llm-url" value="${escapeAttr(settings.llmConfig.baseUrl)}" placeholder="https://api.deepseek.com"></div>
                <div class="gi-row"><label>${t('llm_api_key')}</label>
                    <input type="password" id="gi-llm-key" value="${escapeAttr(settings.llmConfig.apiKey)}" placeholder="sk-..."></div>
                <div class="gi-row"><label>${t('llm_model')}</label>
                    <select id="gi-llm-model" style="flex:1;">${buildModelOptions(settings.llmConfig.modelList, settings.llmConfig.model)}</select>
                    <button class="gi-btn gi-btn-sec gi-btn-sm" id="gi-fetch-models" style="flex-shrink:0;margin-left:6px;">${t('llm_fetch_models')}</button></div>
                <div class="gi-row"><label>${t('llm_max_tokens')}</label>
                    <input type="number" id="gi-llm-tokens" value="${settings.llmConfig.maxTokens}" min="256" max="32768" step="256"></div>
                <div class="gi-row"><label>${t('llm_temperature')}</label>
                    <input type="range" id="gi-llm-temp" value="${settings.llmConfig.temperature}" min="0" max="2" step="0.05" style="flex:1;">
                    <span class="gi-range-val" id="gi-llm-temp-val">${settings.llmConfig.temperature}</span></div>
                <div class="gi-controls">
                    <button class="gi-btn" id="gi-test-llm">${t('test_llm')}</button>
                </div>
                <div id="gi-llm-status" class="gi-status"></div>
            </div>

            <!-- ===== ANCHOR ===== -->
            <div class="gi-tab-content" data-tab="anchor">
                <div class="gi-row"><label>${t('anchor_enabled')}</label>
                    <label class="gi-toggle"><input type="checkbox" id="gi-anchor-enabled" ${settings.anchorConfig.enabled?'checked':''}><span class="gi-toggle-slider"></span></label></div>
                <div class="gi-row"><label>${t('anchor_cache')}</label>
                    <label class="gi-toggle"><input type="checkbox" id="gi-anchor-cache" ${settings.anchorConfig.cacheEnabled?'checked':''}><span class="gi-toggle-slider"></span></label></div>

                <div class="gi-sec-title">${t('anchor_all_chars')}</div>
                <div id="gi-anchor-table"></div>
                <div class="gi-controls" style="margin-top:8px;">
                    <button class="gi-btn" id="gi-gen-all-anchors">${t('gen_all_anchors')}</button>
                    <button class="gi-btn gi-btn-sec" id="gi-clear-anchor">${t('clear_anchor_cache')}</button>
                </div>
                <div id="gi-anchor-status" style="font-size:0.82em;color:var(--nm-text-muted);margin-top:8px;"></div>

                <div class="gi-sec-title">${t('anchor_template')}</div>
                <div class="gi-row" style="flex-direction:column;align-items:stretch;gap:0;">
                    <textarea id="gi-anchor-tpl" style="width:100%;min-height:140px;font-family:'Consolas','Monaco',monospace!important;font-size:0.8em!important;">${escapeHtml(settings.anchorConfig.template)}</textarea>
                </div>
            </div>

            <!-- ===== COMFYUI ===== -->
            <div class="gi-tab-content" data-tab="comfyui">
                <div class="gi-row"><label>${t('comfyui_host')}</label>
                    <input type="text" id="gi-comfyui-host" value="${escapeAttr(settings.comfyuiConfig.host)}"></div>
                <div class="gi-row"><label>${t('comfyui_port')}</label>
                    <input type="number" id="gi-comfyui-port" value="${settings.comfyuiConfig.port}" min="1" max="65535"></div>
                <div class="gi-row"><label>${t('comfyui_https')}</label>
                    <label class="gi-toggle"><input type="checkbox" id="gi-comfyui-https" ${settings.comfyuiConfig.useHttps?'checked':''}><span class="gi-toggle-slider"></span></label></div>
                <div class="gi-controls" style="margin-bottom:6px;">
                    <button class="gi-btn" id="gi-test-comfyui">${t('test_comfyui')}</button>
                </div>
                <div id="gi-comfyui-status" class="gi-status"></div>

                <div class="gi-sec-title">${t('active_workflow')}</div>
                <div class="gi-row"><label>${t('active_workflow')}</label>
                    <select id="gi-workflow-select" style="flex:1;">${buildWorkflowOptions()}</select>
                    <button class="gi-btn gi-btn-sec gi-btn-sm" id="gi-fetch-workflows" style="margin-left:4px;flex-shrink:0;">${t('fetch_workflows')}</button>
                    <button class="gi-btn gi-btn-sec gi-btn-sm" id="gi-upload-workflow" style="margin-left:4px;flex-shrink:0;">${t('upload_workflow')}</button>
                    <input type="file" id="gi-workflow-file" accept=".json" style="display:none;">
                </div>
                <div id="gi-workflow-fetch-status" style="font-size:0.8em;color:var(--nm-text-muted);margin-bottom:4px;"></div>
                <div class="gi-sec-title">${t('workflow_preview')}</div>
                <div class="gi-workflow-preview" id="gi-wf-preview">${buildWorkflowPreviewHtml(getCurrentWorkflowJson())}</div>

                <div class="gi-sec-title">参数覆盖</div>
                ${buildParamOverridesHtml()}

                <div class="gi-sec-title">${t('loras')}</div>
                <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">
                    <button class="gi-btn gi-btn-sec gi-btn-sm" id="gi-fetch-loras">${t('lora_fetch')}</button>
                    <span id="gi-lora-fetch-status" style="font-size:0.8em;color:var(--nm-text-muted);"></span>
                </div>
                <!-- 可用LoRA列表（从ComfyUI获取后显示） -->
                <div id="gi-lora-available-wrap" style="display:none;">
                    <div class="gi-sec-title" style="margin-top:6px;">${t('lora_available')}</div>
                    <div class="gi-lora-available" id="gi-lora-available"></div>
                    <button class="gi-btn gi-btn-sm" id="gi-lora-add-selected" style="width:100%;margin-bottom:10px;">${t('lora_add_selected')}</button>
                </div>
                <!-- 已启用LoRA -->
                <div class="gi-sec-title">${t('lora_active')}</div>
                <div class="gi-lora-active" id="gi-lora-active"></div>
            </div>

            <!-- ===== PROMPT ===== -->
            <div class="gi-tab-content" data-tab="prompt">
                <p style="font-size:0.82em;color:var(--nm-text-muted);margin-bottom:12px;line-height:1.5;">
                    Z-Image 使用自然语言提示词。全局前缀/后缀会附加在LLM生成的场景描述前后。
                </p>
                <div class="gi-row"><label>全局前缀</label>
                    <input type="text" id="gi-prefix" value="${escapeAttr(settings.promptConfig.globalPrefix)}" placeholder="（可选）"></div>
                <div class="gi-row"><label>全局后缀</label>
                    <input type="text" id="gi-suffix" value="${escapeAttr(settings.promptConfig.globalSuffix)}" placeholder="high quality, detailed, 8k"></div>
                <div class="gi-row" style="flex-direction:column;align-items:stretch;gap:4px;">
                    <label style="font-size:0.85em;color:var(--nm-text-muted);font-weight:600;">${t('global_negative')}</label>
                    <textarea id="gi-negative" style="width:100%;min-height:70px;font-family:'Consolas',monospace!important;font-size:0.82em!important;">${escapeHtml(settings.promptConfig.globalNegative)}</textarea>
                </div>
                <div class="gi-row"><label>${t('history_count')}</label>
                    <input type="number" id="gi-history-count" value="${settings.sceneConfig.historyCount}" min="0" max="20"></div>
                <div class="gi-sec-title">${t('scene_template')}</div>
                <div class="gi-row" style="flex-direction:column;align-items:stretch;gap:0;">
                    <textarea id="gi-scene-tpl" style="width:100%;min-height:160px;font-family:'Consolas','Monaco',monospace!important;font-size:0.8em!important;">${escapeHtml(settings.sceneConfig.template)}</textarea>
                </div>
            </div>

            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;padding-top:14px;border-top:1px solid var(--nm-border);">
                <button class="gi-btn gi-btn-sec" id="gi-cancel">${t('cancel')}</button>
                <button class="gi-btn" id="gi-save">${t('save')}</button>
            </div>
          </div>
        </div>`);

        $('body').append(popup);
        renderActiveLoraList();
        renderAnchorTable();
        // 初始化：从当前工作流填充参数字段
        populateParamFieldsFromWorkflow(getCurrentWorkflowJson());

        // ---- Tab switching ----
        popup.on('click', '.gi-tab-btn', function () {
            const tab = $(this).data('tab');
            popup.find('.gi-tab-btn').removeClass('active');
            popup.find('.gi-tab-content').removeClass('active');
            $(this).addClass('active');
            popup.find(`.gi-tab-content[data-tab="${tab}"]`).addClass('active');
        });

        // ---- Range ----
        $('#gi-llm-temp').on('input', function () { $('#gi-llm-temp-val').text($(this).val()); });

        // ---- Fetch model list ----
        $('#gi-fetch-models').on('click', async function () {
            const btn = $(this);
            btn.prop('disabled', true).text(t('llm_fetching'));
            const url = $('#gi-llm-url').val().trim();
            const key = $('#gi-llm-key').val().trim();
            const $sel = $('#gi-llm-model');
            try {
                const models = await fetchLLMModels(url, key);
                // 更新到settings（临时）
                settings.llmConfig.modelList = models;
                const curModel = $sel.val() || settings.llmConfig.model;
                $sel.html(buildModelOptions(models, curModel));
                if (typeof toastr !== 'undefined') toastr.success(`获取到 ${models.length} 个模型`);
            } catch (e) {
                if (typeof toastr !== 'undefined') toastr.error(`获取模型失败: ${e.message}`);
            }
            btn.prop('disabled', false).text(t('llm_fetch_models'));
        });

        // ---- Test LLM ----
        $('#gi-test-llm').on('click', async function () {
            const btn = $(this).prop('disabled', true).text(t('testing'));
            const cfg = { baseUrl:$('#gi-llm-url').val(), apiKey:$('#gi-llm-key').val(), model:$('#gi-llm-model').val(), maxTokens:20, temperature:0 };
            const r = await testLLMConnection(cfg);
            showStatus('#gi-llm-status', r.success, r.message);
            btn.prop('disabled', false).text(t('test_llm'));
        });

        // ---- Test ComfyUI ----
        $('#gi-test-comfyui').on('click', async function () {
            const btn = $(this).prop('disabled', true).text(t('testing'));
            settings.comfyuiConfig.host = $('#gi-comfyui-host').val();
            settings.comfyuiConfig.port = parseInt($('#gi-comfyui-port').val());
            settings.comfyuiConfig.useHttps = $('#gi-comfyui-https').is(':checked');
            const r = await testComfyUIConnection();
            showStatus('#gi-comfyui-status', r.success, r.message);
            btn.prop('disabled', false).text(t('test_comfyui'));
        });

        // ---- Anchor ----
        $('#gi-gen-all-anchors').on('click', async function () {
            const btn = $(this).prop('disabled', true).text(t('anchor_generating'));
            $('#gi-anchor-status').text('生成中...');
            try {
                const results = await generateAllCharacterAnchors(true);
                renderAnchorTable();
                $('#gi-anchor-status').text(results.length ? `✓ 共生成 ${results.length} 个角色锚点` : '✗ 生成失败（世界书为空或LLM调用失败）');
            } catch (e) { $('#gi-anchor-status').text(`✗ ${e.message}`); }
            btn.prop('disabled', false).text(t('gen_all_anchors'));
        });

        $('#gi-clear-anchor').on('click', function () {
            anchorCache = {};
            saveAnchorCache();
            renderAnchorTable();
            $('#gi-anchor-status').text('✓ 缓存已清除');
        });

        // ---- Fetch ComfyUI models (Checkpoint + UNET) ----
        $('#gi-fetch-models-comfy').on('click', async function () {
            const btn = $(this).prop('disabled', true).text('获取中...');
            settings.comfyuiConfig.host = $('#gi-comfyui-host').val();
            settings.comfyuiConfig.port = parseInt($('#gi-comfyui-port').val());
            try {
                const { checkpoints, unets } = await fetchComfyUIModels();
                settings.comfyuiConfig.availableModels = { checkpoints, unets };
                const curCkpt = settings.comfyuiConfig.paramOverrides?.ckpt_name || '';
                const curUnet = settings.comfyuiConfig.paramOverrides?.unet_name || '';
                $('#gi-ckpt').html(checkpoints.map(m => `<option value="${escapeAttr(m)}" ${m===curCkpt?'selected':''}>${escapeHtml(m)}</option>`).join('') || '<option value="">（无）</option>');
                $('#gi-unet').html(unets.map(m => `<option value="${escapeAttr(m)}" ${m===curUnet?'selected':''}>${escapeHtml(m)}</option>`).join('') || '<option value="">（无）</option>');
                if (typeof toastr !== 'undefined') toastr.success(`Checkpoint: ${checkpoints.length}，UNET: ${unets.length}`);
            } catch (e) {
                if (typeof toastr !== 'undefined') toastr.error(`获取模型失败: ${e.message}`);
            }
            btn.prop('disabled', false).text(t('model_fetch'));
        });

        // ---- Fetch ComfyUI workflows ----
        $('#gi-fetch-workflows').on('click', async function () {
            const btn = $(this).prop('disabled', true).text('获取中...');
            $('#gi-workflow-fetch-status').text('正在获取并下载工作流...');
            settings.comfyuiConfig.host = $('#gi-comfyui-host').val();
            settings.comfyuiConfig.port = parseInt($('#gi-comfyui-port').val());
            try {
                const items = await fetchComfyUIWorkflows();
                if (!items.length) throw new Error('未找到工作流文件');
                if (!settings.comfyuiConfig.savedWorkflows) settings.comfyuiConfig.savedWorkflows = {};
                let loaded = 0;
                for (const { name, path, json } of items) {
                    // 已有手动上传的不覆盖
                    const existing = settings.comfyuiConfig.savedWorkflows[name];
                    if (!existing || existing.fromServer) {
                        settings.comfyuiConfig.savedWorkflows[name] = { fromServer: true, path, json };
                        if (json) loaded++;
                    }
                }
                $('#gi-workflow-select').html(buildWorkflowOptions());
                const msg = `共 ${items.length} 个工作流，${loaded} 个已加载，${items.length - loaded} 个需手动上传JSON`;
                $('#gi-workflow-fetch-status').text(msg);
                if (typeof toastr !== 'undefined') toastr.success(`工作流已获取：${loaded}/${items.length}`);
            } catch (e) {
                $('#gi-workflow-fetch-status').text(`✗ ${e.message}`);
                if (typeof toastr !== 'undefined') toastr.error(`获取工作流失败: ${e.message}`);
            }
            btn.prop('disabled', false).text(t('fetch_workflows'));
        });

        // ---- Workflow select change → update preview + populate param fields ----
        $('#gi-workflow-select').on('change', function () {
            const wf = $(this).val();
            const json = wf === 'Z-Image' ? Z_IMAGE_WORKFLOW : settings.comfyuiConfig.savedWorkflows?.[wf]?.json;
            if (!json) {
                $('#gi-wf-preview').html(`<div style="color:#ff8080;font-size:0.82em;padding:8px;">⚠ 此工作流 JSON 未加载，请点击"从服务器获取"或手动上传 JSON 文件</div>`);
                return;
            }
            $('#gi-wf-preview').html(buildWorkflowPreviewHtml(json));
            // 从工作流读取当前参数值，填入参数覆盖字段
            populateParamFieldsFromWorkflow(json);
        });

        // ---- Upload workflow ----
        $('#gi-upload-workflow').on('click', () => $('#gi-workflow-file').click());
        $('#gi-workflow-file').on('change', function (e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                try {
                    const json = JSON.parse(ev.target.result);
                    const name = file.name.replace('.json','');
                    if (!settings.comfyuiConfig.savedWorkflows) settings.comfyuiConfig.savedWorkflows = {};
                    settings.comfyuiConfig.savedWorkflows[name] = { json };
                    settings.comfyuiConfig.activeWorkflow = name;
                    $('#gi-workflow-select').html(buildWorkflowOptions()).val(name);
                    $('#gi-wf-preview').html(buildWorkflowPreviewHtml(json));
                    if (typeof toastr !== 'undefined') toastr.success(`工作流 "${name}" 已上传`);
                } catch (err) {
                    if (typeof toastr !== 'undefined') toastr.error(`JSON解析失败: ${err.message}`);
                }
            };
            reader.readAsText(file);
        });

        // ---- Fetch LoRAs ----
        $('#gi-fetch-loras').on('click', async function () {
            const btn = $(this).prop('disabled', true).text(t('lora_fetching'));
            $('#gi-lora-fetch-status').text('');
            try {
                // Apply host/port first
                settings.comfyuiConfig.host = $('#gi-comfyui-host').val();
                settings.comfyuiConfig.port = parseInt($('#gi-comfyui-port').val());
                const loras = await fetchComfyUILoras();
                settings.comfyuiConfig.availableLoras = loras;
                renderAvailableLoraList(loras);
                $('#gi-lora-available-wrap').show();
                $('#gi-lora-fetch-status').text(`共 ${loras.length} 个`);
            } catch (e) {
                $('#gi-lora-fetch-status').text(`✗ ${e.message}`);
            }
            btn.prop('disabled', false).text(t('lora_fetch'));
        });

        // ---- Add selected LoRAs ----
        $('#gi-lora-add-selected').on('click', function () {
            const selected = [];
            $('#gi-lora-available input[type=checkbox]:checked').each(function () {
                selected.push($(this).val());
            });
            if (!settings.comfyuiConfig.loras) settings.comfyuiConfig.loras = [];
            for (const name of selected) {
                if (!settings.comfyuiConfig.loras.some(l => l.name === name)) {
                    settings.comfyuiConfig.loras.push({ name, strength: 1.0 });
                }
            }
            renderActiveLoraList();
            if (typeof toastr !== 'undefined') toastr.success(`已添加 ${selected.length} 个 LoRA`);
        });

        // ---- Export/Import ----
        $('#gi-export').on('click', exportConfig);
        $('#gi-import').on('click', importConfig);

        // ---- Close / Save ----
        $('#gi-close, #gi-cancel').on('click', closeSettingsPopup);
        $('#gi-save').on('click', function () {
            collectSettingsFromUI();
            saveSettings();
            closeSettingsPopup();
            if (typeof toastr !== 'undefined') toastr.success('✓ 设置已保存');
        });
        $('#gi-settings-overlay').on('click', function (e) {
            if ($(e.target).is('#gi-settings-overlay')) closeSettingsPopup();
        });
    }

    // ---- Helpers ----

    function showStatus(selector, ok, message) {
        $(selector).removeClass('ok err').addClass(ok ? 'ok' : 'err').text((ok ? '✓ ' : '✗ ') + message);
    }

    function buildModelOptions(modelList, current) {
        const list = modelList?.length ? modelList : (current ? [current] : []);
        if (!list.length) return `<option value="">（点击"获取模型列表"）</option>`;
        return list.map(m => `<option value="${escapeAttr(m)}" ${m===current?'selected':''}>${escapeHtml(m)}</option>`).join('');
    }

    function buildWorkflowOptions() {
        const active = settings.comfyuiConfig.activeWorkflow || 'Z-Image';
        let opts = `<option value="Z-Image" ${active==='Z-Image'?'selected':''}>${t('workflow_builtin')}</option>`;
        for (const [name, wf] of Object.entries(settings.comfyuiConfig.savedWorkflows || {})) {
            const label = wf?.json ? escapeHtml(name) : `${escapeHtml(name)} (未加载)`;
            opts += `<option value="${escapeAttr(name)}" ${active===name?'selected':''}>${label}</option>`;
        }
        return opts;
    }

    function getCurrentWorkflowJson() {
        const wf = settings.comfyuiConfig.activeWorkflow;
        if (!wf || wf === 'Z-Image') return Z_IMAGE_WORKFLOW;
        return settings.comfyuiConfig.savedWorkflows?.[wf]?.json || Z_IMAGE_WORKFLOW;
    }

    function buildModelSelectHtml(id, list, cur) {
        if (!list.length) {
            const curOpt = cur ? `<option value="${escapeAttr(cur)}" selected>${escapeHtml(cur)}</option>` : '<option value="">（点击获取）</option>';
            return `<select id="${id}" style="flex:1;">${curOpt}</select>`;
        }
        const opts = list.map(m => `<option value="${escapeAttr(m)}" ${m===cur?'selected':''}>${escapeHtml(m)}</option>`).join('');
        return `<select id="${id}" style="flex:1;">${opts}</select>`;
    }

    function buildParamOverridesHtml() {
        const o = settings.comfyuiConfig.paramOverrides || {};
        const am = settings.comfyuiConfig.availableModels || { checkpoints:[], unets:[] };
        const samplers = ['euler','euler_ancestral','heun','dpm_2','dpm_2_ancestral','dpmpp_2s_ancestral','dpmpp_sde','dpmpp_2m','ddim'];
        const scheds   = ['normal','karras','exponential','sgm_uniform','simple','ddim_uniform'];
        return `
        <div class="gi-row"><label>Checkpoint 模型</label>
            ${buildModelSelectHtml('gi-ckpt', am.checkpoints||[], o.ckpt_name||'')}
            <button class="gi-btn gi-btn-sec gi-btn-sm" id="gi-fetch-models-comfy" style="margin-left:6px;flex-shrink:0;">${t('model_fetch')}</button>
        </div>
        <div class="gi-row"><label>UNET 模型<br><span style="font-size:0.75em;color:var(--nm-text-muted);">(Z-Image/Flux)</span></label>
            ${buildModelSelectHtml('gi-unet', am.unets||[], o.unet_name||'')}
        </div>
        <div class="gi-row"><label>${t('width')} × ${t('height')}</label>
            <input type="number" id="gi-width"  value="${o.width||832}"  min="64" max="2048" step="64" style="max-width:90px;">
            <span style="color:var(--nm-text-muted);padding:0 4px;">×</span>
            <input type="number" id="gi-height" value="${o.height||1216}" min="64" max="2048" step="64" style="max-width:90px;"></div>
        <div class="gi-row"><label>${t('steps')}</label><input type="number" id="gi-steps" value="${o.steps||20}" min="1" max="150"></div>
        <div class="gi-row"><label>${t('cfg')}</label><input type="number" id="gi-cfg" value="${o.cfg||7}" min="1" max="30" step="0.5"></div>
        <div class="gi-row"><label>${t('sampler')}</label><select id="gi-sampler">${samplers.map(s=>`<option value="${s}" ${o.sampler_name===s?'selected':''}>${s}</option>`).join('')}</select></div>
        <div class="gi-row"><label>${t('scheduler')}</label><select id="gi-scheduler">${scheds.map(s=>`<option value="${s}" ${o.scheduler===s?'selected':''}>${s}</option>`).join('')}</select></div>
        <div class="gi-row"><label>${t('seed')}</label><input type="number" id="gi-seed" value="${o.seed??-1}" min="-1"></div>`;
    }

    /** 切换工作流时，将工作流内的实际参数值回填到参数覆盖输入框 */
    function populateParamFieldsFromWorkflow(json) {
        if (!json) return;
        const map = autoMapNodes(json);
        if (map.sampler_node) {
            const s = json[map.sampler_node]?.inputs || {};
            if (s.steps     !== undefined) $('#gi-steps').val(s.steps);
            if (s.cfg       !== undefined) $('#gi-cfg').val(s.cfg);
            if (s.seed      !== undefined) $('#gi-seed').val(s.seed < 0 ? -1 : s.seed);
            if (s.sampler_name) $('#gi-sampler').val(s.sampler_name);
            if (s.scheduler)   $('#gi-scheduler').val(s.scheduler);
        }
        if (map.latent_node) {
            const l = json[map.latent_node]?.inputs || {};
            if (l.width  !== undefined) $('#gi-width').val(l.width);
            if (l.height !== undefined) $('#gi-height').val(l.height);
        }
        if (map.checkpoint_node) {
            const ckpt = json[map.checkpoint_node]?.inputs?.ckpt_name || '';
            if (ckpt) {
                if (!$('#gi-ckpt').find(`option[value="${escapeAttr(ckpt)}"]`).length) {
                    $('#gi-ckpt').prepend(`<option value="${escapeAttr(ckpt)}">${escapeHtml(ckpt)}</option>`);
                }
                $('#gi-ckpt').val(ckpt);
            }
        }
        if (map.unet_node) {
            const unet = json[map.unet_node]?.inputs?.unet_name || '';
            if (unet) {
                if (!$('#gi-unet').find(`option[value="${escapeAttr(unet)}"]`).length) {
                    $('#gi-unet').prepend(`<option value="${escapeAttr(unet)}">${escapeHtml(unet)}</option>`);
                }
                $('#gi-unet').val(unet);
            }
        }
    }

    function renderAnchorTable() {
        const $table = $('#gi-anchor-table').empty();
        const entries = Object.entries(anchorCache);
        if (!entries.length) {
            $table.html(`<div style="color:var(--nm-text-muted);font-size:0.82em;padding:8px 4px;">${t('anchor_empty')}</div>`);
            return;
        }
        const header = `<div class="gi-anchor-table-header"><span>${t('anchor_char_name')}</span><span>${t('anchor_desc')}</span><span>${t('anchor_ops')}</span></div>`;
        $table.html(header);
        for (const [charName, anchor] of entries) {
            const row = $(`<div class="gi-anchor-table-row">
                <span class="gi-anchor-table-name" title="${escapeAttr(charName)}">${escapeHtml(charName)}</span>
                <span class="gi-anchor-table-desc">${escapeHtml(anchor.description || '')}</span>
                <span class="gi-anchor-table-ops">
                    <button class="gi-btn gi-btn-sm gi-btn-sec" data-regen="${escapeAttr(charName)}">${t('regen')}</button>
                    <button class="gi-btn gi-btn-sm gi-btn-danger" data-del="${escapeAttr(charName)}">${t('delete')}</button>
                </span>
            </div>`);
            row.find('[data-regen]').on('click', async function () {
                const name = $(this).data('regen');
                $(this).prop('disabled', true).text('...');
                $('#gi-anchor-status').text(`正在重新生成 ${name}...`);
                await generateCharacterAnchor(name, true);
                renderAnchorTable();
                $('#gi-anchor-status').text(`✓ ${name} 已重新生成`);
            });
            row.find('[data-del]').on('click', function () {
                const name = $(this).data('del');
                delete anchorCache[name];
                saveAnchorCache();
                renderAnchorTable();
            });
            $table.append(row);
        }
    }

    function renderAvailableLoraList(loras) {
        const $list = $('#gi-lora-available').empty();
        const active = new Set((settings.comfyuiConfig.loras||[]).map(l => l.name));
        for (const name of loras) {
            $list.append(`<label class="gi-lora-item"><input type="checkbox" value="${escapeAttr(name)}" ${active.has(name)?'checked':''}><span title="${escapeAttr(name)}">${escapeHtml(name)}</span></label>`);
        }
    }

    function renderActiveLoraList() {
        const $list = $('#gi-lora-active').empty();
        const loras = settings.comfyuiConfig.loras || [];
        if (!loras.length) {
            $list.append(`<div style="color:var(--nm-text-muted);font-size:0.82em;padding:6px 4px;">（暂无启用LoRA，从列表中选择后点击添加）</div>`);
            return;
        }
        loras.forEach((lora, i) => {
            const row = $(`<div class="gi-lora-active-row">
                <span class="gi-lora-active-name" title="${escapeAttr(lora.name)}">${escapeHtml(lora.name)}</span>
                <input type="number" class="gi-lora-active-strength" value="${lora.strength??1.0}" min="0" max="2" step="0.05" title="${t('lora_strength')}">
                <button class="gi-btn gi-btn-danger gi-btn-sm" data-idx="${i}">${t('delete')}</button>
            </div>`);
            row.find('input').on('input', function () { loras[i].strength = parseFloat($(this).val()); });
            row.find('button').on('click', function () {
                loras.splice(i, 1);
                renderActiveLoraList();
            });
            $list.append(row);
        });
    }

    function collectSettingsFromUI() {
        settings.enabled        = $('#gi-enabled').is(':checked');
        settings.language       = $('#gi-language').val();
        settings.promptLanguage = $('#gi-prompt-lang').val();
        settings.autoGenerate   = $('#gi-auto-gen').is(':checked');
        settings.debounceMs     = parseInt($('#gi-debounce').val()) || 1000;

        settings.llmConfig.baseUrl     = $('#gi-llm-url').val().trim();
        settings.llmConfig.apiKey      = $('#gi-llm-key').val().trim();
        settings.llmConfig.model       = $('#gi-llm-model').val();
        settings.llmConfig.maxTokens   = parseInt($('#gi-llm-tokens').val()) || 4096;
        settings.llmConfig.temperature = parseFloat($('#gi-llm-temp').val()) || 0.7;

        settings.anchorConfig.enabled       = $('#gi-anchor-enabled').is(':checked');
        settings.anchorConfig.cacheEnabled  = $('#gi-anchor-cache').is(':checked');
        settings.anchorConfig.template      = $('#gi-anchor-tpl').val();

        settings.comfyuiConfig.host         = $('#gi-comfyui-host').val().trim();
        settings.comfyuiConfig.port         = parseInt($('#gi-comfyui-port').val()) || 8188;
        settings.comfyuiConfig.useHttps     = $('#gi-comfyui-https').is(':checked');
        settings.comfyuiConfig.activeWorkflow = $('#gi-workflow-select').val();
        settings.comfyuiConfig.paramOverrides = {
            ckpt_name:   $('#gi-ckpt').val()?.trim() || '',
            unet_name:   $('#gi-unet').val()?.trim() || '',
            steps:       parseInt($('#gi-steps').val()) || 20,
            cfg:         parseFloat($('#gi-cfg').val()) || 7,
            width:       parseInt($('#gi-width').val()) || 832,
            height:      parseInt($('#gi-height').val()) || 1216,
            sampler_name: $('#gi-sampler').val(),
            scheduler:   $('#gi-scheduler').val(),
            seed:        parseInt($('#gi-seed').val()) ?? -1,
        };

        settings.promptConfig.globalPrefix   = $('#gi-prefix').val();
        settings.promptConfig.globalSuffix   = $('#gi-suffix').val();
        settings.promptConfig.globalNegative = $('#gi-negative').val();
        settings.sceneConfig.historyCount    = parseInt($('#gi-history-count').val()) || 4;
        settings.sceneConfig.template        = $('#gi-scene-tpl').val();
    }

    // ========== EVENT SYSTEM ==========

    function registerSTEvents() {
        if (typeof eventOn !== 'function' || typeof tavern_events === 'undefined') {
            addLog('EVENTS', '酒馆事件系统不可用');
            return;
        }
        let autoGenDebounced = null;
        eventOn(tavern_events.MESSAGE_RECEIVED, (mesId) => {
            if (!settings.autoGenerate) return;
            if (!autoGenDebounced) autoGenDebounced = debounce(id => handleAutoGeneration(id), settings.debounceMs);
            autoGenDebounced(mesId);
        });
        if (tavern_events.CHAT_CHANGED) {
            eventOn(tavern_events.CHAT_CHANGED, () => {
                addLog('EVENT', 'CHAT_CHANGED');
                // 切换角色/对话后，如果没有任何缓存则自动生成全部角色锚点
                if (settings.anchorConfig.enabled && Object.keys(anchorCache).length === 0) {
                    setTimeout(async () => {
                        addLog('ANCHOR', '切换对话，自动生成全部角色锚点...');
                        await generateAllCharacterAnchors();
                    }, 1500);
                }
                setTimeout(processChatDOM, 800);
            });
        }
        if (tavern_events.CHARACTER_MESSAGE_RENDERED) {
            eventOn(tavern_events.CHARACTER_MESSAGE_RENDERED, () => setTimeout(processChatDOM, 300));
        }
        addLog('EVENTS', '事件已注册');
    }

    function registerButtons() {
        if (typeof appendInexistentScriptButtons !== 'function') return;
        appendInexistentScriptButtons([
            { name:t('gen_anchor_btn'), visible:true },
            { name:t('manual_gen'),     visible:true }
        ]);
        eventOn(getButtonEvent(t('gen_anchor_btn')), async () => {
            if (typeof toastr !== 'undefined') toastr.info(t('anchor_generating'));
            const results = await generateAllCharacterAnchors(true);
            if (results.length) {
                if (typeof toastr !== 'undefined') toastr.success(`✓ 已生成 ${results.length} 个角色锚点`);
            } else {
                if (typeof toastr !== 'undefined') toastr.warning('锚点生成失败（世界书为空或LLM调用失败）');
            }
        });
        eventOn(getButtonEvent(t('manual_gen')), async () => {
            try {
                const ctx = getSTContext();
                const chat = ctx?.chat;
                if (!chat) return;
                let id = -1;
                for (let i = chat.length-1; i >= 0; i--) { if (!chat[i].is_user) { id = i; break; } }
                if (id >= 0) await handleAutoGeneration(id);
            } catch (e) {
                if (typeof toastr !== 'undefined') toastr.error(`手动生图失败: ${e.message}`);
            }
        });
    }

    // ========== INIT ==========

    async function ensureImgGenFilterRegex() {
        if (typeof getTavernRegexes !== 'function' || typeof updateTavernRegexesWith !== 'function') return;
        const NAME = '过滤上下文[IMG_GEN]';
        const PATTERN = '/\\[IMG_GEN\\]((?:(?!\\[IMG_GEN\\])[\\s\\S])*?)\\[\\/IMG_GEN\\]/gsi';
        try {
            if (getTavernRegexes({ scope:'global' }).some(r => r.script_name === NAME)) return;
            await updateTavernRegexesWith(list => {
                list.push({ id: crypto.randomUUID?.() || `gi-${Date.now()}`, script_name:NAME, enabled:true, run_on_edit:true, scope:'global', find_regex:PATTERN, replace_string:'', source:{ user_input:false, ai_output:true, slash_command:false, world_info:false }, destination:{ display:false, prompt:true }, min_depth:null, max_depth:null });
                return list;
            });
            addLog('REGEX', '已添加 IMG_GEN 过滤正则');
        } catch (e) { addLog('REGEX', `添加失败: ${e.message}`); }
    }

    function injectCSS() {
        if ($('#gi-global-css').length) return;
        $('<style id="gi-global-css">').text(GLOBAL_CSS).appendTo('head');
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
            toastr.success('🎨 生图助手 v2 已启动', '插件加载', { timeOut:1500, positionClass:'toast-top-center' });
        }
        addLog('INIT', '生图助手 v2.1.0 启动');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(initScript, 500));
    } else {
        setTimeout(initScript, 500);
    }

})();
