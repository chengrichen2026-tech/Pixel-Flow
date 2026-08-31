import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const baseToken = "LHGPbg2XYag81as7YACcgEPtnIe";
const productTableId = "tbl6yv6yiBHY14nO";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = dirname(scriptDir);
const outputDir = join(projectDir, "imports", "2026-08-25-飞书产品库同步");
const imageDir = join(outputDir, "images");
mkdirSync(imageDir, { recursive: true });

function run(args, options = {}) {
  return execFileSync("lark-cli", args, { encoding: "utf8", ...options });
}

function safeName(value) {
  return String(value || "未命名").replace(/[\\/:*?"<>|]/g, "-").trim();
}

function mimeType(path) {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

const payload = JSON.parse(run([
  "base", "+record-list", "--base-token", baseToken, "--table-id", productTableId,
  "--field-id", "产品序号", "--field-id", "产品名称", "--field-id", "包装盒", "--field-id", "铝箔",
  "--limit", "200", "--as", "user", "--format", "json",
]));
if (!payload.ok || payload.data.has_more) throw new Error("产品库读取失败或记录未完整分页");

const rows = payload.data.record_id_list.map((recordId, index) => ({
  recordId,
  values: Object.fromEntries(payload.data.fields.map((field, fieldIndex) => [field, payload.data.data[index][fieldIndex]])),
}));

const assets = [];
const media = [];
for (const row of rows) {
  const productId = row.values["产品序号"] || row.recordId;
  const productName = row.values["产品名称"] || "未命名产品";
  for (const field of ["包装盒", "铝箔"]) {
    const attachments = row.values[field] || [];
    for (let index = 0; index < attachments.length; index += 1) {
      const attachment = attachments[index];
      const extension = extname(attachment.name || "") || ".png";
      const suffix = attachments.length > 1 ? `-${index + 1}` : "";
      const filename = `${safeName(productId)}-${field}${suffix}${extension}`;
      run([
        "base", "+record-download-attachment", "--base-token", baseToken, "--table-id", productTableId,
        "--record-id", row.recordId, "--file-token", attachment.file_token, "--output", `./${filename}`,
        "--as", "user", "--overwrite",
      ], { cwd: imageDir });
      const path = join(imageDir, filename);
      const assetId = `feishu-product-asset-${productId}-${field}-${index + 1}`;
      const mediaId = `feishu-product-media-${productId}-${field}-${index + 1}`;
      const label = attachments.length > 1 ? `${field} ${index + 1}` : field;
      assets.push({ id: assetId, dataUrl: `data:${mimeType(path)};base64,${readFileSync(path).toString("base64")}` });
      media.push({
        id: mediaId,
        kind: "product",
        name: `${productId}｜${productName}｜${label}`,
        assetId,
        source: { baseToken, tableId: productTableId, recordId: row.recordId, field, fileToken: attachment.file_token },
      });
    }
  }
}

const output = {
  version: 1,
  kind: "pixel-flow-asset-library",
  exportedAt: new Date().toISOString(),
  library: { prompts: [], presets: { copy: [], background: [], composition: [] }, media, templates: [] },
  assets,
};
const outputPath = join(outputDir, "Pixel-Flow-飞书产品素材同步-2026-08-25.json");
writeFileSync(outputPath, JSON.stringify(output));
console.log(JSON.stringify({ outputPath, productCount: rows.length, mediaCount: media.length, assetCount: assets.length }));
