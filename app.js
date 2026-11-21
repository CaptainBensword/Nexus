(function(){
"use strict";
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
const STORAGE_KEY="nexus-workspace-v2";
const OLD_KEY="nexus-deck-v1";
const SEED={
  projects:[
    {id:"project-talon",name:"Talon Studio",description:"A home for games, experiments and community projects",symbol:"T",status:"In progress",created:Date.now()-86400000*7},
    {id:"project-crimson",name:"Crimson Client",description:"A Minecraft client with a clean interface and useful tools",symbol:"C",status:"Building",created:Date.now()-86400000*4},
    {id:"project-horizon",name:"Horizon",description:"A story world with characters, places and history",symbol:"H",status:"Writing",created:Date.now()-86400000*2}
  ],
  tasks:[
    {id:"task-1",title:"Choose the next feature to build",projectId:"project-talon",done:false,created:Date.now()-3600000},
    {id:"task-2",title:"Review the main client screen",projectId:"project-crimson",done:false,created:Date.now()-7200000},
    {id:"task-3",title:"Collect the next chapter notes",projectId:"project-horizon",done:true,created:Date.now()-86400000}
  ],
  notes:[
    {id:"note-1",title:"Workspace idea",body:"Keep the next step small and clear\n\nUse this space for details you do not want to lose",projectId:"project-talon",updated:Date.now()-86400000}
  ],
  activity:[{id:"a1",text:"Nexus workspace is ready",kind:"Workspace",created:Date.now()}]
};
let data=loadData();
let currentView="home";
let activeProjectId=null;
let taskFilter="all";
let focusTaskId=null;
let modalType="";
let editingId=null;
let searchQuery="";
let tourStep=0;
let focusTimer={seconds:25*60,duration:25*60,running:false,interval:null};
function id(prefix){const random=window.crypto&&window.crypto.randomUUID?window.crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2,8);return prefix+"-"+random;}
function clone(value){return JSON.parse(JSON.stringify(value));}
function loadData(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||localStorage.getItem(OLD_KEY)||"null");
    if(saved&&Array.isArray(saved.projects)&&Array.isArray(saved.tasks)&&Array.isArray(saved.notes)){
      return {
        projects:saved.projects.map(p=>({id:p.id||id("project"),name:p.name||"Untitled project",description:p.description||p.desc||"",symbol:p.symbol||"N",status:p.status||"In progress",created:p.created||Date.now()})),
        tasks:saved.tasks.map(t=>({id:t.id||id("task"),title:t.title||t.text||"Untitled task",projectId:t.projectId||null,done:!!t.done,created:t.created||Date.now()})),
        notes:saved.notes.map(n=>({id:n.id||id("note"),title:n.title||"Untitled note",body:n.body||"",projectId:n.projectId||null,updated:n.updated||Date.now()})),
        activity:Array.isArray(saved.activity)?saved.activity:clone(SEED.activity)
      };
    }
  }catch(error){}
  return clone(SEED);
}
function saveData(){
  try{
    localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
    $("#saveStatus").innerHTML="<i></i> ALL CHANGES SAVED";
  }catch(error){
    $("#saveStatus").textContent="STORAGE FULL";
    toast("Your browser could not save this change");
  }
}
function escapeHTML(value){
  return String(value==null?"":value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}
function uidLabel(value){return String(value||"").slice(0,1).toUpperCase()||"N";}
function toast(message){
  const node=document.createElement("div");
  node.className="toast";
  node.textContent=message;
  $("#toastStack").append(node);
  setTimeout(()=>node.remove(),2500);
}
function activity(text,kind){
  data.activity.unshift({id:id("activity"),text,kind,created:Date.now()});
  data.activity=data.activity.slice(0,12);
  saveData();
}
function formatDate(value,options){
  return new Date(value||Date.now()).toLocaleDateString(undefined,options||{month:"short",day:"numeric"});
}
function projectById(projectId){return data.projects.find(project=>project.id===projectId)||null;}
function projectTaskCount(projectId){return data.tasks.filter(task=>task.projectId===projectId&&!task.done).length;}
function projectProgress(projectId){
  const tasks=data.tasks.filter(task=>task.projectId===projectId);
  return tasks.length?Math.round(tasks.filter(task=>task.done).length/tasks.length*100):0;
}
function setView(view){
  currentView=view;
  activeProjectId=null;
  render();
}
function pageHeading(kicker,title,description,actions){
  return '<div class="page-heading"><div><div class="page-kicker">'+escapeHTML(kicker)+'</div><h1>'+escapeHTML(title)+'</h1><p>'+escapeHTML(description)+'</p></div>'+(actions?'<div class="page-actions">'+actions+'</div>':"")+'</div>';
}
function projectCard(project){
  const open=projectTaskCount(project.id);
  const progress=projectProgress(project.id);
  return '<button class="project-card" data-project-open="'+escapeHTML(project.id)+'"><div class="project-topline"><span class="project-glyph">'+escapeHTML(project.symbol||uidLabel(project.name))+'</span><span class="project-state">'+escapeHTML(project.status)+'</span></div><h3>'+escapeHTML(project.name)+'</h3><p>'+escapeHTML(project.description||"No description yet")+'</p><div class="progress-track"><div class="progress-fill" style="width:'+progress+'%"></div></div><div class="project-card-footer"><span>'+open+' OPEN TASK'+(open===1?"":"S")+'</span><span>OPEN PROJECT ↗</span></div></button>';
}
function taskRow(task){
  const project=projectById(task.projectId);
  return '<div class="task-row '+(task.id===focusTaskId?"task-highlight":"")+'"><button class="task-check '+(task.done?"done":"")+'" data-task-toggle="'+escapeHTML(task.id)+'" aria-label="'+(task.done?"Mark task open":"Complete task")+'">'+(task.done?"✓":"")+'</button><span class="task-text '+(task.done?"done":"")+'">'+escapeHTML(task.title)+'</span>'+(project?'<span class="task-project">'+escapeHTML(project.name)+'</span>':'')+'<button class="task-delete" data-task-delete="'+escapeHTML(task.id)+'" aria-label="Delete task">×</button></div>';
}
function notePreview(note){
  const project=projectById(note.projectId);
  return '<button class="note-preview-item" data-note-edit="'+escapeHTML(note.id)+'"><strong>'+escapeHTML(note.title)+'</strong><p>'+escapeHTML(note.body||"No note content yet")+'</p></button>';
}
function emptyState(title,description,action){
  return '<div class="empty-state"><strong>'+escapeHTML(title)+'</strong>'+escapeHTML(description)+(action||"")+'</div>';
}
function renderHome(){
  const incomplete=data.tasks.filter(task=>!task.done).length;
  const finished=data.tasks.filter(task=>task.done).length;
  const gettingStarted='<section class="getting-started" id="gettingStarted"><div class="section-top"><div><h2 class="section-heading">Start here</h2><p class="section-subtitle">Three parts make up your Nexus workspace</p></div><button class="text-button" id="tourAgain">HOW IT WORKS ↗</button></div><div class="steps-grid"><button class="step-card" data-open="project"><span class="step-number">01</span><span><strong>Projects hold the big picture</strong><small>Give each thing you are making its own space</small></span></button><button class="step-card" data-open="task"><span class="step-number">02</span><span><strong>Tasks hold the next steps</strong><small>Turn a big project into small actions</small></span></button><button class="step-card" data-open="note"><span class="step-number">03</span><span><strong>Notes keep the details</strong><small>Save research, decisions and stray ideas</small></span></button></div></section>';
  const projects=data.projects.slice(0,3);
  const nextTasks=data.tasks.filter(task=>!task.done).slice(0,4);
  const recentNotes=data.notes.slice(0,3);
  return '<section class="home-intro"><div><div class="kicker">YOUR PROJECT WORKSPACE</div><h1>Make space for the things<br>you want to <span>bring to life</span></h1><p class="intro-copy">Nexus keeps your projects, next steps and useful details together — so you can see what you are working on and know where to pick up</p><div class="intro-actions"><button class="button-primary" data-open="project">＋ Create a project</button><button class="button-secondary" data-view="projects">Browse projects</button></div></div><div class="intro-art"><div class="art-label">HOW THE PIECES FIT</div><div class="art-flow"><div class="art-node active"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h5"/></svg></div><span class="art-connector"></span><div class="art-node"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><path d="m5 12 4 4L19 6"/><path d="M19 13v5H5V6h9"/></svg></div><span class="art-connector"></span><div class="art-node"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><path d="M7 4h10v16H7zM10 8h4M10 12h4M10 16h2"/></svg></div></div><div class="art-caption">PROJECTS　→　TASKS　→　NOTES</div></div></section>'+gettingStarted+
  '<section class="section-block"><div class="section-title-row"><div><h2>Your projects</h2><p>The main things you are working on</p></div><button class="text-button" data-view="projects">VIEW ALL ↗</button></div>'+(projects.length?'<div class="project-grid">'+projects.map(projectCard).join("")+'</div>':emptyState("Nothing here yet","Create a project and give your work a home",'<div class="empty-actions"><button class="button-primary" data-open="project">Create first project</button></div>'))+'</section>'+
  '<div class="home-lower"><section class="panel"><div class="panel-header"><strong>Next steps</strong><span>'+incomplete+' OPEN</span></div>'+(nextTasks.length?'<div class="task-list">'+nextTasks.map(taskRow).join("")+'</div>':emptyState("You are all caught up","Add a task when something needs doing",'<div class="empty-actions"><button class="button-secondary" data-open="task">Add a task</button></div>'))+'<div style="margin-top:10px"><button class="text-button" data-view="tasks">OPEN TASK LIST ↗</button></div></section><section class="panel"><div class="panel-header"><strong>Recent notes</strong><span>'+data.notes.length+' SAVED</span></div>'+(recentNotes.length?'<div class="note-preview">'+recentNotes.map(notePreview).join("")+'</div>':emptyState("No notes saved","Keep the details you want to remember",'<div class="empty-actions"><button class="button-secondary" data-open="note">Write a note</button></div>'))+'<div style="margin-top:10px"><button class="text-button" data-view="notes">OPEN NOTEBOOK ↗</button></div></section></div>';
}
function renderProjects(){
  return pageHeading("YOUR WORK","Projects","Each project keeps its description, tasks and notes in one place",'<button class="button-primary" data-open="project">＋ New project</button>')+(data.projects.length?'<div class="project-grid large">'+data.projects.map(projectCard).join("")+'</div>':emptyState("No projects yet","Start with one thing you want to make",'<div class="empty-actions"><button class="button-primary" data-open="project">Create a project</button></div>'));
}
function renderProjectDetail(){
  const project=projectById(activeProjectId);
  if(!project){activeProjectId=null;currentView="projects";return renderProjects();}
  const tasks=data.tasks.filter(task=>task.projectId===project.id);
  const notes=data.notes.filter(note=>note.projectId===project.id);
  const complete=tasks.filter(task=>task.done).length;
  return '<div class="detail-head"><div><div class="page-kicker">PROJECT SPACE</div><h1 class="detail-title">'+escapeHTML(project.name)+'</h1><p class="detail-description">'+escapeHTML(project.description||"No description yet")+'</p></div><div class="page-actions"><button class="button-secondary" data-project-edit="'+escapeHTML(project.id)+'">Edit details</button><button class="button-secondary" data-view="projects">Back</button></div></div><div class="detail-columns"><section class="detail-info"><h3>Next steps <span style="color:#918a92;font-weight:400">· '+complete+' of '+tasks.length+' complete</span></h3>'+(tasks.length?'<div class="task-list">'+tasks.map(taskRow).join("")+'</div>':emptyState("No tasks for this project","Add a task to turn the plan into action"))+'<div style="margin-top:12px"><button class="button-primary" data-open="task" data-project-prefill="'+escapeHTML(project.id)+'">＋ Add project task</button></div></section><aside class="detail-info"><h3>Project details</h3><div class="detail-meta"><div><strong>STATUS</strong><select class="project-status-select" id="projectStatus">'+["Planning","In progress","Building","Writing","On hold","Complete"].map(status=>'<option '+(project.status===status?"selected":"")+'>'+status+'</option>').join("")+'</select></div><div><strong>CREATED</strong>'+formatDate(project.created)+'</div><div><strong>PROGRESS</strong>'+projectProgress(project.id)+'% of linked tasks completed</div></div><div class="progress-track" style="margin-top:13px"><div class="progress-fill" style="width:'+projectProgress(project.id)+'%"></div></div><div style="height:1px;background:#e8e4dd;margin:17px 0"></div><h3>Project notes</h3>'+(notes.length?'<div class="note-preview">'+notes.map(notePreview).join("")+'</div>':emptyState("No notes linked yet","Use notes to keep project details close"))+'<div style="margin-top:10px"><button class="button-secondary" data-open="note" data-project-prefill="'+escapeHTML(project.id)+'">＋ Add project note</button></div><div style="margin-top:18px"><button class="button-danger" data-project-delete="'+escapeHTML(project.id)+'">Delete project</button></div></aside></div>';
}
function renderTasks(){
  const filtered=data.tasks.filter(task=>taskFilter==="all"||(taskFilter==="open"&&!task.done)||(taskFilter==="done"&&task.done));
  return pageHeading("YOUR WORK","Tasks","A simple list of the next things that need doing",'<button class="button-primary" data-open="task">＋ Add task</button>')+'<div class="filter-row">'+["all","open","done"].map(filter=>'<button class="filter-button '+(taskFilter===filter?"active":"")+'" data-task-filter="'+filter+'">'+({all:"All tasks",open:"To do",done:"Completed"}[filter])+'</button>').join("")+'</div><section class="panel">'+(filtered.length?'<div class="task-list">'+filtered.map(taskRow).join("")+'</div>':emptyState(taskFilter==="done"?"No completed tasks yet":"Nothing on this list","Add a task or change the filter"))+'</section>';
}
function renderNotes(){
  return pageHeading("YOUR WORK","Notes","Keep ideas, details and decisions beside your projects",'<button class="button-primary" data-open="note">＋ New note</button>')+(data.notes.length?'<div class="note-grid">'+data.notes.map(note=>'<button class="note-card" data-note-edit="'+escapeHTML(note.id)+'"><div class="note-card-top"><span>NOTEBOOK</span><span>'+escapeHTML(projectById(note.projectId)?.name||"GENERAL")+'</span></div><h3>'+escapeHTML(note.title)+'</h3><p>'+escapeHTML(note.body||"No content yet")+'</p><small>UPDATED '+formatDate(note.updated).toUpperCase()+'</small></button>').join("")+'</div>':emptyState("Your notebook is empty","Add a note to keep the useful details somewhere easy to find",'<div class="empty-actions"><button class="button-primary" data-open="note">Write a note</button></div>'));
}
function timerDisplay(){
  const minutes=Math.floor(focusTimer.seconds/60).toString().padStart(2,"0");
  const seconds=(focusTimer.seconds%60).toString().padStart(2,"0");
  return minutes+":"+seconds;
}
function renderFocus(){
  return pageHeading("PERSONAL","Focus timer","Give one task your attention for a little while")+'<div class="focus-layout"><section class="focus-main"><div><div class="timer-face"><div><div class="timer-digits" id="timerDigits">'+timerDisplay()+'</div><div class="timer-caption">MINUTES LEFT</div></div></div><div class="timer-actions"><button class="button-primary" id="timerToggle">'+(focusTimer.running?"Pause":"Start focus")+'</button><button class="button-secondary" id="timerReset">Reset</button></div></div></section><aside class="focus-presets"><h3>Choose a session</h3>'+[{name:"Quick reset",minutes:10},{name:"Focus session",minutes:25},{name:"Long session",minutes:45}].map(item=>'<button class="preset '+(focusTimer.duration===item.minutes*60?"active":"")+'" data-duration="'+item.minutes+'">'+item.name+'<span>'+item.minutes+' MIN</span></button>').join("")+'<p class="task-side-copy" style="margin-top:14px">Pick one thing to work on, start the timer and let the rest wait</p></aside></div>';
}
function renderSettings(){
  return pageHeading("PERSONAL","Workspace","A few details about how this Nexus copy works")+'<div class="workspace-settings"><section class="settings-card"><h3>Saved on this device</h3><p>Your projects, tasks and notes are stored in this browser — nothing is uploaded to an account or shared with other people</p><div class="setting-actions"><button class="button-primary" id="exportData">Export workspace</button><button class="button-secondary" id="replayTourPage">Show quick tour</button></div></section><section class="settings-card"><h3>Keep a backup</h3><p>Export a copy before clearing site data or switching browsers</p><div class="setting-actions"><button class="button-danger" id="resetData">Reset workspace</button></div></section></div>';
}
function render(){
  const page=activeProjectId?renderProjectDetail():({home:renderHome,projects:renderProjects,tasks:renderTasks,notes:renderNotes,focus:renderFocus,settings:renderSettings}[currentView]||renderHome)();
  $("#content").innerHTML=page;
  const crumb=activeProjectId?"PROJECT":currentView.toUpperCase();
  $("#crumbName").textContent=crumb;
  $$(".nav-link").forEach(button=>button.classList.toggle("active",!activeProjectId&&button.dataset.view===currentView));
  $("#projectCount").textContent=data.projects.length;
  $("#taskCount").textContent=data.tasks.filter(task=>!task.done).length;
  if(activeProjectId){
    const select=$("#projectStatus");
    if(select)select.addEventListener("change",()=>{const project=projectById(activeProjectId);if(project){project.status=select.value;saveData();toast("Project status updated");render();}});
  }
}
function openModal(type,options){
  const opts=options||{};
  modalType=type;
  editingId=opts.id||null;
  const projectId=opts.projectId||null;
  let title="",fields="",wide=false;
  if(type==="chooser"){
    title="Create something";
    fields='<div class="steps-grid" style="grid-template-columns:1fr"><button class="step-card" data-choice="project"><span class="step-number">01</span><span><strong>Project</strong><small>Start a new piece of work</small></span></button><button class="step-card" data-choice="task"><span class="step-number">02</span><span><strong>Task</strong><small>Add the next thing to do</small></span></button><button class="step-card" data-choice="note"><span class="step-number">03</span><span><strong>Note</strong><small>Save an idea or useful detail</small></span></button></div>';
  }
  if(type==="project"){
    const project=projectById(editingId)||{};
    title=editingId?"Edit project":"Create a project";
    fields='<label>PROJECT NAME<input class="field-input" name="name" maxlength="48" value="'+escapeHTML(project.name||"")+'" placeholder="For example, a game or a website" required></label><label>WHAT IS IT ABOUT?<textarea class="field-textarea" name="description" maxlength="240" placeholder="A sentence to remind you what this project is">'+escapeHTML(project.description||"")+'</textarea></label><label>SHORT MARK<input class="field-input" name="symbol" maxlength="2" value="'+escapeHTML(project.symbol||"")+'" placeholder="A letter or symbol"></label><label>STATUS<select class="field-select" name="status">'+["Planning","In progress","Building","Writing","On hold","Complete"].map(status=>'<option '+((project.status||"In progress")===status?"selected":"")+'>'+status+'</option>').join("")+'</select></label>';
  }
  if(type==="task"){
    title="Add a task";
    fields='<label>WHAT NEEDS DOING?<input class="field-input" name="title" maxlength="110" placeholder="Write one clear next step" required></label><label>PROJECT<select class="field-select" name="projectId"><option value="">No project</option>'+data.projects.map(project=>'<option value="'+escapeHTML(project.id)+'" '+(projectId===project.id?"selected":"")+'>'+escapeHTML(project.name)+'</option>').join("")+'</select></label>';
  }
  if(type==="note"){
    const note=data.notes.find(item=>item.id===editingId)||{};
    title=editingId?"Edit note":"New note";
    wide=true;
    fields='<label>NOTE TITLE<input class="field-input" name="title" maxlength="60" value="'+escapeHTML(note.title||"")+'" placeholder="Give this note a name" required></label><label>KEEP THE DETAILS HERE<textarea class="field-textarea" name="body" maxlength="5000" style="height:180px" placeholder="Write an idea, a decision or something to remember">'+escapeHTML(note.body||"")+'</textarea></label><label>PROJECT<select class="field-select" name="projectId"><option value="">General note</option>'+data.projects.map(project=>'<option value="'+escapeHTML(project.id)+'" '+((note.projectId||projectId)===project.id?"selected":"")+'>'+escapeHTML(project.name)+'</option>').join("")+'</select></label>';
  }
  if(type==="search"){
    title="Search your workspace";
    fields='<input class="field-input" id="searchInput" type="search" placeholder="Search projects, tasks and notes" value="'+escapeHTML(searchQuery)+'" autocomplete="off"><div class="search-results" id="searchResults"></div>';
  }
  if(type==="tour"){
    renderTourModal();
    return;
  }
  $("#modalLayer").innerHTML='<div class="modal '+(wide?"wide":"")+'" role="dialog" aria-modal="true"><div class="modal-header"><h2>'+title+'</h2><button class="modal-close" type="button" data-close aria-label="Close">×</button></div>'+(type==="chooser"?fields:'<form class="modal-form" id="modalForm">'+fields+'<div class="modal-actions"><button class="button-secondary" type="button" data-close>Cancel</button><button class="button-primary" type="submit">Save</button></div></form>')+'</div>';
  $("#modalLayer").classList.add("open");
  $("#modalLayer").setAttribute("aria-hidden","false");
  if(type==="search"){
    drawSearchResults();
    $("#searchInput").focus();
  }else{
    const first=$(".field-input");
    if(first)first.focus();
  }
}
function renderTourModal(){
  const steps=[
    {number:"01",title:"This is your project workspace",body:"Nexus is a place to keep the things you are making in one spot — not a social network, and not another complicated planner"},
    {number:"02",title:"Projects hold the big picture",body:"Create a project for something you are building or writing, then keep its tasks and notes attached to it"},
    {number:"03",title:"Tasks and notes keep it moving",body:"Tasks are the next actions, notes are the details, and the focus timer gives you a little quiet time to work"}
  ];
  const step=steps[tourStep];
  $("#modalLayer").innerHTML='<div class="modal" role="dialog" aria-modal="true"><div class="tour-progress">'+steps.map((item,index)=>'<span class="'+(index<=tourStep?"active":"")+'"></span>').join("")+'</div><div class="tour-step">'+step.number+'</div><div class="modal-header"><h2>'+step.title+'</h2><button class="modal-close" type="button" data-close aria-label="Close">×</button></div><p class="tour-copy">'+step.body+'</p><div class="tour-footer"><button class="text-button" data-tour-skip>SKIP TOUR</button><button class="button-primary" data-tour-next>'+(tourStep===steps.length-1?"Open Nexus":"Next step →")+'</button></div></div>';
  $("#modalLayer").classList.add("open");
  $("#modalLayer").setAttribute("aria-hidden","false");
}
function closeModal(){
  $("#modalLayer").classList.remove("open");
  $("#modalLayer").setAttribute("aria-hidden","true");
  modalType="";
  editingId=null;
}
function completeTour(){
  try{localStorage.setItem("nexus-tour-complete","yes");}catch(error){}
  closeModal();
}
function saveForm(form){
  const values=Object.fromEntries(new FormData(form).entries());
  if(modalType==="project"){
    if(editingId){
      const project=projectById(editingId);
      if(project)Object.assign(project,values);
      activity("Updated project details","Project");
    }else{
      const project={id:id("project"),name:values.name.trim(),description:values.description.trim(),symbol:values.symbol.trim()||values.name.trim().slice(0,1).toUpperCase(),status:values.status,created:Date.now()};
      data.projects.unshift(project);
      activeProjectId=project.id;
      currentView="projects";
      activity("Created "+project.name,"Project");
    }
  }
  if(modalType==="task"){
    data.tasks.unshift({id:id("task"),title:values.title.trim(),projectId:values.projectId||null,done:false,created:Date.now()});
    activity("Added a task","Task");
  }
  if(modalType==="note"){
    if(editingId){
      const note=data.notes.find(item=>item.id===editingId);
      if(note)Object.assign(note,{title:values.title.trim(),body:values.body,projectId:values.projectId||null,updated:Date.now()});
      activity("Updated a note","Note");
    }else{
      data.notes.unshift({id:id("note"),title:values.title.trim(),body:values.body,projectId:values.projectId||null,updated:Date.now()});
      activity("Saved a note","Note");
    }
  }
  saveData();
  closeModal();
  render();
  toast("Saved");
}
function deleteProject(projectId){
  const project=projectById(projectId);
  if(!project||!confirm('Delete "'+project.name+'" and unlink its tasks and notes?'))return;
  data.projects=data.projects.filter(item=>item.id!==projectId);
  data.tasks.forEach(task=>{if(task.projectId===projectId)task.projectId=null;});
  data.notes.forEach(note=>{if(note.projectId===projectId)note.projectId=null;});
  activeProjectId=null;
  currentView="projects";
  activity("Deleted "+project.name,"Project");
  saveData();
  render();
}
function deleteTask(taskId){
  data.tasks=data.tasks.filter(task=>task.id!==taskId);
  saveData();
  render();
}
function toggleTask(taskId){
  const task=data.tasks.find(item=>item.id===taskId);
  if(!task)return;
  task.done=!task.done;
  saveData();
  render();
}
function drawSearchResults(){
  const root=$("#searchResults");
  if(!root)return;
  const query=searchQuery.trim().toLowerCase();
  if(!query){root.innerHTML='<div class="empty-state">Type a word to search your projects, tasks and notes</div>';return;}
  const results=[];
  data.projects.forEach(project=>{if((project.name+" "+project.description).toLowerCase().includes(query))results.push({kind:"PROJECT",title:project.name,detail:project.description,id:project.id});});
  data.tasks.forEach(task=>{if(task.title.toLowerCase().includes(query))results.push({kind:"TASK",title:task.title,detail:projectById(task.projectId)?.name||"General task",id:task.id});});
  data.notes.forEach(note=>{if((note.title+" "+note.body).toLowerCase().includes(query))results.push({kind:"NOTE",title:note.title,detail:projectById(note.projectId)?.name||"General note",id:note.id});});
  root.innerHTML=results.length?results.slice(0,12).map(result=>'<button class="search-result" data-search-kind="'+result.kind+'" data-search-id="'+escapeHTML(result.id)+'"><span class="result-kind">'+result.kind.slice(0,1)+'</span><span><strong>'+escapeHTML(result.title)+'</strong><small>'+escapeHTML(result.detail)+'</small></span></button>').join(""):'<div class="empty-state">No matching items</div>';
}
function exportWorkspace(){
  const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),...data},null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  anchor.href=url;anchor.download="nexus-workspace.json";anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast("Workspace export created");
}
function resetWorkspace(){
  if(!confirm("Reset this Nexus workspace on this device? This cannot be undone"))return;
  data=clone(SEED);
  activeProjectId=null;
  currentView="home";
  saveData();
  render();
  toast("Workspace reset");
}
function timerTick(){
  if(focusTimer.seconds>0)focusTimer.seconds--;
  if(focusTimer.seconds<=0){
    clearInterval(focusTimer.interval);
    focusTimer.interval=null;
    focusTimer.running=false;
    toast("Focus session complete");
  }
  const digits=$("#timerDigits");
  const toggle=$("#timerToggle");
  if(digits)digits.textContent=timerDisplay();
  if(toggle)toggle.textContent=focusTimer.running?"Pause":"Start focus";
}
function toggleTimer(){
  if(focusTimer.running){
    clearInterval(focusTimer.interval);
    focusTimer.interval=null;
    focusTimer.running=false;
  }else{
    if(focusTimer.seconds===0)focusTimer.seconds=focusTimer.duration;
    focusTimer.running=true;
    focusTimer.interval=setInterval(timerTick,1000);
  }
  render();
}
function resetTimer(){
  clearInterval(focusTimer.interval);
  focusTimer.interval=null;
  focusTimer.running=false;
  focusTimer.seconds=focusTimer.duration;
  render();
}
function openSearchResult(kind,itemId){
  closeModal();
  if(kind==="PROJECT"){activeProjectId=itemId;currentView="projects";render();return;}
  if(kind==="TASK"){currentView="tasks";activeProjectId=null;taskFilter="all";focusTaskId=itemId;render();return;}
  if(kind==="NOTE"){openModal("note",{id:itemId});return;}
}
function handleClick(event){
  const target=event.target;
  const viewButton=target.closest("[data-view]");
  if(viewButton){setView(viewButton.dataset.view);return;}
  const open=target.closest("[data-open]");
  if(open){
    const options={projectId:open.dataset.projectPrefill||null};
    openModal(open.dataset.open,options);
    return;
  }
  if(target.closest("[data-close]")){if(modalType==="tour")completeTour();else closeModal();return;}
  if(target.closest("[data-choice]")){
    const choice=target.closest("[data-choice]").dataset.choice;
    closeModal();openModal(choice);return;
  }
  if(target.closest("[data-tour-next]")){
    if(tourStep<2){tourStep++;renderTourModal();}else completeTour();
    return;
  }
  if(target.closest("[data-tour-skip]")){completeTour();return;}
  if(target.closest("[data-tour-again]")||target.closest("#tourAgain")||target.closest("#replayTour")||target.closest("#replayTourPage")){
    tourStep=0;openModal("tour");return;
  }
  const projectOpen=target.closest("[data-project-open]");
  if(projectOpen){activeProjectId=projectOpen.dataset.projectOpen;currentView="projects";render();return;}
  const projectEdit=target.closest("[data-project-edit]");
  if(projectEdit){openModal("project",{id:projectEdit.dataset.projectEdit});return;}
  const projectDelete=target.closest("[data-project-delete]");
  if(projectDelete){deleteProject(projectDelete.dataset.projectDelete);return;}
  const taskToggle=target.closest("[data-task-toggle]");
  if(taskToggle){focusTaskId=null;toggleTask(taskToggle.dataset.taskToggle);return;}
  const taskDeleteButton=target.closest("[data-task-delete]");
  if(taskDeleteButton){focusTaskId=null;deleteTask(taskDeleteButton.dataset.taskDelete);return;}
  const noteEdit=target.closest("[data-note-edit]");
  if(noteEdit){openModal("note",{id:noteEdit.dataset.noteEdit});return;}
  const filter=target.closest("[data-task-filter]");
  if(filter){taskFilter=filter.dataset.taskFilter;focusTaskId=null;render();return;}
  const duration=target.closest("[data-duration]");
  if(duration){clearInterval(focusTimer.interval);focusTimer.interval=null;focusTimer.running=false;focusTimer.duration=Number(duration.dataset.duration)*60;focusTimer.seconds=focusTimer.duration;render();return;}
  const searchResult=target.closest("[data-search-kind]");
  if(searchResult){openSearchResult(searchResult.dataset.searchKind,searchResult.dataset.searchId);return;}
}
document.addEventListener("click",handleClick);
$("#addButton").addEventListener("click",()=>openModal("chooser"));
$("#searchButton").addEventListener("click",()=>{searchQuery="";openModal("search");});
$("#modalLayer").addEventListener("click",event=>{if(event.target===$("#modalLayer"))closeModal();});
$("#modalLayer").addEventListener("submit",event=>{
  if(event.target.id==="modalForm"){event.preventDefault();saveForm(event.target);}
});
$("#modalLayer").addEventListener("input",event=>{
  if(event.target.id==="searchInput"){searchQuery=event.target.value;drawSearchResults();}
});
$("#content").addEventListener("submit",event=>{
  if(event.target.id==="quickTaskForm"){
    event.preventDefault();
    const input=$('input[name="quickTask"]',event.target);
    if(!input.value.trim())return;
    data.tasks.unshift({id:id("task"),title:input.value.trim(),projectId:activeProjectId||null,done:false,created:Date.now()});
    activity("Added a task","Task");
    render();
  }
});
$("#content").addEventListener("click",event=>{
  if(event.target.id==="timerToggle")toggleTimer();
  if(event.target.id==="timerReset")resetTimer();
  if(event.target.id==="exportData")exportWorkspace();
  if(event.target.id==="resetData")resetWorkspace();
});
$("#projectCount").textContent=data.projects.length;
$("#todayDate").textContent=new Date().toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"}).toUpperCase();
document.addEventListener("keydown",event=>{
  const typing=event.target.matches("input,textarea,select");
  if(event.key==="Escape")closeModal();
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){event.preventDefault();searchQuery="";openModal("search");}
  if(!typing&&!event.ctrlKey&&!event.metaKey){
    const views={"1":"home","2":"projects","3":"tasks","4":"notes"};
    if(views[event.key])setView(views[event.key]);
  }
});
render();
try{
  if(!localStorage.getItem("nexus-tour-complete"))setTimeout(()=>{if(!modalType){tourStep=0;openModal("tour");}},350);
}catch(error){}
})();