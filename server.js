"use strict";
require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");
const http = require("node:http");
const { Server } = require("socket.io");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Copy .env.example to .env and add a PostgreSQL connection string.");
  process.exit(1);
}
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  console.error("SESSION_SECRET is required in production.");
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e5 });
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "disable" ? false : { rejectUnauthorized: false },
  max: Number(process.env.PG_POOL_SIZE || 8),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 12000
});
const PORT = Number(process.env.PORT || 3000);
const COOKIE_NAME = "nx_session";
const SESSION_DAYS = 30;
const SESSION_SECRET = process.env.SESSION_SECRET || "local-development-only-change-this-secret";

app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "data:"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      styleSrcAttr: ["'unsafe-inline'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: "40kb" }));
app.use(cookieParser());

app.use("/api", function checkOrigin(req, res, next) {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    const expected = req.protocol + "://" + req.get("host");
    if (origin && origin !== expected) return res.status(403).json({ error: "This request did not come from Nexus." });
  }
  next();
});

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many attempts. Please wait a little and try again." } });
const writeLimiter = rateLimit({ windowMs: 60 * 1000, limit: 90, standardHeaders: "draft-8", legacyHeaders: false });
const reportLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "You have submitted several reports recently. Please wait before sending another." } });

function hashToken(token) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(token).digest("hex");
}
function makeCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 };
}
function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
}
function normaliseUsername(value) {
  return String(value || "").trim().replace(/^@/, "").toLowerCase();
}
function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at || null,
    online: !!row.is_online
  };
}
function validName(name, max) {
  return typeof name === "string" && name.trim().length > 0 && name.trim().length <= max;
}
function asyncRoute(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
function requireAuth(req, res, next) {
  asyncRoute(async function () {
    const token = req.cookies[COOKIE_NAME];
    if (!token || token.length > 180) return res.status(401).json({ error: "Please log in to continue." });
    const tokenHash = hashToken(token);
    const result = await pool.query(
      "SELECT u.id,u.username,u.username_norm,u.email,u.display_name,u.created_at,u.last_seen_at,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
      [tokenHash]
    );
    if (!result.rowCount) {
      clearSessionCookie(res);
      return res.status(401).json({ error: "Your session expired. Please log in again." });
    }
    req.user = result.rows[0];
    req.sessionHash = tokenHash;
    next();
  })(req, res, next);
}
async function issueSession(client, userId, res) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  await client.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+($3::int * interval '1 day'))",
    [tokenHash, userId, SESSION_DAYS]
  );
  res.cookie(COOKIE_NAME, token, makeCookieOptions());
}
async function requireChamberRole(chamberId, userId, roles) {
  const result = await pool.query("SELECT role FROM chamber_members WHERE chamber_id=$1 AND user_id=$2", [chamberId, userId]);
  return result.rowCount && roles.includes(result.rows[0].role) ? result.rows[0].role : null;
}
async function requirePocketAccess(pocketId, userId) {
  const result = await pool.query(
    "SELECT p.id,p.chamber_id,p.name,p.emoji FROM pockets p JOIN chamber_members m ON m.chamber_id=p.chamber_id WHERE p.id=$1 AND m.user_id=$2",
    [pocketId, userId]
  );
  return result.rows[0] || null;
}
async function isFriend(userOne, userTwo) {
  const result = await pool.query("SELECT 1 FROM friendships WHERE user_id=$1 AND friend_id=$2", [userOne, userTwo]);
  return result.rowCount > 0;
}
async function notifyPresence(userId, online) {
  const friends = await pool.query("SELECT friend_id FROM friendships WHERE user_id=$1", [userId]);
  const payload = { userId: userId, online: !!online, lastSeenAt: online ? null : new Date().toISOString() };
  for (const row of friends.rows) io.to("user:" + row.friend_id).emit("presence:change", payload);
}

app.get("/api/health", asyncRoute(async function (req, res) {
  await pool.query("SELECT 1");
  res.json({ ok: true, app: "Nexus", database: "connected" });
}));

app.post("/api/auth/register", authLimiter, asyncRoute(async function (req, res) {
  const username = String(req.body.username || "").trim();
  const usernameNorm = normaliseUsername(username);
  const email = String(req.body.email || "").trim();
  const emailNorm = email.toLowerCase();
  const displayName = String(req.body.displayName || username).trim();
  const password = String(req.body.password || "");
  if (!/^[a-z0-9_]{3,24}$/.test(usernameNorm)) return res.status(400).json({ error: "Usernames must be 3–24 characters using letters, numbers, or underscores." });
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) return res.status(400).json({ error: "Enter a valid email address." });
  if (!validName(displayName, 32)) return res.status(400).json({ error: "Display names must be 1–32 characters." });
  if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) return res.status(400).json({ error: "Use a password between 12 and 72 bytes." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const id = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);
    const inserted = await client.query(
      "INSERT INTO users(id,username,username_norm,email,email_norm,display_name,password_hash) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,username,email,display_name,created_at,last_seen_at",
      [id, username, usernameNorm, email, emailNorm, displayName, passwordHash]
    );
    await issueSession(client, id, res);
    await client.query("COMMIT");
    res.status(201).json({ user: publicUser(inserted.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ error: "That username or email is already in use." });
    throw error;
  } finally {
    client.release();
  }
}));

