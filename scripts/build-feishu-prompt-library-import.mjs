import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const baseToken = "LHGPbg2XYag81as7YACcgEPtnIe";
const visualTableId = "tblanDsVX07dPwPI";
const compositionTableId = "tbl3LuvKI5277JdJ";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = dirname(scriptDir);
const outputDir = join(projectDir, "imports", "2026-08-25-飞书提示词库同步");
const imageDir = join(outputDir, "images");
mkdirSync(imageDir, { recursive: true });

function run(args, options = {}) {
  return execFileSync("lark-cli", args, { encoding: "utf8", ...options });
}

function listRecords(tableId, fields) {
  const args = ["base", "+record-list", "--base-token", baseToken, "--table-id", tableId];
  for (const field of fields) args.push("--field-id", field);
  args.push("--limit", "200", "--as", "user", "--format", "json");
  const payload = JSON.parse(run(args));
  if (!payload.ok || payload.data.has_more) throw new Error(`读取 ${tableId} 失败或结果未完整分页`);
  return payload.data.record_id_list.map((recordId, index) => ({
    recordId,
    values: Object.fromEntries(payload.data.fields.map((field, fieldIndex) => [field, payload.data.data[index][fieldIndex]])),
  }));
}

function mimeType(path) {
  return extname(path).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
}

function downloadAttachment(tableId, recordId, attachment, basename) {
  if (!attachment?.file_token) return null;
  const extension = extname(attachment.name || "") || ".png";
  const filename = `${basename}${extension}`;
  run([
    "base", "+record-download-attachment", "--base-token", baseToken, "--table-id", tableId,
    "--record-id", recordId, "--file-token", attachment.file_token, "--output", `./${filename}`,
    "--as", "user", "--overwrite",
  ], { cwd: imageDir });
  const path = join(imageDir, filename);
  return { path, dataUrl: `data:${mimeType(path)};base64,${readFileSync(path).toString("base64")}` };
}

const visualRows = listRecords(visualTableId, ["效果展示", "模板内容", "模版序号", "模版名称1", "视觉DNA类型", "执行路线"])
  .filter(({ values }) => values["模版名称1"] && values["模板内容"]);
const compositionRows = listRecords(compositionTableId, ["通用提示词", "构图名称", "案例图"])
  .filter(({ values }) => values["构图名称"] && values["通用提示词"]);

const assets = [];
const prompts = [];
for (const row of visualRows) {
  const sourceId = row.values["模版序号"] || row.recordId;
  const attachment = row.values["效果展示"]?.[0];
  const downloaded = downloadAttachment(visualTableId, row.recordId, attachment, sourceId);
  const assetId = downloaded ? `feishu-cover-${sourceId}` : "";
  if (downloaded) assets.push({ id: assetId, dataUrl: downloaded.dataUrl });
  prompts.push({
    id: `feishu-visual-${row.recordId}`,
    name: row.values["模版名称1"],
    content: row.values["模板内容"],
    tags: [/材质|精修/.test(row.values["模版名称1"]) || row.values["视觉DNA类型"]?.[0] === "材质变化" || row.values["执行路线"]?.[0] === "材质变化" || row.values["执行路线"]?.[0] === "产品精修白底图" ? "功能" : "模版"],
    ...(assetId ? { exampleAssetId: assetId } : {}),
    source: { baseToken, tableId: visualTableId, recordId: row.recordId },
  });
}

for (const row of compositionRows) {
  const attachment = row.values["案例图"]?.[0];
  const downloaded = downloadAttachment(compositionTableId, row.recordId, attachment, row.recordId);
  const assetId = downloaded ? `feishu-cover-${row.recordId}` : "";
  if (downloaded) assets.push({ id: assetId, dataUrl: downloaded.dataUrl });
  prompts.push({
    id: `feishu-composition-${row.recordId}`,
    name: row.values["构图名称"],
    content: row.values["通用提示词"],
    tags: ["构图"],
    ...(assetId ? { exampleAssetId: assetId } : {}),
    source: { baseToken, tableId: compositionTableId, recordId: row.recordId },
  });
}

const output = {
  version: 1,
  kind: "pixel-flow-asset-library",
  exportedAt: new Date().toISOString(),
  library: { promptSyncMode: "replace", prompts, presets: { copy: [], background: [], composition: [] }, media: [], templates: [] },
  assets,
};
const outputPath = join(outputDir, "Pixel-Flow-飞书提示词库同步-2026-08-25.json");
writeFileSync(outputPath, JSON.stringify(output));
console.log(JSON.stringify({ outputPath, promptCount: prompts.length, visualCount: visualRows.length, compositionCount: compositionRows.length, assetCount: assets.length }));
