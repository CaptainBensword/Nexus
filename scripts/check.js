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

assert.ok(html.includes('id="content"'),"Main page mount is missing");
assert.ok(html.includes('id="ambiencePanel"'),"Persistent ambience controls are missing");
assert.ok(html.includes('id="runningTimer"'),"Persistent timer indicator is missing");
assert.ok(html.includes('assets/nexus-symbol.svg'),"Geometric Nexus mark is missing");
assert.ok(!/kit-head|kit-head\.svg|nexus-mark\.svg/i.test(html+css+app),"Old character and logo references must not be used");
assert.ok(app.includes('const EMPTY_DATA={projects:[],tasks:[],notes:[]}'),"New workspaces must start empty");
assert.ok(app.includes('nexus-workspace-v3'),"Fresh workspace storage key is missing");
assert.ok(app.includes('SAMPLE_PROJECT_NAMES')&&app.includes('SAMPLE_TASK_TITLES')&&app.includes('SAMPLE_NOTE_TITLES'),"Old sample content must be filtered during upgrade");
assert.ok(app.includes('new AudioContextClass()'),"Generated ambient audio is missing");
for(const scene of ['rain','brown','wind','fire']){
  assert.ok(app.includes('scene==="'+scene+'"')||app.includes(scene+':{'),"Missing ambient scene: "+scene);
}
for(const feature of [
  "function renderTimer()","function renderProjects()","function renderTasks()",
  "function renderNotes()","function toggleAmbience()","function changeVolume(",
  "function exportWorkspace()","data-project-open","data-task-toggle","data-note-edit"
]){
  assert.ok(app.includes(feature),"Missing workspace feature: "+feature);
}
assert.ok(css.includes(".focus-main"),"Focus timer layout styles are missing");
assert.ok(css.includes(".ambience-panel"),"Ambient control styling is missing");
assert.ok(css.includes("prefers-reduced-motion"),"Reduced motion support is missing");
assert.ok(css.includes("@media(max-width:680px)"),"Mobile layout is missing");
assert.ok(icon.includes("<svg")&&icon.includes("</svg>"),"Nexus symbol SVG is invalid");
console.log("Nexus checks passed — empty workspace, timer, ambient audio, responsive layout and assets");
