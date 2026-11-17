# Nexus

Nexus is an independent social platform project. The app has a custom Node.js backend and PostgreSQL data store; it does not use Supabase Auth.

## What is implemented

- Account registration and login with bcrypt password hashes
- Database-backed, HTTP-only sessions that survive page refreshes
- Profiles and password changes
- Friend requests, accept/decline, remove, and block
- Online presence for friends
- Private Chambers by default, with optional public discovery
- Chamber invite codes
- Pockets inside Chambers, each with its own emoji, topic, and message history
- Persistent Pocket messages and real-time delivery with Socket.IO
- Direct messages between accepted friends
- Report submission endpoint
- Mobile-responsive app interface
- A temporary Admin preview that stores demo data only in the current browser

The app creates its tables from \`schema.sql\` at server startup.

## Deploy the real app

GitHub Pages can only host the static frontend. It cannot run the Node API or Socket.IO server. The real app is designed to be served from one Node web service so the frontend and API share the same origin.

The included \`render.yaml\` defines a Render web service. The database is intentionally external so the project does not depend on Render's expiring free Postgres database.

### 1. Create a PostgreSQL database

Create a project in Neon and create a database for Nexus. Copy its PostgreSQL connection string. Keep it private.

The Neon Free plan currently includes 1 GB of storage per project and 100 compute-hours per month. Its compute scales down when idle; the data remains stored when compute pauses. Check the current plan limits before inviting other people.

### 2. Deploy the backend

In Render, create a new Blueprint and connect this repository. Render reads \`render.yaml\`.

During setup, provide the Neon connection string as \`DATABASE_URL\`. Render generates \`SESSION_SECRET\` automatically. The service uses Node 22 and serves both the app and the API.

After the first successful deploy, open the Render service URL. Register a new account there. The Admin button is only a local preview and is not an account.

### 3. Local development

Use Node 22 or later and a PostgreSQL database.

1. Copy \`.env.example\` to \`.env\`.
2. Put your PostgreSQL connection string in \`DATABASE_URL\`.
3. Set a long random \`SESSION_SECRET\`.
4. Run \`npm install\`.
5. Run \`npm start\`.
6. Open \`http://localhost:3000\`.

For a local Postgres server without TLS, set \`DATABASE_SSL=disable\`. Do not commit \`.env\`.

## Preview vs real accounts

- **Admin** enters a browser-only preview. Chambers, Pockets, messages, and preview requests are saved in that browser's local storage only.
- **Create Account / Log In** use the custom API and PostgreSQL. They work only when the Node backend and database are deployed and connected.
- The GitHub Pages copy is useful for checking the layout, but it cannot provide real accounts or shared messages.

## Security and launch status

Passwords are hashed server-side, session cookies are HTTP-only, and write requests are checked for same-origin browser requests. API routes enforce Chamber membership and friend-only direct messages. User content is escaped before it is inserted into the interface.

This is still a development build, not ready for a public launch. Email verification, email-based password recovery, avatar/file uploads, a moderator dashboard for reports, account export/deletion, and a tested backup/restore process still need to be added. The report endpoint stores reports but there is not yet a moderation interface. Do not use a password that you use on another service, and do not put real private information in the temporary Admin preview.

## Main files

- \`server.js\` — API, sessions, authorization, Socket.IO, and static server
- \`schema.sql\` — PostgreSQL tables and indexes
- \`app.js\` / \`styles.css\` — browser application
- \`public/\` — frontend served by the Node service
- \`render.yaml\` — Render Blueprint
- \`assets/kit-head.svg\` — Kit's head mark, without the N inside the face
- \`assets/nexus-mark.svg\` — original orbital N used on the login screen
