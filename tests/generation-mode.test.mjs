import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("browser runs wait for an in-flight mode save", async () => {
  const source = await readFile(new URL("production/generation-mode.js", root), "utf8");
  assert.match(source, /const pendingModeSave = modeSavePromises\.get\(key\)/);
  assert.match(source, /if \(selectedMode !== "api" && !pendingModeSave\) return/);
  assert.match(source, /await pendingModeSave/);
});

test("a new run clears stale status detail before queueing", async () => {
  const source = await readFile(new URL("public/background.js", root), "utf8");
  assert.match(source, /status: "queued",\s*detail: void 0/);
});

test("manual-action errors prefer the concrete conversation URL reported by the page", async () => {
  const source = await readFile(new URL("public/background.js", root), "utf8");
  assert.match(source, /concreteChatGptConversationUrl\(message\.conversationUrl\) \?\? concreteChatGptConversationUrl\(senderUrl\)/);
});

test("opening a task recovers from a stale tab mapping", async () => {
  const source = await readFile(new URL("public/background.js", root), "utf8");
  assert.match(source, /expectedUrl === "https:\/\/chatgpt\.com\/" && liveConversationUrl/);
  assert.match(source, /if \(!\(error instanceof ConversationUnavailableError\)\) throw error/);
  assert.match(source, /this\.taskTabs\.set\(taskId, \{ conversationUrl: conversationUrl \?\? previous\?\.conversationUrl \}\)/);
});

test("ChatGPT temporary generation errors retry automatically with a hard limit", async () => {
  const source = await readFile(new URL("public/contentScript.js", root), "utf8");
  assert.match(source, /function findTemporaryRetryButton\(\)/);
  assert.match(source, /const retryButton = !isGenerating \? findTemporaryRetryButton\(\) : void 0/);
  assert.match(source, /if \(automaticRetryCount >= 2\)/);
  assert.match(source, /retryButton\.click\(\)/);
});

test("manual send keeps the task alive until the user submits and the result returns", async () => {
  const content = await readFile(new URL("public/contentScript.js", root), "utf8");
  const background = await readFile(new URL("public/background.js", root), "utf8");
  const modeUi = await readFile(new URL("production/generation-mode.js", root), "utf8");
  assert.match(content, /await input\.onManualAction\?\.\(\)/);
  assert.match(content, /10 \* 6e4/);
  assert.match(background, /else if \(message\.type === "TASK_ERROR"\)/);
  assert.match(modeUi, /task-status\[data-status="manual_action"\]/);
});

test("a new ChatGPT conversation URL gets a hydration grace period before rejection", async () => {
  const source = await readFile(new URL("public/contentScript.js", root), "utf8");
  assert.match(source, /let pendingConversationStartedAt = 0/);
  assert.match(source, /Date\.now\(\) - pendingConversationStartedAt <= 15e3/);
  assert.match(source, /if \(!submittedTurnIsStillVisible\(previousUserTurnCount, prompt\)\)/);
});

test("API mode submits persistent jobs and reconnects with apiJobId", async () => {
  const source = await readFile(new URL("public/background.js", root), "utf8");
  const manifest = await readFile(new URL("public/manifest.json", root), "utf8");
  assert.match(source, /API_WORKER_URL = "http:\/\/127\.0\.0\.1:43129"/);
  assert.match(source, /apiJobId: jobId/);
  assert.match(source, /if \(task\?\.apiJobId\)/);
  assert.match(manifest, /http:\/\/127\.0\.0\.1:43129\/\*/);
});

test("API mode is the default unless a task explicitly chooses browser mode", async () => {
  const modeUi = await readFile(new URL("production/generation-mode.js", root), "utf8");
  const background = await readFile(new URL("public/background.js", root), "utf8");
  assert.match(modeUi, /generationMode === "browser" \? "browser" : "api"/);
  assert.match(modeUi, /saveTaskMode\(currentProjectId, currentTaskId, "api"\)/);
  assert.match(background, /if \(task\.generationMode !== "browser"\)/);
  assert.doesNotMatch(background, /if \(task\.generationMode === "api"\)/);
});

test("API mode wakes the MV3 service worker to poll persistent jobs", async () => {
  const source = await readFile(new URL("public/background.js", root), "utf8");
  const manifest = await readFile(new URL("public/manifest.json", root), "utf8");
  assert.match(manifest, /"alarms"/);
  assert.match(source, /API_POLL_ALARM_NAME = "pixel-flow-api-poll"/);
  assert.match(source, /chrome\.alarms\.onAlarm\.addListener/);
  assert.match(source, /void processApiPollCycle\(\)/);
  assert.match(source, /then\(\(\) => processApiPollCycle\(\)\)/);
  assert.doesNotMatch(source, /function waitForApiWorkerJob/);
  assert.doesNotMatch(source, /const images = await waitForApiWorkerJob\(jobId\)/);
});

test("API mode does not show normal progress as red status detail", async () => {
  const source = await readFile(new URL("public/background.js", root), "utf8");
  assert.match(source, /status: "sending", detail: void 0/);
  assert.match(source, /status: "generating", detail: void 0, apiJobId: jobId/);
  assert.doesNotMatch(source, /API 任务已由本机服务持久执行/);
  assert.doesNotMatch(source, /正在向本机 API 任务服务提交请求/);
  assert.doesNotMatch(source, /已重连本机 API 任务/);
});

