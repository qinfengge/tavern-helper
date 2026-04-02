# 酒馆助手脚本版

这个目录是“生图大师”的 TavernHelper / JS-Slash-Runner 版本，不依赖 SillyTavern 前端扩展。

## 文件

- [gen-master.js](./gen-master.js): 可被 `import` 的主脚本
- [script.example.json](./script.example.json): 可导入到酒馆助手脚本库的示例配置

## 使用方式

1. 将 `gen-master.js` 上传到你自己的 CDN、对象存储或可直链访问的位置。
2. 把 `script.example.json` 里的 `content` 地址替换成你的实际脚本地址。
3. 在酒馆助手 / JS-Slash-Runner 中导入该脚本配置，或手动新建脚本后填入同样的 `import` 语句。

## 当前实现

- 使用脚本变量 API 保存配置，失败时回退到 `localStorage`
- 自动添加“生图大师”菜单入口
- 自动注册“生图大师”与“手动生词”脚本按钮
- 自定义 LLM 模型列表获取
- ComfyUI 连接测试
- 内置 `Z-Image-Turbo` 工作流
- 自定义工作流 JSON 保存与选择
- 角色卡 / 世界书 / 当前聊天摘要
- 最终提示词组合与 ComfyUI 出图
