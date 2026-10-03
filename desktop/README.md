# DCUGen desktop app

The same DCUGen Hero Forge, in its own window, with three things the web version cannot do:

- **Your data lives in a folder on your computer.** Everything (roster, world, battle, notes, settings) is
  mirrored to `vault/` inside the app's data folder a few seconds after any change, plus a rolling daily
  backup (14 days) in `backups/`. Updating or reinstalling the app keeps the folder, and `File > Open the
  data folder` shows you where it is. "Back up everything" on the Roster tab still works for a single file.
- **Host a table.** On the Table tab, "Host a table" starts a lobby on this computer and gives you a lobby
  key. Players paste it into "Join a table" in their own DCUGen app (desktop, or a local copy of
  `DCUGen.html`). They get your world and roster, claim their own characters, roll for them from the
  sheet's "Roll" menu, and everyone sees every roll. Players on your network join directly; for players
  elsewhere, forward the lobby port (7777 by default) on your router or run a tunnel, and the key works as is.
- **No browser storage limits.**

## Install it (no Node needed)

Every push to `main` makes GitHub build installers and publish them as a release:
[Windows installer](https://github.com/Beherrit/DCUGen/releases/latest/download/DCUGen-Setup.exe),
[Windows portable](https://github.com/Beherrit/DCUGen/releases/latest/download/DCUGen-Portable.exe),
[macOS](https://github.com/Beherrit/DCUGen/releases/latest/download/DCUGen.dmg),
[Linux](https://github.com/Beherrit/DCUGen/releases/latest/download/DCUGen.AppImage).
The website's "Get the app" button points at the same files. Installed apps check for a new release on start and
every four hours, download it in the background and offer a restart (`Help > Check for updates…` does it by hand).
The builds are not code-signed, so Windows shows an "unknown publisher" warning the first time (More info > Run
anyway) and macOS needs right-click > Open the first time; macOS apps also do not self-update without signing.

## Run it from source

Needs Node 18 or newer and a copy of the repository:

```
git clone https://github.com/Beherrit/DCUGen.git
cd DCUGen
npm run desktop
```

`npm run desktop` rebuilds `DCUGen.html`, installs Electron (about 100 MB, first time only) and opens the app.
It works the same in PowerShell, cmd and a Mac or Linux shell.

Step by step, if you prefer (one line at a time; Windows PowerShell 5 does not accept `&&` between commands):

```
cd DCUGen
npm run build
cd desktop
npm install
npm start
```

### "Electron failed to install correctly"

`npm install` downloaded the package but not Electron's runtime (interrupted or blocked download). `npm start`
now fetches it on its own; if that fails too, run these one at a time inside `desktop/`:

```
Remove-Item -Recurse -Force node_modules\electron      (PowerShell; on Mac/Linux: rm -rf node_modules/electron)
npm install
npm start
```

If the installer finishes instantly without downloading anything, the environment variable
`ELECTRON_SKIP_BINARY_DOWNLOAD` is set on your computer (some developer tools set it). `npm start` ignores it,
but `npm install` honours it; remove it from your system environment variables to make `npm install` work normally.

Behind a proxy or firewall that blocks downloads from github.com, point Electron at a mirror first:
`$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"` (PowerShell) or
`export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`.

## Make installers

```
npm run desktop:dist   # from the repository root: installers for this platform in desktop/dist/
```

or inside `desktop/`:

```
npm run dist         # installers for this platform in desktop/dist/
npm run dist:win     # Windows: NSIS installer and a portable .exe
npm run dist:mac     # macOS: .dmg
npm run dist:linux   # Linux: AppImage
```

Windows installers from a Mac or Linux machine need Wine; the simplest route is to run `npm run dist:win`
on a Windows machine, or let a GitHub Actions runner do it.

## Data folder

| Platform | Folder |
|----------|--------|
| Windows | `%APPDATA%\DCUGen Hero Forge\vault` |
| macOS | `~/Library/Application Support/DCUGen Hero Forge/vault` |
| Linux | `~/.config/DCUGen Hero Forge/vault` |

Each file is one piece of the app's data as JSON (`dcugen.roster.v1.json` is the roster). Copy the folder
to move everything to another machine, or import a `backups/dcugen-YYYY-MM-DD.json` with "Restore a backup".

## Lobby

The lobby server (`lobby-server.js`) is a plain WebSocket relay with no dependencies. The host's app is the
authority: it sends newcomers a snapshot of the roster and world, accepts edits only from the player who
claimed that character, and rebroadcasts rolls and chat. The lobby key encodes the host's addresses, the
port and a one-time token.
