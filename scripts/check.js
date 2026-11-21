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

assert.ok(html.includes('id="landingPage"'),"Public welcome page is missing");
assert.ok(html.includes('id="enterWorkspace"'),"Welcome page entry button is missing");
assert.ok(html.includes('id="workspaceApp" hidden'),"Workspace should be hidden until entered");
assert.ok(html.includes('id="landingSoundToggle"'),"Welcome page sound control is missing");
assert.ok(html.includes('id="ambiencePanel"'),"Workspace ambient controls are missing");
assert.ok(html.includes('id="runningTimer"'),"Persistent timer indicator is missing");
assert.ok(html.includes('assets/nexus-symbol.svg'),"Geometric Nexus mark is missing");
assert.ok(html.includes("app.js?v=6")&&html.includes("styles.css?v=6"),"Cache-busted asset versions are missing");
assert.ok(!/kit-head|kit-head\.svg|nexus-mark\.svg/i.test(html+css+app),"Old character and logo references must not be used");
assert.ok(app.includes('const STORAGE_KEY="nexus-workspace-v4"'),"Fresh workspace storage key is missing");
assert.ok(app.includes('const EMPTY_DATA={projects:[],tasks:[],notes:[]}'),"New workspaces must start empty");
assert.ok(app.includes('"nexus-workspace-v3","nexus-workspace-v2","nexus-deck-v1","nexus-focus-task"'),"Old personal demo data must be cleared on upgrade");
assert.ok(!/Talon Studio|Crimson Client|Horizon/.test(app),"No personal example names should be present");
assert.ok(!/HOW THE PIECES FIT|PROJECTS　→　TASKS　→　NOTES/.test(app+html),"Old category diagram must be removed");
for(const feature of [
  "function renderTimer()","function renderProjects()","function renderTasks()",
  "function renderNotes()","function toggleAmbience()","function changeVolume(",
  "function startRainDrops()","function startCrackles()","function exportWorkspace()",
  "data-project-open","data-task-toggle","data-note-edit","function enterWorkspace()"
]){
  assert.ok(app.includes(feature),"Missing workspace feature: "+feature);
}
assert.ok(css.includes(".landing-page"),"Welcome page styling is missing");
assert.ok(css.includes(".landing-visual"),"Animated landing visual is missing");
assert.ok(css.includes(".focus-main"),"Focus timer layout is missing");
assert.ok(css.includes(".ambience-panel"),"Ambient controls styling is missing");
assert.ok(css.includes("prefers-reduced-motion"),"Reduced motion support is missing");
assert.ok(css.includes("@media(max-width:680px)"),"Mobile layout is missing");
assert.ok(icon.includes("<svg")&&icon.includes("</svg>"),"Nexus symbol SVG is invalid");
console.log("Nexus checks passed — welcome page, blank workspace, focus timer, ambient sound, responsive layout and assets");
