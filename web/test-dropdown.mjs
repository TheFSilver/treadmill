// Behavior: the custom dropdown opens/closes, selecting an item fires onSelect once and
// relabels + closes, and programmatic setValue (restore) relabels WITHOUT firing onSelect.
import assert from 'node:assert';
import { createDropdown } from './dropdown.js';

let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };

function mkEl() {
  return {
    children: [], _on: {}, _text: '',
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(e, h) { (this._on[e] ||= []).push(h); },
    click() { (this._on.click || []).forEach((h) => h()); },
    set textContent(v) { this._text = v; }, get textContent() { return this._text; },
  };
}
const doc = { createElement: () => mkEl() };
const items = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }];

// Initial state: placeholder, list closed, no value.
{
  const d = createDropdown(doc, { items, placeholder: 'Choisir' });
  assert.equal(d.button.textContent, 'Choisir');
  assert.equal(d.list.hidden, true);
  assert.equal(d.value, null);
  ok('starts with placeholder, closed, no value');
}

// Button toggles the list open/closed.
{
  const d = createDropdown(doc, { items, placeholder: 'Choisir' });
  d.button.click(); assert.equal(d.list.hidden, false);
  d.button.click(); assert.equal(d.list.hidden, true);
  ok('button toggles the list');
}

// Picking an item: fires onSelect once, sets value, relabels, closes.
{
  let calls = [];
  const d = createDropdown(doc, { items, placeholder: 'Choisir', onSelect: (id) => calls.push(id) });
  d.open();
  d.buttons.b.click();
  assert.deepEqual(calls, ['b'], 'onSelect fired exactly once with the id');
  assert.equal(d.value, 'b');
  assert.equal(d.button.textContent, 'Beta', 'relabeled');
  assert.equal(d.list.hidden, true, 'closed after pick');
  ok('picking an item fires onSelect once, relabels, closes');
}

// Programmatic setValue(silent) restores the label WITHOUT firing onSelect; unknown → placeholder.
{
  let calls = 0;
  const d = createDropdown(doc, { items, placeholder: 'Choisir', onSelect: () => calls++ });
  d.setValue('a', { silent: true });
  assert.equal(d.value, 'a'); assert.equal(d.button.textContent, 'Alpha'); assert.equal(calls, 0);
  d.setValue(null, { silent: true });
  assert.equal(d.button.textContent, 'Choisir', 'unknown/null → placeholder');
  ok('silent setValue restores label without firing onSelect');
}

console.log(`dropdown: ${n} checks passed`);
