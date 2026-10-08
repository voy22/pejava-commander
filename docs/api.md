<!-- Published from the PejavaCommander sources (also at https://pejava.com/docs/). Do not edit here: changes are overwritten. -->

# PejavaCommander Plugin API

This document describes how PejavaCommander is built and the full API for plugins.
For step-by-step examples, see the [Cookbook](cookbook.md).

- [1. Architecture](#1-architecture)
- [2. Plugin anatomy](#2-plugin-anatomy)
- [3. Manifest reference (`plugin.json`)](#3-manifest-reference-pluginjson)
- [4. UI-side API (`pc`)](#4-ui-side-api-pc)
- [5. Node-side API](#5-node-side-api)
- [6. Panels: providers, fields, modes](#6-panels-providers-fields-modes)
- [7. Keys and `when` clauses](#7-keys-and-when-clauses)
- [8. Colors and palettes](#8-colors-and-palettes)
- [9. Files on disk](#9-files-on-disk)
- [10. Development workflow](#10-development-workflow)
- [11. Built-in plugins and commands](#11-built-in-plugins-and-commands)

---

## 1. Architecture

```
┌──────────────────────────── Main process (Node) ─────────────────────────────┐
│ PluginHost   SettingsService   ThemeService   KeybindingService   PtyService │
│ (discovery,  (settings.json)   (palettes)     (keybindings.json)  (shell)    │
│  Node parts)                                                                  │
└──────────────▲──────────────────────────────▲─────────────────────────────────┘
               │ IPC (preload: window.pcBridge)│
┌──────────────┴──── Main window (UI) ─────────┴────────┐  ┌── Settings window ──┐
│ Workbench: commands, keybindings, context keys, menus, │  │ General / Colors /  │
│ theme, dialogs, registries (providers/fields/modes)    │  │ Keyboard editors    │
│ Layer 1: TerminalLayer (xterm.js + shell)              │  └─────────────────────┘
│ Layer 2: PanelsLayer (1–2 panels + key bar)            │
│ PluginLoader → activate(pc, context) of UI parts       │
└────────────────────────────────────────────────────────┘
```

**Two layers.** Layer 1 is your shell (`$SHELL`) in a real PTY, rendered by xterm.js with full color support. Layer 2 holds the panels. They cover the whole window except the last line, where the shell prompt shows through. `Ctrl+O` shows or hides the panels.

**The shell owns the working directory.** Shell integration reports the directory on every prompt. The active file panel follows it. When a panel navigates, the app sends `cd` to the shell, but only while the shell sits at its prompt.

**Everything is a plugin.** File panels, listing modes, file operations, palettes, the plugin manager and even the application commands are built-in plugins in `src/plugins/`. Your plugins use the same API. A user plugin with the same `id` replaces the built-in one.

**Declarative + code.** A plugin declares static things in `plugin.json` (commands, keys, menus, colors, palettes, settings, listing modes). It registers dynamic things in code (command handlers, panel providers, fields).

**Hot reload.** Enabling, disabling, installing or uninstalling a plugin applies at once, without a restart. Everything a plugin registered through the API is removed automatically.

**Security.** Like VS Code extensions, plugins are trusted code. The Node part has full Node.js access. Install plugins only from sources you trust.

## 2. Plugin anatomy

```
my-plugin/
  plugin.json      manifest (required)
  renderer.js      UI part, an ES module (optional)
  main.js          Node part, CommonJS (optional)
  styles.css       extra CSS (optional, listed in "styles")
  palettes/…       palette files (optional)
```

**UI part** (`renderer.js`), runs in the main window:

```js
export function activate(pc, context) {
  pc.commands.register('my.hello', () => pc.ui.showMessage('Hello!'));
}
export function deactivate() {} // optional; registrations are undone automatically
```

**Node part** (`main.js`), runs in the Electron main process:

```js
exports.activate = (context) => {
  context.rpc.handle('sum', (a, b) => a + b); // called from UI: pc.rpc.call('sum', 1, 2)
};
exports.deactivate = () => {};
```

**Lifecycle**
1. On start, the app scans the built-in folder, the user plugins folder and any `--plugin-dev` folders.
2. It activates the Node parts of enabled plugins.
3. The main window applies each plugin's declarative contributions, then imports its `renderer` module and calls `activate(pc, context)`. Built-in plugins go first.
4. When a plugin is disabled or removed, the app calls `deactivate()` and disposes everything it registered.

## 3. Manifest reference (`plugin.json`)

| Field | Type | Description |
|---|---|---|
| `id` | string, required | Unique id, `[a-z0-9][a-z0-9._-]*`. Use a prefix: `yourname.feature`. |
| `name` | string, required | Display name. |
| `version` | string, required | Semver, e.g. `1.2.0`. |
| `description` | string | Shown in the plugin manager. |
| `author` | string | |
| `renderer` | string | Path to the UI module (ES module). |
| `main` | string | Path to the Node module (CommonJS). |
| `styles` | string[] | CSS files to load into the main window. |
| `required` | boolean | Built-in plugins only: the plugin cannot be disabled. |
| `contributes` | object | Contribution points, see below. |

### `contributes.commands`

```json
{ "command": "my.cmd", "title": "Do Something", "category": "My", "keybarTitle": "DoIt", "enablement": "activePanelHasTarget", "description": "…" }
```
Declares titles for the command palette, menus, the key bar and the keyboard editor. The handler is registered in code with `pc.commands.register`. `enablement` is a when-clause: while it is false the command's key does nothing and its key bar label is dimmed (use it for "bound here, but nothing to act on right now"; use the binding's `when` for "not available in this panel at all").

### `contributes.keybindings`

```json
{ "key": "ctrl+shift+d", "mac": "meta+shift+d", "command": "my.cmd", "when": "panelFocus", "args": ["x"], "keybarTitle": "Dup" }
```
- `key` is the default for every platform. `mac`, `linux` and `win` override it per platform.
- `args` is passed to the command handler (a single value or an array).
- `keybarTitle` is a label for this binding in the F-key bar (overrides the command's).
- See [section 7](#7-keys-and-when-clauses) for the key syntax and `when`.

### `contributes.menubar` / `contributes.menus`

```json
"menubar": [{ "id": "tools", "label": "Tools", "order": 45 }],
"menus": [
  { "menu": "tools", "command": "my.cmd", "group": "1", "order": 10 },
  { "menu": "tools", "command": "panels.setMode", "args": ["left", "columns3"], "label": "Columns 3", "checked": "leftPanelMode == 'columns3'" },
  { "menu": "tools", "submenu": "tools.more", "label": "More" },
  { "menu": "tools.more", "command": "my.other", "when": "activePanelProvider == 'fs'" }
]
```
Built-in top menus: `left` (10), `file` (20), `command` (30), `options` (40), `right` (50).
Items are sorted by `group`, then `order`, with a separator between groups. `when` hides an item. `checked` shows a check mark. Both are context-key expressions. The shortcut shown next to an item comes from the keybindings.

### `contributes.colors`

```json
{ "id": "myplugin.badge.foreground", "default": "#ffcc00", "description": "Badge text" }
```
Becomes the CSS variable `--myplugin-badge-foreground`, and can be edited in Settings → Colors.

### `contributes.palettes`

```json
{ "id": "my-theme", "label": "My Theme", "path": "palettes/my-theme.json" }
```
Palette file format: see [section 8](#8-colors-and-palettes).

### `contributes.settings`

```json
{ "key": "myplugin.limit", "type": "number", "default": 100, "description": "Max items", "enum": null, "hidden": false }
```
`type`: `boolean` | `number` | `string`. With `enum: [...]` the setting is shown as a drop-down. Settings appear in Settings → General.

### `contributes.panelModes`

```json
{ "id": "wide", "title": "Wide", "columns": 2, "order": 50, "providers": ["fs"],
  "fields": [{ "field": "name" }, { "field": "size", "width": 8, "align": "right", "title": "Bytes" }] }
```
`"details"` decides whether panels in this mode show the details block: `true` (default), `false`, or the key of a boolean setting (the mode then follows that setting, so a command or hotkey that flips it shows/hides the block). See [section 6](#6-panels-providers-fields-modes).

## 4. UI-side API (`pc`)

`activate(pc, context)` receives:

**`context`**: `{ id, manifest, baseUrl, asUrl(relPath), subscriptions: { push(...disposables) }, state }`
- `context.state.get(key, fallback)` and `context.state.update(key, value)`: persistent per-plugin storage (async).

Every `register…`/`on…` function returns a **disposable** (`{ dispose() }`). You don't need to dispose them yourself: they are removed when the plugin stops.

### `pc.commands`
| | |
|---|---|
| `register(id, handler, meta?)` | Register a handler. `meta`: `{ title, category, keybarTitle }` for commands not declared in the manifest. |
| `execute(id, ...args)` | Run a command. Returns a Promise with its result. |
| `list()` | `[{ id, title, category, keybarTitle, available }]` |
| `getKeys(id, args?)` | Keys bound to a command, e.g. `['f5']`; with `args`, only bindings that pass them (`getKeys('panels.setMode', ['column'])`). |

### `pc.keybindings`
| | |
|---|---|
| `register({ key, command, when?, args?, mac?, keybarTitle? })` | Add a binding from code. |
| `format(key)` | Display form: `'shift+meta+p'` → `⇧⌘P` on macOS. |

### `pc.context`
`set(key, value)` and `get(key)` read and write context keys used by `when` clauses. Plugins may define their own keys, e.g. `myplugin.busy`.

### `pc.menus`
`registerMenu({ id, label, order })` and `registerItem({ menu, command, … })`: the same shapes as in the manifest.

### `pc.panels`
| | |
|---|---|
| `registerProvider(id, provider)` | A panel source (see §6). |
| `registerField(id, field)` | A column field (see §6). |
| `registerMode(mode)` | A listing mode (same shape as the manifest). |
| `registerView(id, view)` | A panel view: draws a panel in its own way (see §6). |
| `getField(id)` | A registered field definition. |
| `providers`, `fields`, `modes`, `views` | Lists of what is registered. |
| `active`, `passive`, `left`, `right`, `getPanel(side)` | Panel handles (below). |
| `activeSide` | `'left'` or `'right'`. |
| `visible`, `isDual` | Layer visible? Two panels shown? |
| `show()`, `hide()`, `toggle()` | Show or hide the panels layer. |
| `activate(side)`, `switch()`, `swap()` | Change the active panel, or swap the panels. |
| `resizable`, `toggleResizable()` | Resizable mode: the divider can be dragged; the narrower panel keeps its width in pixels (50/50 while the window is too narrow for it). Toggling resets to 50/50 and returns the new mode. |
| `togglePanel(side)`, `setDual(bool)` | One panel or two. |
| `onDidChangeLocation(fn)` | `fn({ panel, location })` for any panel. |
| `onDidChangeProviders(fn)`, `onDidChangeModes(fn)` | Registry changes. |

**Panel handle**

| Property | |
|---|---|
| `side`, `isActive` | |
| `providerId`, `location` | What is shown and where. |
| `modeId`, `mode` (normalized mode object), `availableModes`, `defaultModeId`, `sort` (`{ field, reverse }`) | |
| `title`, `error` | Panel title, last listing error. |
| `itemsVersion` | Increases whenever the items are reloaded or re-sorted (views use it to rebuild). |
| `locationInfo` | The `info` object the provider returned with the listing (fs: `{ dev }`). |
| `items`, `cursorItem`, `cursorIndex` | |
| `selectedItems` | Marked items. |
| `targetItems` | What operations act on: the view's choice (see view hooks), else marked items, else the item under the cursor. |
| `currentItem` | What F3/F4 act on: the view's choice, else the item under the cursor. |
| `view` | `{ id, sortable, itemOps }` of the current view. |
| `rowsPerColumn`, `pageSize` | Current geometry. |

| Method | |
|---|---|
| `navigate(location, { focus? })` | Same provider, new location. `focus` = item name to put the cursor on. |
| `setProvider(id, location?)` | Switch the source. `back()` returns to the previous one. |
| `refresh()`, `openItem(item?)`, `goParent()` | |
| `setMode(id)`, `resetMode()`, `setSort(field, reverse?)` | A mode that does not fit the provider switches to the provider's default. |
| `setCursor(i)`, `moveCursor(delta)`, `setCursorByName(name)` | |
| `moveDirection(dir)` | `'up' 'down' 'left' 'right' 'pageUp' 'pageDown'`; the view decides the step. |
| `click(index, { shiftKey, metaKey, ctrlKey })` | Mouse semantics: click = cursor, Cmd/Ctrl = toggle mark, Shift = mark range. |
| `isSelected(item)` | |
| `setSelection(names, { cursorName? })` | Replace the selection (rubber-band selection uses it). |
| `toggleSelect(item?, value?)`, `select(names, value)`, `selectWhere(pred, value)`, `invertSelection()`, `clearSelection()` | |
| `expand(item)`, `collapse(item)`, `toggleExpand(item)`, `isExpanded(item)` | Folders open in place, in a view with `tree: true`. Their items follow the folder in `items`, named `"<folder>/<name>"`, with `depth` and `treeParent`; a folder's location is its `item.path`. They stay open when the same place is reread. |
| `onDidChangeLocation(fn)`, `onDidChange(fn)` | |

### `pc.terminal`
| | |
|---|---|
| `cwd`, `onDidChangeCwd(fn)` | The shell's working directory. |
| `onDidPrompt(fn)` | Fires on every new prompt (a command finished). |
| `cd(dir)` | `cd` in the shell. Returns `{ ok, reason? }`; `reason: 'busy'` means a program is running. |
| `run(command, { showOutput = true })` | Run a command line. The panels hide until the next prompt. |
| `sendText(text)` | Type into the command line (no Enter). `'\r'` executes. |
| `clearCommandLine()` | |
| `write(data)` | Raw bytes to the PTY. |
| `quote(str)` | Shell-safe single quoting. |
| `focus()`, `isIdle()` | |

### `pc.fs`
All async unless noted: `list(dir)` → `{ path, parent, entries[] }`; `stat(path)`; `isDirectory(path)`; `roots()` → `[{ label, path, kind: 'home' \| 'root' \| 'volume', total?, free? }]` (sizes when the volume answers within 400 ms); `mkdir(path)`; `trash(paths[])`; `rename(from, to)`; `openPath(path)` (default app); `reveal(path)`.
`readText(path, maxBytes = 256K)` → `{ text, truncated, binary, size }`; `dirSize(paths)` → `{ bytes, files, dirs, errors }` (recursive, symlinks not followed); `thumbnail(path, size, mtime?)` → data URL or `null` (system thumbnailer: images, video, PDF on macOS; cached and queued); `cachedThumbnail(path, size, mtime?)` (sync, `undefined` if not loaded yet).
Sync: `fileUrl(path)` → a `pc://local/…` URL for `<img>`/`<video>`/`<audio>` (supports seeking); `info()` → `{ home, sep, platform, uid, user }`; path helpers `join`, `dirname`, `basename`, `extname`, `normalize`, `resolve(base, input)`.

Entry: `{ name, path, isDir, isLink, linkBroken?, linkTarget?, size, mtime, ctime, birthtime, atime, mode, uid, gid, isExecutable, error? }`.

### `pc.ui`
| | |
|---|---|
| `showQuickPick(items, { title, placeholder, activeIndex, panel?, anchor? })` | Items: strings or `{ label, description?, detail?, value? }`; `{ separator: true, label }` starts a titled group; filtering also matches the group title and keeps it above its matches. Resolves with the picked item, or `undefined`. |
| `showInputBox({ title, prompt, value, placeholder, validate, password })` | `validate(v)` returns an error message or nothing; `password: true` hides the text. Resolves with the string, or `undefined`. |
| `showForm({ title, fields, submitLabel, validate, onChange, actions })` | A dialog with several fields. Field: `{ id, label, type: 'text' \| 'password' \| 'number' \| 'select' \| 'checkbox' \| 'separator', value, placeholder, hint, options: [{ label, value }], visible(values), autofocus, button: { label, run(values) } }`. `validate(values)` returns an error message; `onChange(values, id)` may return `{ id: value }` to update other fields; `actions: [{ label, run(values, { setMessage }) }]` are extra buttons that keep the dialog open (e.g. Test). Resolves with `{ id: value }`, or `undefined`. |
| `confirm(message, { title, buttons = ['Yes','No'], danger })` | Resolves with the pressed button's label, or `undefined`. |
| *placement* | Dialogs open centered over the active panel while the panels are shown. `panel: 'left' \| 'right' \| handle` centers over that panel, `anchor: 'window'` over the whole window (use it for app-wide dialogs). Works for all three dialog kinds. |
| `showMessage(text, level = 'info')` | `'info'`, `'warning'` or `'error'` toast. |
| `fileKind(item)`, `fileExt(name)`, `hasThumbnail(item)`, `canShowInBrowser(name)` | File type helpers: kind is `folder`, `image`, `video`, `audio`, `archive`, `pdf`, `document`, `source`, `text`, `executable`, `other`; `canShowInBrowser` → `'image' \| 'video' \| 'audio' \| null`. |
| `fileIconSvg(item)`, `renderFileIcon(host, item)` | Format icons (respects `item.icon`). |
| `showOpenDialog(options)`, `showSaveDialog(options)` | Native dialogs (Electron options). |

### `pc.settings`
`get(key, fallback)`, `update(key, value)` (`null` resets), `onDidChange(fn(keys[]))`.

### `pc.theme`
`getColor(id)`, `palette` (`{ id, name, type }`), `cssVar(id)`, `listPalettes()`, `setPalette(id)`, `onDidChange(fn)`.

### `pc.plugins`
`list()`, `errors()`, `setEnabled(id, bool)`, `installFromFolder(dir?)`, `installFromZip(file?)`, `installFromUrl(url)`, `uninstall(id)`, `onDidChange(fn)`. Called without a path, the install functions open a file dialog.

### `pc.rpc`
`call(method, ...args)` calls this plugin's Node part. `on(event, fn)` receives events it emits.

### `pc.app`
`openSettings(tab?)` (`'general' | 'colors' | 'keys' | 'account'`), `reload()`, `quit()`, `info()`, `toggleDevTools()`.

### `pc.tabs`
Each tab of a window is a separate page with its own terminal, panels and plugin instances (the plugins' Node parts are shared). Calls without an id act on the plugin's own tab: `new()`, `newWindow()`, `close(id?)` (asks when a program runs), `next()`, `previous()`, `selectIndex(i)` (8 and above = last), `rename(name, id?)` (empty = automatic title), `info()` → `{ id, title, customName, count }`, `moveToNewWindow(id?)`. The automatic title is the page's `document.title`: the shell's folder, or "folder — program" while a command runs (a program's own terminal title wins). Commands: `tabs.new` ⌘T, `tabs.newWindow` ⌘N, `tabs.close` ⌘W, `tabs.next` ⌘⇧] / ⌃Tab, `tabs.previous` ⌘⇧[ / ⌃⇧Tab, `tabs.select` ⌘1…⌘9, `tabs.rename`, `tabs.moveToNewWindow`. Tab bar colors: `tabs.*`.

## 5. Node-side API

```js
exports.activate = (context) => { … };
```

| `context.` | |
|---|---|
| `id`, `path`, `manifest` | Plugin id, absolute folder, parsed manifest. |
| `storagePath` | A folder you may create for your data (`<userData>/plugin-data/<id>`). |
| `rpc.handle(method, fn)` | Expose `fn` to `pc.rpc.call(method, …)`. It may be async; its return value must be serializable. Errors reach the caller as rejected Promises. |
| `rpc.emit(event, payload)` | Send an event to the UI side (`pc.rpc.on(event, fn)`). |
| `subscriptions` | Push `{ dispose() }` objects to clean up on deactivate. |
| `log(...args)` | Console log with the plugin id. |

## 6. Panels: providers, fields, modes

A panel shows **items** from a **provider** at a **location**, laid out by a **mode**. The mode picks a **view** (default: `list`), and a list's columns show **fields**.

### Provider (the panel's purpose)

```js
pc.panels.registerProvider('my', {
  title: 'My Source',                  // chooser and fallback title
  description: 'shown in Alt+F1 list',
  hidden: false,                       // true: not listed in the chooser
  defaultMode: 'my.mode',
  syncWithTerminal: false,             // true only for local directories (the fs provider)
  sortItems: true,                     // false: keep the order returned by list()
  modesOf: 'fs',                       // optional: also use the modes made for this provider (file-like items)
  getDefaultLocation(ctx) { return 'root'; },
  // Optional: entries for the Select Source chooser (Alt+F1/F2), under their own group
  // titles. An entry opens `location` in this provider (or `providerId`), or runs
  // `command` with `args` (default: the panel side). Answer quickly: after 1.5 s the chooser opens without them.
  async sources(ctx) { return [{ separator: true, label: 'My' }, { label: 'Home', description: '/', location: 'root', current: false }]; },
  // Optional: clickable parts of the path in the panel header. Without it the
  // whole title is shown and a click opens the source chooser. A part with
  // `provider` switches the panel to that provider (e.g. an archive's folder).
  breadcrumbs(location, ctx) { return [{ label: 'root', location: 'root' }, { label: 'sub', location: 'root/sub' }]; },

  async list(location, ctx) {          // required
    return {
      location,                        // normalized location (optional)
      title: `My: ${location}`,        // panel title (optional)
      items: [
        { name: '..', isParent: true, isDir: true },
        { name: 'a', label: 'Item A', isDir: false, size: 10, color: 'panel.executable.foreground' },
      ],
    };
  },

  async open(item, ctx) {              // Enter / double-click
    if (item.isDir) return { location: item.name, focus: undefined }; // navigate
    // or do anything and return undefined
  },
  parentLocation(location, ctx) { return location === 'root' ? null : 'root'; }, // null → panel.back()
  childName(location) { return location; }, // cursor target after going up
  statusText(item, ctx) { return item.name; },

  // Optional: rows for the details block — [label, value, { wide }?]
  details(item, ctx) { return [['Path', item.path, { wide: true }], ['Size', '10 B']]; },
  // Optional: extra rows while items are marked (after the "Selected" row).
  selectionDetails(items, ctx) { return [['Size', 'show ⌘I', { command: 'my.calc', action: 'show ⌘I' }]]; },

  // Optional: drag and drop
  canDrag(item) { return true; },                        // items may be dragged out
  dropEffect(drop, ctx) { return 'copy'; },              // 'copy' | 'move' | 'none'
  async acceptDrop(drop, ctx) { /* drop.paths → drop.target.location */ },

  // Optional: F3/F5/F6/F7/F8 work here too (core.fileops), through these hooks.
  fileOps: true,
  async exportItems(items, ctx) { return { paths: ['/tmp/copy'], cleanup: async () => {} }; }, // local copies to read
  async importPaths(paths, location, ctx) {},   // put local files/folders inside
  async removeItems(items, ctx) {},             // delete for good (no Trash)
  async makeDirectory(location, name, ctx) {},
  readOnly(location) { return false; },         // or a reason: F6/F7/F8 dimmed, writes refused
  hostPath(location) { return '/real/file'; },  // where it lives (default destination for F5 out)
});
```

A mode with `"providers": ["fs"]` is offered to providers with `modesOf: 'fs'` too, unless it says `"strictProviders": true` (the Visual mode does: it scans real folders).

When `list()` fails, the panel stays where it was and shows the error; an error with `cancelled: true` (the user cancelled a slow request, e.g. with Esc) shows nothing.

**Openers.** `pc.panels.registerOpener(id, { match(item, ctx), open(item, panel) })`: Enter on a file in a file panel asks the openers first, before running or opening it with its app. PejavaArchive uses this to open archives as folders. `pc.panels.findOpener(item, ctx)` returns the first one that matches.

**Previewers.** `pc.panels.registerPreviewer(id, { match(item, ctx), async create(host, item, ctx) })`: the Preview view (Ctrl+8, Quick View Ctrl+Q) asks the previewers before showing an item its own way. `ctx` is `{ panel, source, providerId, addMeta(label, value), isStale(), refreshHeader() }` (`source`: the panel whose item is shown). `create` fills `host` and returns an instance, or `null` to let the Preview show the item as usual. Instance hooks, all optional: `dispose()`; `focus()` / `hasFocus()` (the active Preview panel gives it the focus); `accepts(item, providerId)` + `update(item)` (the same file changed: keep the instance instead of creating a new one); `headerAction()` (a button in the Preview panel's header, see views; call `ctx.refreshHeader()` when it changes). PejavaCodeEditor is a previewer.

**Editing a file from another plugin.** `await pc.commands.execute('codeEditor.open', localPath, { title, afterSave, onClose })` opens a local file in the code editor over the whole window and returns `false` when it isn't text (binary, too large). `afterSave()` runs after each save; when it throws, the text stays unsaved (an error with `cancelled: true` shows no message). PejavaRemote edits server files this way: a downloaded copy, uploaded by `afterSave`, removed by `onClose`.

**Elements that take the keys.** While the focus is inside an element with the attribute `data-pc-own-keys` (a code editor), panel keys don't fire and typing doesn't go to the command line; keys without a `when` (⌘T, ⌘Q, ⌘⇧P…) still work. The context key `editorFocus` is true then, `panelFocus` false.

**PejavaArchive** (`pejava.archive`) is a complete example of all of the above: provider `archive`, location `"<archive path>::<folder inside>"`. It reads every format `bsdtar` (libarchive) knows: zip and its relatives (jar, apk, epub, whl…), tar with gz/bz2/xz/zst/lzma, 7z, rar, iso, cab, xar/pkg, cpio, ar/deb, rpm, plus single .gz/.bz2/.xz/.zst files. zip is changed in place with Info-ZIP `zip`; tar.* and 7z are rebuilt with bsdtar; the rest, and archives opened inside archives, are read-only. Encrypted archives ask for the password (`showInputBox({ password: true })`).

**PejavaRemote** (`pejava.remote`) adds network connections: provider `remote` (the connection list) and `remote.files` (location `"<connection id>::<remote path>"`), plus `sources()` entries in the chooser. SFTP (following `~/.ssh/config`: HostName, User, Port, IdentityFile, ProxyJump, ProxyCommand; host keys checked against `~/.ssh/known_hosts`), FTP, FTPS (explicit and implicit) and WebDAV (Basic and Digest) are browsed in the panel with F3–F8 and Shift+F6; F4 edits a copy and uploads it back when the editor exits. SMB, AFP and NFS shares are mounted by the system (macOS `mount volume`, Linux GVfs `gio mount`) and opened in a file panel. Saved connections live in `~/.pejava/connections.json` (mode 0600; passwords encrypted with Electron `safeStorage` while the setting `remote.encryptPasswords` is on and the keychain is available). Hosts from `~/.ssh/config`, FileZilla's Site Manager, `~/.netrc` and Bonjour/mDNS on the local network are offered too.

**Drag and drop.** Views mark item elements with `data-index` and `draggable`; the panel does the rest. A drag carries the marked items, or the dragged item. `drop` is `{ source: { side, providerId, location, items } | null, external, target: { location, item, info }, modifiers: { alt, meta, ctrl, shift }, effect, paths }`. `external` means files dragged in from another app (e.g. Finder). Without `acceptDrop` the panel refuses drops. The `fs` provider uses Finder's rules: same volume → move, other volume → copy, Option → copy, Cmd → move. A folder under the pointer is the target, otherwise the panel's location. It calls the commands `fileops.moveTo` / `fileops.copyTo` (`(paths, destDir)`, which ask only about conflicts).

**Details block.** Below each panel, in every mode unless the mode says `"details": false` (see `contributes.panelModes`) or the view hides it: information about the current item in two columns, from `provider.details(item)`, with a small preview on the right (setting `panels.detailsPreview`, **Ctrl+Alt+I**). When something is marked, a "Selected" row comes first. Without `details()` it shows the name and `statusText()`. When the block is shown, it replaces the status line. The **[▼]** button on its top border (**F9**, **Ctrl+I**, command `panels.toggleDetailsCompact`) makes it compact: only the `Path` row; **[▲]** brings the full block back. Each panel remembers its choice. A `Path` value (and any row with `{ copy: true }`) copies itself to the clipboard on click. A row with `{ command, args?, action? }` is a button: clicking the value (or only its `action` substring) runs the command — fs uses it for **Size: show ⌘I**, which counts a folder (or everything marked; command `fs.calcSize`, ⌘I / Ctrl+Alt+L); the result also replaces `<DIR>` in the Size column. After changing data in place, call the panel handle's `redraw()`. Panel handle: `hasDetails`, `detailsCompact`, `setDetailsCompact(bool)`; context keys `activePanelHasDetails`, `activePanelDetailsCompact`.

`ctx` is `{ panel, api, settings }`, where `panel` is the handle of the panel asking.

**Item fields**

| | |
|---|---|
| `name` | Unique within the listing. Also used for selection. |
| `label` | Shown by the `name` field instead of `name`. |
| `title` | Human name for non-list views (icon captions, preview). |
| `icon` | SVG markup or image URL used by the Icons view and the Preview. |
| `description` | Shown as "Info" in the Preview for non-file items. |
| `isDir`, `isParent` | |
| `color` | A color id for the whole row. |
| `classes` | Extra CSS classes for the row. |
| `selectable: false` | The item cannot be marked. |
| anything else | Available to your fields. |

### Field (a column's content)

```js
pc.panels.registerField('age', {
  title: 'Age', width: 5, align: 'right',   // width in characters, or '*' = take the rest
  render(item, ctx) { return '3d'; },       // text for the cell
  sortValue(item) { return item.mtime; },   // enables sorting by this field
  className(item) { return 'is-old'; },     // optional CSS class for the cell
  format(bytes) { … },                      // used by 'size' for selection totals
});
```

Built-in fields: `name` (core.panels); `size`, `mtime`, `perms`, `owner`, `ext` (core.filesystem); `plugin.*` (plugin manager).

### Mode (the panel's look)

`columns` is how many **flowing** columns the items fill: top to bottom, then the next column, as in Columns 3. `fields` are the cells shown in each of those columns.

| Mode | columns | fields |
|---|---|---|
| `column` | 1 | name; metadata: short = size, mtime; long = + perms, owner |
| `columns2` | 2 | name; metadata: short = size; long = + mtime |
| `columns3` | 3 | name; metadata as in `columns2` |
| `columns` | `"auto"` | name; as many columns of `panels.columnWidth` characters (default 30) as fit |
| `visual` | view `treemap` | disk usage treemap (plugin `visual.disk-usage`) |
| `outline` | view `outline` | Finder-like list: folders open in place (click the chevron, or →/←); nested rows are indented, the other columns stay aligned |
| `icons` | view `icons` | Finder-like grid, thumbnails for images/video/PDF |
| `preview` | view `preview` | shows the other panel's current item (Quick View, Ctrl+Q) |

Mode properties: `id`, `title`, `order`, `columns` (number or `"auto"`), `columnWidth` (characters, or the key of a number setting), `fields`, `meta` (the default metadata level: `"off"`, `"short"` (default) or `"long"`), `header` (default `true`), `providers`, `view` (default `"list"`), `options` (free-form, for the view).

**Metadata.** A field entry with `"meta": "short"` or `"long"` is optional: the panel shows it at that level or above (None → Short → Long). The level is kept per panel and per mode; the user picks it in Listing Mode, in the Left/Right menus or with Ctrl+4 (`panels.cycleMeta`, `panels.setMeta(level)`). A metadata field may have its own `providers` (`column` shows sizes and dates only for `fs` and the providers whose `modesOf` is `fs`). Panel handle: `metaLevel` (`null` when the mode has no metadata), `metaFields`, `setMeta(level)`, `cycleMeta()`. Old mode ids still work: `brief` → `columns3` without metadata, `medium` → `columns2`, `full` → `column` short, `long` → `column` long, `full2` → `columns2` short.

A field entry can override `width`, `align` and `title`. `providers: [...]` limits a mode to some providers. Asking for a mode that does not fit (e.g. Ctrl+5 (Outline) in the plugin manager) shows the provider's default mode; Ctrl+0 resets to the default. The mode is remembered per panel and per provider.

### View (how a panel is drawn)

```js
pc.panels.registerView('my.view', {
  title: 'My view',
  create(container, ctx) {
    // ctx: { panel, api, settings, mode, fieldDef(id), metrics: { rowHeight(), charWidth() } }
    const root = document.createElement('div');
    container.append(root);
    return {
      render() { /* draw ctx.panel.items, ctx.panel.cursorIndex, ctx.panel.isSelected(item) */ },
      step(direction) { return { up: -1, down: 1 }[direction] ?? 0; }, // cursor delta for arrows
      pageSize: 20,                    // optional
      statusText() { return '…'; },    // optional: replaces the status line
      dispose() { root.remove(); },
    };
  },
});
```
`render()` runs after every change (cursor, selection, items, resize, activation). The instance is created again when the panel's mode changes.

A view definition with `tree: true` lets the panel open folders in place (`expand`/`collapse` on the panel handle); `outline` is such a view.

Details block hooks: on the view definition, `details: false` hides the block and `detailsPreview: false` hides its mini-preview. On the instance: `details` / `detailsPreview` (same, but dynamic); `detailsTarget()` → `{ item, providerId, panel, thumbnail? }` to describe another item (Preview uses the other panel's; `thumbnail` forces/suppresses a system thumbnail); `detailsExtra()` → extra rows (shown even when there is no item); and the view calls `ctx.refreshDetails()` when they change.

Keys follow the view: on the definition, `sortable: false` hides the sort keys (`activePanelSortable`) and `itemOps: false` hides F3–F8 (`activePanelItemOps`), so the key bar shows only what works there. `sourceChooser: false` drops the ▾ source chooser from the panel header (Preview: its source is the other panel). A view that doesn't sort may put its own button where the sort order is shown: the instance's `headerAction()` returns `{ label, title?, run() }` or `null`, and the view calls `ctx.refreshHeader()` when it changes. A view that picks items its own way (the treemap's clicked block) implements `currentItem()` and `targetItems()` returning `{ name, path, isDir, size }` objects, and calls `ctx.changed()` when the choice changes. `refresh()` is called when the panel rereads the same folder (after a delete, a copy, a shell command), for views that keep their own data. A mode uses the view with `"view": "my.view"`. Built-in views: `list` (core), `icons` and `preview` (core.views). A plugin may also replace `list`.
Use `ctx.panel.click(index, mouseEvent)` for clicks and `ctx.api.commands.execute('panels.open')` for double clicks, so selection works the same everywhere.

## 7. Keys and `when` clauses

**Key syntax:** `modifiers+key`, lower case. Modifiers are `ctrl`, `alt`, `shift` and `meta` (the Cmd key on macOS; aliases `cmd`, `win`). Keys:
- letters `a`–`z`, digits `0`–`9`, `f1`–`f24`;
- `enter`, `escape`, `tab`, `space`, `backspace`, `delete`, `insert`, `home`, `end`, `pageup`, `pagedown`, `up`, `down`, `left`, `right`;
- `numpad_add`, `numpad_subtract`, `numpad_multiply`, `numpad_divide`, `numpad0`–`numpad9`;
- punctuation `- = [ ] \ ; ' , . / \``.

Keys match physical positions, so `ctrl+o` also works with a Russian layout.

**Resolution:** user bindings beat plugin bindings. Among plugin bindings, the one with the more specific `when` wins (more `&&` conditions), then the one registered later. A user entry `{ "key": "f8", "command": "-fileops.delete" }` removes a default.

**`when` syntax:** `&&`, `||`, `!`, `==`, `!=`, parentheses, `'strings'`, numbers, `true`/`false`, and context keys.

**Context keys**

| Key | Meaning |
|---|---|
| `panelsVisible`, `panelFocus`, `terminalFocus`, `inputFocus`, `dialogOpen` | Focus and visibility |
| `terminalAltScreen` | A full-screen program (vim, less, htop) is running |
| `commandLineDirty` | The shell command line holds text (zsh reports it; other shells: read off the screen after the prompt). Left/Right/Enter/Backspace then go to the command line |
| `dualPanels`, `leftPanelVisible`, `rightPanelVisible` | Layout |
| `panelsResizable` | Resizable mode is on (`panels.toggleResize`, ⌘⇧D / Ctrl+Shift+D, or by dragging the divider) |
| `activePanel` | `'left'` / `'right'` |
| `activePanelProvider`, `passivePanelProvider`, `leftPanelProvider`, `rightPanelProvider` | e.g. `'fs'`, `'plugins'` |
| `activePanelMode`, `passivePanelMode`, `leftPanelMode`, `rightPanelMode` | e.g. `'column'` |
| `activePanelMeta`, `leftPanelMeta`, `rightPanelMeta` | Metadata level: `'off'`, `'short'`, `'long'`, or `''` when the mode has none |
| `activePanelView` | `'list'`, `'icons'`, `'preview'`, … |
| `cursorIsDirectory`, `cursorIsParent`, `hasSelection` | Cursor state |
| `activePanelSortable`, `activePanelItemOps` | What the active view supports (see view hooks) |
| `activePanelHasCurrent`, `activePanelHasTarget` | There is an item for F3/F4 / for copy, move, delete |
| `editorFocus` | The focus is in an element that takes the keys (`data-pc-own-keys`, e.g. the code editor) |
| `overlayOpen` | Something covers the whole window (the F4 code editor); Ctrl+O and Ctrl+` stay off |
| `isMac`, `platform` | |
| `fsShowHidden` | Set by core.filesystem |

## 8. Colors and palettes

- A **color** is an id with a default (`contributes.colors`), available to CSS as `var(--id-with-dashes)`.
- A **palette** is a named set of color values. The resolved theme is the color defaults overridden by the active palette.
- **Built-in palettes** come from plugins and are read-only: duplicate one to edit it. **User palettes** live in `<userData>/palettes/*.json`.
- Settings → Colors lets you activate, duplicate, rename, delete, export and import palettes, and edit every color with a live preview.

Palette file (the export format; `format` and `version` are optional on import):

```json
{
  "format": "pejava-palette",
  "version": 1,
  "name": "My Palette",
  "type": "dark",
  "colors": { "panel.background": "#0000a8", "panel.foreground": "#c0c0c0" }
}
```

Color values: `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`.

## 9. Files on disk

`<userData>` is `~/Library/Application Support/PejavaCommander` on macOS and `~/.config/PejavaCommander` on Linux.

| File | Content |
|---|---|
| `settings.json` | Changed settings only. |
| `keybindings.json` | User keybindings (VS Code format, `-command` removes). |
| `palettes/*.json` | User palettes. |
| `plugins/<id>/` | Installed plugins. |
| `plugins.json` | `{ "disabled": [ids] }` |
| `plugin-data/<id>/` | Suggested data folder for Node parts. |
| `state.json` | UI state (panel paths, modes, plugin `context.state`). |

## 10. Development workflow

```bash
PC=/Applications/PejavaCommander.app/Contents/MacOS/PejavaCommander   # macOS; Windows: PejavaCommander.exe, Linux: the AppImage
"$PC" --plugin-dev=/path/to/my-plugin      # load a plugin from disk (repeatable; a folder of plugins works too)
PC_PLUGIN_DEV=/a:/b "$PC"                  # same via env
PC_USER_DATA=/tmp/pc-test "$PC"            # separate profile
```

- `Cmd/Ctrl+Shift+R` reloads the window. The shell keeps running, and its output is replayed.
- `Cmd+Alt+I` / `Ctrl+Shift+I` opens DevTools. `window.pcWorkbench` is the workbench object.
- Errors in `activate` appear as notifications and in the plugin manager (`Cmd/Ctrl+Shift+X`).
- To pick up changes to a Node part, disable and re-enable the plugin, or restart the app.

**Packaging:** zip the plugin folder, with `plugin.json` at the root of the archive or in a single top-level folder. Install it with Plugin Manager → F5 → From .zip / From URL. URL install is the basis for the upcoming plugin server.

## 11. Built-in plugins and commands

| Plugin | Provides |
|---|---|
| `core.workbench` (required) | Core colors and settings, command palette, settings windows, quit, command line bridge, menu bar skeleton |
| `core.panels` (required) | Cursor movement, selection, layout, sorting, provider chooser, `name` field, `column`/`columns2`/`columns3`/`columns` modes |
| `core.filesystem` | `fs` provider, `size`/`mtime`/`perms`/`owner`/`ext` fields, file type colors |
| `core.fileops` | F3 view, F4 edit, F5 copy, F6 move, F7 mkdir, F8 delete (Node part for copy/move) |
| `core.palettes` | Built-in color palettes: classic blue, dark, light, Solarized Dark and Solarized Light |
| `core.views` | `outline` view (Finder-like list, folders open in place with an animation), `icons` view (smooth scrolling, thumbnails, rubber-band selection, details block) and `preview` view, Ctrl+Q Quick View |
| `core.plugin-manager` | `plugins` provider (the plugin manager panel) |
| `visual.disk-usage` | `visual` mode / `treemap` view: scans a folder in the Node part (parallel, progress, Esc cancels) and draws a cushion treemap; zooming reuses the scan |
| `pejava.codeeditor` | Edit text and code in the Preview panel with Monaco (the editor of VS Code): a previewer; ⌘S / Ctrl+S saves, Esc returns to the other panel; F4 edits over the whole window, Shift+F4 makes a new file (commands `codeEditor.edit`, `codeEditor.newFile`); settings `codeEditor.*` |
| `pejava.remote` | Network connections: `remote` and `remote.files` providers, `remote.list` mode, ⌘K / Ctrl+Shift+K connect to a URL, F4/F7/F8 edit/add/delete connections in the Network panel; on a server F4 edits a file in the code editor (each ⌘S uploads it, asking first when the server's file changed meanwhile), Shift+F4 makes a new file |

Open **Settings → Keyboard** or press **F1** in the panels for the live list of all commands and keys, grouped by category. **`Cmd/Ctrl+Shift+P`** is the command palette.
