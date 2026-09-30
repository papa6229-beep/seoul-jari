const assert = require('node:assert/strict');
const test = require('node:test');
const {validate} = require('./validate_commercial_view_data');

function fixture(){
  return {
    quarter: '20262',
    dongSales: [{quarter: '20262', dong_code: '11110001', business_code: 'CS100010', business_name: '커피-음료', amount: 900, count: 30}],
    dongStores: [{quarter: '20262', dong_code: '11110001', business_code: 'CS100010', business_name: '커피-음료', similar_store_count: 3, store_count: 2, franchise_store_count: 1}],
    guSales: [{quarter: '20262', area_code: '11110', business_code: 'CS100010', amount: 900, count: 30}],
    guStores: [{quarter: '20262', area_code: '11110', business_code: 'CS100010', similar_store_count: 3}],
    viewRows: [{code: '11110001', biz: {
      svc_CS100010: {sales: 900, sales_count: 30, stores: 3, independent_stores: 2, franchises: 1,
        reference_sales: {scope: '자치구', amount: 900, count: 30, stores: 3, monthly_sales_per_store: 100}},
      cafe: {sales: 900, stores: 3}
    }}]
  };
}

test('validates source rows, grouped totals and district references', () => {
  assert.deepEqual(validate(fixture()), {dong_sales: 1, dong_stores: 1, grouped_cells: 5, references: 1});
});

test('rejects a dropped source dong and an invented empty dong', () => {
  const missing = fixture();
  missing.viewRows = [];
  assert.throws(() => validate(missing), /행정동/);
  const extra = fixture();
  extra.viewRows.push({code: '11110002', biz: {}});
  assert.throws(() => validate(extra), /원본에 없는/);
});

test('rejects wrong local sales, grouped sales and district reference', () => {
  const local = fixture();
  local.viewRows[0].biz.svc_CS100010.sales = 800;
  assert.throws(() => validate(local), /동 매출/);
  const grouped = fixture();
  grouped.viewRows[0].biz.cafe.sales = 800;
  assert.throws(() => validate(grouped), /묶음/);
  const reference = fixture();
  reference.viewRows[0].biz.svc_CS100010.reference_sales.amount = 800;
  assert.throws(() => validate(reference), /구 참고값/);
});
