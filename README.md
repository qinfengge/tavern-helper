# 酒馆助手脚本版

`tavern-helper` 现在是项目主线实现，目标宿主是酒馆助手 / JS-Slash-Runner，不再依赖 `ui-extension`。

## 入口说明

- 入口在“酒馆助手 -> 脚本按钮”，不是 SillyTavern 扩展列表。
- 启用脚本后应看到两个按钮：`生图大师`、`手动生词`。
- 脚本同时会尝试在页面菜单里追加一个 `生图大师` 入口，但这只是补充入口，不是主入口。

## 文件

- [gen-master.js](./gen-master.js): 可被 `import` 的主脚本
- [script.example.json](./script.example.json): 可直接导入酒馆助手脚本库的示例配置

## 使用方式

1. 将 [gen-master.js](./gen-master.js) 上传到你自己的 CDN、对象存储或任意可直链访问的位置。
2. 把 [script.example.json](./script.example.json) 中的远程地址替换成你的实际脚本地址。
3. 在酒馆助手 / JS-Slash-Runner 中导入该 JSON，或手动新建脚本并填入同样的 `import` 语句。
4. 在脚本库里确认：
   - 脚本本身已启用
   - `button.enabled` 已启用
   - 两个按钮都可见

## 当前实现

- 使用酒馆助手脚本变量 API 保存配置，失败时回退到 `localStorage`
- 兼容 `script_id` 版本的脚本 API，优先按文档使用 `getScriptId()`
- 自动注册 `生图大师` 与 `手动生词` 脚本按钮
- 自定义 OpenAI-compatible LLM 模型列表获取与连通性测试
- ComfyUI 连接测试
- 内置 `Z-Image-Turbo` 工作流
- 自定义工作流 JSON 保存与选择
- 角色卡 / 世界书 / 当前聊天摘要
- 最终提示词组合与 ComfyUI 出图
