# Nexus

Nexus is a focus workspace with a timer, ambient sound, projects, tasks and notes

## Open Nexus

https://captainbensword.github.io/Nexus/

A new workspace starts empty

## Focus

The Focus page is the main screen

- Choose a 10, 25 or 45 minute session
- Optionally select a task to work on
- Start, pause or reset the timer
- The timer keeps running while you move to another page

A small timer indicator stays in the top bar while a session is running

## Ambient sound

Use **Sound** in the top bar to choose:

- Soft rain
- Brown noise
- Wind
- Fireplace

Press **Play** once to start audio. Browsers require a user action before a website can play sound

The sound continues while navigating between Nexus pages. The soundscapes are generated locally with the Web Audio API; no audio files are downloaded or streamed. Scene and volume preferences are saved in this browser

## Projects, tasks and notes

Projects can group related tasks and notes

Tasks can be linked to a project or left on their own
Notes can be linked to a project or kept separate

Nothing is preloaded as an example. Create only what you need

## Data

Nexus does not require an account

Projects, tasks and notes are stored in local browser storage on this device. They do not sync to another browser or device

Use **Settings → Export workspace** to download a JSON backup. **Clear workspace** removes the saved projects, tasks and notes from this browser

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

- `index.html` — page structure and persistent controls
- `styles.css` — layout, transitions and responsive styling
- `app.js` — workspace data, timer and ambient audio
- `assets/nexus-symbol.svg` — geometric Nexus mark

Run `npm run check` to check JavaScript syntax and core features