test("switching to browser mode clears inherited API job state", async () => {
  const modeUi = await readFile(new URL("production/generation-mode.js", root), "utf8");
  const background = await readFile(new URL("public/background.js", root), "utf8");
  assert.match(modeUi, /mode === "browser" \? \{ apiJobId: void 0, statusDetail: void 0 \}/);
  assert.match(modeUi, /\["queued", "waiting_page", "uploading", "sending", "generating", "manual_action"\]\.includes\(activeStatus\)/);
  assert.match(background, /message\.clearApiJobId \? void 0/);
});

test("browser results preserve the original latest-assistant-turn writeback path", async () => {
  const source = await readFile(new URL("public/contentScript.js", root), "utf8");
  assert.match(source, /const images = \[\.\.\.latest\.querySelectorAll\("img"\)\]/);
  assert.doesNotMatch(source, /existingImageSources/);
  assert.doesNotMatch(source, /collectGeneratedImageSources/);
  assert.match(source, /isTransientResponseText\(responseText\) \? "" : responseText/);
});

test("reinjected ChatGPT adapter replaces a stale page listener after extension reload", async () => {
  const content = await readFile(new URL("public/contentScript.js", root), "utf8");
  const background = await readFile(new URL("public/background.js", root), "utf8");
  assert.match(content, /CHATGPT_ADAPTER_VERSION = 15/);
  assert.match(background, /CHATGPT_ADAPTER_VERSION = 15/);
  assert.match(content, /__gptNodeCanvasMessageListener/);
  assert.match(content, /removeListener\(previousMessageListener\)/);
  assert.match(content, /addListener\(currentMessageListener\)/);
  assert.doesNotMatch(content, /if \(contentScriptScope\.__gptNodeCanvasAdapterVersion !== CHATGPT_ADAPTER_VERSION\)/);
});

test("hidden ChatGPT tabs receive page activity signals while reference images upload", async () => {
  const content = await readFile(new URL("public/contentScript.js", root), "utf8");
  assert.match(content, /function signalBackgroundPageActivity\(\)/);
  assert.match(content, /const uploadStartedAt = Date\.now\(\)/);
  assert.match(content, /Date\.now\(\) - uploadStartedAt > 6e4/);
  assert.match(content, /document\.hidden && Date\.now\(\) - lastBackgroundWake > 1500/);
  assert.match(content, /signalBackgroundPageActivity\(\)/);
});

test("images can be dropped onto the canvas at the pointer position", async () => {
  const build = await readFile(new URL("scripts/build-extension.mjs", root), "utf8");
  const manifest = await readFile(new URL("public/manifest.json", root), "utf8");
  assert.match(build, /onDrop:async H=>/);
  assert.match(build, /f\.pasteImage\(O,m\(\{x:H\.clientX,y:H\.clientY\}\)\)/);
  assert.match(build, /text\/uri-list/);
  assert.match(manifest, /https:\/\/\*\.oaiusercontent\.com\/\*/);
});

test("trackpad pan works over prompt text and left-drag creates a partial selection box", async () => {
  const build = await readFile(new URL("scripts/build-extension.mjs", root), "utf8");
  assert.match(build, /selectionOnDrag:!0,selectionMode:\"partial\",panOnDrag:\[1,2\],panOnScroll:!0/);
  assert.match(build, /\['task-prompt nodrag nowheel', 'task-prompt nodrag'\]/);
});

test("hidden ChatGPT task tabs receive internal refresh signals without foreground activation", async () => {
  const content = await readFile(new URL("public/contentScript.js", root), "utf8");
  const background = await readFile(new URL("public/background.js", root), "utf8");
  assert.match(content, /document\.hidden && Date\.now\(\) - started > 15e3/);
  assert.match(content, /function signalBackgroundPageActivity\(\)/);
  assert.match(content, /window\.dispatchEvent\(new Event\("focus"\)\)/);
  assert.match(content, /document\.dispatchEvent\(new Event\("visibilitychange"\)\)/);
  assert.doesNotMatch(content, /WAKE_TASK_TAB/);
  assert.doesNotMatch(background, /pulseTaskTab|WAKE_TASK_TAB/);
  assert.match(background, /message\.type === "TASK_STATUS" \|\| message\.type === "TASK_RESULT"/);
});

test("Windows API Worker has install, start, uninstall, and health-check scripts", async () => {
  const packageJson = await readFile(new URL("package.json", root), "utf8");
  const install = await readFile(new URL("api-worker/install-windows.ps1", root), "utf8");
  const start = await readFile(new URL("api-worker/start-windows.ps1", root), "utf8");
  const uninstall = await readFile(new URL("api-worker/uninstall-windows.ps1", root), "utf8");
  assert.match(packageJson, /api-worker:install:windows/);
  assert.match(packageJson, /api-worker:start:windows/);
  assert.match(packageJson, /api-worker:uninstall:windows/);
  assert.match(install, /\[Environment\]::GetFolderPath\("Startup"\)/);
  assert.match(install, /Node\.js 20 or newer/);
  assert.match(start, /Invoke-RestMethod -Uri \$healthUrl/);
  assert.match(start, /api-worker\.windows\.pid/);
  assert.match(uninstall, /Get-CimInstance Win32_Process/);
  assert.match(uninstall, /CommandLine\.Contains\(\$serverPath\)/);
});
