(function(){
"use strict";

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
const STORAGE_KEY="nexus-workspace-v4";
const AMBIENCE_KEY="nexus-ambience-v1";
const EMPTY_DATA={projects:[],tasks:[],notes:[]};

let data=loadData();
let currentView="home";
let activeProjectId=null;
let taskFilter="all";
let editingId=null;
let modalType="";
let searchQuery="";
let focusTaskId=null;
let focusTimer={duration:25*60,seconds:25*60,running:false,interval:null,taskId:""};
let ambiencePrefs=loadAmbiencePrefs();
let audio={context:null,master:null,noiseGain:null,highpass:null,lowpass:null,noiseSource:null,brownGain:null,brownFilter:null,brownSource:null,crackleGain:null,crackleSource:null,crackleFilter:null,lfo:null,lfoDepth:null,crackleInterval:null,rainInterval:null,playing:false};

function makeId(prefix){
  const random=window.crypto&&window.crypto.randomUUID?window.crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  return prefix+"-"+random;
}
function clone(value){return JSON.parse(JSON.stringify(value));}
function safeParse(value){try{return JSON.parse(value);}catch(error){return null;}}
function loadData(){
  const saved=safeParse(localStorage.getItem(STORAGE_KEY)||"");
  if(saved&&Array.isArray(saved.projects)&&Array.isArray(saved.tasks)&&Array.isArray(saved.notes)){
    return {
      projects:saved.projects,
      tasks:saved.tasks,
      notes:saved.notes
    };
  }
  return clone(EMPTY_DATA);
}
function saveData(){
  try{
    localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
    const status=$("#saveStatus");
    if(status)status.innerHTML="<i></i> SAVED ON THIS DEVICE";
  }catch(error){
    const status=$("#saveStatus");
    if(status)status.textContent="STORAGE FULL";
    toast("This browser could not save the change");
  }
}
function loadAmbiencePrefs(){
  const saved=safeParse(localStorage.getItem(AMBIENCE_KEY)||"");
  const scenes=["rain","brown","wind","fire"];
  return {
    scene:saved&&scenes.includes(saved.scene)?saved.scene:"rain",
    volume:saved&&Number.isFinite(Number(saved.volume))?Math.max(0,Math.min(100,Number(saved.volume))):38
  };
}
function saveAmbiencePrefs(){
  try{localStorage.setItem(AMBIENCE_KEY,JSON.stringify(ambiencePrefs));}catch(error){}
}
function escapeHTML(value){
  return String(value==null?"":value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}
function toast(message){
  const stack=$("#toastStack");
  const node=document.createElement("div");
  node.className="toast";
  node.textContent=message;
  stack.append(node);
  setTimeout(()=>node.remove(),2600);
}
function formatDate(value){
  return new Date(value||Date.now()).toLocaleDateString(undefined,{month:"short",day:"numeric"});
}
function projectById(projectId){return data.projects.find(project=>project.id===projectId)||null;}
function openTaskCount(projectId){return data.tasks.filter(task=>task.projectId===projectId&&!task.done).length;}
function projectProgress(projectId){
  const tasks=data.tasks.filter(task=>task.projectId===projectId);
  return tasks.length?Math.round(tasks.filter(task=>task.done).length/tasks.length*100):0;
}
function setView(view){
  currentView=view;
  activeProjectId=null;
  focusTaskId=null;
  render();
}
function pageHeading(kicker,title,description,actions){
  return '<div class="page-heading"><div><div class="page-kicker">'+escapeHTML(kicker)+'</div><h1>'+escapeHTML(title)+'</h1><p>'+escapeHTML(description)+'</p></div>'+(actions?'<div class="page-actions">'+actions+'</div>':"")+'</div>';
}
function emptyState(title,description,action){
  return '<div class="empty-state"><strong>'+escapeHTML(title)+'</strong>'+escapeHTML(description)+(action||"")+'</div>';
}
function projectCard(project){
  const open=openTaskCount(project.id);
  const progress=projectProgress(project.id);
  return '<button class="project-card" data-project-open="'+escapeHTML(project.id)+'"><div class="project-topline"><span class="project-glyph">'+escapeHTML(project.symbol||project.name.slice(0,1).toUpperCase())+'</span><span class="project-state">'+escapeHTML(project.status)+'</span></div><h3>'+escapeHTML(project.name)+'</h3><p>'+escapeHTML(project.description||"No description")+'</p><div class="progress-track"><div class="progress-fill" style="width:'+progress+'%"></div></div><div class="project-card-footer"><span>'+open+' OPEN TASK'+(open===1?"":"S")+'</span><span>OPEN ↗</span></div></button>';
}
function taskRow(task){
  const project=projectById(task.projectId);
  return '<div class="task-row '+(task.id===focusTaskId?"task-highlight":"")+'"><button class="task-check '+(task.done?"done":"")+'" data-task-toggle="'+escapeHTML(task.id)+'" aria-label="'+(task.done?"Mark task open":"Complete task")+'">'+(task.done?"✓":"")+'</button><span class="task-text '+(task.done?"done":"")+'">'+escapeHTML(task.title)+'</span>'+(project?'<span class="task-project">'+escapeHTML(project.name)+'</span>':'')+'<button class="task-delete" data-task-delete="'+escapeHTML(task.id)+'" aria-label="Delete task">×</button></div>';
}
function notePreview(note){
  return '<button class="note-preview-item" data-note-edit="'+escapeHTML(note.id)+'"><strong>'+escapeHTML(note.title)+'</strong><p>'+escapeHTML(note.body||"No content")+'</p></button>';
}
function timerDisplay(){
  const minutes=Math.floor(focusTimer.seconds/60).toString().padStart(2,"0");
  const seconds=(focusTimer.seconds%60).toString().padStart(2,"0");
  return minutes+":"+seconds;
}
function taskOptions(){
  const options=['<option value="">No task selected</option>'];
  data.tasks.filter(task=>!task.done).forEach(task=>{
    options.push('<option value="'+escapeHTML(task.id)+'" '+(focusTimer.taskId===task.id?"selected":"")+'>'+escapeHTML(task.title)+'</option>');
  });
  return options.join("");
}
function renderTimer(){
  const durationButtons=[10,25,45].map(minutes=>'<button class="duration-button '+(focusTimer.duration===minutes*60?"active":"")+'" data-duration="'+minutes+'">'+minutes+' min</button>').join("");
  return '<section class="focus-main"><div class="focus-main-head"><strong>Focus timer</strong><span class="focus-status '+(focusTimer.running?"running":"")+'" id="focusStatus">'+(focusTimer.running?"SESSION RUNNING":"READY")+'</span></div><div class="timer-task-wrap"><label for="focusTaskSelect">WORKING ON</label><select class="timer-task-select" id="focusTaskSelect">'+taskOptions()+'</select></div><div class="timer-ring"><svg viewBox="0 0 220 220" aria-hidden="true"><circle class="timer-track" cx="110" cy="110" r="100"></circle><circle class="timer-progress" id="timerProgress" cx="110" cy="110" r="100"></circle></svg><div><div class="timer-digits" id="timerDigits">'+timerDisplay()+'</div><div class="timer-caption">TIME REMAINING</div></div></div><div class="duration-row">'+durationButtons+'</div><div class="timer-actions"><button class="button-primary" id="timerToggle" data-timer-toggle>'+(focusTimer.running?"Pause":"Start focus")+'</button><button class="button-secondary" id="timerReset">Reset</button></div><p class="focus-footnote">The timer keeps running while you move between pages</p></section>';
}
function renderHome(){
  const nextTasks=data.tasks.filter(task=>!task.done).slice(0,4);
  const sceneName=sceneLabel(ambiencePrefs.scene);
  const sceneStatus=audio.playing?"PLAYING":"OFF";
  const nextTaskMarkup=nextTasks.length?'<div class="task-list">'+nextTasks.map(taskRow).join("")+'</div>':'<div class="task-empty">No open tasks <br><button class="text-button" data-open="task">ADD A TASK</button></div>';
  return '<div class="home-heading"><div><div class="kicker">FOCUS</div><h1>Focus on one thing</h1><p>Set a timer and keep distractions out of the way</p></div></div><div class="focus-layout">'+renderTimer()+'<aside class="focus-side"><section class="ambient-card '+(audio.playing?"is-playing":"")+'" id="homeAmbientCard"><div class="ambient-card-top"><strong>Ambient sound</strong><span id="homeAmbientStatus">'+sceneStatus+'</span></div><div class="ambient-visual" aria-hidden="true">'+Array.from({length:25},(_,index)=>'<i style="animation-delay:-'+((index%7)*.13)+'s"></i>').join("")+'</div><div class="ambient-current"><div><strong id="homeAmbientName">'+escapeHTML(sceneName)+'</strong><small>Background audio for focus</small></div><button id="homeAmbienceButton">Change sound</button></div></section><section class="next-tasks-card"><div class="card-heading"><strong>Tasks</strong><span>'+data.tasks.filter(task=>!task.done).length+' OPEN</span></div>'+nextTaskMarkup+'<div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center"><button class="text-button" data-view="tasks">ALL TASKS</button><button class="text-button" data-open="task">＋ ADD</button></div></section></aside></div><div class="focus-bottom"><div class="focus-bottom-card"><div><strong>Projects</strong><small>'+data.projects.length+' saved</small></div><button data-view="projects">OPEN PROJECTS</button></div><div class="focus-bottom-card"><div><strong>Notes</strong><small>'+data.notes.length+' saved</small></div><button data-view="notes">OPEN NOTES</button></div></div>';
}
function renderProjects(){
  return pageHeading("WORKSPACE","Projects","Create a project to group related tasks and notes",'<button class="button-primary" data-open="project">＋ New project</button>')+(data.projects.length?'<div class="project-grid large">'+data.projects.map(projectCard).join("")+'</div>':emptyState("No projects yet","Create a project when you want to group tasks and notes together",'<div class="empty-actions"><button class="button-primary" data-open="project">Create project</button></div>'));
}
function renderProjectDetail(){
  const project=projectById(activeProjectId);
  if(!project){activeProjectId=null;currentView="projects";return renderProjects();}
  const tasks=data.tasks.filter(task=>task.projectId===project.id);
  const notes=data.notes.filter(note=>note.projectId===project.id);
  const complete=tasks.filter(task=>task.done).length;
  return '<div class="project-detail-head"><div><div class="page-kicker">PROJECT</div><h1 class="detail-title">'+escapeHTML(project.name)+'</h1><p class="detail-description">'+escapeHTML(project.description||"No description")+'</p></div><div class="page-actions"><button class="button-secondary" data-project-edit="'+escapeHTML(project.id)+'">Edit</button><button class="button-secondary" data-view="projects">Back</button></div></div><div class="detail-columns"><section class="detail-info"><h3>Tasks <span style="color:#918a92;font-weight:400">· '+complete+' of '+tasks.length+' complete</span></h3>'+(tasks.length?'<div class="task-list">'+tasks.map(taskRow).join("")+'</div>':emptyState("No tasks yet","Add a task to this project"))+'<div style="margin-top:12px"><button class="button-primary" data-open="task" data-project-prefill="'+escapeHTML(project.id)+'">＋ Add task</button></div></section><aside class="detail-info"><h3>Project details</h3><div class="detail-meta"><div><strong>STATUS</strong><select class="project-status-select" id="projectStatus">'+["Planning","In progress","On hold","Complete"].map(status=>'<option '+(project.status===status?"selected":"")+'>'+status+'</option>').join("")+'</select></div><div><strong>CREATED</strong>'+formatDate(project.created)+'</div><div><strong>PROGRESS</strong>'+projectProgress(project.id)+'% complete</div></div><div class="progress-track" style="margin-top:13px"><div class="progress-fill" style="width:'+projectProgress(project.id)+'%"></div></div><div style="height:1px;background:#e8e4dd;margin:17px 0"></div><h3>Notes</h3>'+(notes.length?'<div class="note-preview">'+notes.map(notePreview).join("")+'</div>':emptyState("No notes yet","Add a note to this project"))+'<div style="margin-top:10px"><button class="button-secondary" data-open="note" data-project-prefill="'+escapeHTML(project.id)+'">＋ Add note</button></div><div style="margin-top:18px"><button class="button-danger" data-project-delete="'+escapeHTML(project.id)+'">Delete project</button></div></aside></div>';
}
function renderTasks(){
  const filtered=data.tasks.filter(task=>taskFilter==="all"||(taskFilter==="open"&&!task.done)||(taskFilter==="done"&&task.done));
  const createForm='<form class="task-add-row" id="quickTaskForm"><input name="quickTask" maxlength="110" placeholder="Add a task" required><button aria-label="Add task">＋</button></form>';
  return pageHeading("WORKSPACE","Tasks","Add the next thing you need to do",'<button class="button-primary" data-open="task">＋ New task</button>')+'<div class="filter-row">'+["all","open","done"].map(filter=>'<button class="filter-button '+(taskFilter===filter?"active":"")+'" data-task-filter="'+filter+'">'+({all:"All",open:"To do",done:"Completed"}[filter])+'</button>').join("")+'</div><section class="task-list-panel">'+createForm+(filtered.length?'<div class="task-list">'+filtered.map(taskRow).join("")+'</div>':emptyState(taskFilter==="done"?"No completed tasks":"No tasks yet","Add a task above or change the filter"))+'</section>';
}
function renderNotes(){
  return pageHeading("WORKSPACE","Notes","Save details and ideas you want to keep",'<button class="button-primary" data-open="note">＋ New note</button>')+(data.notes.length?'<div class="note-grid">'+data.notes.map(note=>'<button class="note-card" data-note-edit="'+escapeHTML(note.id)+'"><div class="note-card-top"><span>NOTE</span><span>'+escapeHTML(projectById(note.projectId)?.name||"UNLINKED")+'</span></div><h3>'+escapeHTML(note.title)+'</h3><p>'+escapeHTML(note.body||"")+'</p><small>UPDATED '+formatDate(note.updated).toUpperCase()+'</small></button>').join("")+'</div>':emptyState("No notes yet","Create a note to keep useful information in one place",'<div class="empty-actions"><button class="button-primary" data-open="note">Create note</button></div>'));
}
function renderSettings(){
  return pageHeading("PREFERENCES","Settings","Manage your saved workspace and sound")+'<div class="workspace-settings"><section class="settings-card"><h3>Workspace data</h3><p>Your projects, tasks and notes are saved in this browser on this device</p><div class="setting-actions"><button class="button-primary" id="exportData">Export workspace</button><button class="button-danger" id="resetData">Clear workspace</button></div></section><section class="settings-card"><h3>Ambient sound</h3><p>Choose a sound in the top bar. It continues while you move between pages. Audio begins after you press Play</p><div class="setting-actions"><button class="button-secondary" id="settingsAmbienceButton">Open sound controls</button></div></section></div>';
}
function render(){
  const page=activeProjectId?renderProjectDetail():({home:renderHome,projects:renderProjects,tasks:renderTasks,notes:renderNotes,settings:renderSettings}[currentView]||renderHome)();
  $("#content").innerHTML=page;
  $("#crumbName").textContent=activeProjectId?"PROJECT":({home:"FOCUS",projects:"PROJECTS",tasks:"TASKS",notes:"NOTES",settings:"SETTINGS"}[currentView]||"FOCUS");
  $$(".nav-link").forEach(button=>button.classList.toggle("active",!activeProjectId&&button.dataset.view===currentView));
  $("#projectCount").textContent=data.projects.length;
  $("#taskCount").textContent=data.tasks.filter(task=>!task.done).length;
  updateTimerUI();
  syncAmbienceUI();
  if(activeProjectId){
    const select=$("#projectStatus");
    if(select)select.addEventListener("change",()=>{
      const project=projectById(activeProjectId);
      if(project){project.status=select.value;saveData();render();toast("Status updated");}
    });
  }
}
function sceneLabel(scene){
  return ({rain:"Soft rain",brown:"Brown noise",wind:"Wind",fire:"Fireplace"})[scene]||"Soft rain";
}
function syncAmbienceUI(){
  const button=$("#ambienceButton");
  const status=$("#ambienceButtonStatus");
  const description=$("#ambienceDescription");
  const play=$("#ambiencePlay");
  const volume=$("#ambienceVolume");
  const volumeValue=$("#ambienceVolumeValue");
  if(button){
    button.classList.toggle("is-playing",audio.playing);
    button.setAttribute("aria-label",audio.playing?"Ambient sound playing":"Ambient sound off");
  }
  if(status)status.textContent=audio.playing?"On":"Off";
  if(description)description.textContent=(audio.playing?"Playing · ":"Off · ")+sceneLabel(ambiencePrefs.scene);
  if(play)play.textContent=audio.playing?"Pause":"Play";
  if(volume&&Number(volume.value)!==ambiencePrefs.volume)volume.value=String(ambiencePrefs.volume);
  if(volumeValue)volumeValue.textContent=ambiencePrefs.volume+"%";
  $$(".scene-button").forEach(item=>item.classList.toggle("active",item.dataset.scene===ambiencePrefs.scene));
  const homeName=$("#homeAmbientName");
  const homeStatus=$("#homeAmbientStatus");
  const homeCard=$("#homeAmbientCard");
  if(homeName)homeName.textContent=sceneLabel(ambiencePrefs.scene);
  if(homeStatus)homeStatus.textContent=audio.playing?"PLAYING":"OFF";
  if(homeCard)homeCard.classList.toggle("is-playing",audio.playing);
  const landingLabel=$("#landingSoundLabel");
  const landingButton=$("#landingSoundToggle");
  if(landingLabel)landingLabel.textContent=audio.playing?"Sound on":"Sound off";
  if(landingButton)landingButton.classList.toggle("is-playing",audio.playing);
}
function setAmbiencePanel(open){
  const panel=$("#ambiencePanel");
  const button=$("#ambienceButton");
  if(!panel||!button)return;
  panel.hidden=!open;
  button.setAttribute("aria-expanded",open?"true":"false");
}
function toggleAmbiencePanel(){
  const panel=$("#ambiencePanel");
  setAmbiencePanel(!!panel&&panel.hidden);
}
function createNoiseBuffer(context,type){
  const length=context.sampleRate*4;
  const buffer=context.createBuffer(1,length,context.sampleRate);
  const channel=buffer.getChannelData(0);
  if(type==="brown"){
    let last=0;
    for(let i=0;i<length;i++){
      const white=Math.random()*2-1;
      last=(last+.018*white)/1.018;
      channel[i]=last*3.4;
    }
  }else{
    for(let i=0;i<length;i++)channel[i]=Math.random()*2-1;
  }
  return buffer;
}
function createAudioGraph(){
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextClass)throw new Error("This browser does not support generated audio");
  const context=new AudioContextClass();
  const master=context.createGain();
  master.gain.value=0;
  master.connect(context.destination);

  const whiteBuffer=createNoiseBuffer(context,"white");
  const brownBuffer=createNoiseBuffer(context,"brown");

  const rainSource=context.createBufferSource();
  rainSource.buffer=whiteBuffer;
  rainSource.loop=true;
  const highpass=context.createBiquadFilter();
  highpass.type="highpass";
  highpass.frequency.value=260;
  highpass.Q.value=.45;
  const lowpass=context.createBiquadFilter();
  lowpass.type="lowpass";
  lowpass.frequency.value=3600;
  lowpass.Q.value=.45;
  const noiseGain=context.createGain();
  noiseGain.gain.value=.2;
  rainSource.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(noiseGain);
  noiseGain.connect(master);
  rainSource.start();

  const brownSource=context.createBufferSource();
  brownSource.buffer=brownBuffer;
  brownSource.loop=true;
  const brownFilter=context.createBiquadFilter();
  brownFilter.type="lowpass";
  brownFilter.frequency.value=700;
  brownFilter.Q.value=.5;
  const brownGain=context.createGain();
  brownGain.gain.value=.02;
  brownSource.connect(brownFilter);
  brownFilter.connect(brownGain);
  brownGain.connect(master);
  brownSource.start();

  const crackleSource=context.createBufferSource();
  crackleSource.buffer=whiteBuffer;
  crackleSource.loop=true;
  const crackleFilter=context.createBiquadFilter();
  crackleFilter.type="bandpass";
  crackleFilter.frequency.value=1600;
  crackleFilter.Q.value=.65;
  const crackleGain=context.createGain();
  crackleGain.gain.value=0;
  crackleSource.connect(crackleFilter);
  crackleFilter.connect(crackleGain);
  crackleGain.connect(master);
  crackleSource.start();

  const lfo=context.createOscillator();
  lfo.type="sine";
  lfo.frequency.value=.075;
  const lfoDepth=context.createGain();
  lfoDepth.gain.value=0;
  lfo.connect(lfoDepth);
  lfoDepth.connect(brownGain.gain);
  lfo.start();

  audio.context=context;
  audio.master=master;
  audio.noiseGain=noiseGain;
  audio.highpass=highpass;
  audio.lowpass=lowpass;
  audio.noiseSource=rainSource;
  audio.brownGain=brownGain;
  audio.brownFilter=brownFilter;
  audio.brownSource=brownSource;
  audio.crackleGain=crackleGain;
  audio.crackleSource=crackleSource;
  audio.crackleFilter=crackleFilter;
  audio.lfo=lfo;
  audio.lfoDepth=lfoDepth;
  configureScene();
}
function configureScene(){
  if(!audio.context)return;
  const now=audio.context.currentTime;
  const settings={
    rain:{high:240,low:3800,white:.2,brown:.025,brownLow:650,modulation:0},
    brown:{high:20,low:260,white:0,brown:.42,brownLow:280,modulation:0},
    wind:{high:35,low:900,white:.012,brown:.28,brownLow:900,modulation:.11},
    fire:{high:45,low:1050,white:.025,brown:.19,brownLow:780,modulation:.025}
  }[ambiencePrefs.scene];
  audio.highpass.frequency.setTargetAtTime(settings.high,now,.35);
  audio.lowpass.frequency.setTargetAtTime(settings.low,now,.4);
  audio.noiseGain.gain.setTargetAtTime(settings.white,now,.35);
  audio.brownFilter.frequency.setTargetAtTime(settings.brownLow,now,.45);
  audio.brownGain.gain.setTargetAtTime(settings.brown,now,.45);
  audio.lfoDepth.gain.setTargetAtTime(settings.modulation,now,.6);
  stopCrackles();
  stopRainDrops();
  if(ambiencePrefs.scene==="fire"){
    audio.crackleFilter.frequency.setTargetAtTime(1750,now,.4);
    startCrackles();
  }else{
    audio.crackleGain.gain.setTargetAtTime(.0001,now,.1);
    if(ambiencePrefs.scene==="rain")startRainDrops();
  }
}
function startCrackles(){
  if(audio.crackleInterval||!audio.context)return;
  audio.crackleInterval=setInterval(()=>{
    if(!audio.playing||ambiencePrefs.scene!=="fire"||!audio.context)return;
    const now=audio.context.currentTime;
    const peak=.025+Math.random()*.045;
    const end=now+.025+Math.random()*.08;
    audio.crackleGain.gain.cancelScheduledValues(now);
    audio.crackleGain.gain.setValueAtTime(.0001,now);
    audio.crackleGain.gain.linearRampToValueAtTime(peak,now+.006);
    audio.crackleGain.gain.exponentialRampToValueAtTime(.0001,end);
  },150+Math.random()*240);
}
function stopCrackles(){
  if(audio.crackleInterval){clearInterval(audio.crackleInterval);audio.crackleInterval=null;}
}
function startRainDrops(){
  if(audio.rainInterval||!audio.context)return;
  audio.rainInterval=setInterval(()=>{
    if(!audio.playing||ambiencePrefs.scene!=="rain"||!audio.context)return;
    const context=audio.context;
    const oscillator=context.createOscillator();
    const envelope=context.createGain();
    const now=context.currentTime;
    oscillator.type="sine";
    oscillator.frequency.setValueAtTime(850+Math.random()*1500,now);
    oscillator.frequency.exponentialRampToValueAtTime(450+Math.random()*600,now+.065);
    envelope.gain.setValueAtTime(.0001,now);
    envelope.gain.linearRampToValueAtTime(.012+Math.random()*.012,now+.008);
    envelope.gain.exponentialRampToValueAtTime(.0001,now+.075);
    oscillator.connect(envelope);
    envelope.connect(audio.master);
    oscillator.start(now);
    oscillator.stop(now+.08);
  },105+Math.random()*150);
}
function stopRainDrops(){
  if(audio.rainInterval){clearInterval(audio.rainInterval);audio.rainInterval=null;}
}
async function toggleAmbience(){
  try{
    if(!audio.context)createAudioGraph();
    if(audio.playing){
      audio.playing=false;
      stopCrackles();
      const context=audio.context;
      audio.master.gain.setTargetAtTime(0,context.currentTime,.16);
      syncAmbienceUI();
      setTimeout(()=>{if(!audio.playing&&context.state==="running")context.suspend();},650);
    }else{
      await audio.context.resume();
      audio.playing=true;
      configureScene();
      audio.master.gain.cancelScheduledValues(audio.context.currentTime);
      audio.master.gain.setTargetAtTime((ambiencePrefs.volume/100)*.8,audio.context.currentTime,.7);
      syncAmbienceUI();
    }
  }catch(error){
    audio.playing=false;
    syncAmbienceUI();
    toast("Ambient audio could not start in this browser");
  }
}
function changeScene(scene){
  if(!["rain","brown","wind","fire"].includes(scene))return;
  ambiencePrefs.scene=scene;
  saveAmbiencePrefs();
  if(audio.playing)configureScene();
  syncAmbienceUI();
}
function changeVolume(value){
  ambiencePrefs.volume=Math.max(0,Math.min(100,Number(value)||0));
  saveAmbiencePrefs();
  if(audio.context&&audio.master&&audio.playing){
    audio.master.gain.setTargetAtTime((ambiencePrefs.volume/100)*.8,audio.context.currentTime,.12);
  }
  syncAmbienceUI();
}
function updateTimerUI(){
  const digits=$("#timerDigits");
  if(digits)digits.textContent=timerDisplay();
  const progress=$("#timerProgress");
  if(progress){
    const circumference=2*Math.PI*100;
    const ratio=focusTimer.duration?focusTimer.seconds/focusTimer.duration:0;
    progress.style.strokeDasharray=String(circumference);
    progress.style.strokeDashoffset=String(circumference*(1-ratio));
  }
  const button=$("#timerToggle");
  if(button)button.textContent=focusTimer.running?"Pause":"Start focus";
  const status=$("#focusStatus");
  if(status){
    status.textContent=focusTimer.running?"SESSION RUNNING":"READY";
    status.classList.toggle("running",focusTimer.running);
  }
  const running=$("#runningTimer");
  if(running)running.hidden=!focusTimer.running;
  const runningValue=$("#runningTimerValue");
  if(runningValue)runningValue.textContent=timerDisplay();
  const persistent=$("#persistentTimerToggle");
  if(persistent)persistent.textContent="Pause";
  $$(".duration-button").forEach(item=>item.classList.toggle("active",Number(item.dataset.duration)*60===focusTimer.duration));
}
function timerTick(){
  if(focusTimer.seconds>0)focusTimer.seconds--;
  if(focusTimer.seconds<=0){
    focusTimer.seconds=0;
    clearInterval(focusTimer.interval);
    focusTimer.interval=null;
    focusTimer.running=false;
    toast("Focus session complete");
  }
  updateTimerUI();
}
function toggleTimer(){
  if(focusTimer.running){
    clearInterval(focusTimer.interval);
    focusTimer.interval=null;
    focusTimer.running=false;
  }else{
    if(focusTimer.seconds<=0)focusTimer.seconds=focusTimer.duration;
    focusTimer.running=true;
    focusTimer.interval=setInterval(timerTick,1000);
  }
  updateTimerUI();
}
function resetTimer(){
  clearInterval(focusTimer.interval);
  focusTimer.interval=null;
  focusTimer.running=false;
  focusTimer.seconds=focusTimer.duration;
  updateTimerUI();
}
function selectDuration(minutes){
  clearInterval(focusTimer.interval);
  focusTimer.interval=null;
  focusTimer.running=false;
  focusTimer.duration=minutes*60;
  focusTimer.seconds=focusTimer.duration;
  updateTimerUI();
}
function openModal(type,options){
  const opts=options||{};
  modalType=type;
  editingId=opts.id||null;
  const projectId=opts.projectId||null;
  let title="",fields="",wide=false;
  if(type==="chooser"){
    title="Add to Nexus";
    fields='<div class="choice-list"><button class="choice-button" data-choice="project"><span class="choice-icon">P</span><span><strong>Project</strong><small>Group related work together</small></span></button><button class="choice-button" data-choice="task"><span class="choice-icon">✓</span><span><strong>Task</strong><small>Add something you need to do</small></span></button><button class="choice-button" data-choice="note"><span class="choice-icon">N</span><span><strong>Note</strong><small>Save information or an idea</small></span></button></div>';
  }
  if(type==="project"){
    const project=projectById(editingId)||{};
    title=editingId?"Edit project":"New project";
    fields='<label>PROJECT NAME<input class="field-input" name="name" maxlength="48" value="'+escapeHTML(project.name||"")+'" placeholder="Name" required></label><label>DESCRIPTION<textarea class="field-textarea" name="description" maxlength="240" placeholder="What is this project about?">'+escapeHTML(project.description||"")+'</textarea></label><label>STATUS<select class="field-select" name="status">'+["Planning","In progress","On hold","Complete"].map(status=>'<option '+((project.status||"Planning")===status?"selected":"")+'>'+status+'</option>').join("")+'</select></label>';
  }
  if(type==="task"){
    title="New task";
    fields='<label>TASK<input class="field-input" name="title" maxlength="110" placeholder="What needs doing?" required></label><label>PROJECT<select class="field-select" name="projectId"><option value="">No project</option>'+data.projects.map(project=>'<option value="'+escapeHTML(project.id)+'" '+(projectId===project.id?"selected":"")+'>'+escapeHTML(project.name)+'</option>').join("")+'</select></label>';
  }
  if(type==="note"){
    const note=data.notes.find(item=>item.id===editingId)||{};
    title=editingId?"Edit note":"New note";
    wide=true;
    fields='<label>TITLE<input class="field-input" name="title" maxlength="60" value="'+escapeHTML(note.title||"")+'" placeholder="Title" required></label><label>NOTE<textarea class="field-textarea" name="body" maxlength="5000" style="height:180px" placeholder="Write here">'+escapeHTML(note.body||"")+'</textarea></label><label>PROJECT<select class="field-select" name="projectId"><option value="">No project</option>'+data.projects.map(project=>'<option value="'+escapeHTML(project.id)+'" '+((note.projectId||projectId)===project.id?"selected":"")+'>'+escapeHTML(project.name)+'</option>').join("")+'</select></label>';
  }
  if(type==="search"){
    title="Search";
    fields='<input class="field-input" id="searchInput" type="search" placeholder="Search projects, tasks and notes" value="'+escapeHTML(searchQuery)+'" autocomplete="off"><div class="search-results" id="searchResults"></div>';
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
function closeModal(){
  $("#modalLayer").classList.remove("open");
  $("#modalLayer").setAttribute("aria-hidden","true");
  modalType="";
  editingId=null;
}
function saveForm(form){
  const values=Object.fromEntries(new FormData(form).entries());
  if(modalType==="project"){
    if(editingId){
      const project=projectById(editingId);
      if(project)Object.assign(project,{name:values.name.trim(),description:values.description.trim(),status:values.status});
    }else{
      const project={id:makeId("project"),name:values.name.trim(),description:values.description.trim(),symbol:values.name.trim().slice(0,1).toUpperCase(),status:values.status,created:Date.now()};
      data.projects.unshift(project);
      activeProjectId=project.id;
      currentView="projects";
    }
  }
  if(modalType==="task"){
    data.tasks.unshift({id:makeId("task"),title:values.title.trim(),projectId:values.projectId||null,done:false,created:Date.now()});
  }
  if(modalType==="note"){
    if(editingId){
      const note=data.notes.find(item=>item.id===editingId);
      if(note)Object.assign(note,{title:values.title.trim(),body:values.body,projectId:values.projectId||null,updated:Date.now()});
    }else{
      data.notes.unshift({id:makeId("note"),title:values.title.trim(),body:values.body,projectId:values.projectId||null,updated:Date.now()});
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
  saveData();
  render();
}
function deleteTask(taskId){
  data.tasks=data.tasks.filter(task=>task.id!==taskId);
  if(focusTimer.taskId===taskId)focusTimer.taskId="";
  saveData();
  render();
}
function toggleTask(taskId){
  const task=data.tasks.find(item=>item.id===taskId);
  if(!task)return;
  task.done=!task.done;
  if(task.done&&focusTimer.taskId===taskId)focusTimer.taskId="";
  saveData();
  render();
}
function drawSearchResults(){
  const root=$("#searchResults");
  if(!root)return;
  const query=searchQuery.trim().toLowerCase();
  if(!query){root.innerHTML='<div class="empty-state">Type to search projects, tasks and notes</div>';return;}
  const results=[];
  data.projects.forEach(project=>{if((project.name+" "+project.description).toLowerCase().includes(query))results.push({kind:"PROJECT",title:project.name,detail:project.description,id:project.id});});
  data.tasks.forEach(task=>{if(task.title.toLowerCase().includes(query))results.push({kind:"TASK",title:task.title,detail:projectById(task.projectId)?.name||"Task",id:task.id});});
  data.notes.forEach(note=>{if((note.title+" "+note.body).toLowerCase().includes(query))results.push({kind:"NOTE",title:note.title,detail:projectById(note.projectId)?.name||"Note",id:note.id});});
  root.innerHTML=results.length?results.slice(0,12).map(result=>'<button class="search-result" data-search-kind="'+result.kind+'" data-search-id="'+escapeHTML(result.id)+'"><span class="result-kind">'+result.kind.slice(0,1)+'</span><span><strong>'+escapeHTML(result.title)+'</strong><small>'+escapeHTML(result.detail)+'</small></span></button>').join(""):'<div class="empty-state">No results</div>';
}
function openSearchResult(kind,itemId){
  closeModal();
  if(kind==="PROJECT"){activeProjectId=itemId;currentView="projects";render();return;}
  if(kind==="TASK"){currentView="tasks";activeProjectId=null;taskFilter="all";focusTaskId=itemId;render();return;}
  if(kind==="NOTE"){openModal("note",{id:itemId});return;}
}
function exportWorkspace(){
  const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),...data},null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  anchor.href=url;
  anchor.download="nexus-workspace.json";
  anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast("Export created");
}
function resetWorkspace(){
  if(!confirm("Clear all projects, tasks and notes from this browser?"))return;
  data=clone(EMPTY_DATA);
  activeProjectId=null;
  currentView="home";
  saveData();
  render();
  toast("Workspace cleared");
}
function openSearch(){searchQuery="";openModal("search");}
function handleClick(event){
  const target=event.target;
  if(target.closest("[data-return-landing]")){returnToLanding();return;}
  const viewButton=target.closest("[data-view]");
  if(viewButton){setView(viewButton.dataset.view);return;}
  const open=target.closest("[data-open]");
  if(open){
    openModal(open.dataset.open,{projectId:open.dataset.projectPrefill||null});
    return;
  }
  if(target.closest("[data-close]")){closeModal();return;}
  const choice=target.closest("[data-choice]");
  if(choice){const selected=choice.dataset.choice;closeModal();openModal(selected);return;}
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
  if(duration){selectDuration(Number(duration.dataset.duration));return;}
  const searchResult=target.closest("[data-search-kind]");
  if(searchResult){openSearchResult(searchResult.dataset.searchKind,searchResult.dataset.searchId);return;}
}
document.addEventListener("click",handleClick);
function enterWorkspace(){
  $("#landingPage").hidden=true;
  $("#workspaceApp").hidden=false;
  currentView="home";
  activeProjectId=null;
  render();
  window.scrollTo({top:0,behavior:"smooth"});
}
function returnToLanding(){
  $("#workspaceApp").hidden=true;
  $("#landingPage").hidden=false;
  window.scrollTo({top:0,behavior:"smooth"});
}
$("#enterWorkspace").addEventListener("click",enterWorkspace);
$("#landingSoundToggle").addEventListener("click",toggleAmbience);
$("#addButton").addEventListener("click",()=>openModal("chooser"));
$("#searchButton").addEventListener("click",openSearch);
$("#ambienceButton").addEventListener("click",toggleAmbiencePanel);
$("#runningTimer").addEventListener("click",event=>{if(event.target.closest("[data-timer-toggle]"))toggleTimer();});
$("#ambiencePlay").addEventListener("click",toggleAmbience);
$("#ambiencePanel").addEventListener("click",event=>{
  const scene=event.target.closest("[data-scene]");
  if(scene)changeScene(scene.dataset.scene);
});
$("#ambienceVolume").addEventListener("input",event=>changeVolume(event.target.value));
document.addEventListener("pointerdown",event=>{
  if(!event.target.closest(".ambience-wrap")&&!event.target.closest("#homeAmbienceButton")&&!event.target.closest("#settingsAmbienceButton"))setAmbiencePanel(false);
});
$("#modalLayer").addEventListener("click",event=>{if(event.target===$("#modalLayer"))closeModal();});
$("#modalLayer").addEventListener("submit",event=>{
  if(event.target.id==="modalForm"){event.preventDefault();saveForm(event.target);}
});
$("#modalLayer").addEventListener("input",event=>{
  if(event.target.id==="searchInput"){searchQuery=event.target.value;drawSearchResults();}
});
$("#content").addEventListener("change",event=>{
  if(event.target.id==="focusTaskSelect"){
    focusTimer.taskId=event.target.value;
    try{localStorage.setItem("nexus-focus-task",focusTimer.taskId);}catch(error){}
  }
});
$("#content").addEventListener("submit",event=>{
  if(event.target.id==="quickTaskForm"){
    event.preventDefault();
    const input=$('input[name="quickTask"]',event.target);
    if(!input.value.trim())return;
    data.tasks.unshift({id:makeId("task"),title:input.value.trim(),projectId:activeProjectId||null,done:false,created:Date.now()});
    saveData();
    render();
    toast("Task added");
  }
});
$("#content").addEventListener("click",event=>{
  if(event.target.closest("#homeAmbienceButton")||event.target.closest("#settingsAmbienceButton")){setAmbiencePanel(true);return;}
  if(event.target.closest("#timerToggle")||event.target.closest("#persistentTimerToggle"))toggleTimer();
  if(event.target.id==="timerReset")resetTimer();
  if(event.target.id==="exportData")exportWorkspace();
  if(event.target.id==="resetData")resetWorkspace();
});
document.addEventListener("keydown",event=>{
  const typing=event.target.matches("input,textarea,select");
  if(event.key==="Escape"){closeModal();setAmbiencePanel(false);}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){event.preventDefault();openSearch();}
  if(!typing&&!event.ctrlKey&&!event.metaKey){
    const views={"1":"home","2":"projects","3":"tasks","4":"notes"};
    if(views[event.key])setView(views[event.key]);
  }
});
try{focusTimer.taskId=localStorage.getItem("nexus-focus-task")||"";}catch(error){}
$("#todayDate").textContent=new Date().toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"}).toUpperCase();
render();
syncAmbienceUI();
})();