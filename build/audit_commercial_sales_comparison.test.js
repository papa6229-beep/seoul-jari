const assert = require('node:assert/strict');
const test = require('node:test');
const {audit} = require('./audit_commercial_sales_comparison');

test('audit uses all stores and flags district sales that do not equal dong totals', () => {
  const result = audit({
    quarter: '20262',
    dongSales: [
      {quarter: '20262', gu_code: '1', business_code: 'A', amount: 900},
      {quarter: '20262', gu_code: '2', business_code: 'A', amount: 600}
    ],
    dongStores: [
      {quarter: '20262', gu_code: '1', business_code: 'A', similar_store_count: 30, store_count: 20, franchise_store_count: 10},
      {quarter: '20262', gu_code: '2', business_code: 'A', similar_store_count: 20, store_count: 12, franchise_store_count: 8}
    ],
    guSales: [
      {quarter: '20262', area_code: '1', area_name: '첫구', business_code: 'A', amount: 900},
      {quarter: '20262', area_code: '2', area_name: '둘구', business_code: 'A', amount: 1000}
    ],
    guStores: [
      {quarter: '20262', area_code: '1', business_code: 'A', similar_store_count: 30},
      {quarter: '20262', area_code: '2', business_code: 'A', similar_store_count: 20}
    ]
  });
  assert.deepEqual(result.summary, {groups: 2, comparable: 1, sales_mismatch: 1, stores_mismatch: 0});
  assert.equal(result.groups.find(row => row.gu === '첫구').gu_monthly_per_store, 10);
  assert.equal(result.groups.find(row => row.gu === '둘구').comparable, false);
  assert.equal(result.groups.find(row => row.gu === '둘구').sales_coverage, 0.6);
});
