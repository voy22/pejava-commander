// A panel provider with its own items. Opening an item switches the panel
// back to the file system at the bookmarked directory.
export function activate(pc, context) {
  const load = () => context.state.get('list', []);
  const save = (list) => context.state.update('list', list);

  pc.panels.registerProvider('bookmarks', {
    title: 'Bookmarks',
    description: 'Saved directories',
    defaultMode: 'bookmarks.list',
    getDefaultLocation: () => 'all',

    async list() {
      const items = [{ name: '..', label: '..', isParent: true, isDir: true }];
      for (const dir of await load()) {
        items.push({ name: dir, label: pc.fs.basename(dir) || dir, path: dir, isDir: true, color: 'panel.directory.foreground' });
      }
      return { location: 'all', title: 'Bookmarks', items };
    },

    async open(item, { panel }) {
      if (item.isParent) {
        if (!(await panel.back())) await panel.setProvider('fs');
        return undefined;
      }
      await panel.setProvider('fs', item.path);
      return undefined;
    },

    parentLocation: () => null,
    statusText: (item) => item.path ?? '',
  });

  pc.panels.registerField('bookmark.path', { title: 'Path', width: '*', render: (item) => item.path ?? '' });

  pc.commands.register('bookmarks.add', async () => {
    const dir = pc.panels.active.location;
    const list = await load();
    if (!list.includes(dir)) await save([...list, dir]);
    pc.ui.showMessage(`Bookmarked ${dir}`);
  });

  pc.commands.register('bookmarks.open', () => pc.panels.active.setProvider('bookmarks'));

  pc.commands.register('bookmarks.remove', async () => {
    const panel = pc.panels.active;
    const item = panel.cursorItem;
    if (!item?.path) return;
    await save((await load()).filter((d) => d !== item.path));
    await panel.refresh();
  });
}
