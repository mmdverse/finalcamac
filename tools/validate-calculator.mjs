import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateWorkbook } from '../src/calculator/excelEngine.js';
import { CALCULATORS } from '../src/calculator/definitions.js';

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

console.log(`PASS: ${workbook.formulaCount}/${workbook.formulaCount} formula caches matched the source workbook.`);
console.log('PASS: 10 calculator definitions; input references resolve to source input cells.');
console.log('PASS: boundary, source-anomaly, travel-time and iron-price scenarios.');
