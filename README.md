# Nexus

Nexus is a focus workspace

The welcome page opens first. Enter the workspace to use the focus timer, ambient audio, projects, tasks and notes

## Open Nexus

https://captainbensword.github.io/Nexus/

## Focus

- Choose a 10, 25 or 45 minute session
- Optionally select a task
- Start, pause or reset the timer
- The timer keeps running while you move between workspace pages

## Ambient sound

Start sound with the Sound button on the welcome page or the Play control inside the workspace

Choose between:
- Rain
- Brown noise
- Wind
- Fireplace

Volume and sound choice are saved in this browser. The sound continues while navigating between the welcome page and workspace. Audio starts only after a button press because browsers block autoplay

The soundscapes are generated locally with the Web Audio API. Nexus does not download or stream audio files

## Projects, tasks and notes

New workspaces start empty

Projects can group related tasks and notes. Tasks can also stand alone. Notes can be connected to a project or kept separate

## Data

Nexus does not require an account

Projects, tasks and notes are stored in local browser storage on this device. They do not sync between devices

Use **Settings → Export workspace** to download a JSON backup. **Clear workspace** removes saved projects, tasks and notes from this browser

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| 1 | Focus |
| 2 | Projects |
| 3 | Tasks |
| 4 | Notes |
| Ctrl + K | Search |

## Development

The app is plain HTML, CSS and JavaScript with no build step

- `index.html` — welcome page and workspace structure
- `styles.css` — responsive design and animations
- `app.js` — workspace, timer and ambient audio
- `assets/nexus-symbol.svg` — geometric Nexus mark

Run `npm run check` to verify JavaScript syntax and key app features
