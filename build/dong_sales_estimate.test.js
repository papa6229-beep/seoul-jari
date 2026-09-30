const assert = require('node:assert/strict');
const test = require('node:test');
const estimate = require('../web/dong-sales-estimate.js');

function fixture(){
  const business_types = ['target', 'p1', 'p2', 'p3', 'p4', 'p5'].map(id => ({id: 'svc_' + id}));
  const row = (code, peerSales) => ({
    code,
    biz: Object.fromEntries(business_types.map(type => [type.id, type.id === 'svc_target'
      ? {stores: 2}
      : {stores: 3, sales: peerSales * 3}]))
  });
  return {business_types, rows: [row('low', 100), row('high', 200)]};
}

test('uses other industries to distinguish dongs without treating the reference as local sales', () => {
  const model = estimate.create(fixture());
  const low = model.forDong('svc_target', 'low', 10000000);
  const high = model.forDong('svc_target', 'high', 10000000);
  assert.equal(low.peer_count, 5);
  assert.ok(low.monthly_won < 10000000);
  assert.ok(high.monthly_won > 10000000);
  assert.ok(low.monthly_won < high.monthly_won);
});

test('requires a base, a target store and at least five independent peer industries', () => {
  const view = fixture();
  const model = estimate.create(view);
  assert.equal(model.forDong('svc_target', 'low', 0), null);
  assert.equal(model.forDong('svc_target', 'missing', 10000000), null);
  view.rows[0].biz.svc_target.stores = 0;
  assert.equal(estimate.create(view).forDong('svc_target', 'low', 10000000), null);
  for (const id of ['svc_p4', 'svc_p5']) delete view.rows[0].biz[id].sales;
  assert.equal(estimate.create(view).forDong('svc_target', 'low', 10000000), null);
});

test('does not use the target industry as its own peer and caps extreme adjustments', () => {
  const view = fixture();
  view.rows[0].biz.svc_target.sales = 999999999;
  view.rows[1].biz.svc_target.sales = 10;
  const result = estimate.create(view).forDong('svc_target', 'low', 10000000);
  assert.equal(result.peer_count, 5);
  assert.ok(result.factor >= .45 && result.factor <= 1.6);
});

test('rounds a displayed estimate instead of implying one-won precision', () => {
  assert.equal(estimate.approxMoney(200250000), '약 2.0억원');
  assert.equal(estimate.approxMoney(6160000), '약 600만원');
  assert.equal(estimate.approxMoney(null), '자료 없음');
});