app.post("/api/auth/login", authLimiter, asyncRoute(async function (req, res) {
  const login = String(req.body.login || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!login || !password) return res.status(400).json({ error: "Enter your username or email and password." });
  const result = await pool.query(
    "SELECT id,username,username_norm,email,display_name,password_hash,created_at,last_seen_at FROM users WHERE username_norm=$1 OR email_norm=$1 LIMIT 1",
    [login]
  );
  if (!result.rowCount || !(await bcrypt.compare(password, result.rows[0].password_hash))) {
    return res.status(401).json({ error: "Those login details were not recognised." });
  }
  const user = result.rows[0];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await issueSession(client, user.id, res);
    await client.query("UPDATE users SET last_seen_at=now() WHERE id=$1", [user.id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  res.json({ user: publicUser(user) });
}));

app.get("/api/auth/me", requireAuth, function (req, res) {
  res.json({ user: publicUser(req.user) });
});
app.post("/api/auth/logout", asyncRoute(async function (req, res) {
  const token = req.cookies[COOKIE_NAME];
  if (token && token.length <= 180) await pool.query("DELETE FROM sessions WHERE token_hash=$1", [hashToken(token)]);
  clearSessionCookie(res);
  res.json({ ok: true });
}));
app.patch("/api/auth/profile", requireAuth, asyncRoute(async function (req, res) {
  const displayName = String(req.body.displayName || "").trim();
  if (!validName(displayName, 32)) return res.status(400).json({ error: "Display names must be 1–32 characters." });
  const result = await pool.query("UPDATE users SET display_name=$1 WHERE id=$2 RETURNING id,username,email,display_name,created_at,last_seen_at", [displayName, req.user.id]);
  res.json({ user: publicUser(result.rows[0]) });
}));
app.post("/api/auth/password", requireAuth, authLimiter, asyncRoute(async function (req, res) {
  const current = String(req.body.currentPassword || "");
  const next = String(req.body.newPassword || "");
  const found = await pool.query("SELECT password_hash FROM users WHERE id=$1", [req.user.id]);
  if (!found.rowCount || !(await bcrypt.compare(current, found.rows[0].password_hash))) return res.status(400).json({ error: "Your current password was not correct." });
  if (next.length < 12 || Buffer.byteLength(next, "utf8") > 72) return res.status(400).json({ error: "Use a password between 12 and 72 bytes." });
  const newHash = await bcrypt.hash(next, 12);
  await pool.query("UPDATE users SET password_hash=$1 WHERE id=$2", [newHash, req.user.id]);
  await pool.query("DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2", [req.user.id, req.sessionHash]);
  res.json({ ok: true });
}));

app.delete("/api/auth/account", requireAuth, authLimiter, asyncRoute(async function (req, res) {
  const password = String(req.body.password || "");
  const found = await pool.query("SELECT password_hash FROM users WHERE id=$1", [req.user.id]);
  if (!found.rowCount || !(await bcrypt.compare(password, found.rows[0].password_hash))) {
    return res.status(400).json({ error: "Your password was not correct." });
  }
  await pool.query("DELETE FROM users WHERE id=$1", [req.user.id]);
  clearSessionCookie(res);
  res.json({ ok: true });
}));
app.get("/api/friends", requireAuth, asyncRoute(async function (req, res) {
  const [friends, incoming, outgoing] = await Promise.all([
    pool.query("SELECT u.id,u.username,u.display_name,u.last_seen_at,u.is_online FROM friendships f JOIN users u ON u.id=f.friend_id WHERE f.user_id=$1 ORDER BY u.username_norm", [req.user.id]),
    pool.query("SELECT r.id,r.created_at,u.id AS user_id,u.username,u.display_name FROM friend_requests r JOIN users u ON u.id=r.sender_id WHERE r.receiver_id=$1 ORDER BY r.created_at DESC", [req.user.id]),
    pool.query("SELECT r.id,r.created_at,u.id AS user_id,u.username,u.display_name FROM friend_requests r JOIN users u ON u.id=r.receiver_id WHERE r.sender_id=$1 ORDER BY r.created_at DESC", [req.user.id])
  ]);
  const now = Date.now();
  res.json({
    friends: friends.rows.map(function (row) { return { id: row.id, username: row.username, displayName: row.display_name, online: !!row.is_online && row.last_seen_at ? now - new Date(row.last_seen_at).getTime() < 75000 : false, lastSeenAt: row.last_seen_at }; }),
    incoming: incoming.rows,
    outgoing: outgoing.rows
  });
}));
app.post("/api/friends/requests", requireAuth, writeLimiter, asyncRoute(async function (req, res) {
  const username = normaliseUsername(req.body.username);
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return res.status(400).json({ error: "Enter a valid username." });
  const target = await pool.query("SELECT id,username FROM users WHERE username_norm=$1", [username]);
  if (!target.rowCount) return res.status(404).json({ error: "That username was not found." });
  const targetId = target.rows[0].id;
  if (targetId === req.user.id) return res.status(400).json({ error: "You cannot add yourself." });
  const blocked = await pool.query("SELECT 1 FROM blocked_users WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)", [req.user.id, targetId]);
  if (blocked.rowCount) return res.status(404).json({ error: "That user cannot be added." });
  if (await isFriend(req.user.id, targetId)) return res.status(409).json({ error: "You are already friends." });
  const reverse = await pool.query("SELECT id FROM friend_requests WHERE sender_id=$1 AND receiver_id=$2", [targetId, req.user.id]);
  if (reverse.rowCount) return res.status(409).json({ error: "They have already sent you a request. Open Requests to respond." });
  try {
    const id = crypto.randomUUID();
    await pool.query("INSERT INTO friend_requests(id,sender_id,receiver_id) VALUES($1,$2,$3)", [id, req.user.id, targetId]);
    io.to("user:" + targetId).emit("friend-request:new", { id: id, from: { username: req.user.username, displayName: req.user.display_name } });
    res.status(201).json({ ok: true, id: id });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "A request already exists." });
    throw error;
  }
}));
app.post("/api/friends/requests/:id/accept", requireAuth, asyncRoute(async function (req, res) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const request = await client.query("SELECT sender_id,receiver_id FROM friend_requests WHERE id=$1 AND receiver_id=$2 FOR UPDATE", [req.params.id, req.user.id]);
    if (!request.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "That request is no longer available." }); }
    const sender = request.rows[0].sender_id;
    await client.query("INSERT INTO friendships(user_id,friend_id) VALUES($1,$2),($2,$1) ON CONFLICT DO NOTHING", [req.user.id, sender]);
    await client.query("DELETE FROM friend_requests WHERE (sender_id=$1 AND receiver_id=$2) OR (sender_id=$2 AND receiver_id=$1)", [req.user.id, sender]);
    await client.query("COMMIT");
    io.to("user:" + sender).emit("friend-request:accepted", { userId: req.user.id });
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}));
app.delete("/api/friends/requests/:id", requireAuth, asyncRoute(async function (req, res) {
  const result = await pool.query("DELETE FROM friend_requests WHERE id=$1 AND (sender_id=$2 OR receiver_id=$2) RETURNING id", [req.params.id, req.user.id]);
  if (!result.rowCount) return res.status(404).json({ error: "That request is no longer available." });
  res.json({ ok: true });
}));
app.delete("/api/friends/:friendId", requireAuth, asyncRoute(async function (req, res) {
  await pool.query("DELETE FROM friendships WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)", [req.user.id, req.params.friendId]);
  await pool.query("DELETE FROM friend_requests WHERE (sender_id=$1 AND receiver_id=$2) OR (sender_id=$2 AND receiver_id=$1)", [req.user.id, req.params.friendId]);
  await pool.query("DELETE FROM dm_conversations WHERE (user_one=$1 AND user_two=$2) OR (user_one=$2 AND user_two=$1)", [req.user.id, req.params.friendId]);
  res.json({ ok: true });
}));
app.post("/api/users/:userId/block", requireAuth, asyncRoute(async function (req, res) {
  if (req.params.userId === req.user.id) return res.status(400).json({ error: "You cannot block yourself." });
  await pool.query("INSERT INTO blocked_users(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [req.user.id, req.params.userId]);
  await pool.query("DELETE FROM friendships WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)", [req.user.id, req.params.userId]);
  await pool.query("DELETE FROM friend_requests WHERE (sender_id=$1 AND receiver_id=$2) OR (sender_id=$2 AND receiver_id=$1)", [req.user.id, req.params.userId]);
  await pool.query("DELETE FROM dm_conversations WHERE (user_one=$1 AND user_two=$2) OR (user_one=$2 AND user_two=$1)", [req.user.id, req.params.userId]);
  res.json({ ok: true });
}));
app.post("/api/reports", requireAuth, reportLimiter, asyncRoute(async function (req, res) {
  let targetUserId = req.body.targetUserId ? String(req.body.targetUserId) : null;
  let chamberId = req.body.chamberId ? String(req.body.chamberId) : null;
  let messageId = req.body.messageId ? String(req.body.messageId) : null;
  const reason = String(req.body.reason || "").trim();
  const details = String(req.body.details || "").trim().slice(0, 1000);
  if (!["spam","harassment","inappropriate","other"].includes(reason)) return res.status(400).json({ error: "Choose a report reason." });
  if (targetUserId && !/^[0-9a-f-]{36}$/i.test(targetUserId)) return res.status(400).json({ error: "Invalid user reference." });
  if (chamberId && !/^[0-9a-f-]{36}$/i.test(chamberId)) return res.status(400).json({ error: "Invalid Chamber reference." });
  if (messageId && !/^\d{1,18}$/.test(messageId)) return res.status(400).json({ error: "Invalid message reference." });
  if (messageId) {
    const found = await pool.query("SELECT pm.user_id,p.chamber_id FROM pocket_messages pm JOIN pockets p ON p.id=pm.pocket_id WHERE pm.id=$1", [messageId]);
    if (!found.rowCount || !found.rows[0].user_id) return res.status(404).json({ error: "That message is no longer available." });
    if (!await requireChamberRole(found.rows[0].chamber_id, req.user.id, ["owner","moderator","member"])) return res.status(404).json({ error: "That message is no longer available." });
    targetUserId = found.rows[0].user_id;
    chamberId = found.rows[0].chamber_id;
  }
  if (!targetUserId || targetUserId === req.user.id) return res.status(400).json({ error: "Choose another user or message to report." });
  const targetExists = await pool.query("SELECT 1 FROM users WHERE id=$1", [targetUserId]);
  if (!targetExists.rowCount) return res.status(404).json({ error: "That user is no longer available." });
  const id = crypto.randomUUID();
  await pool.query("INSERT INTO user_reports(id,reporter_id,target_user_id,chamber_id,message_id,reason,details) VALUES($1,$2,$3,$4,$5,$6,$7)", [id, req.user.id, targetUserId, chamberId, messageId, reason, details]);
  res.status(201).json({ ok: true, id: id });
}));

app.get("/api/chambers", requireAuth, asyncRoute(async function (req, res) {
  const result = await pool.query(
    "SELECT c.id,c.name,c.description,c.emoji,c.is_public,c.owner_id,c.created_at,m.role,(SELECT count(*)::int FROM chamber_members cm WHERE cm.chamber_id=c.id) AS member_count,(SELECT count(*)::int FROM pockets p WHERE p.chamber_id=c.id) AS pocket_count FROM chamber_members m JOIN chambers c ON c.id=m.chamber_id WHERE m.user_id=$1 ORDER BY c.created_at DESC",
    [req.user.id]
  );
  res.json({ chambers: result.rows.map(function (row) {
    return { id: row.id, name: row.name, description: row.description, emoji: row.emoji, isPublic: row.is_public, ownerId: row.owner_id, role: row.role, memberCount: row.member_count, pocketCount: row.pocket_count, createdAt: row.created_at };
  }) });
}));
app.get("/api/chambers/discover", requireAuth, asyncRoute(async function (req, res) {
  const result = await pool.query(
    "SELECT c.id,c.name,c.description,c.emoji,(SELECT count(*)::int FROM chamber_members cm WHERE cm.chamber_id=c.id) AS member_count FROM chambers c WHERE c.is_public=true AND NOT EXISTS(SELECT 1 FROM chamber_members m WHERE m.chamber_id=c.id AND m.user_id=$1) ORDER BY c.created_at DESC LIMIT 60",
    [req.user.id]
  );
  res.json({ chambers: result.rows });
}));
app.post("/api/chambers/:id/join", requireAuth, asyncRoute(async function (req, res) {
  const chamber = await pool.query("SELECT id,is_public FROM chambers WHERE id=$1", [req.params.id]);
  if (!chamber.rowCount) return res.status(404).json({ error: "Chamber not found." });
  if (!chamber.rows[0].is_public) return res.status(403).json({ error: "This Chamber is private. Ask a member for an invite code." });
  await pool.query("INSERT INTO chamber_members(chamber_id,user_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING", [req.params.id, req.user.id]);
  res.json({ ok: true, chamberId: req.params.id });
}));
app.post("/api/chambers", requireAuth, writeLimiter, asyncRoute(async function (req, res) {
  const name = String(req.body.name || "").trim();
  const description = String(req.body.description || "").trim().slice(0, 180);
  const emoji = String(req.body.emoji || "🏠").slice(0, 12);
  const isPublic = req.body.isPublic === true;
  if (!validName(name, 48)) return res.status(400).json({ error: "Chamber names must be 1–48 characters." });
  const client = await pool.connect();
  const id = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO chambers(id,owner_id,name,description,emoji,is_public) VALUES($1,$2,$3,$4,$5,$6)", [id, req.user.id, name, description, emoji, isPublic]);
    await client.query("INSERT INTO chamber_members(chamber_id,user_id,role) VALUES($1,$2,'owner')", [id, req.user.id]);
    await client.query("INSERT INTO pockets(id,chamber_id,name,emoji,topic,sort_order,created_by) VALUES($1,$2,'general','💬','The main conversation',0,$3)", [crypto.randomUUID(), id, req.user.id]);
    await client.query("COMMIT");
    res.status(201).json({ chamber: { id: id, name: name, description: description, emoji: emoji, isPublic: isPublic, ownerId: req.user.id, role: "owner", memberCount: 1, pocketCount: 1 } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}));
app.get("/api/chambers/:id", requireAuth, asyncRoute(async function (req, res) {
  const result = await pool.query("SELECT c.*,m.role,(SELECT count(*)::int FROM chamber_members cm WHERE cm.chamber_id=c.id) AS member_count FROM chambers c LEFT JOIN chamber_members m ON m.chamber_id=c.id AND m.user_id=$2 WHERE c.id=$1", [req.params.id, req.user.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Chamber not found." });
  const chamber = result.rows[0];
  if (!chamber.role && !chamber.is_public) return res.status(403).json({ error: "You do not have access to this Chamber." });
  const pockets = await pool.query("SELECT id,name,emoji,topic,sort_order FROM pockets WHERE chamber_id=$1 ORDER BY sort_order,created_at", [chamber.id]);
  res.json({ chamber: { id: chamber.id, name: chamber.name, description: chamber.description, emoji: chamber.emoji, isPublic: chamber.is_public, ownerId: chamber.owner_id, role: chamber.role || "visitor", memberCount: chamber.member_count, pockets: pockets.rows } });
}));
app.patch("/api/chambers/:id", requireAuth, asyncRoute(async function (req, res) {
  if (!await requireChamberRole(req.params.id, req.user.id, ["owner","moderator"])) return res.status(403).json({ error: "Only Chamber managers can change these settings." });
  const name = String(req.body.name || "").trim();
  const description = String(req.body.description || "").trim().slice(0, 180);
  const emoji = String(req.body.emoji || "🏠").slice(0, 12);
  const isPublic = req.body.isPublic === true;
  if (!validName(name, 48)) return res.status(400).json({ error: "Chamber names must be 1–48 characters." });
  const result = await pool.query("UPDATE chambers SET name=$1,description=$2,emoji=$3,is_public=$4 WHERE id=$5 RETURNING id,name,description,emoji,is_public,owner_id", [name, description, emoji, isPublic, req.params.id]);
  const row = result.rows[0];
  res.json({ chamber: { id: row.id, name: row.name, description: row.description, emoji: row.emoji, isPublic: row.is_public, ownerId: row.owner_id } });
}));
app.delete("/api/chambers/:id", requireAuth, asyncRoute(async function (req, res) {
  const role = await requireChamberRole(req.params.id, req.user.id, ["owner"]);
  if (!role) return res.status(403).json({ error: "Only the Chamber owner can delete it." });
  await pool.query("DELETE FROM chambers WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
}));
app.delete("/api/chambers/:id/leave", requireAuth, asyncRoute(async function (req, res) {
  const membership = await pool.query("SELECT role FROM chamber_members WHERE chamber_id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  if (!membership.rowCount) return res.status(404).json({ error: "You are not a member of this Chamber." });
  if (membership.rows[0].role === "owner") return res.status(400).json({ error: "The owner must transfer ownership or delete the Chamber before leaving." });
  await pool.query("DELETE FROM chamber_members WHERE chamber_id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  res.json({ ok: true });
}));
app.post("/api/chambers/:id/invites", requireAuth, asyncRoute(async function (req, res) {
  if (!await requireChamberRole(req.params.id, req.user.id, ["owner","moderator","member"])) return res.status(403).json({ error: "Join this Chamber before creating an invite link." });
  const code = crypto.randomBytes(6).toString("base64url");
  await pool.query("INSERT INTO chamber_invites(code,chamber_id,created_by,expires_at,max_uses) VALUES($1,$2,$3,now()+interval '7 days',50)", [code, req.params.id, req.user.id]);
  res.status(201).json({ code: code, expiresInDays: 7, inviteUrl: "/?join=" + code });
}));
app.post("/api/chambers/join", requireAuth, asyncRoute(async function (req, res) {
  const code = String(req.body.code || "").trim();
  if (!/^[A-Za-z0-9_-]{6,24}$/.test(code)) return res.status(400).json({ error: "Enter a valid invite code." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const invite = await client.query("SELECT chamber_id,expires_at,max_uses,uses FROM chamber_invites WHERE code=$1 FOR UPDATE", [code]);
    if (!invite.rowCount || new Date(invite.rows[0].expires_at).getTime() < Date.now() || invite.rows[0].uses >= invite.rows[0].max_uses) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "That invite is invalid, expired, or full." });
    }
    const chamberId = invite.rows[0].chamber_id;
    await client.query("INSERT INTO chamber_members(chamber_id,user_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING", [chamberId, req.user.id]);
    await client.query("UPDATE chamber_invites SET uses=uses+1 WHERE code=$1", [code]);
    await client.query("COMMIT");
    res.json({ ok: true, chamberId: chamberId });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}));

app.post("/api/chambers/:id/pockets", requireAuth, writeLimiter, asyncRoute(async function (req, res) {
  if (!await requireChamberRole(req.params.id, req.user.id, ["owner","moderator","member"])) return res.status(403).json({ error: "Join this Chamber before adding a Pocket." });
  const name = String(req.body.name || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  const emoji = String(req.body.emoji || "💬").slice(0, 12);
  const topic = String(req.body.topic || "").trim().slice(0, 120);
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(name)) return res.status(400).json({ error: "Pocket names can use lowercase letters, numbers, dashes, and underscores." });
  const order = await pool.query("SELECT COALESCE(MAX(sort_order),-1)+1 AS next_order FROM pockets WHERE chamber_id=$1", [req.params.id]);
  const id = crypto.randomUUID();
  try {
    const result = await pool.query("INSERT INTO pockets(id,chamber_id,name,emoji,topic,sort_order,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,name,emoji,topic,sort_order", [id, req.params.id, name, emoji, topic, order.rows[0].next_order, req.user.id]);
    res.status(201).json({ pocket: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That Pocket already exists in this Chamber." });
    throw error;
  }
}));
app.patch("/api/pockets/:id", requireAuth, asyncRoute(async function (req, res) {
  const access = await requirePocketAccess(req.params.id, req.user.id);
  if (!access) return res.status(404).json({ error: "Pocket not found." });
  if (!await requireChamberRole(access.chamber_id, req.user.id, ["owner","moderator"])) return res.status(403).json({ error: "Only Chamber managers can edit Pockets." });
  const name = String(req.body.name || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  const emoji = String(req.body.emoji || "💬").slice(0, 12);
  const topic = String(req.body.topic || "").trim().slice(0, 120);
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(name)) return res.status(400).json({ error: "Enter a valid Pocket name." });
  try {
    const result = await pool.query("UPDATE pockets SET name=$1,emoji=$2,topic=$3 WHERE id=$4 RETURNING id,name,emoji,topic,sort_order", [name, emoji, topic, req.params.id]);
    res.json({ pocket: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That Pocket name is already used." });
    throw error;
  }
}));
app.delete("/api/pockets/:id", requireAuth, asyncRoute(async function (req, res) {
  const access = await requirePocketAccess(req.params.id, req.user.id);
  if (!access) return res.status(404).json({ error: "Pocket not found." });
  if (!await requireChamberRole(access.chamber_id, req.user.id, ["owner","moderator"])) return res.status(403).json({ error: "Only Chamber managers can delete Pockets." });
  const count = await pool.query("SELECT count(*)::int AS total FROM pockets WHERE chamber_id=$1", [access.chamber_id]);
  if (count.rows[0].total <= 1) return res.status(400).json({ error: "A Chamber must keep at least one Pocket." });
  await pool.query("DELETE FROM pockets WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
}));
app.delete("/api/pockets/:id/messages/:messageId", requireAuth, asyncRoute(async function (req, res) {
  if (!/^\d{1,18}$/.test(String(req.params.messageId))) return res.status(400).json({ error: "Invalid message reference." });
  const access = await requirePocketAccess(req.params.id, req.user.id);
  if (!access) return res.status(404).json({ error: "Pocket not found." });
  const found = await pool.query("SELECT user_id FROM pocket_messages WHERE id=$1 AND pocket_id=$2", [req.params.messageId, req.params.id]);
  if (!found.rowCount) return res.status(404).json({ error: "Message not found." });
  const role = await requireChamberRole(access.chamber_id, req.user.id, ["owner","moderator"]);
  if (found.rows[0].user_id !== req.user.id && !role) return res.status(403).json({ error: "You can only delete your own messages." });
  await pool.query("DELETE FROM pocket_messages WHERE id=$1 AND pocket_id=$2", [req.params.messageId, req.params.id]);
  io.to("pocket:" + req.params.id).emit("pocket:message-deleted", { pocketId: req.params.id, messageId: String(req.params.messageId) });
  res.json({ ok: true });
}));
app.get("/api/pockets/:id/messages", requireAuth, asyncRoute(async function (req, res) {
  if (!await requirePocketAccess(req.params.id, req.user.id)) return res.status(404).json({ error: "Pocket not found." });
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 60)));
  const before = Number(req.query.before || 0);
  const result = await pool.query(
    "SELECT m.id,m.body,m.created_at,u.id AS user_id,u.username,u.display_name FROM pocket_messages m LEFT JOIN users u ON u.id=m.user_id WHERE m.pocket_id=$1 AND ($2::bigint=0 OR m.id<$2) ORDER BY m.id DESC LIMIT $3",
    [req.params.id, Number.isFinite(before) ? before : 0, limit]
  );
  res.json({ messages: result.rows.reverse().map(function (row) {
    return { id: String(row.id), body: row.body, createdAt: row.created_at, user: { id: row.user_id, username: row.username || "deleted", displayName: row.display_name || "Deleted user" } };
  }) });
}));

app.post("/api/pockets/:id/messages", requireAuth, writeLimiter, asyncRoute(async function (req, res) {
  const access = await requirePocketAccess(req.params.id, req.user.id);
  if (!access) return res.status(404).json({ error: "Pocket not found." });
  const body = String(req.body.body || "").trim();
  if (!body || body.length > 2000) return res.status(400).json({ error: "Messages must be 1–2000 characters." });
  const result = await pool.query("INSERT INTO pocket_messages(pocket_id,user_id,body) VALUES($1,$2,$3) RETURNING id,body,created_at", [req.params.id, req.user.id, body]);
  const message = { id: String(result.rows[0].id), body: result.rows[0].body, createdAt: result.rows[0].created_at, user: { id: req.user.id, username: req.user.username, displayName: req.user.display_name } };
  io.to("pocket:" + req.params.id).emit("pocket:message", { pocketId: req.params.id, message: message });
  res.status(201).json({ message: message });
}));

app.get("/api/conversations", requireAuth, asyncRoute(async function (req, res) {
  const result = await pool.query(
    "SELECT c.id,CASE WHEN c.user_one=$1 THEN u2.id ELSE u1.id END AS friend_id,CASE WHEN c.user_one=$1 THEN u2.username ELSE u1.username END AS username,CASE WHEN c.user_one=$1 THEN u2.display_name ELSE u1.display_name END AS display_name,last.body AS last_body,last.created_at AS last_at FROM dm_conversations c JOIN users u1 ON u1.id=c.user_one JOIN users u2 ON u2.id=c.user_two LEFT JOIN LATERAL (SELECT body,created_at FROM dm_messages WHERE conversation_id=c.id ORDER BY id DESC LIMIT 1) last ON true WHERE c.user_one=$1 OR c.user_two=$1 ORDER BY COALESCE(last.created_at,c.created_at) DESC",
    [req.user.id]
  );
  res.json({ conversations: result.rows });
}));
app.post("/api/conversations", requireAuth, asyncRoute(async function (req, res) {
  const friendId = String(req.body.friendId || "");
  if (!friendId || friendId === req.user.id || !(await isFriend(req.user.id, friendId))) return res.status(403).json({ error: "Direct messages are available between friends." });
  const pair = [req.user.id, friendId].sort();
  const id = crypto.randomUUID();
  const result = await pool.query("INSERT INTO dm_conversations(id,user_one,user_two) VALUES($1,$2,$3) ON CONFLICT(user_one,user_two) DO UPDATE SET user_one=EXCLUDED.user_one RETURNING id", [id, pair[0], pair[1]]);
  res.status(201).json({ conversationId: result.rows[0].id });
}));
app.post("/api/conversations/:id/messages", requireAuth, writeLimiter, asyncRoute(async function (req, res) {
  const body = String(req.body.body || "").trim();
  if (!body || body.length > 2000) return res.status(400).json({ error: "Messages must be 1–2000 characters." });
  const result = await pool.query("INSERT INTO dm_messages(conversation_id,sender_id,body) SELECT $1,$2,$3 WHERE EXISTS(SELECT 1 FROM dm_conversations WHERE id=$1 AND (user_one=$2 OR user_two=$2)) RETURNING id,body,created_at", [req.params.id, req.user.id, body]);
  if (!result.rowCount) return res.status(404).json({ error: "Conversation not found." });
  const message = { id: String(result.rows[0].id), body: result.rows[0].body, createdAt: result.rows[0].created_at, user: { id: req.user.id, username: req.user.username, displayName: req.user.display_name } };
  io.to("dm:" + req.params.id).emit("dm:message", { conversationId: req.params.id, message: message });
  res.status(201).json({ message: message });
}));
app.get("/api/conversations/:id/messages", requireAuth, asyncRoute(async function (req, res) {
  const member = await pool.query("SELECT 1 FROM dm_conversations WHERE id=$1 AND (user_one=$2 OR user_two=$2)", [req.params.id, req.user.id]);
  if (!member.rowCount) return res.status(404).json({ error: "Conversation not found." });
  const before = Number(req.query.before || 0);
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 60)));
  const result = await pool.query("SELECT m.id,m.body,m.created_at,u.id AS user_id,u.username,u.display_name FROM dm_messages m LEFT JOIN users u ON u.id=m.sender_id WHERE m.conversation_id=$1 AND ($2::bigint=0 OR m.id<$2) ORDER BY m.id DESC LIMIT $3", [req.params.id, Number.isFinite(before) ? before : 0, limit]);
  res.json({ messages: result.rows.reverse().map(function (row) { return { id: String(row.id), body: row.body, createdAt: row.created_at, user: { id: row.user_id, username: row.username || "deleted", displayName: row.display_name || "Deleted user" } }; }) });
}));

app.use("/api", function (req, res) { res.status(404).json({ error: "API route not found." }); });
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"], maxAge: 0, etag: true, lastModified: true }));
app.get(/^\/(?!api\/).*/, function (req, res) { res.sendFile(path.join(__dirname, "public", "index.html")); });

app.use(function (error, req, res, next) {
  console.error(error);
  if (res.headersSent) return next(error);
  const status = Number(error.status || error.statusCode || 500);
  res.status(status >= 400 && status < 600 ? status : 500).json({ error: status >= 500 ? "Something went wrong on the server. Please try again." : error.message });
});

function parseCookieHeader(value) {
  const output = {};
  String(value || "").split(";").forEach(function (part) {
    const index = part.indexOf("=");
    if (index > 0) {
      const key = part.slice(0, index).trim();
      const val = part.slice(index + 1).trim();
      try { output[key] = decodeURIComponent(val); } catch (error) { output[key] = val; }
    }
  });
  return output;
}
io.use(async function (socket, next) {
  try {
    const origin = socket.handshake.headers.origin;
    const host = socket.handshake.headers.host;
    if (origin && host) { const parsed = new URL(origin); if (parsed.host !== host) return next(new Error("Cross-origin connection refused.")); }
    const cookies = parseCookieHeader(socket.handshake.headers.cookie);
    const token = cookies[COOKIE_NAME];
    if (!token || token.length > 180) return next(new Error("Please log in."));
    const result = await pool.query(
      "SELECT u.id,u.username,u.display_name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
      [hashToken(token)]
    );
    if (!result.rowCount) return next(new Error("Your session expired."));
    socket.user = result.rows[0];
    next();
  } catch (error) { next(new Error("Could not verify your session.")); }
});
io.on("connection", function (socket) {
  const user = socket.user;
  const userRoom = "user:" + user.id;
  socket.join(userRoom);
  pool.query("UPDATE users SET last_seen_at=now(),is_online=true WHERE id=$1", [user.id]).then(function () { return notifyPresence(user.id, true); }).catch(console.error);
  let lastSendAt = 0;

  socket.on("heartbeat", function () {
    pool.query("UPDATE users SET last_seen_at=now(),is_online=true WHERE id=$1", [user.id]).catch(console.error);
  });
  socket.on("join-pocket", async function (pocketId, ack) {
    try {
      const access = await requirePocketAccess(String(pocketId), user.id);
      if (!access) return typeof ack === "function" && ack({ ok: false, error: "You do not have access to that Pocket." });
      socket.join("pocket:" + access.id);
      if (typeof ack === "function") ack({ ok: true });
    } catch (error) { if (typeof ack === "function") ack({ ok: false, error: "Could not join Pocket." }); }
  });
  socket.on("leave-pocket", function (pocketId) { socket.leave("pocket:" + String(pocketId)); });
  socket.on("pocket-message", async function (payload, ack) {
    try {
      const now = Date.now();
      if (now - lastSendAt < 450) return typeof ack === "function" && ack({ ok: false, error: "Slow down a moment." });
      lastSendAt = now;
      const pocketId = String(payload && payload.pocketId || "");
      const body = String(payload && payload.body || "").trim();
      if (!body || body.length > 2000) return typeof ack === "function" && ack({ ok: false, error: "Messages must be 1–2000 characters." });
      const access = await requirePocketAccess(pocketId, user.id);
      if (!access || !socket.rooms.has("pocket:" + pocketId)) return typeof ack === "function" && ack({ ok: false, error: "Join the Pocket before sending a message." });
      const result = await pool.query(
        "INSERT INTO pocket_messages(pocket_id,user_id,body) VALUES($1,$2,$3) RETURNING id,body,created_at",
        [pocketId, user.id, body]
      );
      const message = { id: String(result.rows[0].id), body: result.rows[0].body, createdAt: result.rows[0].created_at, user: { id: user.id, username: user.username, displayName: user.display_name } };
      io.to("pocket:" + pocketId).emit("pocket:message", { pocketId: pocketId, message: message });
      if (typeof ack === "function") ack({ ok: true, message: message });
    } catch (error) {
      console.error(error);
      if (typeof ack === "function") ack({ ok: false, error: "Message could not be sent." });
    }
  });
  socket.on("join-dm", async function (conversationId, ack) {
    const result = await pool.query("SELECT 1 FROM dm_conversations WHERE id=$1 AND (user_one=$2 OR user_two=$2)", [String(conversationId), user.id]);
    if (!result.rowCount) return typeof ack === "function" && ack({ ok: false });
    socket.join("dm:" + conversationId);
    if (typeof ack === "function") ack({ ok: true });
  });
  socket.on("dm-message", async function (payload, ack) {
    try {
      const now = Date.now();
      if (now - lastSendAt < 450) return typeof ack === "function" && ack({ ok: false, error: "Slow down a moment." });
      lastSendAt = now;
      const conversationId = String(payload && payload.conversationId || "");
      const body = String(payload && payload.body || "").trim();
      if (!body || body.length > 2000) return typeof ack === "function" && ack({ ok: false, error: "Messages must be 1–2000 characters." });
      if (!socket.rooms.has("dm:" + conversationId)) return typeof ack === "function" && ack({ ok: false, error: "Open the conversation before sending a message." });
      const result = await pool.query("INSERT INTO dm_messages(conversation_id,sender_id,body) SELECT $1,$2,$3 WHERE EXISTS(SELECT 1 FROM dm_conversations WHERE id=$1 AND (user_one=$2 OR user_two=$2)) RETURNING id,body,created_at", [conversationId, user.id, body]);
      if (!result.rowCount) return typeof ack === "function" && ack({ ok: false, error: "Conversation not found." });
      const message = { id: String(result.rows[0].id), body: result.rows[0].body, createdAt: result.rows[0].created_at, user: { id: user.id, username: user.username, displayName: user.display_name } };
      io.to("dm:" + conversationId).emit("dm:message", { conversationId: conversationId, message: message });
      if (typeof ack === "function") ack({ ok: true, message: message });
    } catch (error) {
      console.error(error);
      if (typeof ack === "function") ack({ ok: false, error: "Message could not be sent." });
    }
  });
  socket.on("disconnect", async function () {
    try {
      const others = await io.in(userRoom).fetchSockets();
      if (others.length === 0) {
        await pool.query("UPDATE users SET is_online=false,last_seen_at=now() WHERE id=$1", [user.id]);
        await notifyPresence(user.id, false);
      }
    } catch (error) { console.error(error); }
  });
});

async function start() {
  await pool.query(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
  await pool.query("DELETE FROM sessions WHERE expires_at < now()");
  server.listen(PORT, "0.0.0.0", function () {
    console.log("Nexus is listening on port " + PORT);
  });
}
start().catch(function (error) {
  console.error("Nexus could not start:", error);
  process.exit(1);
});
process.on("SIGTERM", function () { server.close(function () { pool.end().finally(function () { process.exit(0); }); }); });
