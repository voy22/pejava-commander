// Node side: has full Node.js access. Exposes one RPC method to the UI side.
const { execFile } = require('child_process');
const path = require('path');

function git(cwd, args) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => resolve(err ? null : stdout));
  });
}

exports.activate = (context) => {
  // Returns { "<name in dir>": "M" | "A" | "??" | … } for a directory.
  context.rpc.handle('statusFor', async (dir) => {
    const root = (await git(dir, ['rev-parse', '--show-toplevel']))?.trim();
    if (!root) return null;
    const out = await git(dir, ['status', '--porcelain=v1', '-z', '--ignored=no', '--', '.']);
    if (out === null) return null;
    const result = {};
    for (const entry of out.split('\0')) {
      if (entry.length < 4) continue;
      const code = entry.slice(0, 2).trim() || '•';
      const abs = path.join(root, entry.slice(3));
      const rel = path.relative(dir, abs);
      if (rel.startsWith('..')) continue;
      const name = rel.split(path.sep)[0]; // a change deep inside marks the top folder
      result[name] = result[name] && result[name] !== code ? 'M' : code;
    }
    return result;
  });
};
