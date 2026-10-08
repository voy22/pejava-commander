// activate() runs when the plugin is enabled; everything registered through
// `pc` is removed automatically when it is disabled.
export function activate(pc) {
  pc.commands.register('hello.sayHello', () => {
    const item = pc.panels.active.cursorItem;
    pc.ui.showMessage(`Hello! The cursor is on "${item?.name ?? 'nothing'}"`);
  });
}
