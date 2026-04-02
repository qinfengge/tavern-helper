# 酒馆助手脚本版

`tavern-helper` 现在是项目主线实现，目标宿主是酒馆助手 / JS-Slash-Runner，不再依赖 `ui-extension`。

## 入口说明

- 主入口在左下角魔棒工具菜单内，和“生图助手”同一层级。
- 同时也会注册酒馆助手脚本按钮：`生图大师`、`手动生词`。
- 入口不在 SillyTavern 扩展列表。

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

## 远程地址要求

- 远程 `gen-master.js` 必须以 JavaScript 模块 MIME type 返回，例如 `text/javascript` 或 `application/javascript`。
- 如果服务器返回的是 `text/plain`，浏览器会直接报错：
  `Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/plain".`
- 这类报错出现时，脚本根本不会执行，入口自然也不会显示。

## 推荐地址

- 如果你直接使用 GitHub 仓库，优先用 jsDelivr，而不是 `raw` 地址。
- 当前仓库可直接使用：
  `https://cdn.jsdelivr.net/gh/qinfengge/tavern-helper@main/gen-master.js`
- 如果你使用阿里云 OSS / 自建静态服务，请把该文件的 `Content-Type` 改为 `text/javascript`。

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
