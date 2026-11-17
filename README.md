# Nexus

Nexus is an independent social platform built with its own Node.js backend and PostgreSQL database. It does not use Supabase Auth.

## What is implemented

- Account registration and login with bcrypt password hashes
- Database-backed, HTTP-only sessions that survive page refreshes
- Display-name editing, password changes, and password-confirmed account deletion
- Friend requests, accept/decline, remove, and block
- Online friends with heartbeat-based presence
- Private Chambers by default, optional public discovery, invite codes, and a leave-Chamber flow
- Pockets inside Chambers, each with its own emoji and topic
- Pocket creation, editing, and deletion, with at least one Pocket kept per Chamber
- Persistent Pocket message history, real-time delivery, and authorized message deletion
- Friend-only direct messages
- Reports for users and Pocket messages
- Responsive desktop and mobile interface
- Temporary Admin preview stored only in the current browser

The server applies the database tables and indexes from `schema.sql` on startup.

## Preview

The GitHub Pages workflow packages only the browser frontend. If Pages is enabled for this repository, the preview address is:

https://captainbensword.github.io/Nexus/

Use the temporary **Admin** button to explore the local preview. Preview Chambers, Pockets, messages, and requests are saved only in the current browser. They are not real accounts and are not shared with anyone.

The static preview cannot connect to the custom account API because GitHub Pages does not run Node.js or Socket.IO.

## Deploy the real app

The real app is served from one Node web service so the browser, API, and Socket.IO connection use the same origin.

The included `render.yaml` defines a Render Blueprint for the web service. The PostgreSQL database is external so Nexus does not rely on Render's free Postgres database, which expires after 30 days.

### 1. Create the database

Create a PostgreSQL project in Neon and copy its connection string. Keep the connection string private.

Neon's Free plan currently includes 1 GB storage and 100 compute-hours per project each month. Its compute can pause while idle; the database data remains stored. Check the provider's current limits before inviting other people.

### 2. Deploy the backend

In Render, create a new Blueprint and connect this repository. Render reads `render.yaml`.

During setup, provide the Neon connection string as `DATABASE_URL`. Render generates `SESSION_SECRET` automatically. The service uses Node 22 and serves both the browser app and API.

After a successful deployment, open the Render service URL and create a real account. The Admin button remains a local preview only.

### 3. Local development

Use Node 22 or later and a PostgreSQL database.

1. Copy `.env.example` to `.env`.
2. Put your PostgreSQL connection string in `DATABASE_URL`.
3. Set a long random `SESSION_SECRET`.
4. Run `npm install`.
5. Run `npm start`.
6. Open `http://localhost:3000`.

For a local Postgres server without TLS, set `DATABASE_SSL=disable`. Never commit `.env`.

Run `npm run check` to check server and browser JavaScript syntax and confirm the deployed frontend files match the source files.

## Security and launch status

Passwords are hashed on the server. Session cookies are HTTP-only, same-site, and secure in production. Write requests are checked for same-origin browser requests. APIs enforce Chamber membership, owner/moderator permissions, and friend-only direct messaging. Message and user reports are rate-limited.

This is still a development build, not ready for a public launch. Email verification, email-based password recovery, avatar/file uploads, a moderation dashboard for reviewing reports, account-data export, and a tested backup/restore process still need to be added. The report endpoint records reports, but there is not yet a moderation inbox. Do not use a password that you use on another service, and do not put real private information in the temporary Admin preview.

Free hosting has limitations. Render's free web service spins down after 15 minutes without incoming HTTP requests or WebSocket messages and may take about a minute to wake. Neon Free has monthly compute and storage limits. These are useful for testing, not a promise of always-on production service.

## Main files

- `server.js` — API, sessions, authorization, Socket.IO, and static server
- `schema.sql` — PostgreSQL tables and indexes
- `app.js` / `styles.css` — browser application
- `public/` — frontend served by the Node service
- `render.yaml` — Render deployment blueprint
- `assets/kit-head.svg` — Kit head mark without the N inside the face
- `assets/nexus-mark.svg` — orbital N used on the login screen
