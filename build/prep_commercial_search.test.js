const test = require('node:test');
const assert = require('node:assert/strict');
const {buildIndex} = require('./prep_commercial_search');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');

test('keeps administrative identity and computes direct monthly sales per store', () => {
  const index = buildIndex({quarter:'20262', generated_at:'now', business_types:[{id:'svc_1',label:'커피-음료'}], rows:[
    {code:'1',gu:'마포구',name:'서교동',residents:100,workers:50,biz:{svc_1:{sales:9000000,stores:3}}}
  ]});
  assert.equal(index.rows[0].industries.svc_1.sales_per_store_month_won, 1000000);
  assert.equal(index.rows[0].industries.svc_1.sales_state, 'direct');
  assert.equal(index.rows[0].code, '1');
  assert.equal(index.quarter, '20262');
});

test('never invents dong sales when source is incomplete or has no stores', () => {
  const index = buildIndex({business_types:[{id:'svc_1',label:'커피-음료'}], rows:[
    {code:'1',biz:{svc_1:{sales:9000000,stores:3,sales_incomplete:true}}},
    {code:'2',biz:{svc_1:{sales:9000000,stores:0}}}
  ]});
  for (const row of index.rows) {
    assert.equal(row.industries.svc_1.sales_per_store_month_won, null);
    assert.equal(row.industries.svc_1.sales_state, 'unavailable');
  }
});

test('CLI can build a scratch derivative and preserves the source timestamp, identifiers and nulls', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'search-prep-port-'));
  const source = path.join(root, 'view.json'), output = path.join(root, 'search.json');
  t.after(() => {
    for (const name of fs.readdirSync(root)) fs.unlinkSync(path.join(root, name));
    fs.rmdirSync(root);
  });
  const view = {quarter: '20262', generated_at: '2026-10-12T00:00:00.000Z', business_types: [{id: 'cafe', label: 'Coffee', kind: 'group'}],
    rows: [{code: '11110001', residents: null, biz: {cafe: {stores: 3, sales: null}}}]};
  fs.writeFileSync(source, JSON.stringify(view));
  const before = fs.readFileSync(source);
  const result = spawnSync(process.execPath, [path.join(__dirname, 'prep_commercial_search.js'), '--source', source, '--out', output], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  const actual = JSON.parse(fs.readFileSync(output));
  assert.equal(actual.generated_at, '2026-10-12T00:00:00.000Z');
  assert.equal(actual.rows[0].code, '11110001');
  assert.equal(actual.rows[0].residents, null);
  assert.equal(actual.rows[0].industries.cafe.sales_state, 'unavailable');
  assert.equal(actual.rows[0].industries.cafe.sales_per_store_month_won, null);
  assert.deepEqual(fs.readFileSync(source), before);
});


