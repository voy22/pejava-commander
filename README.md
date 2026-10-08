# PejavaCommander

[PejavaCommander](https://pejava.com) is a two-panel file manager for macOS, Windows and Linux where everything is a plugin. The app is distributed as compiled builds from [pejava.com](https://pejava.com/download/).

This repository holds the public issue tracker and everything you need to write plugins.

## Write a plugin

- **[Plugin API](docs/api.md)**: anatomy, manifest, the `pc` API, panels, keys, colors, workflow.
- **[Cookbook](docs/cookbook.md)**: step-by-step recipes.
- **[Examples](examples/)**: working plugins to start from.

Run your plugin without installing it:

```bash
/Applications/PejavaCommander.app/Contents/MacOS/PejavaCommander --plugin-dev=/path/to/my-plugin
```

(Windows: `PejavaCommander.exe --plugin-dev=…`, Linux: the AppImage with the same option.)

### With an AI agent

Clone this repo and open it in your coding agent (Claude Code, Codex, Cursor, Copilot…). [`AGENTS.md`](AGENTS.md) tells it how plugins work, where the docs are, how to run and package a plugin and what to check before it's done. Then just ask, for example: *"Write a plugin that adds a column with each file's MD5 hash."*

The docs and examples here are the same as on [pejava.com/docs](https://pejava.com/docs/api/) and follow each release.

## Report a bug or suggest a feature

**[Open an issue →](../../issues/new/choose)**

Before opening one, search the [existing issues](../../issues?q=is%3Aissue). If yours is already there, add a 👍 instead.

## License

The example plugins and the code samples in the docs may be copied, changed and used in your own plugins without restriction. PejavaCommander itself is free for individuals and charities; organizations pay per installation. See [pricing](https://pejava.com/pricing/) and the [license](https://pejava.com/license/).
