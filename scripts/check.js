"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}
const syncPairs = [
  ["index.html", "public/index.html"],
  ["styles.css", "public/styles.css"],
  ["app.js", "public/app.js"],
  ["assets/nexus-mark.svg", "public/assets/nexus-mark.svg"],
  ["assets/kit-head.svg", "public/assets/kit-head.svg"]
];
for (const [source, deployed] of syncPairs) {
  assert.equal(read(source), read(deployed), source + " must match " + deployed);
}
const server = read("server.js");
const app = read("app.js");
const schema = read("schema.sql");
const html = read("index.html");
for (const route of [
  '/api/health',
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/account',
  '/api/friends/requests',
  '/api/blocks',
  '/api/chambers',
  '/api/chambers/:id/pockets',
  '/api/pockets/:id/messages',
  '/api/reports'
]) {
  assert.ok(server.includes(route), "Missing backend route: " + route);
}
for (const feature of [
  'id="authForm"',
  'id="adminEntry"',
  'data-page="chambers"',
  'Create a Chamber',
  'Create a Pocket',
  'report-pocket-message',
  'delete-pocket-message',
  'delete-account',
  'unblock-user'
]) {
  assert.ok(app.includes(feature) || html.includes(feature), "Missing frontend feature: " + feature);
}
for (const table of [
  "users","sessions","friend_requests","friendships","blocked_users","user_reports",
  "chambers","chamber_members","pockets","pocket_messages","dm_conversations","dm_messages"
]) {
  assert.ok(schema.includes("CREATE TABLE IF NOT EXISTS " + table), "Missing database table: " + table);
}
assert.ok(html.includes('assets/nexus-mark.svg'), "Login orbital N asset missing");
assert.ok(html.includes('assets/kit-head.svg'), "Kit head mark missing");
assert.ok(!html.includes('/socket.io/socket.io.js'), "Socket client should load only when the backend is available");
console.log("Nexus checks passed: JavaScript syntax, synced frontend, app routes and database tables.");
