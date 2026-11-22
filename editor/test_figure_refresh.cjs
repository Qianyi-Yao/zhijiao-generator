const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('figure refresh batches requests and stops writing once labels are current', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/library-editor.js'), 'utf8');
  const code = source.slice(source.indexOf('let figureRefreshPending'), source.indexOf('const CaptionedImage'));
  const frames = [];
  let writes = 0;
  const labels = ['甲', '乙'].map(caption => {
    let text = '';
    return { dataset: { caption }, get textContent() { return text; },
      set textContent(value) { text = value; writes++; } };
  });
  const context = vm.createContext({requestAnimationFrame: callback => frames.push(callback),
    editor: {isDestroyed: false, view: {dom: {querySelectorAll: () => labels}}}});
  vm.runInContext(code, context);
  for (let i = 0; i < 100; i++) vm.runInContext('scheduleFigureNumbers()', context);
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.equal(writes, 2);
  for (let i = 0; i < 100; i++) vm.runInContext('refreshFigureNumbers()', context);
  assert.equal(writes, 2);
  labels.reverse();
  vm.runInContext('refreshFigureNumbers()', context);
  assert.equal(labels[0].textContent, '图1 乙');
  assert.equal(labels[1].textContent, '图2 甲');
  assert.equal(writes, 4);
});
