'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const gate = require('./validate_operational_snapshot');

function fixture() {
  const quarter = '20262';
  const generated_at = '2026-09-30T05:33:08.757Z';
  const business_types = [
    { id: 'cafe', kind: 'group', label: 'Coffee group' },
    { id: 'svc_CS100010', kind: 'service', code: 'CS100010', label: 'Coffee' }
  ];
  const p = {};
  p['living-population-daily-gu.json'] = { date: '20261012', gu: [
    '11110', '11140', '11170', '11200', '11215', '11230', '11260', '11290', '11305',
    '11320', '11350', '11380', '11410', '11440', '11470', '11500', '11530', '11545',
    '11560', '11590', '11620', '11650', '11680', '11710', '11740'
  ].map(code => ({ code, date: '20261012', total: null })) };
  for (const feed of gate.FEEDS) {
    const row = { quarter };
    row[feed.areaField] = feed.areaField === 'dong_code' ? '11110001' : feed.scope === 'mega' ? '11' : feed.scope === 'signgu' ? '11110' : '3110001';
    if (feed.business) Object.assign(row, { business_code: 'CS100010', business_name: '\ucee4\ud53c', amount: 900, count: 30, similar_store_count: 3, store_count: 2, franchise_store_count: 1 });
    else Object.assign(row, { total: null, total_spending: null });
    p[feed.file] = { quarter, [feed.rowsKey]: [row] };
  }
  p['commercial-stores-dong.json'].rows.push({ quarter, dong_code: '11110002', business_code: 'CS100010', business_name: '\ucee4\ud53c', similar_store_count: 2, store_count: 2, franchise_store_count: 0 });
  p['commercial-view-dong.json'] = {
    quarter, generated_at, business_types,
    rows: [
      { code: '11110001', gu: 'District', name: 'One', residents: null, workers: null, floating: null, biz: {
        cafe: { sales: 900, stores: 3 },
        svc_CS100010: { sales: 900, sales_count: 30, stores: 3, independent_stores: 2, franchises: 1 }
      } },
      { code: '11110002', gu: 'District', name: 'Two', residents: null, workers: null, floating: null, biz: {
        cafe: { sales: 0, stores: 2, sales_incomplete: true },
        svc_CS100010: { sales: 0, sales_count: 0, stores: 2, independent_stores: 2, franchises: 0 }
      } }
    ]
  };
  p['commercial-search-index.json'] = {
    quarter, generated_at, business_types: [
      { id: 'cafe', kind: 'group', label: 'Coffee group' },
      { id: 'svc_CS100010', kind: 'service', label: 'Coffee' }
    ], rows: [
      { code: '11110001', gu: 'District', name: 'One', residents: null, workers: null, floating: null, industries: {
        cafe: { stores: 3, sales_per_store_month_won: 100, sales_state: 'direct', sales_incomplete: false },
        svc_CS100010: { stores: 3, sales_per_store_month_won: 100, sales_state: 'direct', sales_incomplete: false }
      } },
      { code: '11110002', gu: 'District', name: 'Two', residents: null, workers: null, floating: null, industries: {
        cafe: { stores: 2, sales_per_store_month_won: null, sales_state: 'unavailable', sales_incomplete: true },
        svc_CS100010: { stores: 2, sales_per_store_month_won: null, sales_state: 'unavailable', sales_incomplete: false }
      } }
    ]
  };
  p['commercial-coverage.json'] = {
    quarter, generated_at: '2026-09-30T05:34:00.000Z', rows: 2,
    summary: { business_types: 2, service_types: 1, service_with_sales: 1, service_without_sales: 0, service_with_map_points: 0 },
    items: business_types.map(type => ({ id: type.id, code: type.code || null, label: type.label, kind: type.kind,
      has_sales: true, has_stores: true, has_map_points: false, sales_dongs: 1, store_dongs: 2, sales_total: 900, store_total: 5, map_dongs: 0, map_points: 0, coverage_level: 'partial_sales' }))
  };
  p['dates.json'] = { built: '2026.10.16', items: gate.FEEDS.map(feed => ({ what: feed.label, src: 'Source', when: '2026\ub144 2\ubd84\uae30' })) };
  return p;
}

