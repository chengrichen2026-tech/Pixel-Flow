# Pixel Flow 架构

## 运行链路

`浏览器模式：React 画布 → background 调度队列 → ChatGPT 标签页 → contentScript → IndexedDB → React 画布`

`API 模式：React 画布 → background 提交本机任务 → 127.0.0.1:43129 常驻 API Worker → 本地任务结果 → background 轮询/重连 → IndexedDB → React 画布`

## 稳定边界

- 生产画布逻辑：原版 `扩展程序/assets/index-DBuGHJ6j.js`、`flow-CkYuQltV.js`、`state-DM-FwQ-q.js`
- 生产品牌与视觉：`production/`
- 生图模式与 Key 设置 UI：`production/generation-mode.js`
- OpenAI 兼容 API 请求层：`public/api-client.js`
- API 模式执行：`public/background.js` 中复用原版任务队列、项目写入和结果节点逻辑
- API 持久执行：`api-worker/server.mjs`，任务文件位于 `runtime/api-jobs/`；macOS 使用动态生成的 LaunchAgent，Windows 使用当前用户启动文件夹与 PID 验证脚本
- 逐模块迁移源码：`src/`，未通过对照测试前不得替换生产逻辑
- 扩展权限和产品信息：`public/manifest.json`
- 后台调度兼容层：`public/background.js`
- ChatGPT DOM 适配：`public/contentScript.js`
- 构建产物：`扩展程序/`

## 数据

IndexedDB 名称为 `gpt-node-canvas`，版本 1：

- `projects: id, updatedAt, name`
- `assets: id, createdAt`
- `runs: id, [projectId+taskId], startedAt`

保持数据库名、版本和字段不变，是旧画布数据继续可用的必要条件。

## 后续优先重构

1. 先建立原版行为基线测试，再迁移对应 TypeScript 模块。
2. 将后台调度兼容层拆成 TypeScript 模块。
3. 为 ChatGPT DOM 适配器建立选择器探测与回归测试。
4. 增加备份导入、自动备份和迁移测试。
5. 每个迁移模块必须验证实时拖动、位置持久化、复制、连线、并发和结果回写没有回归。
