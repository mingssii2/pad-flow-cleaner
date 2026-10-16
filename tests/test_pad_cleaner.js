// Unit tests for index.html core logic.
// Loads the real <script> from the HTML and runs it in a vm sandbox with
// minimal DOM/mermaid stubs, then exercises the pure functions.
// Run: node tests/test_pad_cleaner.js

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
if (!m) { console.error('Could not extract main <script> from HTML'); process.exit(1); }
const src = m[1];

// --- DOM / env stubs ---
// getElementById / createElement return a proxy that swallows any property
// access or call, so top-level addEventListener wiring runs without error.
function makeEl() {
  const el = {
    _value: '',
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener() {},
    appendChild() {}, after() {}, querySelector() { return null; },
    querySelectorAll() { return []; },
    get value() { return this._value; },
    set value(v) { this._value = v; },
    set innerHTML(v) {}, get innerHTML() { return ''; },
    set textContent(v) {}, get textContent() { return ''; },
  };
  return el;
}
const document = {
  getElementById: () => makeEl(),
  createElement: () => makeEl(),
  querySelectorAll: () => [],
  addEventListener() {},
};
const sandbox = {
  document,
  navigator: { clipboard: { writeText() {} } },
  mermaid: { initialize() {}, render: async () => ({ svg: '' }) },
  URL: { createObjectURL: () => '', revokeObjectURL() {} },
  Blob: function () {},
  setTimeout, console,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

// --- tiny assert ---
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  - ' + name); }
  else { fail++; console.log('  FAIL- ' + name + (extra ? '\n        ' + extra : '')); }
}

const { modeB, modeC, discoverCalls, assembleMerged, scrubSensitive } = sandbox;

// ===== discoverCalls =====
console.log('discoverCalls');
{
  const main = 'CALL init\nCALL excel\nCALL login\nCALL excel\n  CALL add_employee\nCALL close';
  const r = discoverCalls(main);
  ok('extracts in order', JSON.stringify(r) === JSON.stringify(['init','excel','login','add_employee','close']), JSON.stringify(r));
  ok('dedups repeats', r.filter(x => x === 'excel').length === 1);
  ok('handles indented CALL', r.includes('add_employee'));
  ok('empty text -> []', discoverCalls('').length === 0);
  ok('no false match on word', discoverCalls('RECALL foo\nMyCALL bar').length === 0, JSON.stringify(discoverCalls('RECALL foo')));
}

// ===== assembleMerged =====
console.log('assembleMerged');
{
  const merged = assembleMerged('CALL a\nCALL b', [
    { name: 'a', body: 'SET x TO 1' },
    { name: 'b', body: '' },           // empty -> skipped
    { name: 'c', body: 'SET y TO 2' },
  ]);
  ok('wraps Main region', merged.startsWith('** REGION Main\nCALL a\nCALL b\n** ENDREGION'));
  ok('includes filled subflow a', /\*\* REGION a\nSET x TO 1\n\*\* ENDREGION/.test(merged));
  ok('skips empty subflow b', !/\*\* REGION b/.test(merged));
  ok('includes subflow c', /\*\* REGION c\nSET y TO 2\n\*\* ENDREGION/.test(merged));
  ok('empty main -> empty string', assembleMerged('', [{ name: 'a', body: 'x' }]) === '');
}

// ===== modeB cleaning + scrub =====
console.log('modeB');
{
  const sample =
    "SET inputFile TO $'''%baseFolder%\\\\New_Hires.xlsx'''\n" +
    'Excel.LaunchExcel.LaunchAndOpenUnderExistingProcess Path: inputFile Visible: True ReadOnly: False UseMachineLocale: False Instance=> ExcelInstance\n' +
    "SET userPassword TO $'''hunter2secret'''\n" +
    'SET userEmail TO bob@corp.com';
  const r = modeB(sample);
  ok('returns before/after sizes', r.before > 0 && r.after > 0);
  ok('strips UseMachineLocale', !/UseMachineLocale/.test(r.text), r.text);
  ok('flattens $\'\'\' wrapper', !r.text.includes("$'''"), r.text);
  ok('redacts SET userPassword', /SET userPassword TO <REDACTED>/.test(r.text), r.text);
  ok('redaction count > 0', r.redactions > 0);
}

// ===== scrubSensitive direct =====
console.log('scrubSensitive');
{
  ok('JWT redacted', scrubSensitive('tok eyJabcdefghij.klmnopqrst.uvwxyz12345').text.includes('<REDACTED_JWT>'));
  ok('AWS key redacted', scrubSensitive('AKIAIOSFODNN7EXAMPLE').text.includes('<REDACTED_AWS_AKID>'));
  ok('email redacted', scrubSensitive('a@b.com').text.includes('<REDACTED_EMAIL>'));
}

// ===== modeC with subflow regions -> subgraph + call edges =====
console.log('modeC (subflow linking)');
{
  const merged = assembleMerged('CALL init\nCALL excel', [
    { name: 'init', body: 'SET baseFolder TO C\nFolder.Create FolderName: baseFolder' },
    { name: 'excel', body: 'Excel.LaunchExcel.LaunchAndOpenUnderExistingProcess Path: f Instance=> ExcelInstance\nExcel.ReadFromExcel.ReadCells Instance: ExcelInstance RangeValue=> ExcelData' },
  ]);
  const { mmd, nodeCount } = modeC(merged);
  ok('flowchart header', mmd.startsWith('flowchart TD'));
  ok('emits subgraph for init', /subgraph sg\d+\["init"\]/.test(mmd), mmd);
  ok('emits subgraph for excel', /subgraph sg\d+\["excel"\]/.test(mmd));
  ok('has call edge (dashed, labelled)', /-\.->\|call\|/.test(mmd), mmd);
  ok('node count > 0', nodeCount > 0);
  ok('CALL node label uses arrow', /⇒ init/.test(mmd), mmd);
  ok('no region marker leaked as node', !/REGION Main/.test(mmd), mmd);
}

// ===== modeC backward-compat: plain flow, no regions, no subgraph =====
console.log('modeC (plain flow, no regions)');
{
  const { mmd } = modeC('SET x TO 1\nIF x > 0 THEN\nSET y TO 2\nEND');
  ok('no subgraph when no regions', !/subgraph/.test(mmd), mmd);
  ok('still emits nodes', /flowchart TD/.test(mmd) && /n0/.test(mmd));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
