# Nexus

Nexus is a personal project workspace

It keeps four things together

- **Projects** — the larger things you are making
- **Tasks** — the next actions for each project
- **Notes** — decisions, ideas and details worth keeping
- **Focus** — a small timer for quiet work sessions

## Open Nexus

https://captainbensword.github.io/Nexus/

A short first-run tour explains how the parts fit together

## How to use it

1. Create a project and give it a name and a short description
2. Open the project and add tasks that belong to it
3. Add notes to keep useful details beside the project
4. Use the Home page to see your projects, next steps and recent notes

The top **Add new** button lets you create a project, task or note from anywhere

## Data and privacy

Nexus is local-first and does not require an account

Your workspace is saved in this browser on this device
It does not sync between devices or share your information with other people

Use **Workspace → Export workspace** to save a JSON backup
Resetting browser site data can erase the local copy, so export a backup first

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| 1 | Home |
| 2 | Projects |
| 3 | Tasks |
| 4 | Notes |
| Ctrl + K or ⌘ K | Search |

## Development

The app is plain HTML, CSS and JavaScript with no build step

- `index.html` — page structure
- `styles.css` — layout and visual design
- `app.js` — workspace data and interactions
- `assets/nexus-symbol.svg` — the geometric Nexus mark

Run `npm run check` to check JavaScript syntax and key app features

The GitHub Pages workflow publishes the root files directly
