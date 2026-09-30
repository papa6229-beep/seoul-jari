const assert = require('node:assert/strict');
const test = require('node:test');
const {assessReference, rankWithinGu} = require('./commercial-reference');

test('a district reference is comparable only when sales and total stores reconcile', () => {
  const reference = {scope: '자치구', amount: 900, stores: 30};
  assert.equal(assessReference(reference, {amount: 900, stores: 30}).comparable, true);
  assert.equal(assessReference(reference, {amount: 800, stores: 30}).comparable, false);
  assert.equal(assessReference(reference, {amount: 900, stores: 20}).comparable, false);
  assert.equal(assessReference(null, {amount: 900, stores: 30}).comparable, false);
});

test('rank counts only dongs with sales in the same district', () => {
  const rows = [
    {code: 'A', gu: '송파구', sales_per_store_month: 400},
    {code: 'B', gu: '송파구', sales_per_store_month: 200},
    {code: 'C', gu: '송파구', sales_per_store_month: null},
    {code: 'D', gu: '강남구', sales_per_store_month: 600}
  ];
  assert.deepEqual(rankWithinGu(rows, rows[0]), {rank: 1, total: 2});
  assert.deepEqual(rankWithinGu(rows, rows[1]), {rank: 2, total: 2});
  assert.equal(rankWithinGu(rows, rows[2]), null);
});
