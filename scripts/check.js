"use strict";
const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");
function read(file){return fs.readFileSync(path.join(root,file),"utf8");}
const html=read("index.html");
const css=read("styles.css");
const app=read("app.js");
const icon=read("assets/nexus-symbol.svg");
assert.ok(html.includes('id="content"'),"Main content mount is missing");
assert.ok(html.includes('id="modalLayer"'),"Modal layer is missing");
assert.ok(html.includes('assets/nexus-symbol.svg'),"Nexus symbol is missing");
assert.ok(!/kit-head|kit-head\.svg|nexus-mark\.svg/i.test(html+css+app),"Old character or logo must not be used");
for(const feature of [
  "Create a project","Next steps","Recent notes","Search your workspace",
  "focusTimer","nexus-workspace-v2","nexus-tour-complete","Export workspace",
  "data-project-open","data-task-toggle","data-note-edit"
]){
  assert.ok(app.includes(feature)||html.includes(feature),"Missing workspace feature: "+feature);
}
assert.ok(css.includes(".home-intro"),"Home layout styles are missing");
assert.ok(css.includes("@media(max-width:760px)"),"Mobile layout is missing");
assert.ok(css.includes("prefers-reduced-motion"),"Reduced motion support is missing");
assert.ok(icon.includes("<svg")&&icon.includes("</svg>"),"Nexus symbol SVG is invalid");
assert.ok(!html.includes("kit-head.svg"),"No Kit image references allowed");
console.log("Nexus checks passed — workspace markup, interactions, responsive styles and assets");
