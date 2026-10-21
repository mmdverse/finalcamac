import assert from 'node:assert/strict';
import { buildStrokeTextUnits } from '../src/components/ReactBits/strokeTextUnits.js';

const zwnjWord = 'می\u200cدهد';
const persian = `آسانسوری که معماری را حرکت ${zwnjWord}`;
const persianUnits = buildStrokeTextUnits(persian, 'حرکت');

assert.equal(persianUnits.map(unit => unit.text).join(''), persian, 'Arabic text content must be preserved exactly');
assert.deepEqual(
  persianUnits.filter(unit => unit.animated).map(unit => unit.text),
  ['آسانسوری', 'که', 'معماری', 'را', 'حرکت', zwnjWord],
  'Arabic letters, including ZWNJ, must remain grouped into whole-word shaping runs'
);
assert.deepEqual(
  persianUnits.filter(unit => unit.highlighted).map(unit => unit.text),
  ['حرکت'],
  'the highlighted Persian word must stay whole'
);
assert.equal(
  persianUnits.filter(unit => !unit.animated).map(unit => unit.text).join(''),
  '     ',
  'Arabic whitespace must not be animated as isolated glyphs'
);

const latinUnits = buildStrokeTextUnits('CAMAC', 'AMA');
assert.deepEqual(
  latinUnits.map(unit => unit.text),
  ['C', 'A', 'M', 'A', 'C'],
  'Latin text must retain the original per-character animation'
);
assert.deepEqual(
  latinUnits.filter(unit => unit.highlighted).map(unit => unit.text),
  ['A', 'M', 'A'],
  'Latin substring highlighting must remain character-accurate'
);

console.log('StrokeText validation passed: Persian word shaping runs, ZWNJ, highlight, and Latin per-character animation.');
