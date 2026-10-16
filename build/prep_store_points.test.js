'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { compile, generate } = require('./prep_store_points');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'store-points-port-'));
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
  const source = path.join(root, 'source.json'), output = path.join(root, 'points');
  const payload = { as_of: '2026-10-12', points: {
    'District/One': { cafe: [{ n: 'One', lat: null, lng: 127, extra: { values: [0, false, ''] } }], empty: [] },
    'District/Two': { other: [{ n: 'Two', lat: 37, lng: 127 }, { n: 'Three', lat: 38, lng: null }] }
  } };
  fs.writeFileSync(source, JSON.stringify(payload));
  return { source, output, payload };
}

test('deterministic independent shards reassemble every source point and null field without mutation', t => {
  const f = fixture(t), before = fs.readFileSync(f.source);
  const result = generate(f.source, f.output);
  assert.equal(result.keys, 2);
  const index = JSON.parse(fs.readFileSync(path.join(f.output, 'index.json')));
  assert.equal(index.as_of, '2026-10-12');
  const actual = {};
  for (const [key, file] of Object.entries(index.keys)) {
    assert.match(file, /^[a-f0-9]{16}\.json$/);
    const shard = JSON.parse(fs.readFileSync(path.join(f.output, file)));
    assert.equal(shard.key, key);
    actual[key] = shard.points;
  }
  assert.deepEqual(actual, f.payload.points);
  assert.equal(new Set(Object.values(index.keys)).size, 2);
  assert.deepEqual(compile(f.payload).index, index);
  assert.deepEqual(fs.readFileSync(f.source), before);
});

test('malformed or empty sources fail before output writes', t => {
  const f = fixture(t);
  for (const points of [null, [], {}, { bad: {} }, { 'District/One': { cafe: null } }, { 'District/One': { cafe: [null] } }]) {
    fs.writeFileSync(f.source, JSON.stringify({ points }));
    assert.throws(() => generate(f.source, f.output));
    assert.equal(fs.existsSync(f.output), false);
  }
});

test('CLI supports explicit source/output paths for scratch and workflow invocations', t => {
  const f = fixture(t);
  const result = spawnSync(process.execPath, [path.join(__dirname, 'prep_store_points.js'), '--source', f.source, '--out', f.output], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).keys, 2);
});