test('accepts mixed missing/partial industry sales, null values and sparse populations without mutating payloads', () => {
  const payloads = fixture(), before = structuredClone(payloads);
  const result = gate.validateOperationalSnapshot(payloads, { targetQuarter: '20262' });
  assert.equal(result.quarter, '20262');
  assert.equal(result.viewDongs, 2);
  assert.equal(result.businessTypes, 2);
  assert.deepEqual(result.daily, { date: '20261012', gu: 25 });
  assert.equal(result.core.dong_sales, 1);
  assert.equal(result.core.dong_stores, 2);
  assert.deepEqual(payloads, before);
});

test('daily feed requires exactly the 25 Seoul gu once each on one real date', () => {
  const changes = [
    p => { delete p['living-population-daily-gu.json']; },
    p => { p['living-population-daily-gu.json'].gu = []; },
    p => { p['living-population-daily-gu.json'].gu.pop(); },
    p => { p['living-population-daily-gu.json'].gu[1].code = '11110'; },
    p => { p['living-population-daily-gu.json'].gu[0].code = '11999'; },
    p => { p['living-population-daily-gu.json'].gu[0].date = '20261011'; },
    p => { p['living-population-daily-gu.json'].date = '20260230'; },
    p => { p['living-population-daily-gu.json'].date = '2026-10-12'; }
  ];
  for (const change of changes) { const p = fixture(); change(p); assert.throws(() => gate.validateOperationalSnapshot(p), /daily/i); }
});

test('accepts an industry with stores but no public sales in any dong', () => {
  const p = fixture();
  p['commercial-view-dong.json'].business_types.push({ id: 'svc_CS200001', code: 'CS200001', kind: 'service', label: 'Other' });
  p['commercial-view-dong.json'].rows[0].biz.svc_CS200001 = { sales: 0, stores: 1, independent_stores: 1, franchises: 0 };
  p['commercial-stores-dong.json'].rows.push({ quarter: '20262', dong_code: '11110001', business_code: 'CS200001', business_name: 'Other', store_count: 1, franchise_store_count: 0 });
  p['commercial-search-index.json'].business_types.push({ id: 'svc_CS200001', kind: 'service', label: 'Other' });
  p['commercial-search-index.json'].rows[0].industries.svc_CS200001 = { stores: 1, sales_per_store_month_won: null, sales_state: 'unavailable', sales_incomplete: false };
  p['commercial-coverage.json'].items.push({ id: 'svc_CS200001', code: 'CS200001', kind: 'service', label: 'Other',
    has_sales: false, has_stores: true, has_map_points: false, sales_dongs: 0, store_dongs: 1,
    sales_total: 0, store_total: 1, map_dongs: 0, map_points: 0, coverage_level: 'needs_map' });
  p['commercial-coverage.json'].summary = { business_types: 3, service_types: 2, service_with_sales: 1, service_without_sales: 1, service_with_map_points: 0 };
  assert.equal(gate.validateOperationalSnapshot(p).businessTypes, 3);
});

test('rejects zero-case view, missing businesses and empty required feeds', () => {
  const empty = fixture();
  empty['commercial-view-dong.json'].rows = [];
  assert.throws(() => gate.validateOperationalSnapshot(empty), /nonempty.*view/i);
  const types = fixture();
  types['commercial-view-dong.json'].business_types = [];
  assert.throws(() => gate.validateOperationalSnapshot(types), /business/i);
  for (const feed of gate.FEEDS) {
    const p = fixture();
    p[feed.file][feed.rowsKey] = [];
    assert.throws(() => gate.validateOperationalSnapshot(p), /nonempty|empty/i, feed.file);
  }
  const missing = fixture();
  delete missing['commercial-sales-signgu.json'];
  assert.throws(() => gate.validateOperationalSnapshot(missing), /missing required feed/);
});

