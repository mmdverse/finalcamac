import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateWorkbook } from '../src/calculator/excelEngine.js';
import { CALCULATORS } from '../src/calculator/definitions.js';
import { isShaftWidthErrorMetric, isShaftWidthMismatch } from '../src/calculator/resultStatus.js';
import { visibleCalculatorText } from '../src/calculator/displayText.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const workbook = JSON.parse(fs.readFileSync(path.join(here, '../src/calculator/workbook.json'), 'utf8'));
assert.equal(workbook.formulaCount, 114, 'source formula count changed; re-audit workbook export');
assert.equal(CALCULATORS.length, 10, 'all 10 workbook tools should be represented in the UI');

const baseline = calculateWorkbook(workbook);
const mismatches = [];
for (const [address, cell] of Object.entries(workbook.cells)) {
  if (!cell.formula) continue;
  const actual = baseline[address];
  const expected = cell.cached;
  const matches = typeof actual === 'number' && typeof expected === 'number'
    ? Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected))
    : actual === expected;
  if (!matches) mismatches.push({ address, expected, actual });
}
assert.deepEqual(mismatches, [], 'formula evaluator must match all cached results in the supplied Excel file');

const doorFail = calculateWorkbook(workbook, { B5: 126 });
const doorPass = calculateWorkbook(workbook, { B5: 127 });
assert.equal(doorFail.B9, '-');
assert.equal(doorPass.B9, 'قابل اجرا');

// Preserve, rather than “correct”, the unusual literal values present in this source branch.
const sourceAnomaly = calculateWorkbook(workbook, { J5: 110, K5: 4, L5: 'سانترال' });
assert.equal(sourceAnomaly.J7, 1111);

const travel = calculateWorkbook(workbook, { AV5: 10, AW5: 3.6, AX5: 0, AY5: 3, AZ5: 3 });
assert.ok(Math.abs(travel.AV7 - 40.4) < 1e-10);
assert.ok(Math.abs(travel.AV9 - 29) < 1e-10);
assert.ok(Math.abs(travel.AV11 - 22.16) < 1e-10);

const changedPrice = calculateWorkbook(workbook, { AD23: 100000 });
assert.equal(changedPrice.W23, changedPrice.AA23 * 100000);
assert.equal(changedPrice.W24, changedPrice.AA24 * 100000);
assert.equal(changedPrice.W25, changedPrice.AA25 * 100000);

for (const calculator of CALCULATORS) {
  for (const field of calculator.fields) {
    const sourceCell = workbook.cells[field.cell];
    assert.ok(sourceCell && !sourceCell.formula, `${calculator.id}: ${field.cell} must be an actual source input cell`);
  }
}

const byId = new Map(CALCULATORS.map((calculator) => [calculator.id, calculator]));
assert.deepEqual(byId.get('shaft-capacity').presentation.metrics.slice(0, 3).map(({ cell }) => cell), ['T7', 'R7', 'N7']);
const cabinCapacityFields = new Map(byId.get('cabin-capacity').fields.map((field) => [field.cell, field]));
assert.equal(cabinCapacityFields.get('U24').type, 'select');
assert.deepEqual(cabinCapacityFields.get('U24').options, [4.5, 2.5]);
assert.equal(cabinCapacityFields.get('U24').hint, 'اگر شرکت آسانسور نیستید، ۴٫۵ را انتخاب کنید');
for (const cell of ['T5', 'T24', 'T40', 'T62']) {
  const field = CALCULATORS.flatMap((calculator) => calculator.fields).find((item) => item.cell === cell);
  assert.equal(field?.hint, 'اگر کابین‌ساز نیستید، ۶ را انتخاب کنید', `${cell}: cabin-maker guidance must be visible`);
}
const ironFields = byId.get('iron').fields;
assert.deepEqual(ironFields.slice(3, 6).map(({ cell }) => cell), ['AD18', 'AB18', 'Y18']);
assert.equal(ironFields.find(({ cell }) => cell === 'AB18').type, 'select');
assert.deepEqual(ironFields.find(({ cell }) => cell === 'AB18').options, [3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 4, 4.1, 4.2]);
assert.match(ironFields.find(({ cell }) => cell === 'Y18').hint, /عدد صفر وارد کنید/);

for (const [calculatorId, actualCell, requiredCell, statusCell, input] of [
  ['shaft-capacity', 'N5', 'R16', 'N16', { N5: 100, O5: 165, P5: 'تلسکوپی', Q5: 1, R5: 90, S5: 2, T5: 6, U5: 'پشت' }],
  ['shaft-from-cabin', 'N42', 'R54', 'N54', { N40: 90, O40: 165, P40: 'تلسکوپی', Q40: 1, R40: 130, S40: 2, T40: 6, U40: 'پشت' }],
  ['hydraulic', 'N62', 'R73', 'N73', { N62: 100, O62: 165, P62: 'تلسکوپی', Q62: 1, R62: 130, S62: 2, T62: 6, U62: 'پشت' }],
]) {
  const result = calculateWorkbook(workbook, input);
  const lookup = (cell) => Object.prototype.hasOwnProperty.call(input, cell) ? input[cell] : result[cell];
  assert.ok(lookup(requiredCell) > lookup(actualCell), `${calculatorId}: required width should exceed the entered/proposed width`);
  assert.equal(result[statusCell], 'عرض چاه برای درب مد نظر مناسب نیست');
  assert.equal(isShaftWidthMismatch(calculatorId, lookup), true);
  assert.equal(isShaftWidthErrorMetric(calculatorId, requiredCell, true), true);
  assert.equal(isShaftWidthErrorMetric(calculatorId, statusCell, true), true);
  assert.equal(isShaftWidthErrorMetric(calculatorId, actualCell, true), false);
}
assert.equal(isShaftWidthMismatch('shaft-capacity', (cell) => ({ N5: 157, R16: 157 })[cell]), false, 'equal minimum and actual widths are not a mismatch');
assert.equal(isShaftWidthMismatch('shaft-capacity', (cell) => ({ N5: 157, R16: 'check' })[cell]), false, 'non-numeric formula results do not trigger width error styling');
assert.equal(visibleCalculatorText('عمق چاه و عمق کابین'), 'طول چاه و طول کابین');
assert.ok(!JSON.stringify(CALCULATORS).includes('عمق'), 'calculator definitions must not expose the old visible term');
for (const cell of Object.values(workbook.cells)) {
  if (typeof cell.value === 'string' && cell.value.includes('عمق')) {
    assert.ok(!visibleCalculatorText(cell.value).includes('عمق'), 'source labels must be translated before display');
  }
}

console.log(`PASS: ${workbook.formulaCount}/${workbook.formulaCount} formula caches matched the source workbook.`);
console.log('PASS: 10 calculator definitions; input references resolve to source input cells.');
console.log('PASS: boundary, source-anomaly, travel-time and iron-price scenarios.');
console.log('PASS: field order, select options, contextual hints and red status for insufficient shaft width.');
