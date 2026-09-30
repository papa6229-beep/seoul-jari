const assert = require('node:assert/strict');
const test = require('node:test');
const {summarizeQuarter, renderReport, fetchQuarter} = require('./audit_commercial_sales_history');

const target = {dong_code: 'A', dong_name: '첫동', gu_code: '1', gu_name: '첫구'};
const rows = {
  dongSales: [{quarter: '20261', dong_code: 'A', gu_code: '1', business_code: 'CS100010', amount: 900}],
  dongStores: [{quarter: '20261', dong_code: 'A', gu_code: '1', business_code: 'CS100010', similar_store_count: 3}],
  guSales: [{quarter: '20261', area_code: '1', area_name: '첫구', business_code: 'CS100010', business_name: '커피-음료', amount: 900}],
  guStores: [{quarter: '20261', area_code: '1', business_code: 'CS100010', similar_store_count: 3}]
};

test('shows a ratio only when dong and district totals reconcile', () => {
  const good = summarizeQuarter('20261', rows, [target])[0];
  assert.equal(good.dong_monthly, 100);
  assert.equal(good.gu_monthly, 100);
  assert.equal(good.ratio, 1);
  assert.equal(good.comparable, true);

  const bad = summarizeQuarter('20261', {
    ...rows,
    guSales: [{...rows.guSales[0], amount: 1200}]
  }, [target])[0];
  assert.equal(bad.comparable, false);
  assert.equal(bad.ratio, null);
  assert.match(renderReport([bad], [target]), /비교 불가/);
});

test('four-quarter report does not call a missing quarter persistent', () => {
  const one = summarizeQuarter('20261', rows, [target])[0];
  const report = renderReport([one], [target]);
  assert.match(report, /자료 부족/);
  assert.match(report, /2026년 1분기/);
});

test('historical collection reuses archived district rows and calls only dong services', async () => {
  const services = [];
  const archived = {guSales: rows.guSales, guStores: rows.guStores};
  const data = await fetchQuarter('KEY', '20261', async url => {
    const service = url.split('/')[5];
    services.push(service);
    const raw = service === 'VwsmAdstrdSelngW'
      ? {STDR_YYQU_CD: '20261', ADSTRD_CD: 'A', SVC_INDUTY_CD: 'CS100010', THSMON_SELNG_AMT: '900'}
      : {STDR_YYQU_CD: '20261', ADSTRD_CD: 'A', SVC_INDUTY_CD: 'CS100010', SIMILR_INDUTY_STOR_CO: '3'};
    return {ok: true, text: async () => JSON.stringify({[service]: {list_total_count: 1, row: [raw]}})};
  }, archived);
  assert.deepEqual(services, ['VwsmAdstrdSelngW', 'VwsmAdstrdStorW']);
  assert.strictEqual(data.guSales, archived.guSales);
  assert.strictEqual(data.guStores, archived.guStores);
});
