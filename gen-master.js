(function () {
    'use strict';

    const APP_NAME = '生图大师';
    const STORAGE_KEY = 'gen_master_script_settings';
    const MODAL_ID = 'gen-master-modal';
    const MENU_ID = 'gen-master-menu-item';
    const STYLE_ID = 'gen-master-style';
    const MANUAL_PROMPT_BUTTON_NAME = '手动生词';
    const RUNTIME_KEY = '__gen_master_tavern_helper_runtime__';
    const SCRIPT_BUTTONS = Object.freeze([
        { name: APP_NAME, visible: true },
        { name: MANUAL_PROMPT_BUTTON_NAME, visible: true }
    ]);
    const SCRIPT_INFO = [
        '酒馆助手脚本版生图大师。',
        `入口按钮: ${APP_NAME} / ${MANUAL_PROMPT_BUTTON_NAME}`,
        '如果没有看到按钮，请在“酒馆助手 -> 脚本库”确认脚本已启用且按钮已启用。'
    ].join('\n');
    const runtime = globalThis[RUNTIME_KEY] && typeof globalThis[RUNTIME_KEY] === 'object'
        ? globalThis[RUNTIME_KEY]
        : { actions: {}, boundEvents: new Set(), bootTimer: null };
    runtime.actions = runtime.actions && typeof runtime.actions === 'object' ? runtime.actions : {};
    runtime.boundEvents = runtime.boundEvents instanceof Set ? runtime.boundEvents : new Set();

    const BUILTIN_WORKFLOWS = [
        {
            id: 'builtin:z-image-turbo',
            name: 'Z-Image-Turbo 默认工作流',
            source: 'builtin',
            workflow: {
                _meta: { title: 'Z-Image-Turbo Starter API Workflow' },
                '1': { inputs: { unet_name: 'z_image_turbo_bf16.safetensors', weight_dtype: 'default' }, class_type: 'UNETLoader', _meta: { title: 'Load Z-Image-Turbo UNet' } },
                '2': { inputs: { clip_name1: 'qwen_3_4b.safetensors', clip_name2: 'qwen_3_4b.safetensors', type: 'qwen' }, class_type: 'DualCLIPLoader', _meta: { title: 'Load Qwen Text Encoder' } },
                '3': { inputs: { vae_name: 'ae.safetensors' }, class_type: 'VAELoader', _meta: { title: 'Load VAE' } },
                '4': { inputs: { text: '{{prompt}}', clip: ['2', 0] }, class_type: 'CLIPTextEncode', _meta: { title: 'Positive Prompt' } },
                '5': { inputs: { text: '{{negativePrompt}}', clip: ['2', 0] }, class_type: 'CLIPTextEncode', _meta: { title: 'Negative Prompt' } },
                '6': { inputs: { width: '{{width}}', height: '{{height}}', batch_size: '{{batchSize}}' }, class_type: 'EmptyLatentImage', _meta: { title: 'Latent Size' } },
                '8': { inputs: { model: ['1', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['6', 0], seed: '{{seed}}', steps: '{{steps}}', cfg: '{{cfg}}', sampler_name: '{{sampler}}', scheduler: '{{scheduler}}', denoise: 1 }, class_type: 'KSampler', _meta: { title: 'Sampler' } },
                '9': { inputs: { samples: ['8', 0], vae: ['3', 0] }, class_type: 'VAEDecode', _meta: { title: 'Decode' } },
                '10': { inputs: { filename_prefix: 'gen_master', images: ['9', 0] }, class_type: 'SaveImage', _meta: { title: 'Save Image' } }
            }
        }
    ];

    const DEFAULT_SETTINGS = {
        activeTab: 'basic',
        llm: { baseUrl: '', apiKey: '', model: '', fetchedModels: [], temperature: 0.3, maxTokens: 1200 },
        comfy: { baseUrl: 'http://127.0.0.1:8188', selectedWorkflowId: 'builtin:z-image-turbo', customWorkflows: [], pollIntervalMs: 1200, timeoutMs: 120000 },
        defaults: { width: 1024, height: 1024, steps: 8, cfg: 1, sampler: 'euler', scheduler: 'simple', seed: -1, batchSize: 1 },
        promptState: { positive: '', negative: '', customWorkflowJson: '', customWorkflowName: '', lorasJson: '[]', mappingJson: '' },
        cache: { characterAnchor: null, sceneSummary: null }
    };

    function mergeDeep(base, patch) {
        const output = JSON.parse(JSON.stringify(base));
        for (const [key, value] of Object.entries(patch || {})) {
            if (value && typeof value === 'object' && !Array.isArray(value) && output[key] && typeof output[key] === 'object' && !Array.isArray(output[key])) {
                output[key] = mergeDeep(output[key], value);
            } else {
                output[key] = value;
            }
        }
        return output;
    }

    function getScriptIdSafe() {
        if (typeof getScriptId !== 'function') {
            return '';
        }

        try {
            return String(getScriptId() || '');
        } catch {
            return '';
        }
    }

    function getScriptVariableOptions(includeScriptId = true) {
        const scriptId = includeScriptId ? getScriptIdSafe() : '';
        return scriptId
            ? { type: 'script', script_id: scriptId }
            : { type: 'script' };
    }

    function getStoredScriptVariables() {
        if (typeof getVariables === 'function') {
            try {
                return getVariables(getScriptVariableOptions(true)) || {};
            } catch (error) {
                try {
                    return getVariables(getScriptVariableOptions(false)) || {};
                } catch (fallbackError) {
                    console.warn(`[${APP_NAME}] 读取脚本变量失败，回退到 localStorage`, fallbackError);
                }
            }
        }

        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        } catch {
            return {};
        }
    }

    function replaceStoredScriptVariables(nextVariables) {
        if (typeof replaceVariables === 'function') {
            try {
                replaceVariables(nextVariables, getScriptVariableOptions(true));
            } catch (error) {
                try {
                    replaceVariables(nextVariables, getScriptVariableOptions(false));
                } catch (fallbackError) {
                    console.warn(`[${APP_NAME}] 保存脚本变量失败，回退到 localStorage`, fallbackError);
                }
            }
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextVariables));
    }

    function loadSettings() {
        return mergeDeep(DEFAULT_SETTINGS, getStoredScriptVariables().config || {});
    }

    function saveSettings(nextSettings) {
        replaceStoredScriptVariables({ config: nextSettings });
        return nextSettings;
    }

    function syncScriptInfo() {
        if (typeof replaceScriptInfo !== 'function') {
            return;
        }

        const scriptId = getScriptIdSafe();
        try {
            if (scriptId && replaceScriptInfo.length >= 2) {
                replaceScriptInfo(scriptId, SCRIPT_INFO);
            } else {
                replaceScriptInfo(SCRIPT_INFO);
            }
        } catch (error) {
            try {
                replaceScriptInfo(SCRIPT_INFO);
            } catch (fallbackError) {
                console.warn(`[${APP_NAME}] 更新脚本说明失败`, fallbackError);
            }
        }
    }

    let settings = loadSettings();

    function getContext() {
        return typeof SillyTavern !== 'undefined' && typeof SillyTavern.getContext === 'function'
            ? SillyTavern.getContext()
            : null;
    }

    function getFetch() {
        return typeof window.SD_safeFetch === 'function' ? window.SD_safeFetch.bind(window) : fetch.bind(window);
    }

    function getWorkflows() {
        const custom = (settings.comfy.customWorkflows || []).map(item => ({
            id: item.id,
            name: item.name,
            source: 'custom',
            workflow: item.workflow
        }));
        return [...BUILTIN_WORKFLOWS, ...custom];
    }

    function getSelectedWorkflow() {
        return getWorkflows().find(item => item.id === settings.comfy.selectedWorkflowId) || BUILTIN_WORKFLOWS[0];
    }

    function setStatus(message, isError = false) {
        const node = document.getElementById('gm-status');
        if (!node) return;
        node.textContent = message;
        node.dataset.tone = isError ? 'error' : 'neutral';
    }

    function toast(type, message, title = APP_NAME) {
        if (typeof toastr !== 'undefined' && typeof toastr[type] === 'function') {
            toastr[type](message, title);
        } else {
            console[type === 'error' ? 'error' : 'log'](`[${APP_NAME}] ${message}`);
        }
    }

    function normalizeError(error) {
        const raw = String(error?.message || error || '未知错误');
        const lower = raw.toLowerCase();
        if (lower.includes('<!doctype html') || lower.includes('<html') || lower.includes('not found')) {
            return '请求返回了 HTML 错误页。通常是地址错误、后端不存在，或跨域/代理配置不正确。';
        }
        return raw;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function addStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${MODAL_ID}{position:fixed;inset:0;z-index:50000;display:none}
            #${MODAL_ID}.is-open{display:block}
            #${MODAL_ID} .gm-backdrop{position:absolute;inset:0;background:rgba(7,9,15,.72);backdrop-filter:blur(10px)}
            #${MODAL_ID} .gm-dialog{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(1100px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;border-radius:28px;background:linear-gradient(180deg,rgba(17,18,26,.98),rgba(13,14,20,.98));box-shadow:0 24px 60px rgba(0,0,0,.42);border:1px solid rgba(117,132,219,.14);color:#f2f4ff}
            #${MODAL_ID} .gm-close{position:absolute;right:14px;top:14px;width:42px;height:42px;border:0;border-radius:14px;background:rgba(255,255,255,.08);color:#fff}
            #${MODAL_ID} .gm-shell{padding:22px}
            #${MODAL_ID} .gm-hero{display:flex;gap:14px;align-items:center;margin-bottom:18px}
            #${MODAL_ID} .gm-mark{width:52px;height:52px;border-radius:18px;display:grid;place-items:center;background:linear-gradient(180deg,rgba(116,143,255,.28),rgba(77,90,157,.14));font-size:22px}
            #${MODAL_ID} .gm-eyebrow{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#8f8da7}
            #${MODAL_ID} .gm-title{font-size:28px;font-weight:700}
            #${MODAL_ID} .gm-subtitle{margin-top:4px;color:#9697ad}
            #${MODAL_ID} .gm-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:10px;border-radius:24px;background:linear-gradient(180deg,rgba(33,34,46,.96),rgba(24,24,34,.96));margin-bottom:18px}
            #${MODAL_ID} .gm-tab{min-height:70px;border:1px solid transparent;border-radius:18px;background:transparent;color:#9f9db5;font-weight:700}
            #${MODAL_ID} .gm-tab.is-active{color:#8ba6ff;background:linear-gradient(180deg,rgba(42,45,68,.95),rgba(29,32,49,.95));box-shadow:0 0 0 1px rgba(90,115,255,.15),0 0 22px rgba(93,116,255,.18)}
            #${MODAL_ID} .gm-panel{display:none}
            #${MODAL_ID} .gm-panel.is-active{display:block}
            #${MODAL_ID} .gm-card{padding:22px;border-radius:24px;background:linear-gradient(180deg,rgba(39,40,56,.98),rgba(28,29,40,.98));border:1px solid rgba(111,127,214,.16);box-shadow:0 18px 40px rgba(0,0,0,.32);margin-bottom:18px}
            #${MODAL_ID} .gm-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px}
            #${MODAL_ID} .gm-card-title{font-size:26px;font-weight:700}
            #${MODAL_ID} .gm-card-subtitle{margin-top:6px;color:#9c9bb3;line-height:1.65}
            #${MODAL_ID} .gm-pill{padding:10px 14px;border-radius:999px;color:#8ba6ff;background:rgba(93,115,255,.12);border:1px solid rgba(108,130,255,.18);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
            #${MODAL_ID} .gm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:16px}
            #${MODAL_ID} .gm-mini{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:16px}
            #${MODAL_ID} .gm-stack{display:grid;gap:14px;margin-bottom:16px}
            #${MODAL_ID} .gm-field{display:flex;flex-direction:column;gap:8px}
            #${MODAL_ID} .gm-label{font-size:15px;font-weight:700;color:#b7b4ca}
            #${MODAL_ID} input,#${MODAL_ID} select,#${MODAL_ID} textarea{width:100%;box-sizing:border-box;padding:15px 17px;color:#f3f5ff;background:linear-gradient(180deg,rgba(23,23,31,.98),rgba(29,29,40,.98));border:1px solid rgba(132,142,197,.1);border-radius:16px}
            #${MODAL_ID} textarea{min-height:130px;resize:vertical;line-height:1.65}
            #${MODAL_ID} .gm-info{padding:18px;border-radius:18px;background:linear-gradient(180deg,rgba(28,29,41,.95),rgba(22,23,31,.95));border:1px solid rgba(104,113,161,.12)}
            #${MODAL_ID} .gm-info b{display:block;margin-bottom:8px;font-size:16px}
            #${MODAL_ID} .gm-actions{display:flex;flex-wrap:wrap;gap:12px}
            #${MODAL_ID} .gm-btn{min-height:54px;padding:0 22px;border:0;border-radius:18px;color:#f8f9ff;font-size:15px;font-weight:700}
            #${MODAL_ID} .gm-btn--primary{background:linear-gradient(180deg,#7690ff,#627bff);box-shadow:0 12px 28px rgba(98,123,255,.35)}
            #${MODAL_ID} .gm-btn--secondary{background:linear-gradient(180deg,rgba(59,61,90,.98),rgba(46,47,68,.98))}
            #${MODAL_ID} .gm-btn--ghost{background:linear-gradient(180deg,rgba(44,44,56,.96),rgba(32,33,43,.96))}
            #${MODAL_ID} .gm-status{padding:16px 18px;border-radius:18px;background:linear-gradient(180deg,rgba(31,32,46,.98),rgba(22,23,31,.98));border:1px solid rgba(110,125,201,.16);margin-bottom:16px;white-space:pre-wrap}
            #${MODAL_ID} .gm-status[data-tone="error"]{background:linear-gradient(180deg,rgba(70,27,39,.96),rgba(49,21,30,.96));border-color:rgba(173,68,98,.28)}
            #${MODAL_ID} .gm-image{min-height:220px;padding:18px;border-radius:20px;background:linear-gradient(180deg,rgba(14,14,18,.98),rgba(11,11,14,.98))}
            #${MODAL_ID} .gm-image img{display:block;max-width:100%;border-radius:16px}
            #${MODAL_ID} .gm-caption{margin-top:14px;padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.04);color:#a7a6bd;line-height:1.65;word-break:break-word}
            #${MODAL_ID} .gm-muted{color:#9c9bb3;font-size:13px}
            @media (max-width: 900px){#${MODAL_ID} .gm-tabs,#${MODAL_ID} .gm-grid,#${MODAL_ID} .gm-mini{grid-template-columns:1fr}#${MODAL_ID} .gm-head{flex-direction:column}}
        `;
        document.head.appendChild(style);
    }

    function buildModalHtml() {
        return `
            <div class="gm-backdrop" data-gm-close="true"></div>
            <div class="gm-dialog">
                <button class="gm-close" type="button" data-gm-close="true"><i class="fa-solid fa-xmark"></i></button>
                <div class="gm-shell">
                    <div class="gm-hero">
                        <div class="gm-mark"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
                        <div>
                            <div class="gm-eyebrow">TavernHelper Script</div>
                            <div class="gm-title">${APP_NAME}</div>
                            <div class="gm-subtitle">基于酒馆助手脚本系统的角色一致性生图面板</div>
                        </div>
                    </div>
                    <div class="gm-tabs">
                        <button class="gm-tab" data-tab="basic">基础设置</button>
                        <button class="gm-tab" data-tab="model">模型配置</button>
                        <button class="gm-tab" data-tab="workflow">工作流</button>
                        <button class="gm-tab" data-tab="prompt">生成与结果</button>
                    </div>
                    <div class="gm-panel" data-panel="basic"><div class="gm-card">
                        <div class="gm-head"><div><div class="gm-card-title">基础连接</div><div class="gm-card-subtitle">配置 ComfyUI 与默认生图参数。</div></div><div class="gm-pill">基础</div></div>
                        <div class="gm-grid">
                            <label class="gm-field"><span class="gm-label">ComfyUI 地址</span><input id="gm-comfy-url" type="text"></label>
                            <div class="gm-info"><b>工作流来源</b><div class="gm-muted">当前脚本支持内置工作流和你保存到脚本配置里的自定义工作流。</div></div>
                        </div>
                        <div class="gm-mini">
                            <label class="gm-field"><span class="gm-label">宽度</span><input id="gm-width" type="number" min="64" step="64"></label>
                            <label class="gm-field"><span class="gm-label">高度</span><input id="gm-height" type="number" min="64" step="64"></label>
                            <label class="gm-field"><span class="gm-label">步数</span><input id="gm-steps" type="number" min="1"></label>
                            <label class="gm-field"><span class="gm-label">CFG</span><input id="gm-cfg" type="number" step="0.1"></label>
                            <label class="gm-field"><span class="gm-label">采样器</span><input id="gm-sampler" type="text"></label>
                            <label class="gm-field"><span class="gm-label">调度器</span><input id="gm-scheduler" type="text"></label>
                            <label class="gm-field"><span class="gm-label">Seed</span><input id="gm-seed" type="number"></label>
                        </div>
                        <div class="gm-actions">
                            <button id="gm-test-comfy" class="gm-btn gm-btn--secondary" type="button">测试 ComfyUI</button>
                            <button id="gm-refresh-workflows" class="gm-btn gm-btn--ghost" type="button">刷新工作流</button>
                            <button id="gm-save" class="gm-btn gm-btn--primary" type="button">保存设置</button>
                        </div>
                    </div></div>
                    <div class="gm-panel" data-panel="model"><div class="gm-card">
                        <div class="gm-head"><div><div class="gm-card-title">模型配置</div><div class="gm-card-subtitle">兼容 OpenAI 风格接口。填好 URL 与 API Key 后可获取模型列表。</div></div><div class="gm-pill">LLM</div></div>
                        <div class="gm-stack">
                            <label class="gm-field"><span class="gm-label">Base URL</span><input id="gm-llm-url" type="text"></label>
                            <label class="gm-field"><span class="gm-label">API Key</span><input id="gm-llm-key" type="password"></label>
                            <label class="gm-field"><span class="gm-label">模型列表</span><select id="gm-model-select"><option value="">请先获取模型列表</option></select></label>
                            <label class="gm-field"><span class="gm-label">当前模型</span><input id="gm-model" type="text"></label>
                        </div>
                        <div class="gm-actions">
                            <button id="gm-fetch-models" class="gm-btn gm-btn--ghost" type="button">获取模型列表</button>
                            <button id="gm-test-llm" class="gm-btn gm-btn--secondary" type="button">测试模型连接</button>
                        </div>
                    </div></div>
                    <div class="gm-panel" data-panel="workflow"><div class="gm-card">
                        <div class="gm-head"><div><div class="gm-card-title">工作流</div><div class="gm-card-subtitle">支持内置 Z-Image-Turbo 和手动保存自定义工作流。</div></div><div class="gm-pill">Workflow</div></div>
                        <div class="gm-grid">
                            <label class="gm-field"><span class="gm-label">工作流选择</span><select id="gm-workflow-select"></select></label>
                            <label class="gm-field"><span class="gm-label">自定义工作流名称</span><input id="gm-workflow-name" type="text" placeholder="例如：我的写实模板"></label>
                        </div>
                        <label class="gm-field"><span class="gm-label">自定义工作流 JSON</span><textarea id="gm-workflow-json" rows="10" placeholder="粘贴 ComfyUI API 工作流 JSON"></textarea></label>
                        <div class="gm-actions">
                            <button id="gm-save-workflow" class="gm-btn gm-btn--secondary" type="button">保存自定义工作流</button>
                            <button id="gm-load-workflow" class="gm-btn gm-btn--ghost" type="button">载入当前工作流 JSON</button>
                        </div>
                        <label class="gm-field" style="margin-top:16px"><span class="gm-label">LoRA 配置 JSON</span><textarea id="gm-loras" rows="4" placeholder='[{"name":"character.safetensors","weight":0.8}]'></textarea></label>
                        <label class="gm-field"><span class="gm-label">手动节点映射 JSON</span><textarea id="gm-mapping" rows="6" placeholder='{"prompt":[{"nodeId":"4","input":"text"}]}'></textarea></label>
                    </div></div>
                    <div class="gm-panel" data-panel="prompt">
                        <div class="gm-card">
                            <div class="gm-head"><div><div class="gm-card-title">提示词生成</div><div class="gm-card-subtitle">总结角色卡、世界书和当前对话，再组合最终提示词。</div></div><div class="gm-pill">Prompt</div></div>
                            <div class="gm-actions" style="margin-bottom:16px">
                                <button id="gm-anchor" class="gm-btn gm-btn--ghost" type="button">总结角色锚点</button>
                                <button id="gm-scene" class="gm-btn gm-btn--ghost" type="button">总结当前场景</button>
                                <button id="gm-compose" class="gm-btn gm-btn--secondary" type="button">生成提示词</button>
                                <button id="gm-generate" class="gm-btn gm-btn--primary" type="button">开始生图</button>
                            </div>
                            <div class="gm-grid">
                                <label class="gm-field"><span class="gm-label">正向提示词</span><textarea id="gm-positive" rows="10"></textarea></label>
                                <label class="gm-field"><span class="gm-label">负向提示词</span><textarea id="gm-negative" rows="10"></textarea></label>
                            </div>
                        </div>
                        <div class="gm-card">
                            <div class="gm-head"><div><div class="gm-card-title">生成结果</div><div class="gm-card-subtitle">状态与图片预览显示在这里。</div></div><div class="gm-pill">Result</div></div>
                            <div id="gm-status" class="gm-status" data-tone="neutral">等待操作</div>
                            <div id="gm-image" class="gm-image"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function ensureModal() {
        if (!document.body) return null;
        addStyle();
        let modal = document.getElementById(MODAL_ID);
        if (!modal) {
            modal = document.createElement('div');
            modal.id = MODAL_ID;
            modal.innerHTML = buildModalHtml();
            document.body.appendChild(modal);

            modal.querySelectorAll('[data-gm-close]').forEach(node => {
                node.addEventListener('click', event => {
                    if (event.target === node || node.classList.contains('gm-close')) {
                        modal.classList.remove('is-open');
                    }
                });
            });
        }
        return modal;
    }

    function activateTab(tab) {
        settings.activeTab = tab;
        saveSettings(settings);
        const modal = document.getElementById(MODAL_ID);
        if (!modal) return;
        modal.querySelectorAll('.gm-tab').forEach(node => node.classList.toggle('is-active', node.dataset.tab === tab));
        modal.querySelectorAll('.gm-panel').forEach(node => node.classList.toggle('is-active', node.dataset.panel === tab));
    }

    function renderWorkflowSelect() {
        const select = document.getElementById('gm-workflow-select');
        if (!select) return;
        select.innerHTML = '';
        for (const workflow of getWorkflows()) {
            const option = document.createElement('option');
            option.value = workflow.id;
            option.textContent = `${workflow.source === 'builtin' ? '内置' : '自定义'} · ${workflow.name}`;
            option.selected = workflow.id === settings.comfy.selectedWorkflowId;
            select.appendChild(option);
        }
    }

    function renderModelSelect() {
        const select = document.getElementById('gm-model-select');
        if (!select) return;
        select.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = settings.llm.fetchedModels.length ? '请选择模型' : '请先获取模型列表';
        placeholder.selected = !settings.llm.model;
        select.appendChild(placeholder);
        settings.llm.fetchedModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.id;
            option.selected = model.id === settings.llm.model;
            select.appendChild(option);
        });
    }

    function renderState() {
        const selectedWorkflow = getSelectedWorkflow();
        const map = [
            ['gm-comfy-url', settings.comfy.baseUrl],
            ['gm-width', settings.defaults.width],
            ['gm-height', settings.defaults.height],
            ['gm-steps', settings.defaults.steps],
            ['gm-cfg', settings.defaults.cfg],
            ['gm-sampler', settings.defaults.sampler],
            ['gm-scheduler', settings.defaults.scheduler],
            ['gm-seed', settings.defaults.seed],
            ['gm-llm-url', settings.llm.baseUrl],
            ['gm-llm-key', settings.llm.apiKey],
            ['gm-model', settings.llm.model],
            ['gm-workflow-name', settings.promptState.customWorkflowName],
            ['gm-workflow-json', settings.promptState.customWorkflowJson],
            ['gm-loras', settings.promptState.lorasJson],
            ['gm-mapping', settings.promptState.mappingJson],
            ['gm-positive', settings.promptState.positive],
            ['gm-negative', settings.promptState.negative]
        ];
        map.forEach(([id, value]) => {
            const node = document.getElementById(id);
            if (node) node.value = value ?? '';
        });
        renderWorkflowSelect();
        renderModelSelect();
        const workflowSelect = document.getElementById('gm-workflow-select');
        if (workflowSelect) workflowSelect.value = selectedWorkflow.id;
        activateTab(settings.activeTab || 'basic');
    }

    function openPanel(targetTab = settings.activeTab || 'basic') {
        const modal = ensureModal();
        modal.classList.add('is-open');
        renderState();
        activateTab(targetTab);
    }

    function readForm() {
        settings.comfy.baseUrl = document.getElementById('gm-comfy-url')?.value?.trim() || settings.comfy.baseUrl;
        settings.defaults.width = Number(document.getElementById('gm-width')?.value || settings.defaults.width);
        settings.defaults.height = Number(document.getElementById('gm-height')?.value || settings.defaults.height);
        settings.defaults.steps = Number(document.getElementById('gm-steps')?.value || settings.defaults.steps);
        settings.defaults.cfg = Number(document.getElementById('gm-cfg')?.value || settings.defaults.cfg);
        settings.defaults.sampler = document.getElementById('gm-sampler')?.value?.trim() || settings.defaults.sampler;
        settings.defaults.scheduler = document.getElementById('gm-scheduler')?.value?.trim() || settings.defaults.scheduler;
        settings.defaults.seed = Number(document.getElementById('gm-seed')?.value || settings.defaults.seed);
        settings.llm.baseUrl = document.getElementById('gm-llm-url')?.value?.trim() || settings.llm.baseUrl;
        settings.llm.apiKey = document.getElementById('gm-llm-key')?.value || settings.llm.apiKey;
        settings.llm.model = document.getElementById('gm-model')?.value?.trim() || settings.llm.model;
        settings.comfy.selectedWorkflowId = document.getElementById('gm-workflow-select')?.value || settings.comfy.selectedWorkflowId;
        settings.promptState.customWorkflowName = document.getElementById('gm-workflow-name')?.value?.trim() || '';
        settings.promptState.customWorkflowJson = document.getElementById('gm-workflow-json')?.value || '';
        settings.promptState.lorasJson = document.getElementById('gm-loras')?.value || '[]';
        settings.promptState.mappingJson = document.getElementById('gm-mapping')?.value || '';
        settings.promptState.positive = document.getElementById('gm-positive')?.value || '';
        settings.promptState.negative = document.getElementById('gm-negative')?.value || '';
        saveSettings(settings);
    }

    function getHeaders(apiKey) {
        return {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        };
    }

    async function safeJson(url, options = {}) {
        const response = await getFetch()(url, options);
        if (!response.ok) {
            throw new Error(`${response.status} ${await response.text()}`);
        }
        return response.json();
    }

    async function fetchModels() {
        readForm();
        const baseUrl = settings.llm.baseUrl.replace(/\/+$/, '');
        const payload = await safeJson(`${baseUrl}/models`, { method: 'GET', headers: getHeaders(settings.llm.apiKey) });
        settings.llm.fetchedModels = Array.isArray(payload?.data) ? payload.data.map(item => ({ id: item.id })).filter(item => item.id) : [];
        saveSettings(settings);
        renderModelSelect();
        setStatus(`已获取 ${settings.llm.fetchedModels.length} 个模型`);
    }

    async function testLlm() {
        readForm();
        const baseUrl = settings.llm.baseUrl.replace(/\/+$/, '');
        const payload = await safeJson(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: getHeaders(settings.llm.apiKey),
            body: JSON.stringify({
                model: settings.llm.model,
                temperature: 0.2,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: 'Return {"ok":true,"message":"Model reachable"} only.' },
                    { role: 'user', content: 'Ping.' }
                ]
            })
        });
        setStatus(`模型连接成功\n${typeof payload?.choices?.[0]?.message?.content === 'string' ? payload.choices[0].message.content : '已收到响应'}`);
    }

    async function testComfy() {
        readForm();
        const baseUrl = settings.comfy.baseUrl.replace(/\/+$/, '');
        let payload;
        try {
            payload = await safeJson(`${baseUrl}/system_stats`);
        } catch {
            payload = await safeJson(`${baseUrl}/queue`);
        }
        renderWorkflowSelect();
        setStatus(`ComfyUI 连接成功\n${JSON.stringify(payload).slice(0, 180)}...`);
    }

    function extractWorldInfo(context) {
        const values = [context?.chatMetadata?.world_info, context?.chatMetadata?.worldInfo, context?.worldInfo, context?.selectedWorldInfo];
        return values.filter(Boolean).map(item => typeof item === 'string' ? item : JSON.stringify(item, null, 2)).join('\n\n');
    }

    function collectCharacterPayload() {
        const context = getContext();
        const character = Number.isInteger(context?.characterId) ? context.characters?.[context.characterId] : null;
        return {
            name: character?.name || '',
            description: character?.description || character?.data?.description || '',
            personality: character?.personality || character?.data?.personality || '',
            scenario: character?.scenario || character?.data?.scenario || '',
            firstMes: character?.first_mes || character?.data?.first_mes || '',
            mesExample: character?.mes_example || character?.data?.mes_example || '',
            extensions: character?.data?.extensions || {},
            worldInfo: extractWorldInfo(context)
        };
    }

    function collectRecentMessages(limit = 20) {
        const chat = getContext()?.chat || [];
        return chat.slice(-limit).map(item => ({
            role: item.is_user ? 'user' : 'assistant',
            name: item.name || '',
            content: item.mes || ''
        }));
    }

    async function callJsonLlm(systemPrompt, userPrompt) {
        readForm();
        const baseUrl = settings.llm.baseUrl.replace(/\/+$/, '');
        const payload = await safeJson(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: getHeaders(settings.llm.apiKey),
            body: JSON.stringify({
                model: settings.llm.model,
                temperature: settings.llm.temperature,
                max_tokens: settings.llm.maxTokens,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ]
            })
        });
        const content = payload?.choices?.[0]?.message?.content;
        return typeof content === 'string' ? JSON.parse(content) : JSON.parse((content || []).map(item => item.text || '').join(''));
    }

    async function buildCharacterAnchor() {
        settings.cache.characterAnchor = await callJsonLlm(
            'Return JSON only. Summarize stable appearance anchors for image generation with fields identityAnchor, styleAnchor, negativeAnchor, consistencyPrompt, negativePrompt.',
            JSON.stringify(collectCharacterPayload(), null, 2)
        );
        saveSettings(settings);
        setStatus('角色锚点已生成');
    }

    async function buildSceneSummary() {
        settings.cache.sceneSummary = await callJsonLlm(
            'Return JSON only. Summarize the recent chat into a visual scene state with fields sceneSummary, visualFocus, camera, mood, environment, pose, positivePrompt, negativePrompt.',
            JSON.stringify({ messages: collectRecentMessages(20) }, null, 2)
        );
        saveSettings(settings);
        setStatus('场景摘要已生成');
    }

    async function composePrompt() {
        const loras = JSON.parse(settings.promptState.lorasJson || '[]');
        const composed = await callJsonLlm(
            'Return JSON only. Compose positivePrompt and negativePrompt for image generation from character anchor and scene summary.',
            JSON.stringify({ characterAnchor: settings.cache.characterAnchor, sceneSummary: settings.cache.sceneSummary, loras }, null, 2)
        );
        settings.promptState.positive = composed.positivePrompt || '';
        settings.promptState.negative = composed.negativePrompt || '';
        saveSettings(settings);
        renderState();
        activateTab('prompt');
        setStatus('最终提示词已生成');
    }

    function inferMappings(workflow) {
        const mapping = {};
        const push = (key, value) => { (mapping[key] ||= []).push(value); };
        let clipIndex = 0;

        for (const [nodeId, node] of Object.entries(workflow || {})) {
            for (const [inputName, inputValue] of Object.entries(node.inputs || {})) {
                if (typeof inputValue === 'string') {
                    const match = inputValue.match(/^\{\{([a-zA-Z0-9_]+)\}\}$/);
                    if (match) push(match[1], { nodeId, input: inputName });
                }
            }

            const classType = String(node.class_type || '').toLowerCase();
            const title = String(node?._meta?.title || '').toLowerCase();

            if (classType.includes('cliptextencode')) {
                push(title.includes('negative') || clipIndex > 0 ? 'negativePrompt' : 'prompt', { nodeId, input: 'text' });
                clipIndex += 1;
            }
            if (classType.includes('emptylatentimage')) {
                push('width', { nodeId, input: 'width' });
                push('height', { nodeId, input: 'height' });
                push('batchSize', { nodeId, input: 'batch_size' });
            }
            if (classType.includes('ksampler')) {
                push('seed', { nodeId, input: 'seed' });
                push('steps', { nodeId, input: 'steps' });
                push('cfg', { nodeId, input: 'cfg' });
                push('sampler', { nodeId, input: 'sampler_name' });
                push('scheduler', { nodeId, input: 'scheduler' });
            }
        }

        return mapping;
    }

    function applyMapped(workflow, entries, value) {
        if (value === undefined) return;
        (entries || []).forEach(entry => {
            if (workflow[entry.nodeId]?.inputs) {
                workflow[entry.nodeId].inputs[entry.input] = value;
            }
        });
    }

    function prepareWorkflow() {
        readForm();
        const selected = getSelectedWorkflow();
        const workflow = JSON.parse(JSON.stringify(selected.workflow));
        const mapping = Object.assign(inferMappings(workflow), JSON.parse(settings.promptState.mappingJson || '{}'));
        const loras = JSON.parse(settings.promptState.lorasJson || '[]');
        const inlineLora = loras.filter(item => item?.name).map(item => `<lora:${item.name}:${item.weight ?? 1}>`).join(', ');
        const finalPositive = [settings.promptState.positive, inlineLora].filter(Boolean).join(', ');

        applyMapped(workflow, mapping.prompt, finalPositive);
        applyMapped(workflow, mapping.negativePrompt, settings.promptState.negative);
        applyMapped(workflow, mapping.width, settings.defaults.width);
        applyMapped(workflow, mapping.height, settings.defaults.height);
        applyMapped(workflow, mapping.batchSize, settings.defaults.batchSize);
        applyMapped(workflow, mapping.steps, settings.defaults.steps);
        applyMapped(workflow, mapping.cfg, settings.defaults.cfg);
        applyMapped(workflow, mapping.sampler, settings.defaults.sampler);
        applyMapped(workflow, mapping.scheduler, settings.defaults.scheduler);
        applyMapped(workflow, mapping.seed, settings.defaults.seed);

        return { workflow, finalPositive };
    }

    async function generateImage() {
        const { workflow, finalPositive } = prepareWorkflow();
        const baseUrl = settings.comfy.baseUrl.replace(/\/+$/, '');
        const queued = await safeJson(`${baseUrl}/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: workflow, client_id: `gen-master-${Date.now()}` })
        });

        const promptId = queued.prompt_id;
        const startedAt = Date.now();
        let image = null;

        while (!image && Date.now() - startedAt < settings.comfy.timeoutMs) {
            const history = await safeJson(`${baseUrl}/history/${encodeURIComponent(promptId)}`);
            const outputs = history?.[promptId]?.outputs || {};
            for (const output of Object.values(outputs)) {
                if (Array.isArray(output?.images) && output.images[0]) {
                    image = output.images[0];
                    break;
                }
            }
            if (!image) {
                await new Promise(resolve => setTimeout(resolve, settings.comfy.pollIntervalMs));
            }
        }

        if (!image) {
            throw new Error('等待 ComfyUI 出图超时');
        }

        const viewUrl = `${baseUrl}/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder || '')}&type=${encodeURIComponent(image.type || 'output')}`;
        const container = document.getElementById('gm-image');
        if (container) {
            container.innerHTML = `<img src="${viewUrl}" alt="generated image" /><div class="gm-caption">${escapeHtml(finalPositive)}</div>`;
        }

        setStatus(`生图完成\nPrompt ID: ${promptId}`);
    }

    function saveCustomWorkflow() {
        readForm();
        const name = settings.promptState.customWorkflowName.trim();
        if (!name) throw new Error('请先填写自定义工作流名称');
        const workflow = JSON.parse(settings.promptState.customWorkflowJson);
        const id = `custom:${name.replace(/\s+/g, '-').toLowerCase()}`;
        settings.comfy.customWorkflows = (settings.comfy.customWorkflows || []).filter(item => item.id !== id).concat([{ id, name, workflow }]);
        settings.comfy.selectedWorkflowId = id;
        saveSettings(settings);
        renderWorkflowSelect();
        setStatus(`已保存自定义工作流：${name}`);
    }

    function loadSelectedWorkflowJson() {
        const selected = getSelectedWorkflow();
        settings.promptState.customWorkflowName = selected.name;
        settings.promptState.customWorkflowJson = JSON.stringify(selected.workflow, null, 2);
        saveSettings(settings);
        renderState();
        setStatus(`已载入工作流 JSON：${selected.name}`);
    }

    function bindUi(modal) {
        modal.querySelectorAll('.gm-tab').forEach(node => node.addEventListener('click', () => activateTab(node.dataset.tab)));
        modal.querySelector('#gm-model-select')?.addEventListener('change', event => {
            settings.llm.model = event.target.value || '';
            saveSettings(settings);
            renderState();
        });

        const bind = (selector, handler) => modal.querySelector(selector)?.addEventListener('click', async () => {
            try {
                setStatus('处理中...');
                await handler();
            } catch (error) {
                const message = normalizeError(error);
                setStatus(message, true);
                toast('error', message);
            }
        });

        bind('#gm-save', async () => { readForm(); setStatus('设置已保存'); });
        bind('#gm-fetch-models', fetchModels);
        bind('#gm-test-llm', testLlm);
        bind('#gm-test-comfy', testComfy);
        bind('#gm-refresh-workflows', async () => { readForm(); renderWorkflowSelect(); setStatus(`已加载 ${getWorkflows().length} 个工作流`); });
        bind('#gm-save-workflow', async () => saveCustomWorkflow());
        bind('#gm-load-workflow', async () => loadSelectedWorkflowJson());
        bind('#gm-anchor', buildCharacterAnchor);
        bind('#gm-scene', buildSceneSummary);
        bind('#gm-compose', composePrompt);
        bind('#gm-generate', generateImage);
    }

    function ensureInteractiveModal() {
        const modal = ensureModal();
        if (!modal) return null;
        if (!modal.dataset.bound) {
            bindUi(modal);
            modal.dataset.bound = 'true';
        }
        return modal;
    }

    function openFromMenu(defaultTab = 'basic') {
        const options = document.getElementById('options');
        if (options) {
            options.style.display = 'none';
        }
        openPanel(defaultTab);
    }

    function ensureMenuItem() {
        if (typeof window.jQuery === 'function') {
            const $ = window.jQuery;
            if ($('#extensionsMenu').length === 0) return false;
            if (!$(`#${MENU_ID}`).length) {
                const $item = $(
                    `<div class="list-group-item flex-container flexGap5 interactable" id="${MENU_ID}">
                        <div class="fa-fw fa-solid fa-wand-magic-sparkles"></div>
                        <span>${APP_NAME}</span>
                    </div>`
                );
                $item.on('click', () => openFromMenu('basic'));
                $('#extensionsMenu').append($item);
            }
            return true;
        }

        const root = document.querySelector('#extensionsMenu');
        if (!root) return false;
        if (!document.getElementById(MENU_ID)) {
            const item = document.createElement('div');
            item.id = MENU_ID;
            item.className = 'list-group-item flex-container flexGap5 interactable';
            item.innerHTML = `<div class="fa-fw fa-solid fa-wand-magic-sparkles"></div><span>${APP_NAME}</span>`;
            item.addEventListener('click', () => openFromMenu('basic'));
            root.appendChild(item);
        }
        return true;
    }

    function appendScriptButtons() {
        const scriptId = getScriptIdSafe();

        if (typeof appendInexistentScriptButtons === 'function') {
            try {
                if (scriptId && appendInexistentScriptButtons.length >= 2) {
                    appendInexistentScriptButtons(scriptId, SCRIPT_BUTTONS);
                } else {
                    appendInexistentScriptButtons(SCRIPT_BUTTONS);
                }
                return true;
            } catch (error) {
                try {
                    appendInexistentScriptButtons(SCRIPT_BUTTONS);
                    return true;
                } catch (fallbackError) {
                    console.warn(`[${APP_NAME}] 追加脚本按钮失败`, fallbackError);
                }
            }
        }

        if (typeof replaceScriptButtons === 'function') {
            let existingButtons = [];

            if (typeof getScriptButtons === 'function') {
                try {
                    existingButtons = scriptId && getScriptButtons.length >= 1
                        ? (getScriptButtons(scriptId) || [])
                        : (getScriptButtons() || []);
                } catch (error) {
                    try {
                        existingButtons = getScriptButtons() || [];
                    } catch {
                        existingButtons = [];
                    }
                }
            }

            const mergedButtons = [...existingButtons];
            SCRIPT_BUTTONS.forEach(button => {
                if (!mergedButtons.some(item => item?.name === button.name)) {
                    mergedButtons.push(button);
                }
            });

            try {
                if (scriptId && replaceScriptButtons.length >= 2) {
                    replaceScriptButtons(scriptId, mergedButtons);
                } else {
                    replaceScriptButtons(mergedButtons);
                }
                return true;
            } catch (error) {
                try {
                    replaceScriptButtons(mergedButtons);
                    return true;
                } catch (fallbackError) {
                    console.warn(`[${APP_NAME}] 替换脚本按钮失败`, fallbackError);
                }
            }
        }

        return false;
    }

    function bindScriptButton(buttonName, actionKey, handler) {
        if (typeof getButtonEvent !== 'function' || typeof eventOn !== 'function') {
            return false;
        }

        runtime.actions[actionKey] = handler;

        if (runtime.boundEvents.has(buttonName)) {
            return true;
        }

        try {
            const buttonEvent = getButtonEvent(buttonName);
            eventOn(buttonEvent, async () => {
                const activeRuntime = globalThis[RUNTIME_KEY];
                const action = activeRuntime?.actions?.[actionKey];
                if (typeof action !== 'function') {
                    return;
                }

                await action();
            });
            runtime.boundEvents.add(buttonName);
            return true;
        } catch (error) {
            console.warn(`[${APP_NAME}] 绑定按钮事件失败: ${buttonName}`, error);
            return false;
        }
    }

    function ensureScriptButtons() {
        appendScriptButtons();
        const mainBound = bindScriptButton(APP_NAME, 'open-panel', async () => {
            openFromMenu('basic');
        });
        const manualBound = bindScriptButton(MANUAL_PROMPT_BUTTON_NAME, 'manual-prompt', async () => {
            try {
                openFromMenu('prompt');
                setStatus('处理中...');
                await buildCharacterAnchor();
                await buildSceneSummary();
                await composePrompt();
            } catch (error) {
                const message = normalizeError(error);
                setStatus(message, true);
                toast('error', message);
            }
        });

        return mainBound && manualBound;
    }

    function clearBootTimer() {
        if (runtime.bootTimer) {
            clearInterval(runtime.bootTimer);
            runtime.bootTimer = null;
        }
    }

    function bootOnce() {
        syncScriptInfo();
        addStyle();
        const modal = ensureInteractiveModal();
        const buttonsReady = ensureScriptButtons();
        ensureMenuItem();
        if (modal && buttonsReady) {
            return true;
        }
        return false;
    }

    function boot() {
        if (bootOnce()) return;
        clearBootTimer();
        runtime.bootTimer = setInterval(() => {
            if (bootOnce()) {
                clearBootTimer();
            }
        }, 1000);
    }

    function dispose() {
        clearBootTimer();
    }

    runtime.dispose = dispose;
    globalThis[RUNTIME_KEY] = runtime;

    if (typeof window.jQuery === 'function') {
        window.jQuery(() => boot());
    } else if (document.readyState === 'loading') {
        window.addEventListener('load', boot, { once: true });
    } else {
        boot();
    }
    window.addEventListener('pagehide', dispose, { once: true });
})();
