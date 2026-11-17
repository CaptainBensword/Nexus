(function () {
"use strict";
var $ = function (selector, root) { return (root || document).querySelector(selector); };
var $$ = function (selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };
var EMOJIS = ["😀","😃","😄","😁","😆","😅","😂","🤣","🥹","😊","🙂","😉","😍","🥰","😘","😎","🤩","🥳","😴","🤔","🫡","😭","😤","😱","🙌","👏","👍","👎","👋","🤝","🙏","💪","❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","✨","⭐","🌟","🔥","💯","🎉","🎊","🎯","🚀","⚡","☀️","🌙","🌈","☁️","🌊","🌲","🌻","🌸","🍀","🍎","🍕","🍔","🍟","🍩","🍪","☕","🧋","⚽","🏀","🎮","🕹️","🎧","🎵","🎸","📚","📖","📝","💡","🔔","📌","🏆","🎨","🧩","🛠️","💻","📷","🐶","🐱","🦊","🐻","🐼","🐸","🐙","🦋","🐢","🦖","🐉","👾","🤖","🏠","🏡","🌍","🗺️","🧭","🛡️","⚔️","🗡️","🪄","🔮","🎲","♟️","🏴‍☠️","🚩"];
var state = {
  apiAvailable:false, demo:false, user:null, page:"home", authTab:"login",
  friends:[], incoming:[], outgoing:[], chambers:[], discover:[], conversations:[],
  chamber:null, selectedPocket:null, pocketMessages:[],
  conversation:null, dmMessages:[], search:"",
  socket:null, heartbeat:null, emojiTarget:null
};
var demo = loadDemo();

function loadDemo(){
  try {
    var saved=JSON.parse(localStorage.getItem("nexus-demo-data")||"{}");
    return {
      chambers:Array.isArray(saved.chambers)?saved.chambers:[],
      requests:Array.isArray(saved.requests)?saved.requests:[],
      messages:saved.messages&&typeof saved.messages==="object"?saved.messages:{},
      friends:Array.isArray(saved.friends)?saved.friends:[],
      conversations:Array.isArray(saved.conversations)?saved.conversations:[],
      dmMessages:saved.dmMessages&&typeof saved.dmMessages==="object"?saved.dmMessages:{},
      displayName:typeof saved.displayName==="string"?saved.displayName:"Admin Preview"
    };
  } catch (error) {
    return {chambers:[],requests:[],messages:{},friends:[],conversations:[],dmMessages:{},displayName:"Admin Preview"};
  }
}
function saveDemo(){
  try { localStorage.setItem("nexus-demo-data",JSON.stringify(demo)); }
  catch (error) { toast("This browser could not save more preview data."); }
}
function escapeHTML(value){
  return String(value==null?"":value).replace(/[&<>"']/g,function(ch){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];
  });
}
function toast(message){
  var root=$("#toastRoot");
  root.innerHTML='<div class="toast">'+escapeHTML(message)+'</div>';
  clearTimeout(toast.timer);
  toast.timer=setTimeout(function(){root.innerHTML="";},2600);
}
function dateLabel(value){
  var date=new Date(value);
  if(isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});
}
function api(path, method, body){
  var options={method:method||"GET",credentials:"same-origin",headers:{}};
  if(body!==undefined){options.headers["Content-Type"]="application/json";options.body=JSON.stringify(body);}
  return fetch("/api"+path,options).then(function(response){
    return response.json().catch(function(){return {};}).then(function(data){
      if(!response.ok) throw new Error(data.error||"The request could not be completed.");
      return data;
    });
  });
}
function setAuthTab(tab){
  state.authTab=tab;
  $$(".auth-tab").forEach(function(button){button.classList.toggle("active",button.dataset.authTab===tab);});
  $("#registerFields").classList.toggle("hidden",tab!=="register");
  $("#loginFields").classList.toggle("hidden",tab!=="login");
  $("#authSubmit").textContent=tab==="register"?"Create Account":"Log In";
  $("#authPassword").autocomplete=tab==="register"?"new-password":"current-password";
  $("#loginNote").textContent="";
}
function showLoginNote(message){
  $("#loginNote").textContent=message;
}
function showLogin(){
  $("#app").classList.add("hidden");
  $("#login").classList.remove("hidden");
}
function enterDemo(){
  disconnectSocket();
  state.demo=true;
  state.apiAvailable=false;
  state.user={id:"demo-user",username:"admin",displayName:demo.displayName||"Admin Preview"};
  state.friends=demo.friends;
  state.incoming=[];
  state.outgoing=demo.requests;
  state.chambers=demo.chambers;
  state.discover=[];
  state.conversations=demo.conversations;
  state.chamber=null;
  state.selectedPocket=null;
  state.conversation=null;
  state.page="home";
  enterApp();
}
function enterReal(user){
  state.demo=false;
  state.user=user;
  state.page="home";
  return refreshAll().then(function(){enterApp();connectSocket();});
}
function enterApp(){
  $("#login").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#previewFlag").classList.toggle("hidden",!state.demo);
  $("#profileName").textContent=state.user.displayName||state.user.username;
  $("#profileAvatar").textContent=(state.user.displayName||state.user.username||"N").slice(0,1).toUpperCase();
  $("#profileStatus").innerHTML='<i class="online-dot"></i>'+(state.demo?"Preview mode":"Online");
  render();
}
function refreshAll(){
  if(state.demo){
    state.friends=demo.friends;state.outgoing=demo.requests;state.chambers=demo.chambers;state.conversations=demo.conversations;
    return Promise.resolve();
  }
  return Promise.all([api("/friends"),api("/chambers"),api("/conversations")]).then(function(results){
    state.friends=results[0].friends||[];
    state.incoming=results[0].incoming||[];
    state.outgoing=results[0].outgoing||[];
    state.chambers=results[1].chambers||[];
    state.conversations=results[2].conversations||[];
    updateFriendBadge();
  });
}
function updateFriendBadge(){
  var count=state.incoming.length;
  $("#friendBadge").textContent=count?String(count):"";
  $("#friendBadge").classList.toggle("hidden",!count);
}
function connectSocket(){
  disconnectSocket();
  if(!window.io) return;
  try {
    state.socket=window.io({transports:["websocket","polling"]});
    state.socket.on("connect",function(){
      if(state.chamber&&state.selectedPocket) state.socket.emit("join-pocket",state.selectedPocket.id);
      if(state.conversation) state.socket.emit("join-dm",state.conversation.id);
      state.socket.emit("heartbeat");
    });
    state.socket.on("pocket:message",function(payload){
      if(!state.chamber||!state.selectedPocket||payload.pocketId!==state.selectedPocket.id) return;
      if(state.pocketMessages.some(function(item){return String(item.id)===String(payload.message.id)})) return;
      state.pocketMessages.push(payload.message);
      drawPocketMessages(true);
    });
    state.socket.on("dm:message",function(payload){
      if(!state.conversation||payload.conversationId!==state.conversation.id) return;
      if(state.dmMessages.some(function(item){return String(item.id)===String(payload.message.id)})) return;
      state.dmMessages.push(payload.message);
      drawDMMessages(true);
    });
    state.socket.on("presence:change",function(payload){
      var friend=state.friends.find(function(item){return item.id===payload.userId;});
      if(friend){friend.online=payload.online;friend.lastSeenAt=payload.lastSeenAt;renderRightRail();}
    });
    state.socket.on("friend-request:new",function(){refreshAll().then(render);});
    state.socket.on("friend-request:accepted",function(){refreshAll().then(render);});
    state.socket.on("connect_error",function(){});
    state.heartbeat=setInterval(function(){if(state.socket&&state.socket.connected)state.socket.emit("heartbeat");},25000);
  } catch (error) { state.socket=null; }
}
function disconnectSocket(){
  if(state.heartbeat){clearInterval(state.heartbeat);state.heartbeat=null;}
  if(state.socket){state.socket.disconnect();state.socket=null;}
}
function logout(){
  if(state.demo){
    state.demo=false;
    state.user=null;
    state.chamber=null;
    showLogin();
    return;
  }
  api("/auth/logout","POST",{}).catch(function(){})
    .finally(function(){
      disconnectSocket();
      state.user=null;state.chamber=null;state.conversation=null;
      showLogin();
      setAuthTab("login");
      showLoginNote("");
    });
}
function navTo(page){
  state.page=page;
  if(page!=="chambers"){state.chamber=null;state.selectedPocket=null;}
  if(page!=="messages")state.conversation=null;
  render();
}
function navHTML(){
  return [
    ["home","⌂","Home"],["friends","♧","Friends"],["chambers","▦","Chambers"],["messages","▤","Messages"]
  ].map(function(item){
    return '<button class="nav-button '+(state.page===item[0]?'active':'')+'" data-page="'+item[0]+'"><span class="nav-icon">'+item[1]+'</span>'+item[2]+'</button>';
  }).join("");
}
function personAvatar(person){
  return '<span class="person-avatar">'+escapeHTML((person.displayName||person.username||"?").slice(0,1).toUpperCase())+'</span>';
}
function renderRightRail(){
  var online=state.friends.filter(function(friend){return !!friend.online;});
  var incoming=state.incoming.length;
  var requests= incoming ? state.incoming.slice(0,4).map(function(request){
    return '<div class="person-row">'+personAvatar(request)+'<div class="person-meta"><strong>'+escapeHTML(request.display_name||request.displayName||request.username)+'</strong><span>Sent a request</span></div><span class="person-status online"></span></div>';
  }).join("") : '<div class="rail-empty">No pending requests.</div>';
  var onlineHTML=online.length?online.slice(0,8).map(function(friend){
    return '<div class="person-row">'+personAvatar(friend)+'<div class="person-meta"><strong>'+escapeHTML(friend.displayName||friend.username)+'</strong><span>Online</span></div><span class="person-status online"></span></div>';
  }).join(""):'<div class="rail-empty">No friends online right now.</div>';
  $("#rightRail").innerHTML=
    '<section class="rail-section"><div class="rail-heading"><span>Friend requests</span><span class="rail-count">'+incoming+' incoming</span></div>'+requests+'<button class="rail-link" data-page="friends" data-tab="requests">Open requests</button></section>'+
    '<section class="rail-section"><div class="rail-heading"><span>Online friends</span><span class="rail-count">'+online.length+' online</span></div>'+onlineHTML+'</section>';
}
function renderHome(){
  var chamberHTML=state.chambers.length?
    '<div class="chamber-grid">'+state.chambers.slice(0,4).map(chamberCard).join("")+'</div>':
    emptyState("▦","No Chambers yet","Create a Chamber and give your people a place to talk.","Create Chamber","create-chamber");
  var online=state.friends.filter(function(friend){return friend.online;});
  return '<div class="section-head"><div><h2>Home</h2><p>Your people and your spaces</p></div><div class="button-row"><button class="outline-button" data-action="join-chamber">Join with code</button><button class="primary-small" data-action="create-chamber">＋ Create Chamber</button></div></div>'+
    '<div class="grid-two"><section><div class="section-head"><div><h2>Your Chambers</h2><p>Spaces you are part of</p></div><button class="rail-link" data-page="chambers">View all</button></div>'+chamberHTML+'</section>'+
    '<section><div class="section-head"><div><h2>Friends online</h2><p>People you have added</p></div><button class="rail-link" data-page="friends">Friends</button></div><div class="panel">'+(online.length?online.slice(0,5).map(function(friend){return '<div class="person-row">'+personAvatar(friend)+'<div class="person-meta"><strong>'+escapeHTML(friend.displayName||friend.username)+'</strong><span>Online</span></div><button class="small-action" data-action="message-friend" data-friend="'+escapeHTML(friend.id)+'">Message</button></div>';}).join(""):'<div class="rail-empty">No friends online right now.</div>')+'</div></section></div>';
}
function chamberCard(chamber){
  var emoji=chamber.emoji||"🏠";
  return '<button class="chamber-card" data-chamber="'+escapeHTML(chamber.id)+'"><span class="chamber-symbol">'+escapeHTML(emoji)+'</span><span class="chamber-name">'+escapeHTML(chamber.name)+'</span><span class="chamber-meta">'+(chamber.memberCount||1)+' member'+((chamber.memberCount||1)===1?'':'s')+' · '+(chamber.pocketCount||1)+' Pocket'+((chamber.pocketCount||1)===1?'':'s')+'</span></button>';
}
function emptyState(mark,title,description,button,action){
  return '<div class="empty-state"><div class="empty-mark">'+mark+'</div><h3>'+title+'</h3><p>'+description+'</p>'+(button?'<button class="primary-small" data-action="'+action+'">'+button+'</button>':'')+'</div>';
}
function renderChambers(){
  if(state.chamber) return renderChamberDetail();
  var tab=state.chamberTab||"mine";
  var list=tab==="mine"?state.chambers:state.discover;
  if(state.search){var query=state.search;list=list.filter(function(chamber){return String(chamber.name||"").toLowerCase().includes(query)||String(chamber.description||"").toLowerCase().includes(query)||(chamber.pockets||[]).some(function(pocket){return String(pocket.name||"").toLowerCase().includes(query);});});}
  var content=list.length?(tab==="mine"?'<div class="chamber-grid">'+list.map(chamberCard).join("")+'<button class="create-card" data-action="create-chamber"><span class="create-plus">+</span>Create Chamber</button></div>':'<div class="chamber-grid">'+list.map(function(chamber){
    return '<div class="discover-card"><div class="discover-emoji">'+escapeHTML(chamber.emoji||"🏠")+'</div><div class="discover-copy"><strong>'+escapeHTML(chamber.name)+'</strong><p>'+escapeHTML(chamber.description||"")+' · '+(chamber.member_count||0)+' members</p></div><button class="primary-small" data-action="join-public" data-chamber="'+escapeHTML(chamber.id)+'">Join</button></div>';
  }).join("")+'</div>'):emptyState(tab==="mine"?"▦":"⌕",tab==="mine"?"No Chambers yet":"Nothing to discover","Create a Chamber or join one with an invite code.",tab==="mine"?"Create Chamber":"Join with code",tab==="mine"?"create-chamber":"join-chamber");
  return '<div class="section-head"><div><h2>Chambers</h2><p>Communities with their own Pockets</p></div><div class="button-row"><button class="outline-button" data-action="join-chamber">Join with code</button><button class="primary-small" data-action="create-chamber">＋ Create Chamber</button></div></div>'+
    '<div class="tabs"><button class="tab '+(tab==="mine"?"active":"")+'" data-chamber-tab="mine">Your Chambers</button><button class="tab '+(tab==="discover"?"active":"")+'" data-chamber-tab="discover">Discover</button></div>'+content;
}
function renderChamberDetail(){
  var chamber=state.chamber;
  if(!chamber)return renderChambers();
  var pockets=chamber.pockets||[];
  var isManager=chamber.role==="owner"||chamber.role==="moderator"||state.demo;
  var pocketList=pockets.map(function(pocket){
    return '<div class="pocket-row"><button class="pocket-item '+(state.selectedPocket&&state.selectedPocket.id===pocket.id?"active":"")+'" data-pocket="'+escapeHTML(pocket.id)+'"><span>'+escapeHTML(pocket.emoji||"💬")+'</span><span class="pocket-label">'+escapeHTML(pocket.name)+'</span></button>'+(isManager?'<button class="pocket-more" data-action="edit-pocket" data-pocket="'+escapeHTML(pocket.id)+'" title="Pocket settings">⋯</button>':'')+'</div>';
  }).join("");
  var selected=state.selectedPocket||pockets[0];
  return '<div class="section-head"><div><h2>'+escapeHTML(chamber.emoji||"🏠")+' '+escapeHTML(chamber.name)+'</h2><p>'+escapeHTML(chamber.description||"")+'</p></div><div class="button-row">'+(isManager?'<button class="outline-button" data-action="invite-chamber">Invite</button><button class="outline-button" data-action="manage-chamber">Manage</button>':'<button class="outline-button" data-action="invite-chamber">Invite</button>')+'<button class="outline-button" data-action="back-chambers">← All Chambers</button></div></div>'+
    '<div class="chamber-layout"><aside class="pocket-sidebar"><div class="pocket-sidebar-head"><span>POCKETS</span><button class="pocket-add" data-action="create-pocket" title="Create Pocket">＋</button></div>'+pocketList+'</aside>'+
    '<section class="pocket-main">'+(selected?renderPocketPane(selected):emptyState("＋","No Pockets","Create a Pocket for conversations.","Create Pocket","create-pocket"))+'</section></div>';
}
function renderPocketPane(pocket){
  return '<header class="pocket-header"><div><h3>'+escapeHTML(pocket.emoji||"💬")+'　'+escapeHTML(pocket.name)+'</h3><p>'+escapeHTML(pocket.topic||"")+'</p></div><div class="button-row"><button class="outline-button" data-action="edit-pocket" data-pocket="'+escapeHTML(pocket.id)+'">Pocket settings</button></div></header>'+
    '<div id="messageFeed" class="message-feed">'+renderMessagesHTML(state.pocketMessages)+'</div>'+
    '<form id="pocketComposer" class="composer"><div class="composer-input-wrap"><button type="button" class="emoji-trigger" data-action="toggle-emoji" data-target="pocket" aria-label="Add emoji">☺</button><input id="pocketMessageInput" maxlength="2000" autocomplete="off" placeholder="Message #'+escapeHTML(pocket.name)+'" aria-label="Message Pocket"></div><button class="send-button" type="submit" aria-label="Send message">➤</button></form>';
}
function renderMessagesHTML(messages){
  if(!messages||!messages.length)return '<div class="message-empty">Nothing here yet. Start the conversation.</div>';
  return messages.map(function(message){
    var who=message.user||{displayName:"Unknown",id:""};
    return '<article class="chat-message"><div class="chat-avatar">'+escapeHTML((who.displayName||who.username||"?").slice(0,1).toUpperCase())+'</div><div class="chat-copy"><div class="chat-meta"><b>'+escapeHTML(who.displayName||who.username||"Unknown")+'</b><time>'+escapeHTML(dateLabel(message.createdAt))+'</time></div><div class="chat-body">'+escapeHTML(message.body)+'</div></div></article>';
  }).join("");
}
function drawPocketMessages(scroll){
  var feed=$("#messageFeed");if(!feed)return;
  feed.innerHTML=renderMessagesHTML(state.pocketMessages);
  if(scroll)feed.scrollTop=feed.scrollHeight;
}
function renderFriends(){
  var tab=state.friendTab||"all";
  var content="";
  if(tab==="requests"){
    var incoming=state.incoming.length?state.incoming.map(function(request){
      return '<div class="row-item">'+personAvatar({displayName:request.display_name||request.displayName,username:request.username})+'<div class="row-main"><div class="row-name">'+escapeHTML(request.display_name||request.displayName||request.username)+'</div><div class="row-sub">@'+escapeHTML(request.username)+' · Incoming request</div></div><button class="primary-small" data-action="accept-request" data-request="'+escapeHTML(request.id)+'">Accept</button><button class="small-action" data-action="decline-request" data-request="'+escapeHTML(request.id)+'">Decline</button></div>';
    }).join(""):'<div class="rail-empty">No incoming requests.</div>';
    var outgoing=state.outgoing.length?state.outgoing.map(function(request){
      return '<div class="row-item">'+personAvatar({displayName:request.display_name||request.displayName,username:request.username})+'<div class="row-main"><div class="row-name">'+escapeHTML(request.display_name||request.displayName||request.username)+'</div><div class="row-sub">@'+escapeHTML(request.username)+' · Waiting for a reply</div></div><span class="status-pill">SENT</span><button class="small-action" data-action="cancel-request" data-request="'+escapeHTML(request.id)+'">Cancel</button></div>';
    }).join(""):'<div class="rail-empty">No outgoing requests.</div>';
    content='<div class="panel"><div class="panel-title">Incoming</div>'+incoming+'</div><div class="panel" style="margin-top:12px"><div class="panel-title">Outgoing</div>'+outgoing+'</div>';
  } else {
    content=state.friends.length?'<div class="list-card">'+state.friends.map(function(friend){
      return '<div class="row-item">'+personAvatar(friend)+'<div class="row-main"><div class="row-name">'+escapeHTML(friend.displayName||friend.username)+'</div><div class="row-sub">@'+escapeHTML(friend.username)+'</div></div><span class="status-pill">'+(friend.online?"ONLINE":"OFFLINE")+'</span><button class="small-action" data-action="message-friend" data-friend="'+escapeHTML(friend.id)+'">Message</button><button class="small-action" data-action="friend-options" data-friend="'+escapeHTML(friend.id)+'">⋯</button></div>';
    }).join("")+'</div>':emptyState("♧","No friends yet","Add someone by their username to send a request.","Add Friend","add-friend");
  }
  return '<div class="section-head"><div><h2>Friends</h2><p>People you have connected with</p></div><button class="primary-small" data-action="add-friend">＋ Add Friend</button></div><div class="tabs"><button class="tab '+(tab==="all"?"active":"")+'" data-friend-tab="all">All Friends</button><button class="tab '+(tab==="requests"?"active":"")+'" data-friend-tab="requests">Requests'+(state.incoming.length?" ("+state.incoming.length+")":"")+'</button></div>'+content;
}
function renderMessages(){
  var active=state.conversation;
  var people=state.friends.map(function(friend){
    var selected=active&&active.friendId===friend.id;
    return '<button class="dm-person '+(selected?"active":"")+'" data-dm-friend="'+escapeHTML(friend.id)+'">'+personAvatar(friend)+'<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escapeHTML(friend.displayName||friend.username)+'</span></button>';
  }).join("");
  var main=active?'<div class="dm-main"><header class="pocket-header"><div><h3>'+escapeHTML(active.displayName||active.username||"Conversation")+'</h3><p>Direct messages</p></div></header><div id="dmFeed" class="message-feed">'+renderMessagesHTML(state.dmMessages)+'</div><form id="dmComposer" class="composer"><div class="composer-input-wrap"><button type="button" class="emoji-trigger" data-action="toggle-emoji" data-target="dm" aria-label="Add emoji">☺</button><input id="dmMessageInput" maxlength="2000" autocomplete="off" placeholder="Message '+escapeHTML(active.displayName||active.username)+'" aria-label="Direct message"></div><button class="send-button" type="submit" aria-label="Send message">➤</button></form></div>':
    '<div class="message-view">'+emptyState("▤","Your messages","Choose a friend to open a conversation. Add people from Friends first.","Find Friends","go-friends")+'</div>';
  return '<div class="section-head"><div><h2>Messages</h2><p>Private conversations with your friends</p></div></div><div class="dm-layout"><aside class="dm-list">'+(people||'<div class="rail-empty">Your friend list is empty.</div>')+'</aside>'+main+'</div>';
}
function renderSettings(){
  return '<div class="section-head"><div><h2>Settings</h2><p>Your account</p></div></div><div class="panel settings-list">'+
    '<div class="setting-row"><div><div class="setting-label">Display name</div><div class="setting-help">'+escapeHTML(state.user.displayName||state.user.username)+'</div></div><button class="outline-button" data-action="edit-profile">Edit</button></div>'+
    '<div class="setting-row"><div><div class="setting-label">Username</div><div class="setting-help">@'+escapeHTML(state.user.username)+'</div></div></div>'+
    '<div class="setting-row"><div><div class="setting-label">Password</div><div class="setting-help">Change your account password</div></div><button class="outline-button" data-action="change-password">Change</button></div>'+
    '<div class="setting-row"><div><div class="setting-label">Account system</div><div class="setting-help">'+(state.demo?"Local preview only":"Nexus custom account service")+'</div></div><span class="status-pill">'+(state.demo?"PREVIEW":"CONNECTED")+'</span></div>'+
    '<div class="setting-row"><div><div class="setting-label">Sign out</div><div class="setting-help">End this session on this device</div></div><button class="danger-button" data-action="logout">Log Out</button></div>'+
    '</div>';
}
function render(){
  if(!state.user)return;
  $("#mainNav").innerHTML=navHTML();
  $$("#mainNav [data-page]").forEach(function(button){button.classList.toggle("active",button.dataset.page===state.page);});
  $("#pageTitle").textContent={home:"Home",friends:"Friends",chambers:"Chambers",messages:"Messages",settings:"Settings"}[state.page]||"Home";
  $("#pageEyebrow").textContent=state.page==="chambers"?"YOUR COMMUNITIES":state.page==="friends"?"YOUR CONNECTIONS":state.page==="messages"?"PRIVATE":state.page==="settings"?"ACCOUNT":"YOUR SPACE";
  $("#profileName").textContent=state.user.displayName||state.user.username;
  $("#profileAvatar").textContent=(state.user.displayName||state.user.username||"N").slice(0,1).toUpperCase();
  $("#previewFlag").classList.toggle("hidden",!state.demo);
  updateFriendBadge();
  var content=state.page==="home"?renderHome():state.page==="friends"?renderFriends():state.page==="chambers"?renderChambers():state.page==="messages"?renderMessages():renderSettings();
  $("#view").innerHTML=content;
  renderRightRail();
  if(state.page==="chambers"&&state.chamber)drawPocketMessages(false);
  if(state.page==="messages"&&state.conversation)drawDMMessages(false);
}
function drawDMMessages(scroll){
  var feed=$("#dmFeed");if(!feed)return;
  feed.innerHTML=renderMessagesHTML(state.dmMessages);
  if(scroll)feed.scrollTop=feed.scrollHeight;
}
function demoPocketMessages(chamberId,pocketId){
  var key=chamberId+":"+pocketId;
  return Array.isArray(demo.messages[key])?demo.messages[key]:[];
}
function setDemoPocketMessages(chamberId,pocketId,messages){
  demo.messages[chamberId+":"+pocketId]=messages;
  saveDemo();
}
function demoFindChamber(id){return demo.chambers.find(function(chamber){return chamber.id===id;})||null;}
function openChamber(id){
  state.page="chambers";
  if(state.demo){
    var chamber=demoFindChamber(id);
    if(!chamber)return;
    state.chamber=chamber;
    state.selectedPocket=chamber.pockets[0]||null;
    state.pocketMessages=state.selectedPocket?demoPocketMessages(chamber.id,state.selectedPocket.id):[];
    render();
    return;
  }
  api("/chambers/"+encodeURIComponent(id)).then(function(result){
    state.chamber=result.chamber;
    state.selectedPocket=result.chamber.pockets[0]||null;
    return state.selectedPocket?loadPocketMessages():Promise.resolve();
  }).then(function(){render();joinCurrentPocket();}).catch(function(error){toast(error.message);});
}
function loadPocketMessages(){
  if(!state.chamber||!state.selectedPocket)return Promise.resolve();
  if(state.demo){
    state.pocketMessages=demoPocketMessages(state.chamber.id,state.selectedPocket.id).slice();
    return Promise.resolve();
  }
  return api("/pockets/"+encodeURIComponent(state.selectedPocket.id)+"/messages").then(function(result){state.pocketMessages=result.messages||[];});
}
function joinCurrentPocket(){
  if(state.socket&&state.socket.connected&&state.selectedPocket)state.socket.emit("join-pocket",state.selectedPocket.id);
}
function selectPocket(id){
  if(state.socket&&state.selectedPocket)state.socket.emit("leave-pocket",state.selectedPocket.id);
  var pocket=(state.chamber.pockets||[]).find(function(item){return item.id===id;});
  if(!pocket)return;
  state.selectedPocket=pocket;
  loadPocketMessages().then(function(){render();joinCurrentPocket();}).catch(function(error){toast(error.message);});
}
function sendPocketMessage(body){
  if(!state.chamber||!state.selectedPocket)return;
  if(state.demo){
    var messages=demoPocketMessages(state.chamber.id,state.selectedPocket.id).slice();
    messages.push({id:String(Date.now()),body:body,createdAt:new Date().toISOString(),user:{id:"demo-user",username:"admin",displayName:state.user.displayName}});
    setDemoPocketMessages(state.chamber.id,state.selectedPocket.id,messages);
    state.pocketMessages=messages;drawPocketMessages(true);return Promise.resolve();
  }
  return api("/pockets/"+encodeURIComponent(state.selectedPocket.id)+"/messages","POST",{body:body}).then(function(result){
    if(!state.socket||!state.socket.connected){
      if(!state.pocketMessages.some(function(item){return String(item.id)===String(result.message.id)}))state.pocketMessages.push(result.message);
      drawPocketMessages(true);
    }
  });
}
function loadConversations(){
  if(state.demo){state.conversations=demo.conversations;return Promise.resolve();}
  return api("/conversations").then(function(result){state.conversations=result.conversations||[];});
}
function openDM(friendId){
  var friend=state.friends.find(function(item){return item.id===friendId;});
  if(!friend)return;
  if(state.demo){
    var conversation=demo.conversations.find(function(item){return item.friendId===friendId;});
    if(!conversation){conversation={id:"demo-dm-"+friendId,friendId:friendId,username:friend.username,displayName:friend.displayName};demo.conversations.push(conversation);saveDemo();}
    state.conversation=conversation;
    state.dmMessages=demo.dmMessages[conversation.id]||[];
    state.page="messages";render();return;
  }
  api("/conversations","POST",{friendId:friendId}).then(function(result){
    return api("/conversations").then(function(list){
      state.conversations=list.conversations||[];
      var found=state.conversations.find(function(item){return item.id===result.conversationId;});
      state.conversation=found||{id:result.conversationId,friendId:friend.id,username:friend.username,displayName:friend.displayName};
      if(state.socket&&state.socket.connected)state.socket.emit("join-dm",state.conversation.id);
      return api("/conversations/"+encodeURIComponent(result.conversationId)+"/messages");
    });
  }).then(function(result){state.dmMessages=result.messages||[];state.page="messages";render();if(state.socket&&state.socket.connected)state.socket.emit("join-dm",state.conversation.id);}).catch(function(error){toast(error.message);});
}
function sendDM(body){
  if(!state.conversation)return;
  if(state.demo){
    var messages=(demo.dmMessages[state.conversation.id]||[]).slice();
    messages.push({id:String(Date.now()),body:body,createdAt:new Date().toISOString(),user:{id:"demo-user",username:"admin",displayName:state.user.displayName}});
    demo.dmMessages[state.conversation.id]=messages;saveDemo();state.dmMessages=messages;drawDMMessages(true);return Promise.resolve();
  }
  return api("/conversations/"+encodeURIComponent(state.conversation.id)+"/messages","POST",{body:body}).then(function(result){
    if(!state.socket||!state.socket.connected){
      if(!state.dmMessages.some(function(item){return String(item.id)===String(result.message.id)}))state.dmMessages.push(result.message);
      drawDMMessages(true);
    }
  });
}
function refreshAndRender(){
  return refreshAll().then(function(){render();}).catch(function(error){toast(error.message);});
}
function emojiGrid(selected){
  return '<div class="emoji-select-grid">'+EMOJIS.map(function(emoji){return '<button type="button" class="emoji-select '+(emoji===selected?"selected":"")+'" data-select-emoji="'+escapeHTML(emoji)+'">'+emoji+'</button>';}).join("")+'</div>';
}
function openModal(type,data){
  data=data||{};
  var html="";
  if(type==="chamber"){
    html='<div class="modal-backdrop" data-close-modal><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h3>Create a Chamber</h3><button class="modal-close" data-close-modal>×</button></div><form id="chamberForm" class="form-grid"><label class="form-label" for="chamberName">Name</label><input id="chamberName" class="form-input" maxlength="48" required placeholder="Name your Chamber"><label class="form-label">Choose an icon</label><input id="chamberEmoji" class="form-input" value="🏠" maxlength="12" aria-label="Chamber emoji"><div class="emoji-select-grid">'+EMOJIS.slice(0,64).map(function(e){return '<button type="button" class="emoji-select" data-select-emoji="'+e+'">'+e+'</button>';}).join("")+'</div><label class="form-label" for="chamberDescription">Description</label><textarea id="chamberDescription" class="form-textarea" maxlength="180" placeholder="What is this Chamber for?"></textarea><label class="form-label"><input id="chamberPublic" type="checkbox" style="width:auto;margin-right:7px">Make this Chamber discoverable</label><div class="modal-note">Private is the default. You can invite people with a code.</div><div class="modal-actions"><button type="button" class="soft-button" data-close-modal>Cancel</button><button class="primary-small" type="submit">Create Chamber</button></div></form></div></div>';
  }
  if(type==="pocket"){
    html='<div class="modal-backdrop" data-close-modal><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h3>Create a Pocket</h3><button class="modal-close" data-close-modal>×</button></div><form id="pocketForm" class="form-grid"><label class="form-label" for="pocketName">Pocket name</label><input id="pocketName" class="form-input" maxlength="32" required placeholder="general-chat"><label class="form-label" for="pocketEmoji">Pick an emoji</label><input id="pocketEmoji" class="form-input" value="💬" maxlength="12"><div class="emoji-select-grid">'+EMOJIS.map(function(e){return '<button type="button" class="emoji-select" data-select-emoji="'+e+'">'+e+'</button>';}).join("")+'</div><label class="form-label" for="pocketTopic">Topic (optional)</label><input id="pocketTopic" class="form-input" maxlength="120" placeholder="What belongs in this Pocket?"><div class="modal-actions"><button type="button" class="soft-button" data-close-modal>Cancel</button><button class="primary-small" type="submit">Create Pocket</button></div></form></div></div>';
  }
  if(type==="edit-pocket"){
    html='<div class="modal-backdrop" data-close-modal><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h3>Pocket settings</h3><button class="modal-close" data-close-modal>×</button></div><form id="editPocketForm" class="form-grid"><label class="form-label" for="editPocketName">Name</label><input id="editPocketName" class="form-input" maxlength="32" required value="'+escapeHTML(data.name)+'"><label class="form-label" for="editPocketEmoji">Emoji</label><input id="editPocketEmoji" class="form-input" maxlength="12" value="'+escapeHTML(data.emoji||"💬")+'"><div class="emoji-select-grid">'+EMOJIS.slice(0,72).map(function(e){return '<button type="button" class="emoji-select" data-select-emoji="'+e+'">'+e+'</button>';}).join("")+'</div><label class="form-label" for="editPocketTopic">Topic</label><input id="editPocketTopic" class="form-input" maxlength="120" value="'+escapeHTML(data.topic||"")+'"><div class="modal-actions" style="justify-content:space-between"><button type="button" class="danger-button" data-action="delete-pocket" data-pocket="'+escapeHTML(data.id)+'">Delete Pocket</button><span class="button-row"><button type="button" class="soft-button" data-close-modal>Cancel</button><button class="primary-small" type="submit">Save</button></span></div></form></div></div>';
  }
  if(type==="friend"){
    html='<div class="modal-backdrop" data-close-modal><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h3>Add a Friend</h3><button class="modal-close" data-close-modal>×</button></div><form id="friendForm" class="form-grid"><label class="form-label" for="friendUsername">Username</label><input id="friendUsername" class="form-input" maxlength="24" required placeholder="Enter their username"><div class="modal-note">You can send a request by username.</div><div class="modal-actions"><button type="button" class="soft-button" data-close-modal>Cancel</button><button class="primary-small" type="submit">Send Request</button></div></form></div></div>';
  }
  if(type==="join"){
    html='<div class="modal-backdrop" data-close-modal><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h3>Join a Chamber</h3><button class="modal-close" data-close-modal>×</button></div><form id="joinForm" class="form-grid"><label class="form-label" for="inviteCode">Invite code</label><input id="inviteCode" class="form-input" maxlength="24" required value="'+escapeHTML(data.code||"")+'" placeholder="Paste an invite code"><div class="modal-actions"><button type="button" class="soft-button" data-close-modal>Cancel</button><button class="primary-small" type="submit">Join Chamber</button></div></form></div></div>';
  }
  if(type==="invite"){
    html='<div class="modal-backdrop" data-close-modal><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h3>Chamber invite</h3><button class="modal-close" data-close-modal>×</button></div><p class="modal-note">Share this code with the people you want to invite. It expires in 7 days.</p><input id="inviteCodeOutput" class="form-input" readonly value="'+escapeHTML(data.code||"")+'"><div class="modal-actions"><button class="soft-button" type="button" data-close-modal>Close</button><button class="primary-small" type="button" data-action="copy-invite">Copy code</button></div></div></div>';
  }
  if(type==="manage-chamber"){
    html='<div class="modal-backdrop" data-close-modal><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h3>Chamber settings</h3><button class="modal-close" data-close-modal>×</button></div><form id="editChamberForm" class="form-grid"><label class="form-label" for="editChamberName">Name</label><input id="editChamberName" class="form-input" maxlength="48" required value="'+escapeHTML(state.chamber.name)+'"><label class="form-label" for="editChamberEmoji">Emoji</label><input id="editChamberEmoji" class="form-input" maxlength="12" value="'+escapeHTML(state.chamber.emoji||"🏠")+'"><label class="form-label" for="editChamberDescription">Description</label><textarea id="editChamberDescription" class="form-textarea" maxlength="180">'+escapeHTML(state.chamber.description||"")+'</textarea><label class="form-label"><input id="editChamberPublic" type="checkbox" style="width:auto;margin-right:7px" '+(state.chamber.isPublic?"checked":"")+'>Discoverable Chamber</label><div class="modal-actions" style="justify-content:space-between"><button type="button" class="danger-button" data-action="delete-chamber">Delete Chamber</button><span class="button-row"><button type="button" class="soft-button" data-close-modal>Cancel</button><button class="primary-small" type="submit">Save</button></span></div></form></div></div>';
  }
  if(type==="profile"){
    html='<div class="modal-backdrop" data-close-modal><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h3>Display name</h3><button class="modal-close" data-close-modal>×</button></div><form id="profileForm" class="form-grid"><label class="form-label" for="displayNameInput">Display name</label><input id="displayNameInput" class="form-input" maxlength="32" required value="'+escapeHTML(state.user.displayName||state.user.username)+'"><div class="modal-actions"><button class="soft-button" type="button" data-close-modal>Cancel</button><button class="primary-small" type="submit">Save</button></div></form></div></div>';
  }
  if(type==="password"){
    html='<div class="modal-backdrop" data-close-modal><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h3>Change password</h3><button class="modal-close" data-close-modal>×</button></div><form id="passwordForm" class="form-grid"><label class="form-label" for="currentPassword">Current password</label><input id="currentPassword" class="form-input" type="password" required><label class="form-label" for="newPassword">New password</label><input id="newPassword" class="form-input" type="password" minlength="12" required><div class="modal-note">Use at least 12 characters.</div><div class="modal-actions"><button class="soft-button" type="button" data-close-modal>Cancel</button><button class="primary-small" type="submit">Update password</button></div></form></div></div>';
  }
  if(type==="friend-options"){
    html='<div class="modal-backdrop" data-close-modal><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h3>Friend options</h3><button class="modal-close" data-close-modal>×</button></div><p class="modal-note">Choose how to manage this connection.</p><div class="modal-actions"><button class="danger-button" data-action="block-friend" data-friend="'+escapeHTML(data.friendId)+'">Block</button><button class="soft-button" data-action="remove-friend" data-friend="'+escapeHTML(data.friendId)+'">Remove friend</button></div></div></div>';
  }
  $("#modalRoot").innerHTML=html;
  var focus=$("#modalRoot input:not([type=checkbox]),#modalRoot textarea");
  if(focus)focus.focus();
}
function closeModal(){ $("#modalRoot").innerHTML=""; }
function selectedEmoji(target,emoji){
  var map={chamber:"#chamberEmoji",pocket:"#pocketEmoji",editPocket:"#editPocketEmoji",editChamber:"#editChamberEmoji"};
  var selector=map[target];
  if(!selector){selector=$("[data-emoji-input]")&&$("[data-emoji-input]").dataset.emojiInput;}
  var input=selector?$(selector):null;
  if(input)input.value=emoji;
}
function addEmojiToComposer(target,emoji){
  var input=target==="dm"?$("#dmMessageInput"):$("#pocketMessageInput");
  if(!input)return;
  var start=input.selectionStart||input.value.length,end=input.selectionEnd||input.value.length;
  input.value=input.value.slice(0,start)+emoji+input.value.slice(end);
  input.focus();
  input.setSelectionRange(start+emoji.length,start+emoji.length);
}
function toggleEmoji(target){
  var existing=$(".emoji-popover");
  if(existing){existing.remove();return;}
  var html='<div class="emoji-popover"><div class="emoji-grid">'+EMOJIS.map(function(emoji){return '<button type="button" class="emoji-choice" data-message-emoji="'+escapeHTML(emoji)+'" data-target="'+target+'">'+emoji+'</button>';}).join("")+'</div></div>';
  var parent=target==="dm"?$("#dmComposer"):$("#pocketComposer");
  if(parent){parent.style.position="relative";parent.insertAdjacentHTML("beforeend",html);}
}
function closeEmoji(){var picker=$(".emoji-popover");if(picker)picker.remove();}
function openPocketCreate(){
  if(state.demo||state.chamber.role==="owner"||state.chamber.role==="moderator"||state.chamber.role==="member")openModal("pocket");
  else toast("Join this Chamber before adding a Pocket.");
}
function createChamber(data){
  if(state.demo){
    var chamber={id:"demo-ch-"+Date.now(),name:data.name,description:data.description,emoji:data.emoji,isPublic:data.isPublic,memberCount:1,pocketCount:1,role:"owner",ownerId:"demo-user",pockets:[{id:"demo-pocket-"+Date.now(),name:"general",emoji:"💬",topic:"The main conversation"}]};
    demo.chambers.unshift(chamber);saveDemo();
    state.chambers=demo.chambers;state.chamber=chamber;state.selectedPocket=chamber.pockets[0];state.pocketMessages=[];state.page="chambers";closeModal();render();toast("Chamber created in preview.");return Promise.resolve();
  }
  return api("/chambers","POST",data).then(function(result){
    closeModal();return refreshAll().then(function(){return openChamber(result.chamber.id);});
  });
}
function createPocket(data){
  if(state.demo){
    var pocket={id:"demo-pocket-"+Date.now(),name:data.name.toLowerCase().replace(/[^a-z0-9_-]+/g,"-"),emoji:data.emoji,topic:data.topic};
    state.chamber.pockets.push(pocket);state.chamber.pocketCount=state.chamber.pockets.length;demo.chambers=state.chambers.map(function(chamber){return chamber.id===state.chamber.id?state.chamber:chamber;});saveDemo();
    state.selectedPocket=pocket;state.pocketMessages=[];closeModal();render();toast("Pocket created in preview.");return Promise.resolve();
  }
  return api("/chambers/"+encodeURIComponent(state.chamber.id)+"/pockets","POST",data).then(function(result){
    state.chamber.pockets.push(result.pocket);state.selectedPocket=result.pocket;state.pocketMessages=[];closeModal();render();toast("Pocket created.");
  });
}
function savePocket(data){
  if(state.demo){
    state.selectedPocket.name=data.name.toLowerCase().replace(/[^a-z0-9_-]+/g,"-");state.selectedPocket.emoji=data.emoji;state.selectedPocket.topic=data.topic;
    saveDemo();closeModal();render();toast("Pocket updated in preview.");return Promise.resolve();
  }
  return api("/pockets/"+encodeURIComponent(state.selectedPocket.id),"PATCH",data).then(function(result){
    state.chamber.pockets=state.chamber.pockets.map(function(pocket){return pocket.id===result.pocket.id?result.pocket:pocket;});
    state.selectedPocket=result.pocket;closeModal();render();toast("Pocket updated.");
  });
}
function deletePocket(id){
  var pocket=state.chamber.pockets.find(function(item){return item.id===id;});
  if(!pocket)return;
  if(state.chamber.pockets.length<=1){toast("A Chamber needs at least one Pocket.");return;}
  if(!confirm("Delete #"+pocket.name+" and its messages?"))return;
  if(state.demo){
    state.chamber.pockets=state.chamber.pockets.filter(function(item){return item.id!==id;});
    delete demo.messages[state.chamber.id+":"+id];state.selectedPocket=state.chamber.pockets[0];state.pocketMessages=demoPocketMessages(state.chamber.id,state.selectedPocket.id);saveDemo();closeModal();render();toast("Pocket deleted from preview.");return;
  }
  api("/pockets/"+encodeURIComponent(id),"DELETE").then(function(){
    state.chamber.pockets=state.chamber.pockets.filter(function(item){return item.id!==id;});
    state.selectedPocket=state.chamber.pockets[0];return loadPocketMessages();
  }).then(function(){closeModal();render();toast("Pocket deleted.");}).catch(function(error){toast(error.message);});
}
function saveChamber(data){
  if(state.demo){
    state.chamber.name=data.name;state.chamber.description=data.description;state.chamber.emoji=data.emoji;state.chamber.isPublic=data.isPublic;saveDemo();closeModal();render();toast("Chamber updated in preview.");return Promise.resolve();
  }
  return api("/chambers/"+encodeURIComponent(state.chamber.id),"PATCH",data).then(function(result){
    Object.assign(state.chamber,result.chamber);closeModal();refreshAll().then(render);toast("Chamber updated.");
  });
}
function deleteChamber(){
  if(!state.chamber||!confirm("Delete this Chamber and all its Pockets and messages?"))return;
  var id=state.chamber.id;
  if(state.demo){
    demo.chambers=demo.chambers.filter(function(chamber){return chamber.id!==id;});
    Object.keys(demo.messages).forEach(function(key){if(key.indexOf(id+":")===0)delete demo.messages[key];});
    saveDemo();state.chambers=demo.chambers;state.chamber=null;state.selectedPocket=null;closeModal();render();toast("Chamber deleted from preview.");return;
  }
  api("/chambers/"+encodeURIComponent(id),"DELETE").then(function(){
    closeModal();state.chamber=null;state.selectedPocket=null;return refreshAll();
  }).then(function(){render();toast("Chamber deleted.");}).catch(function(error){toast(error.message);});
}
function inviteChamber(){
  if(!state.chamber)return;
  if(state.demo){
    var demoCode="NEX-"+Math.random().toString(36).slice(2,8).toUpperCase();
    state.chamber.inviteCode=demoCode;demo.chambers=state.chambers;saveDemo();openModal("invite",{code:demoCode});return;
  }
  api("/chambers/"+encodeURIComponent(state.chamber.id)+"/invites","POST",{}).then(function(result){openModal("invite",{code:result.code});}).catch(function(error){toast(error.message);});
}
function joinChamber(code){
  if(state.demo){var chamber=demo.chambers.find(function(item){return item.inviteCode===code;});if(!chamber){toast("That invite code is not available in this browser preview.");return Promise.resolve();}state.chamber=chamber;state.selectedPocket=chamber.pockets[0]||null;state.pocketMessages=state.selectedPocket?demoPocketMessages(chamber.id,state.selectedPocket.id):[];closeModal();render();return Promise.resolve();}
  return api("/chambers/join","POST",{code:code}).then(function(result){closeModal();return refreshAll().then(function(){return openChamber(result.chamberId);});});
}
function joinPublicChamber(id){
  if(state.demo){toast("Public discovery is available when the account service is connected.");return;}
  api("/chambers/"+encodeURIComponent(id)+"/join","POST",{}).then(function(){return refreshAll();}).then(function(){state.chamberTab="mine";render();toast("Joined Chamber.");}).catch(function(error){toast(error.message);});
}
function sendFriendRequest(username){
  if(state.demo){
    if(demo.requests.some(function(item){return item.username.toLowerCase()===username.toLowerCase();})){toast("A preview request already exists.");return Promise.resolve();}
    demo.requests.unshift({id:"demo-req-"+Date.now(),username:username,displayName:username,display_name:username});
    saveDemo();state.outgoing=demo.requests;closeModal();render();toast("Request added to local preview.");return Promise.resolve();
  }
  return api("/friends/requests","POST",{username:username}).then(function(){closeModal();return refreshAll().then(render).then(function(){toast("Friend request sent.");});});
}
function acceptRequest(id){
  if(state.demo){toast("Friend requests from real accounts need the account service.");return;}
  api("/friends/requests/"+encodeURIComponent(id)+"/accept","POST",{}).then(refreshAll).then(render).then(function(){toast("Friend request accepted.");}).catch(function(error){toast(error.message);});
}
function removeRequest(id){
  if(state.demo){demo.requests=demo.requests.filter(function(item){return item.id!==id;});state.outgoing=demo.requests;saveDemo();render();return;}
  api("/friends/requests/"+encodeURIComponent(id),"DELETE").then(refreshAndRender).catch(function(error){toast(error.message);});
}
function removeFriend(id,block){
  if(state.demo){
    demo.friends=demo.friends.filter(function(friend){return friend.id!==id;});state.friends=demo.friends;saveDemo();closeModal();render();toast(block?"Blocked in local preview.":"Removed in local preview.");return;
  }
  var request=block?api("/users/"+encodeURIComponent(id)+"/block","POST",{}):api("/friends/"+encodeURIComponent(id),"DELETE");
  request.then(function(){closeModal();return refreshAll();}).then(render).then(function(){toast(block?"User blocked.":"Friend removed.");}).catch(function(error){toast(error.message);});
}
function copyInvite(){
  var input=$("#inviteCodeOutput");if(!input)return;
  input.select();
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(input.value).then(function(){toast("Invite code copied.");}).catch(function(){toast("Select and copy the invite code.");});}
  else toast("Select and copy the invite code.");
}
function handleAction(action,element){
  var id=element.dataset.friend||element.dataset.request||element.dataset.pocket||element.dataset.chamber;
  if(action==="create-chamber")openModal("chamber");
  else if(action==="join-chamber")openModal("join");
  else if(action==="add-friend")openModal("friend");
  else if(action==="create-pocket")openPocketCreate();
  else if(action==="manage-chamber")openModal("manage-chamber");
  else if(action==="invite-chamber")inviteChamber();
  else if(action==="back-chambers"){state.chamber=null;state.selectedPocket=null;render();}
  else if(action==="edit-pocket"){var p=state.chamber&&state.chamber.pockets.find(function(item){return item.id===id;});if(p)openModal("edit-pocket",p);}
  else if(action==="delete-pocket")deletePocket(id);
  else if(action==="delete-chamber")deleteChamber();
  else if(action==="copy-invite")copyInvite();
  else if(action==="accept-request")acceptRequest(id);
  else if(action==="decline-request"||action==="cancel-request")removeRequest(id);
  else if(action==="message-friend")openDM(id);
  else if(action==="friend-options")openModal("friend-options",{friendId:id});
  else if(action==="remove-friend")removeFriend(id,false);
  else if(action==="block-friend")removeFriend(id,true);
  else if(action==="edit-profile")openModal("profile");
  else if(action==="change-password")openModal("password");
  else if(action==="logout")logout();
  else if(action==="go-friends"){state.page="friends";render();}
  else if(action==="toggle-emoji")toggleEmoji(element.dataset.target);
  else if(action==="join-public")joinPublicChamber(id);
}
document.addEventListener("click",function(event){
  var authTab=event.target.closest("[data-auth-tab]");
  if(authTab){setAuthTab(authTab.dataset.authTab);return;}
  var nav=event.target.closest("[data-page]");
  if(nav){state.friendTab=nav.dataset.tab||"all";navTo(nav.dataset.page);return;}
  var action=event.target.closest("[data-action]");
  if(action){handleAction(action.dataset.action,action);return;}
  var emoji=event.target.closest("[data-select-emoji]");
  if(emoji){
    var value=emoji.dataset.selectEmoji;
    var visibleModal=$("#modalRoot .modal");
    if(visibleModal){
      var active=$("input:focus",visibleModal);
      if(active&&/Emoji/.test(active.id)){active.value=value;}
      else if($("#chamberEmoji"))$("#chamberEmoji").value=value;
      else if($("#pocketEmoji"))$("#pocketEmoji").value=value;
      else if($("#editPocketEmoji"))$("#editPocketEmoji").value=value;
      else if($("#editChamberEmoji"))$("#editChamberEmoji").value=value;
    }
    return;
  }
  var messageEmoji=event.target.closest("[data-message-emoji]");
  if(messageEmoji){addEmojiToComposer(messageEmoji.dataset.target,messageEmoji.dataset.messageEmoji);closeEmoji();return;}
  var chamber=event.target.closest("[data-chamber]");
  if(chamber){openChamber(chamber.dataset.chamber);return;}
  var pocket=event.target.closest("[data-pocket]");
  if(pocket&&pocket.dataset.pocket){selectPocket(pocket.dataset.pocket);return;}
  var friendTab=event.target.closest("[data-friend-tab]");
  if(friendTab){state.friendTab=friendTab.dataset.friendTab;render();return;}
  var chamberTab=event.target.closest("[data-chamber-tab]");
  if(chamberTab){state.chamberTab=chamberTab.dataset.chamberTab;if(state.chamberTab==="discover"&&!state.demo){api("/chambers/discover").then(function(result){state.discover=result.chambers||[];render();}).catch(function(error){toast(error.message);});}else render();return;}
  if(event.target.classList.contains("modal-backdrop")||event.target.closest(".modal-close")||event.target.matches("button[data-close-modal]")){closeModal();return;}
  if(!event.target.closest(".emoji-popover")&&!event.target.closest("[data-action='toggle-emoji']"))closeEmoji();
});
document.addEventListener("submit",function(event){
  var form=event.target;
  if(form.id==="authForm"){
    event.preventDefault();
    var password=$("#authPassword").value;
    $("#authSubmit").disabled=true;
    if(!state.apiAvailable){showLoginNote("Real accounts are not connected on this static preview. Use Admin to explore.");$("#authSubmit").disabled=false;return;}
    var operation=state.authTab==="register"?
      api("/auth/register","POST",{username:$("#authUsername").value,displayName:$("#authDisplayName").value,email:$("#authEmail").value,password:password}):
      api("/auth/login","POST",{login:$("#authLogin").value,password:password});
    operation.then(function(result){return enterReal(result.user);}).catch(function(error){showLoginNote(error.message);}).finally(function(){$("#authSubmit").disabled=false;});
  }
  if(form.id==="chamberForm"){
    event.preventDefault();
    var data={name:$("#chamberName").value.trim(),description:$("#chamberDescription").value.trim(),emoji:$("#chamberEmoji").value.trim()||"🏠",isPublic:$("#chamberPublic").checked};
    createChamber(data).catch(function(error){toast(error.message);});
  }
  if(form.id==="pocketForm"){
    event.preventDefault();
    createPocket({name:$("#pocketName").value.trim(),emoji:$("#pocketEmoji").value.trim()||"💬",topic:$("#pocketTopic").value.trim()}).catch(function(error){toast(error.message);});
  }
  if(form.id==="editPocketForm"){
    event.preventDefault();
    savePocket({name:$("#editPocketName").value.trim(),emoji:$("#editPocketEmoji").value.trim()||"💬",topic:$("#editPocketTopic").value.trim()}).catch(function(error){toast(error.message);});
  }
  if(form.id==="friendForm"){
    event.preventDefault();
    sendFriendRequest($("#friendUsername").value.trim().replace(/^@/,"")).catch(function(error){toast(error.message);});
  }
  if(form.id==="joinForm"){
    event.preventDefault();
    joinChamber($("#inviteCode").value.trim()).catch(function(error){toast(error.message);});
  }
  if(form.id==="editChamberForm"){
    event.preventDefault();
    saveChamber({name:$("#editChamberName").value.trim(),emoji:$("#editChamberEmoji").value.trim()||"🏠",description:$("#editChamberDescription").value.trim(),isPublic:$("#editChamberPublic").checked}).catch(function(error){toast(error.message);});
  }
  if(form.id==="profileForm"){
    event.preventDefault();
    var name=$("#displayNameInput").value.trim();
    if(state.demo){demo.displayName=name;state.user.displayName=name;saveDemo();closeModal();render();toast("Preview name updated.");}
    else api("/auth/profile","PATCH",{displayName:name}).then(function(result){state.user=result.user;closeModal();render();toast("Display name updated.");}).catch(function(error){toast(error.message);});
  }
  if(form.id==="passwordForm"){
    event.preventDefault();
    if(state.demo){toast("Password changes are available on real accounts.");return;}
    api("/auth/password","POST",{currentPassword:$("#currentPassword").value,newPassword:$("#newPassword").value}).then(function(){closeModal();toast("Password updated. Other sessions were signed out.");}).catch(function(error){toast(error.message);});
  }
  if(form.id==="pocketComposer"){
    event.preventDefault();
    var input=$("#pocketMessageInput");var body=input.value.trim();if(!body)return;
    input.value="";
    sendPocketMessage(body).catch(function(error){toast(error.message);input.value=body;});
  }
  if(form.id==="dmComposer"){
    event.preventDefault();
    var dm=$("#dmMessageInput");var body=dm.value.trim();if(!body)return;
    dm.value="";
    sendDM(body).catch(function(error){toast(error.message);dm.value=body;});
  }
});
$("#authForm").addEventListener("input",function(){if($("#loginNote").textContent)$("#loginNote").textContent="";});
$("#togglePassword").addEventListener("click",function(){
  var input=$("#authPassword");input.type=input.type==="password"?"text":"password";
  this.setAttribute("aria-label",input.type==="password"?"Show password":"Hide password");
});
$("#adminEntry").addEventListener("click",enterDemo);
$("#quickAddFriend").addEventListener("click",function(){openModal("friend");});
$("#settingsButton").addEventListener("click",function(){navTo("settings");});
$("#logoutButton").addEventListener("click",logout);
$("#globalSearch").addEventListener("input",function(){
  state.search=this.value.trim().toLowerCase();
  if(state.page==="chambers"&&!state.chamber)render();
});
$("#globalSearch").addEventListener("keydown",function(event){
  if(event.key==="Enter"){state.page="chambers";state.chamber=null;render();}
});
function startFromQuery(){
  var match=location.search.match(/[?&]join=([A-Za-z0-9_-]+)/);
  if(match){
    var code=decodeURIComponent(match[1]);
    if(state.user){openModal("join",{code:code});}
  }
}
function init(){
  api("/health").then(function(){
    state.apiAvailable=true;
    return api("/auth/me");
  }).then(function(result){
    return enterReal(result.user);
  }).catch(function(error){
    if(error&&error.message&&/session|log in/i.test(error.message)){state.apiAvailable=true;return;}
    state.apiAvailable=false;
    if(error&&error.message&&error.message!=="API route not found.")showLoginNote("Account service is not available right now. Admin preview is still available.");
  }).finally(function(){startFromQuery();});
}
init();
})();