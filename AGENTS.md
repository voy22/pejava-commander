# Writing PejavaCommander plugins: guide for AI agents

This repository is the public home of [PejavaCommander](https://pejava.com), a two-panel file manager for macOS, Windows and Linux where everything is a plugin. The app itself is closed source and installed from [pejava.com/download](https://pejava.com/download/). This repo has everything needed to write a plugin for it:

| Path | What it is |
|---|---|
| [`docs/api.md`](docs/api.md) | The complete plugin API: anatomy, manifest, UI-side API (`pc`), Node-side API, panels (providers, fields, modes, views), keys and `when` clauses, colors, files on disk, workflow. **Read it before writing code.** |
| [`docs/cookbook.md`](docs/cookbook.md) | Task-oriented recipes: commands and keys, dialogs, panels, columns, Node parts, palettes, state. |
| [`examples/`](examples/) | Working plugins: `hello-world` (command, key, menu), `bookmarks` (a panel provider), `git-status` (a field, a listing mode and a Node part), `solarized-palette` (a palette, no code). |

`docs/` and `examples/` are published from the app's sources; don't edit them here.

## What a plugin is

A folder with a `plugin.json` manifest, an optional UI part `renderer.js` (ES module, runs in the window, gets the `pc` API) and an optional Node part `main.js` (CommonJS, runs in Electron's main process). The two parts talk over RPC. Declarative contributions in the manifest (commands, keybindings, menus, colors, palettes, settings, panel modes) need no code. Plugins load and unload without restarting the app.

Start from the closest example and the matching cookbook recipe instead of from scratch.

## Rules that the API relies on

- `id` matches `[a-z0-9][a-z0-9._-]*` and carries a prefix: `yourname.feature`. Prefix command ids the same way.
- The UI part has **no Node access** (no `require`, no `fs`). `pc.fs` lists, reads, renames, trashes and makes folders; writing files and anything else that needs Node goes into `main.js`, called with `pc.rpc.call()`.
- Use only the documented API: `pc` in the UI, `context` in the Node part. Don't reach into the app's DOM or internal objects (`window.pcWorkbench` is for debugging in DevTools only).
- Everything registered through `pc` is undone automatically when the plugin is disabled; release anything else in `deactivate()`.
- Give every command a `title` in `contributes.commands`; bind keys in `contributes.keybindings` with a `when` clause, so they work only where they make sense.
- Colors go through `contributes.colors` and CSS variables, so palettes can restyle them.

## Run and debug

Install PejavaCommander, then start it with the plugin folder (a folder of plugins works too):

```bash
# macOS
/Applications/PejavaCommander.app/Contents/MacOS/PejavaCommander --plugin-dev=/path/to/my-plugin
# Windows: PejavaCommander.exe --plugin-dev=C:\path\to\my-plugin
# Linux:   ./PejavaCommander-*.AppImage --plugin-dev=/path/to/my-plugin
```

- `PC_USER_DATA=/tmp/pc-test` before the command gives a separate, throwaway profile.
- `Cmd/Ctrl+Shift+R` reloads the window after editing the UI part; for the Node part, disable and enable the plugin or restart the app.
- `Cmd+Alt+I` (macOS) or `Ctrl+Shift+I` opens DevTools; `console.log` from the UI part shows there.
- Errors in `activate` appear as notifications and in the plugin manager (`Cmd/Ctrl+Shift+X`).

## Package and install

Zip the plugin folder with `plugin.json` at the root of the archive (or in a single top-level folder). Install it in the app: plugin manager (`Cmd/Ctrl+Shift+X`) → F5 → **From .zip package** or **From URL**.

## Before you call it done

1. The manifest is valid JSON, has `id`, `name`, `version`, and every file it names exists.
2. The plugin starts with `--plugin-dev` without errors in the plugin manager or DevTools.
3. Every command works from the command palette (`Cmd/Ctrl+Shift+P`) and its key, and is disabled where it can't act.
4. Disabling the plugin in the plugin manager removes everything it added.

## Licensing

The example plugins and the code samples in the docs may be copied, changed and used in your own plugins without restriction. Your plugins are yours. PejavaCommander itself is free for individuals and charities; see [pejava.com/license](https://pejava.com/license/).

Bugs and API wishes: [open an issue](../../issues/new/choose).
