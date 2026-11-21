import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const S = require('../sudoku.js');


test('een onmogelijke opgave heeft geen oplossing', () => {
  const bord = new Array(81).fill(0);
  bord[0] = 5;
  bord[1] = 5;
  assert.equal(S.aantalOplossingen(bord, 2), 0);
});