test('rejects target/feed/derivative quarter mismatches and historical-only current feeds', () => {
  assert.throws(() => gate.validateOperationalSnapshot(fixture(), { targetQuarter: '20263' }), /quarter/i);
  for (const file of [...gate.FEEDS.map(feed => feed.file), 'commercial-search-index.json', 'commercial-coverage.json']) {
    const p = fixture();
    p[file].quarter = '20261';
    assert.throws(() => gate.validateOperationalSnapshot(p), /quarter/i, file);
  }
  const p = fixture();
  p['commercial-worker-population-dong.json'].rows[0].quarter = '20261';
  assert.throws(() => gate.validateOperationalSnapshot(p), /current|nonempty|empty/i);
  for (const quarter of [null, '20265', '2026Q2', 20262]) {
    const bad = fixture(); bad['commercial-view-dong.json'].quarter = quarter;
    assert.throws(() => gate.validateOperationalSnapshot(bad), /quarter/i);
  }
});

test('rejects invalid or duplicate dong/business identifiers and undeclared view industries', () => {
  const changes = [
    p => { p['commercial-view-dong.json'].rows[1].code = '11110001'; },
    p => { p['commercial-view-dong.json'].rows[0].code = '../dong'; },
    p => { p['commercial-view-dong.json'].business_types[1].id = 'bad'; },
    p => { p['commercial-view-dong.json'].business_types.push(p['commercial-view-dong.json'].business_types[1]); },
    p => { p['commercial-view-dong.json'].rows[0].biz.unknown = {}; },
    p => { p['commercial-sales-dong.json'].rows.push(p['commercial-sales-dong.json'].rows[0]); },
    p => { p['commercial-sales-dong.json'].rows[0].business_code = 'CSINVALID'; }
  ];
  for (const change of changes) { const p = fixture(); change(p); assert.throws(() => gate.validateOperationalSnapshot(p)); }
});

test('rejects altered core counts through the existing exact consistency validator', () => {
  const p = fixture();
  p['commercial-view-dong.json'].rows[0].biz.svc_CS100010.sales = 901;
  assert.throws(() => gate.validateOperationalSnapshot(p), /core/i);
});

test('rejects missing search dong, stale timestamp, changed industry results and coverage identifiers/counts', () => {
  const changes = [
    p => { p['commercial-search-index.json'].rows.pop(); },
    p => { p['commercial-search-index.json'].generated_at = '2026-09-29T00:00:00.000Z'; },
    p => { p['commercial-search-index.json'].rows[1].industries.cafe.sales_state = 'direct'; },
    p => { p['commercial-coverage.json'].items[0].id = 'unknown'; },
    p => { p['commercial-coverage.json'].items.pop(); },
    p => { p['commercial-coverage.json'].rows = 3; },
    p => { p['commercial-coverage.json'].items[0].store_total = 6; }
  ];
  for (const change of changes) { const p = fixture(); change(p); assert.throws(() => gate.validateOperationalSnapshot(p), /search|coverage/i); }
});

test('dates must be nonempty, well formed and label actual periods even when built is recent', () => {
  const changes = [
    p => { p['dates.json'] = {}; },
    p => { p['dates.json'].items = []; },
    p => { p['dates.json'].built = '2026.02.30'; },
    p => { p['dates.json'].items[0].src = null; },
    p => { p['dates.json'].items[0].when = '2026\ub144 3\ubd84\uae30'; },
    p => { p['dates.json'].items[0].when = p['dates.json'].built; },
    p => { p['dates.json'].items.pop(); }
  ];
  for (const change of changes) { const p = fixture(); change(p); assert.throws(() => gate.validateOperationalSnapshot(p), /dates|period/i); }
});

function diskFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'operational-gate-'));
  t.after(() => {
    function clean(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) clean(file); else fs.unlinkSync(file);
      }
      fs.rmdirSync(dir);
    }
    clean(root);
  });
  const web = path.join(root, 'web'), dataDir = path.join(web, 'data');
  function put(relative, value) {
    const absolute = path.join(web, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, typeof value === 'string' ? value : JSON.stringify(value));
  }
  const payloads = fixture();
  for (const [file, value] of Object.entries(payloads)) put('data/' + file, value);
  put('data/places/index.json', { dongs: { area: { f: 'area' } } });
  put('data/places/area.json', { rows: [] });
  put('data/store-summary.json', { points: { 'district/dong': { cafe: [{ lat: null, lng: null }] } } });
  return { root, dataDir, put, web };
}

