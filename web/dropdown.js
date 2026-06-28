// dropdown.js — small custom dropdown component. The native <select> popup is unstyleable
// (it rendered off-screen), so we roll a tiny one: a button + a list of items. Pure DOM
// factory with an injectable `doc`, so it's reusable and behavior-tested on its own.
//
// createDropdown(doc, { items:[{id,label}], placeholder, onSelect }) → handle:
//   { el, button, list, buttons, open(), close(), toggle(), select(id), setValue(id,{silent}), value }

export function createDropdown(doc, { items = [], placeholder = '', onSelect = () => {} } = {}) {
  const add = (tag, props, parent) => {
    const e = doc.createElement(tag);
    Object.assign(e, props);
    if (parent) parent.appendChild(e);
    return e;
  };

  const el = add('div', { className: 'picker' });
  const button = add('button', { className: 'drop', textContent: placeholder }, el);
  const list = add('div', { className: 'droplist', hidden: true }, el);
  const buttons = {};
  let value = null;

  const open = () => { list.hidden = false; };
  const close = () => { list.hidden = true; };
  const toggle = () => { list.hidden = !list.hidden; };

  // setValue relabels + closes; silent skips the onSelect callback (used for programmatic /
  // restored selection so we don't re-fire the app logic).
  function setValue(id, { silent = false } = {}) {
    value = id;
    const it = items.find((x) => x.id === id);
    button.textContent = it ? it.label : placeholder;
    close();
    if (!silent) onSelect(id);
  }

  function buildItems(newItems) {
    items = newItems;
    for (const k in buttons) delete buttons[k];
    if (list.replaceChildren) list.replaceChildren(); else if (list.children) list.children.length = 0;
    for (const it of items) {
      buttons[it.id] = add('button', { className: 'item', textContent: it.label }, list);
      buttons[it.id].addEventListener('click', () => setValue(it.id));
    }
  }
  buildItems(items);
  button.addEventListener('click', toggle);

  // Rebuild the list (e.g. after a custom item is added), keeping the current selection label.
  function setItems(newItems) { const cur = value; buildItems(newItems); value = null; setValue(cur, { silent: true }); }

  return { el, button, list, buttons, open, close, toggle, select: (id) => setValue(id), setValue, setItems, get value() { return value; } };
}
