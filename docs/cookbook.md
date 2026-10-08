<!-- Published from the PejavaCommander sources (also at https://pejava.com/docs/). Do not edit here: changes are overwritten. -->

# PejavaCommander Cookbook

Hands-on recipes for plugin authors. The full reference is the [API](api.md).
Working versions of several recipes are in [`examples`](../examples/).

1. [Your first plugin](#1-your-first-plugin)
2. [Command + key + menu + key bar](#2-command--key--menu--key-bar)
3. [A new column (field)](#3-a-new-column-field)
4. [A new listing mode](#4-a-new-listing-mode)
5. [Data from Node.js (Node part + RPC)](#5-data-from-nodejs-node-part--rpc)
6. [A custom panel (provider)](#6-a-custom-panel-provider)
7. [Colors, CSS and palettes](#7-colors-css-and-palettes)
8. [Plugin settings](#8-plugin-settings)
9. [Working with the terminal](#9-working-with-the-terminal)
10. [Dialogs](#10-dialogs)
11. [Acting on the selected files](#11-acting-on-the-selected-files)
12. [Remembering state](#12-remembering-state)
13. [Replacing or changing built-in behaviour](#13-replacing-or-changing-built-in-behaviour)
14. [Packaging and installing](#14-packaging-and-installing)
15. [User recipes: keys and palettes without code](#15-user-recipes-keys-and-palettes-without-code)
16. [Your own panel view](#16-your-own-panel-view)
17. [Details and drag and drop in your provider](#17-details-and-drag-and-drop-in-your-provider)

---

## 1. Your first plugin

```
hello/
  plugin.json
  renderer.js
```

`plugin.json`:
```json
{
  "id": "me.hello",
  "name": "Hello",
  "version": "0.1.0",
  "renderer": "renderer.js",
  "contributes": {
    "commands": [{ "command": "me.hello", "title": "Say Hello", "category": "Hello" }]
  }
}
```

`renderer.js`:
```js
export function activate(pc) {
  pc.commands.register('me.hello', () => pc.ui.showMessage('Hello from my plugin!'));
}
```

Run it without installing (on Windows run `PejavaCommander.exe`, on Linux the AppImage, with the same option):
```bash
/Applications/PejavaCommander.app/Contents/MacOS/PejavaCommander --plugin-dev=/path/to/hello
```
Press `Cmd/Ctrl+Shift+P`, type "hello", and press Enter. After editing the code, press `Cmd/Ctrl+Shift+R` to reload the window.

## 2. Command + key + menu + key bar

```json
"contributes": {
  "commands": [
    { "command": "me.touch", "title": "Create Empty File…", "category": "Files", "keybarTitle": "Touch" }
  ],
  "keybindings": [
    { "key": "shift+f4", "command": "me.touch", "when": "panelFocus && activePanelProvider == 'fs'" }
  ],
  "menus": [
    { "menu": "file", "command": "me.touch", "group": "2" }
  ]
}
```

```js
export function activate(pc) {
  pc.commands.register('me.touch', async () => {
    const panel = pc.panels.active;
    const name = await pc.ui.showInputBox({ title: 'Create File', prompt: 'File name:' });
    if (!name) return;
    await pc.terminal.run(`touch ${pc.terminal.quote(name)}`, { showOutput: false });
  });
}
```

- **Key bar:** hold Shift in the panels and F4 shows "Touch". The key bar always shows the F1–F10 bindings active right now, for the modifiers being held.
- **`when`:** use it to scope keys. `panelFocus` keeps F-keys working in terminal programs while the panels are hidden.

## 3. A new column (field)

A field that shows how old a file is:

```js
export function activate(pc) {
  const DAY = 86_400_000;
  pc.panels.registerField('me.age', {
    title: 'Age',
    width: 5,
    align: 'right',
    render: (item) => (item.mtime && !item.isParent ? `${Math.floor((Date.now() - item.mtime) / DAY)}d` : ''),
    sortValue: (item) => item.mtime ?? 0,
  });
}
```

Put it in a mode (next recipe). You can also sort by it with Ctrl+F12 → Age.

## 4. A new listing mode

Modes are plain JSON, so no code is needed:

```json
"panelModes": [
  {
    "id": "me.ages",
    "title": "Name + Age (2 columns)",
    "columns": 2,
    "providers": ["fs"],
    "fields": [{ "field": "name" }, { "field": "me.age" }]
  }
],
"keybindings": [
  { "key": "ctrl+7", "command": "panels.setMode", "args": "me.ages", "when": "panelFocus" }
]
```

`columns` = how many flowing columns the items fill. `fields` = what each column shows. The mode also appears in the Left and Right menus and in `Ctrl+M`.

Fixed-width columns instead of a fixed count: `"columns": "auto", "columnWidth": 30` (characters). `columnWidth` may also name a number setting, as the built-in `columns` mode does with `panels.columnWidth`.

## 5. Data from Node.js (Node part + RPC)

The UI part has no Node access. Put Node code in `main.js` and call it through RPC. Full example: [`examples/git-status`](../examples/git-status/).

`plugin.json`: `"main": "main.js", "renderer": "renderer.js"`

`main.js`:
```js
const fs = require('fs/promises');
const path = require('path');

exports.activate = (context) => {
  // Count lines of a text file.
  context.rpc.handle('countLines', async (file) => {
    const text = await fs.readFile(file, 'utf8');
    return text.split('\n').length;
  });

  // Push events to the UI side.
  const timer = setInterval(() => context.rpc.emit('tick', Date.now()), 60_000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
};
```

`renderer.js`:
```js
export function activate(pc) {
  pc.commands.register('me.lines', async () => {
    const item = pc.panels.active.cursorItem;
    if (!item || item.isDir) return;
    const n = await pc.rpc.call('countLines', item.path);
    pc.ui.showMessage(`${item.name}: ${n} lines`);
  });
  pc.rpc.on('tick', (t) => console.log('tick', t));
}
```

**Async fields:** `render()` must return a value right away. Cache the results, start loading on a cache miss, and call `panel.refresh()` when the data arrives, as the git example does.

## 6. A custom panel (provider)

A provider gives a panel a new purpose, for example environment variables:

```js
export function activate(pc) {
  pc.panels.registerProvider('me.env', {
    title: 'Environment',
    description: 'Shell environment variables',
    defaultMode: 'me.env.list',

    async list() {
      const out = await pc.rpc.call('env'); // from main.js: return process.env
      const items = [{ name: '..', isParent: true, isDir: true }];
      for (const [name, value] of Object.entries(out)) items.push({ name, value });
      return { location: 'env', title: 'Environment', items };
    },

    async open(item, { panel }) {
      if (item.isParent) {
        if (!(await panel.back())) await panel.setProvider('fs');
        return;
      }
      pc.terminal.sendText(`$${item.name}`); // insert into the command line
    },

    parentLocation: () => null, // "up" = back to where we came from
    statusText: (item) => item.value ?? '',
  });

  pc.panels.registerField('me.env.value', { title: 'Value', width: '*', render: (i) => i.value ?? '' });
  pc.panels.registerMode({
    id: 'me.env.list', title: 'Env', columns: 1, providers: ['me.env'],
    fields: [{ field: 'name', width: 24 }, { field: 'me.env.value' }],
  });
}
```

Open it with Alt+F1 / Alt+F2 (it is listed in the chooser), or from a command: `pc.panels.active.setProvider('me.env')`.
See also the directory hotlist in [`examples/bookmarks`](../examples/bookmarks/).

## 7. Colors, CSS and palettes

Declare colors so users can change them in Settings → Colors:
```json
"contributes": {
  "colors": [{ "id": "me.warn.foreground", "default": "#ff5555", "description": "Warnings in my column" }]
},
"styles": ["styles.css"]
```

`styles.css` (a color id becomes a CSS variable, with dots replaced by dashes):
```css
.me-warn { color: var(--me-warn-foreground); }
```

Use it from a field: `className: (item) => (item.size > 1e9 ? 'me-warn' : undefined)`.
For a whole row, set `item.color = 'me.warn.foreground'` in your provider.

A **palette-only plugin** needs no code. See [`examples/solarized-palette`](../examples/solarized-palette/):
```json
"contributes": { "palettes": [{ "id": "example-solarized-dark", "label": "Solarized Dark (example)", "path": "solarized-dark.json" }] }
```

Tip: design the palette in Settings → Colors (Duplicate → edit → Export…), then ship the exported file.

## 8. Plugin settings

```json
"contributes": {
  "settings": [
    { "key": "me.maxLines", "type": "number", "default": 1000, "description": "Stop counting after N lines" },
    { "key": "me.mode", "type": "string", "enum": ["fast", "exact"], "default": "fast", "description": "Counting mode" }
  ]
}
```

```js
const max = pc.settings.get('me.maxLines');
pc.settings.onDidChange((keys) => {
  if (keys.includes('me.mode')) reconfigure();
});
await pc.settings.update('me.maxLines', 5000); // or null to reset
```

## 9. Working with the terminal

```js
// Run a command. The panels hide until it finishes.
await pc.terminal.run(`du -sh ${pc.terminal.quote(item.name)}`);

// Run quietly and keep the panels.
await pc.terminal.run('git fetch', { showOutput: false });

// Type into the command line without executing.
pc.terminal.sendText(`${pc.terminal.quote(item.path)} `);

// Follow the shell.
pc.terminal.onDidChangeCwd((dir) => console.log('shell is now in', dir));
pc.terminal.onDidPrompt(() => console.log('a command finished'));

// cd (refused while a program runs).
const res = await pc.terminal.cd('/tmp');
if (!res.ok) pc.ui.showMessage(`cd failed: ${res.reason}`, 'warning');
```

## 10. Dialogs

```js
const pick = await pc.ui.showQuickPick(
  [{ label: 'Zip', description: '.zip', value: 'zip' }, { label: 'Tar', value: 'tar' }],
  { title: 'Archive format' },
);
if (!pick) return; // Esc

const name = await pc.ui.showInputBox({
  title: 'Archive',
  prompt: 'File name:',
  value: 'backup.zip',
  validate: (v) => (v.trim() ? undefined : 'Required'),
});

const answer = await pc.ui.confirm('Overwrite existing file?', { buttons: ['Overwrite', 'Cancel'], danger: true });
if (answer !== 'Overwrite') return;

pc.ui.showMessage('Done');            // info
pc.ui.showMessage('Careful', 'warning');
pc.ui.showMessage('Failed', 'error');
```

## 11. Acting on the selected files

`targetItems` gives the marked items, or the item under the cursor when nothing is marked:

```js
pc.commands.register('me.zip', async () => {
  const panel = pc.panels.active;
  if (panel.providerId !== 'fs') return;
  const names = panel.targetItems.map((i) => pc.terminal.quote(i.name)).join(' ');
  if (!names) return;
  await pc.terminal.run(`zip -r archive.zip ${names}`);
  await panel.refresh();
  panel.clearSelection();
});
```

Selection keys: Insert / Ctrl+T / Shift+↑↓ to mark (Space too while the command line is empty; with text typed it goes there), Num+ / Num− for a pattern, Num* to invert, Cmd/Ctrl+A for all.

## 12. Remembering state

```js
export async function activate(pc, context) {
  const count = (await context.state.get('launches', 0)) + 1;
  await context.state.update('launches', count);
}
```
For larger data, use the Node part and `context.storagePath`.

## 13. Replacing or changing built-in behaviour

- **Rebind keys (no code):** Settings → Keyboard. Your changes are saved in `keybindings.json`.
- **Add behaviour to an existing key in some context:** declare a binding with a more specific `when`. It wins over the built-in one:
  ```json
  { "key": "f3", "command": "me.preview", "when": "panelFocus && activePanelProvider == 'fs' && !cursorIsDirectory" }
  ```
- **Replace a built-in plugin:** install a plugin with the same `id`, e.g. `core.fileops`. It overrides the built-in copy. The manager shows the source as "installed*".
- **Turn off a built-in feature:** disable it in the plugin manager (F2), e.g. `core.fileops` or `core.palettes`. `core.workbench` and `core.panels` are required.
- **Change what `Enter` does in file panels:** register your own provider with id `fs` in a plugin that replaces `core.filesystem`. Or bind `enter` to your command with a more specific `when`.

## 14. Packaging and installing

```bash
cd my-plugin && zip -r ../my-plugin.zip .      # plugin.json at the root of the zip
```

Then open the Plugin Manager (`Cmd/Ctrl+Shift+X` or Options → Plugin Manager), press **F5 Install**, and choose:
- **From folder…**: copies the folder into `<userData>/plugins/<id>`;
- **From .zip package…**;
- **From URL…**: downloads a `.zip`. This is what the future plugin server will use.

In the manager: **F2** enable/disable, **F8** uninstall, **Enter** for details, **F4** reveals the folder, **Esc/F10** closes the manager.

## 15. User recipes: keys and palettes without code

- **Make F9 open the command palette:** Settings → Keyboard, search "Command Palette", press **+**, then F9.
- **Remove a shortcut:** press ✕ on its chip. For a built-in key this stores `{"key": "...", "command": "-id"}`.
- **Share your keys:** Settings → Keyboard → Export… / Import….
- **Your own colors:** Settings → Colors → select a palette → Duplicate → edit (the main window updates live) → Activate. Share it with Export… / Import….
- **Quickly switch palette:** Options → Select Color Palette….

## 16. Your own panel view

A view decides how a panel is drawn. The list, the icon grid and the preview are all views. This one shows each item as a bar proportional to its size:

```js
export function activate(pc) {
  pc.panels.registerView('me.sizebars', {
    title: 'Size bars',
    create(container, ctx) {
      const root = document.createElement('div');
      root.style.cssText = 'flex:1; overflow:hidden; padding:0 1ch';
      container.append(root);
      root.addEventListener('mousedown', (e) => {
        const row = e.target.closest('[data-index]');
        if (row) ctx.panel.click(Number(row.dataset.index), e); // Shift/Cmd selection for free
      });
      let top = 0;
      const rows = () => Math.max(1, Math.floor(root.clientHeight / ctx.metrics.rowHeight()));
      return {
        get pageSize() { return rows(); },
        step: (dir) => ({ up: -1, down: 1, pageUp: -rows(), pageDown: rows() })[dir] ?? 0,
        render() {
          const { items, cursorIndex } = ctx.panel;
          const n = rows();
          if (cursorIndex < top) top = cursorIndex;
          if (cursorIndex >= top + n) top = cursorIndex - n + 1;
          const max = Math.max(1, ...items.map((i) => i.size || 0));
          root.replaceChildren(...items.slice(top, top + n).map((item, k) => {
            const row = document.createElement('div');
            row.dataset.index = top + k;
            row.className = `pc-row${top + k === cursorIndex ? ' is-cursor' : ''}${ctx.panel.isSelected(item) ? ' is-selected' : ''}`;
            const pct = Math.round(((item.size || 0) / max) * 100);
            row.style.background = top + k === cursorIndex ? '' :
              `linear-gradient(90deg, color-mix(in srgb, var(--panel-cursor-background) 40%, transparent) ${pct}%, transparent ${pct}%)`;
            row.textContent = item.name;
            return row;
          }));
        },
        dispose: () => root.remove(),
      };
    },
  });
  pc.panels.registerMode({ id: 'me.sizebars', title: 'Size bars', view: 'me.sizebars', providers: ['fs'] });
}
```

Pick it with Ctrl+M (or a keybinding to `panels.setMode` with args `"me.sizebars"`).
Tips:
- Reuse the core classes (`pc-row`, `is-cursor`, `is-selected`) so palettes apply automatically.
- `ctx.mode.options` carries free-form options from the mode definition.
- For file content use `pc.fs.fileUrl(path)` (img/video/audio), `pc.fs.readText(path)` and `pc.fs.thumbnail(path, size)`.
- A view that follows the other panel (like Preview) can subscribe with `pc.panels.getPanel(otherSide).onDidChange(...)` and must dispose that in `dispose()`.

## 17. Details and drag and drop in your provider

```js
pc.panels.registerProvider('me.notes', {
  title: 'Notes',
  async list() { /* … items with { name, path, size, mtime } … */ },

  // Two-column details block under the panel (F9 / Ctrl+I makes it compact: path only).
  details(item) {
    return [
      ['Note', item.name, { wide: true }],
      ['Words', String(item.words)], ['Updated', new Date(item.mtime).toLocaleString()],
    ];
  },

  // Let users drag notes into a file panel…
  canDrag: (item) => Boolean(item.path),

  // …and drop files here to import them.
  dropEffect: (drop) => (drop.source?.providerId === 'me.notes' ? 'none' : 'copy'),
  async acceptDrop(drop, { panel }) {
    await pc.rpc.call('import', drop.paths);
    await panel.refresh();
  },
});
```

The panel finds the dragged items through the view's `data-index` elements, so this works in every view (list, icons, your own). A file panel that receives the drag calls `fileops.copyTo` / `moveTo` with your items' `path`s.