test('disk gate parses source JSON, resolves place/store references and never creates staging', t => {
  const f = diskFixture(t);
  const before = fs.readdirSync(f.root);
  const report = gate.validateFromDisk({ dataDir: f.dataDir });
  assert.equal(report.references.storeMode, 'legacy');
  assert.equal(report.references.storeKeys, 1);
  assert.equal(report.references.placeFiles, 1);
  assert.deepEqual(fs.readdirSync(f.root), before);
  f.put('data/places/index.json', { dongs: { area: { f: 'missing' } } });
  assert.throws(() => gate.validateFromDisk({ dataDir: f.dataDir }), /reference/i);
  f.put('data/places/index.json', { dongs: { area: { f: 'area' } } });
  f.put('data/store-points/index.json', { version: 1, keys: { 'district/dong': '0123456789abcdef.json' } });
  assert.throws(() => gate.validateFromDisk({ dataDir: f.dataDir }), /reference/i);
  f.put('data/commercial-worker-population-dong.json', '{broken');
  assert.throws(() => gate.validateFromDisk({ dataDir: f.dataDir }), /JSON.*commercial-worker|commercial-worker.*JSON/i);
  f.put('data/commercial-worker-population-dong.json', fixture()['commercial-worker-population-dong.json']);
  f.put('data/dates.json', '{broken');
  assert.throws(() => gate.validateFromDisk({ dataDir: f.dataDir }), /JSON.*dates|dates.*JSON/i);
  assert.deepEqual(fs.readdirSync(f.root), before);
});

test('accepts indexed derivatives, rejects stale or unsafe shards and validates legacy points', t => {
  const f = diskFixture(t);
  const { generate } = require('./prep_store_points');
  generate(path.join(f.dataDir, 'store-summary.json'), path.join(f.dataDir, 'store-points'));
  const report = gate.validateFromDisk({ dataDir: f.dataDir });
  assert.equal(report.references.storeMode, 'indexed+legacy');
  assert.equal(report.references.storeShards, 1);
  assert.equal(report.references.totalPoints, 1);
  const index = JSON.parse(fs.readFileSync(path.join(f.dataDir, 'store-points/index.json')));
  const file = Object.values(index.keys)[0];
  const shardPath = path.join(f.dataDir, 'store-points', file);
  const shard = JSON.parse(fs.readFileSync(shardPath));
  shard.points.cafe = [];
  f.put('data/store-points/' + file, shard);
  assert.throws(() => gate.validateFromDisk({ dataDir: f.dataDir }), /shard\/source/);
  index.keys['district/dong'] = '../outside.json';
  f.put('data/store-points/index.json', index);
  assert.throws(() => gate.validateFromDisk({ dataDir: f.dataDir }), /unsafe/);
  fs.unlinkSync(shardPath);
  fs.unlinkSync(path.join(f.dataDir, 'store-points/index.json'));
  fs.rmdirSync(path.join(f.dataDir, 'store-points'));
  f.put('data/store-summary.json', { points: { 'district/dong': { cafe: null } } });
  assert.throws(() => gate.validateFromDisk({ dataDir: f.dataDir }), /point list/);
});

test('reference checks reject unsafe place paths and malformed indexed JSON without UI dependencies', t => {
  const f = diskFixture(t);
  f.put('data/places/index.json', { dongs: { area: { f: '../escape' } } });
  assert.throws(() => gate.validateFromDisk({ dataDir: f.dataDir }), /unsafe place/);
  f.put('data/places/index.json', { dongs: { area: { f: 'area' } } });
  f.put('data/places/area.json', '{bad');
  assert.throws(() => gate.validateFromDisk({ dataDir: f.dataDir }), /JSON/);
});

test('CLI accepts data-dir/quarter, emits a compact report, and rejects mismatches', t => {
  const f = diskFixture(t);
  const cli = path.join(__dirname, 'validate_operational_snapshot.js');
  const run = args => spawnSync(process.execPath, [cli, '--data-dir', f.dataDir, ...args], { encoding: 'utf8' });
  const ok = run(['--quarter', '20262']);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).quarter, '20262');
  const bad = run(['--quarter', '20263']);
  assert.notEqual(bad.status, 0);
  assert.equal(bad.stdout, '');
  assert.match(bad.stderr, /quarter/i);
  assert.notEqual(run(['--unknown']).status, 0);
});


