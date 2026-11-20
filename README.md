# Nexus — Command Deck

Nexus is a personal workspace for keeping projects, tasks, notes and focus time in one place

It is a browser-first tool with no account setup and no server required

## Open it

https://captainbensword.github.io/Nexus/

The workspace starts with example projects, a short task list and one sample note so the screens are not empty

## What works

- Project cards with create and edit flows
- Task list with completion, quick-add and cleanup
- Notes with create and edit flows
- Focus timer with 15, 25 and 45 minute sessions
- Overview with project, task and note counts
- Recent activity feed
- Keyboard shortcuts for the main sections
- Workspace export as JSON
- Local browser storage so your changes remain after refresh
- Responsive layout for desktop and mobile

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| 1 | Overview |
| 2 | Projects |
| 3 | Tasks |
| 4 | Notes |
| Ctrl + K | Search |

## Your data

Nexus stores the workspace in local browser storage on the device you use

It does not currently sync between devices or share data with other people

Use **Export workspace** in Library to save a JSON copy before clearing browser data

## Development

The static app is in `index.html`, `styles.css` and `app.js`

The `public/` folder mirrors those files for the existing hosting setup

Run the existing repository check workflow after changes and keep the two copies in sync
