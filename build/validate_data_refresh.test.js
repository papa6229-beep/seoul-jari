const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {validateRefresh} = require('./validate_data_refresh');

const files = [
  'living-population-daily-gu', 'commercial-floating-population-dong',
  'commercial-sales-dong', 'commercial-stores-dong',
  'commercial-worker-population-dong', 'commercial-resident-population-dong',
  'commercial-income-consumption-dong', 'commercial-change-index-dong',
  'commercial-apartment-dong', 'commercial-facility-dong',
  'commercial-sales-signgu', 'commercial-sales-mega',
  'commercial-sales-trdar', 'commercial-sales-trdhl',
  'commercial-stores-signgu', 'commercial-stores-mega',
  'commercial-stores-trdar', 'commercial-stores-trdhl', 'commercial-view-dong'
];

function payload(name, count = 10, period = '20262'){
  const field = name === 'living-population-daily-gu' ? 'gu'
    : name === 'commercial-floating-population-dong' ? 'dong' : 'rows';
  const code = name === 'commercial-view-dong' ? 'code'
    : field === 'gu' ? 'code' : name.endsWith('-dong') ? 'dong_code' : 'area_code';
  return {[field === 'gu' ? 'date' : 'quarter']: period,
    [field]: Array.from({length: count}, (_, i) => ({[code]: String(i),
      ...(name === 'commercial-view-dong' ? {} : {[field === 'gu' ? 'date' : 'quarter']: period})}))};
}

function fixture(t){
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-guard-'));
  t.after(() => fs.rmSync(dataDir, {recursive: true, force: true}));
  const baseline = {};
  const write = (name, value) => fs.writeFileSync(path.join(dataDir, name + '.json'), JSON.stringify(value));
  for (const name of files){
    baseline[name + '.json'] = payload(name);
    write(name, payload(name));
  }
  return {dataDir, write, baseline, run: () => validateRefresh({dataDir,
    readBaseline: file => baseline[file]})};
}

test('rejects empty output in each required fetched dataset and view', t => {
  const f = fixture(t);
  for (const name of files){
    f.write(name, payload(name, 0));
    assert.throws(f.run, new RegExp(name + '.*empty'));
    f.write(name, payload(name));
  }
});

test('rejects the confirmed 425-to-zero view replacement', t => {
  const f = fixture(t);
  f.baseline['commercial-view-dong.json'] = payload('commercial-view-dong', 425);
  f.write('commercial-view-dong', payload('commercial-view-dong', 0));
  assert.throws(f.run, /commercial-view-dong.*empty/);
});

test('rejects shrinkage while allowing the 80 percent boundary and growth', t => {
  const f = fixture(t);
  for (const name of files){
    f.write(name, payload(name, 7));
    assert.throws(f.run, new RegExp(name + '.*10.*7'));
    f.write(name, payload(name, 8));
    assert.doesNotThrow(f.run);
    f.write(name, payload(name, 11));
    assert.doesNotThrow(f.run);
    f.write(name, payload(name));
  }
});

test('rejects lost area coverage even when row count is unchanged', t => {
  const f = fixture(t);
  const value = payload('commercial-sales-dong');
  value.rows.forEach((row, i) => { row.dong_code = String(i % 2); });
  f.write('commercial-sales-dong', value);
  assert.throws(f.run, /commercial-sales-dong.*area coverage.*10.*2/);
});

test('compares current periods rather than all historical rows', t => {
  const f = fixture(t);
  const before = payload('commercial-sales-dong');
  before.rows.push(...payload('commercial-sales-dong', 100, '20261').rows);
  f.baseline['commercial-sales-dong.json'] = before;
  f.write('commercial-sales-dong', payload('commercial-sales-dong', 10, '20263'));
  assert.doesNotThrow(f.run);
  const wrongPeriod = payload('commercial-sales-dong', 10, '20261');
  wrongPeriod.quarter = '20263';
  f.write('commercial-sales-dong', wrongPeriod);
  assert.throws(f.run, /commercial-sales-dong.*empty/);
});

test('fails closed on missing, malformed output or unreadable baseline', t => {
  const f = fixture(t);
  f.write('commercial-sales-dong', {quarter: '20262'});
  assert.throws(f.run, /commercial-sales-dong/);
  f.write('commercial-sales-dong', payload('commercial-sales-dong'));
  fs.unlinkSync(path.join(f.dataDir, 'commercial-sales-dong.json'));
  assert.throws(f.run, /commercial-sales-dong/);
  f.write('commercial-sales-dong', payload('commercial-sales-dong'));
  f.baseline['commercial-sales-dong.json'] = null;
  assert.throws(f.run, /commercial-sales-dong/);
  f.baseline['commercial-sales-dong.json'] = payload('commercial-sales-dong');
  fs.writeFileSync(path.join(f.dataDir, 'commercial-sales-dong.json'), '{');
  assert.throws(f.run, /commercial-sales-dong/);
});

test('allows healthy recovery from an already empty committed baseline', t => {
  const f = fixture(t);
  for (const name of files) f.baseline[name + '.json'] = payload(name, 0);
  assert.doesNotThrow(f.run);
});

test('leaves dataset files untouched when blocking a refresh', t => {
  const f = fixture(t);
  f.write('commercial-view-dong', payload('commercial-view-dong', 0));
  const before = files.map(name => fs.readFileSync(path.join(f.dataDir, name + '.json'), 'utf8'));
  assert.throws(f.run, /Do not commit/);
  const after = files.map(name => fs.readFileSync(path.join(f.dataDir, name + '.json'), 'utf8'));
  assert.deepEqual(after, before);
});
