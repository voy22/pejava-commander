// UI side: a "git" field whose values come from the Node side via RPC.
export function activate(pc) {
  const cache = new Map(); // dir -> status map (or null outside a repo)

  async function load(dir) {
    if (!dir) return;
    const status = await pc.rpc.call('statusFor', dir);
    cache.set(dir, status);
    // Re-render panels showing this directory.
    for (const panel of [pc.panels.left, pc.panels.right]) {
      if (panel.location === dir) panel.refresh();
    }
  }

  pc.panels.registerField('git', {
    title: 'Git',
    width: 2,
    align: 'center',
    render(item, { panel }) {
      if (item.isParent) return '';
      const dir = panel.location;
      if (!cache.has(dir)) {
        cache.set(dir, undefined); // mark as loading, fetch once
        load(dir);
      }
      return cache.get(dir)?.[item.name] ?? '';
    },
    // CSS class for the cell; styles.css colors it with the contributed colors.
    className(item) {
      const code = cache.get(item.path ? pc.fs.dirname(item.path) : '')?.[item.name];
      if (!code) return undefined;
      return code === '??' ? 'git-untracked' : 'git-modified';
    },
  });

  // Forget cached status when a panel is refreshed or navigates.
  pc.panels.onDidChangeLocation(({ location }) => cache.delete(location));
  pc.terminal.onDidPrompt(() => {
    cache.clear();
  });
}
