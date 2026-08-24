import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "扩展程序");
await mkdir(output, { recursive: true });
await mkdir(resolve(output, "assets"), { recursive: true });
for (const file of ["manifest.json", "background.js", "contentScript.js", "api-client.js", "icon.svg"]) {
  await copyFile(resolve(root, "public", file), resolve(output, file));
}
await copyFile(resolve(root, "production", "index.html"), resolve(output, "index.html"));
await copyFile(resolve(root, "production", "pixel-flow-theme.css"), resolve(output, "pixel-flow-theme.css"));
await copyFile(resolve(root, "production", "keyboard-shortcuts.js"), resolve(output, "keyboard-shortcuts.js"));
await copyFile(resolve(root, "production", "generation-mode.js"), resolve(output, "generation-mode.js"));
for (const file of ["index-DBuGHJ6j.js", "index-6USAbLBJ.css", "flow-CkYuQltV.js", "icons-DDeef22D.js", "state-DM-FwQ-q.js"]) {
  await copyFile(resolve(root, "legacy", "ui", "assets", file), resolve(output, "assets", file));
}
await copyFile(resolve(root, "production", "brand-logo.png"), resolve(output, "brand-logo.png"));

const uiPath = resolve(output, "assets", "index-DBuGHJ6j.js");
let ui = await readFile(uiPath, "utf8");
const patches = [
  ['zoomOnDoubleClick:!1,selectionOnDrag:!1,panOnDrag:[0,1,2]', 'zoomOnDoubleClick:!1,selectionOnDrag:!0,selectionMode:"partial",panOnDrag:[1,2],panOnScroll:!0,panOnScrollSpeed:1,zoomOnScroll:!1,zoomOnPinch:!0'],
  ['task-prompt nodrag nowheel', 'task-prompt nodrag'],
  ['ref:U,className:"flow-stage",children:', 'ref:U,className:"flow-stage",onDragOver:H=>{H.preventDefault(),H.currentTarget.classList.add("is-dragging-image")},onDragLeave:H=>{H.currentTarget===H.target&&H.currentTarget.classList.remove("is-dragging-image")},onDrop:async H=>{H.preventDefault(),H.currentTarget.classList.remove("is-dragging-image");let O=[...H.dataTransfer.files].find(V=>V.type.startsWith("image/"));if(!O){const V=H.dataTransfer.getData("text/uri-list").split("\\n").find(_=>/^https?:\\/\\//.test(_.trim()))?.trim();if(V)try{const _=await fetch(V),cl=await _.blob();cl.type.startsWith("image/")&&(O=new File([cl],"dragged-image."+(cl.type.split("/")[1]||"png"),{type:cl.type}))}catch{}}O&&f.pasteImage(O,m({x:H.clientX,y:H.clientY}))},children:']
];
for (const [before, after] of patches) {
  const count = ui.split(before).length - 1;
  if (count !== 1) throw new Error(`Expected exactly one UI patch target, found ${count}: ${before}`);
  ui = ui.replace(before, after);
}
await writeFile(uiPath, ui);
console.log("Pixel Flow production build: original v0.2.3 canvas logic + Pixel Flow theme");
