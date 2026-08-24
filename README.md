# Pixel Flow

Pixel Flow 是一个基于 Chrome Manifest V3 的 AI 创意任务画布，通过节点组织图片、文字、生成任务和结果。它兼容两种生图方式：浏览器模式复用已登录的 ChatGPT 网页账号；API Key 模式通过本机 Pixel Flow API Worker 调用已配置的图片接口。每张任务卡都可以独立选择模式。

## 开发

```bash
npm install
npm run dev
npm run check
npm run build
```

`npm run build` 会把“原版 v0.2.3 画布逻辑＋Pixel Flow 主题＋适配器修复”输出到 `扩展程序/`。在 Chrome 的扩展管理页点击一次“重新加载”，即可使用新版本。

`npm run build:rebuild-preview` 只构建 TypeScript 重建预览，不会覆盖生产扩展。重建模块只有在行为回归通过后才能进入生产版。

## 目录

- `src/`：逐模块迁移用的 React、TypeScript 重建工程，不直接替换生产画布。
- `production/`：生产版入口与纯视觉主题；继续调用原版成熟画布逻辑。
- `public/manifest.json`：扩展清单源文件。
- `public/background.js`：当前后台调度兼容层。
- `public/contentScript.js`：当前 ChatGPT 页面适配器兼容层。
- `legacy/`：原 v0.2.3 打包脚本的只读基线，用于比对和回归。
- `扩展程序/`：Chrome 实际加载的构建产物，不作为后续功能开发入口。

## 数据兼容

数据库继续使用 `gpt-node-canvas`，表结构仍是 `projects / assets / runs`。重建源码和重新加载扩展不会主动删除现有画布数据。

## 当前迁移状态

- 生产 UI 行为继续使用原版 v0.2.3 构建资产，品牌与视觉由 `production/pixel-flow-theme.css` 覆盖。
- UI、节点组件和状态层已在 `src/` 建立迁移源码，但必须逐模块完成行为对照后才能进入生产。
- 后台任务调度与 ChatGPT 页面适配器暂时保留为兼容脚本，已纳入工程构建。
- 新功能优先写入 `src/`；修改 ChatGPT 页面适配时编辑 `public/contentScript.js`，不要直接改 `扩展程序/`。

## Mac 交互

- 触控板双指平行滑动：以默认约 2 倍速度平移画布。
- 触控板双指并拢或张开：缩小或放大画布。
- 左下角缩放按钮仍可使用。
- 选中模块后按 `Backspace` 或 `Delete`：删除模块。
- 光标位于输入框、文本框或可编辑内容时，`Backspace` 只删除文字，不删除模块。

## Windows 支持

- 支持 Chrome 和 Edge 的未打包扩展加载。
- `Ctrl+V` 粘贴图片、`Ctrl+Z` 撤销删除、`Ctrl+C` 复制文字结果。
- `Backspace` 或 `Delete` 删除已选模块；输入框内的退格编辑不受影响。
- 浏览器生图无需安装本地 Worker。
- API Key 生图需先安装 Node.js 20+，再运行 `npm run api-worker:install:windows`；它会为当前用户创建无需管理员权限的登录自启入口。
- 手动启动：`npm run api-worker:start:windows`。
- 卸载自启并停止 Worker：`npm run api-worker:uninstall:windows`。

## 生图模式

- 每张任务卡可选择 `浏览器` 或 `API Key`，默认使用原版浏览器模式。
- API 模式在顶部“API 设置”中保存 Key；Key 只进入 `chrome.storage.local`，不会写入项目、备份、日志或源码。
- 无参考图：`POST https://aihub.rbmanon.cn/v1/images/generations`。
- 有参考图：`POST https://aihub.rbmanon.cn/v1/images/edits`，使用 JSON `images[].image_url` Base64 Data URL；该网关不接受 multipart。
- 模型固定 `gpt-image-2`，质量固定 `medium`；尺寸采用网关已验证的 16 像素倍数，例如 9:16 为 720×1280、16:9 为 1280×720。
- API 模式会把提示词和参考图片发送到 `aihub.rbmanon.cn`，结果仍写回原版 IndexedDB 画布和结果节点。
- API 请求最多等待 7 分钟；超时后任务失败并显示原因，不再永久停留在“生成中”。
- 扩展重载时发现中断的 API 任务，会标记失败且不自动重试，避免重复计费。
