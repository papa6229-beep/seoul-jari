#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const assert = require('node:assert/strict');
const { BIZ } = require('./build_commercial_view_data');
const { validate: validateCore } = require('./validate_commercial_view_data');
const { buildIndex } = require('./prep_commercial_search');
const { coverageStatus } = require('./build_commercial_coverage');
const { compile: compileStorePoints } = require('./prep_store_points');

const SEOUL_GU_CODES = new Set([
  '11110', '11140', '11170', '11200', '11215', '11230', '11260', '11290', '11305',
  '11320', '11350', '11380', '11410', '11440', '11470', '11500', '11530', '11545',
  '11560', '11590', '11620', '11650', '11680', '11710', '11740'
]);

const commercial = '\uc0c1\uad8c ';
const FEEDS = Object.freeze([
  ...[['sales', '\ucd94\uc815\ub9e4\ucd9c'], ['stores', '\uc810\ud3ec']].flatMap(([name, label]) =>
    [['dong', ''], ['signgu', '\uc790\uce58\uad6c'], ['mega', '\uc11c\uc6b8\uc2dc'], ['trdar', '\uc0c1\uad8c'], ['trdhl', '\uc0c1\uad8c\ubc30\ud6c4\uc9c0']].map(([scope, suffix]) => ({
      file: `commercial-${name}-${scope}.json`, label: commercial + label + (suffix ? ' \ucc38\uace0-' + suffix : ''),
      areaField: scope === 'dong' ? 'dong_code' : 'area_code', scope, business: true, rowsKey: 'rows'
    }))),
  ...[
    ['floating-population', '\uc720\ub3d9\uc778\uad6c', 'dong'],
    ['worker-population', '\uc9c1\uc7a5\uc778\uad6c', 'rows'],
    ['resident-population', '\uc0c1\uc8fc\uc778\uad6c', 'rows'],
    ['income-consumption', '\uc18c\ub4dd\uc18c\ube44', 'rows'],
    ['change-index', '\ubcc0\ud654\uc9c0\ud45c', 'rows'],
    ['apartment', '\uc544\ud30c\ud2b8', 'rows'],
    ['facility', '\uc9d1\uac1d\uc2dc\uc124', 'rows']
  ].map(([name, label, rowsKey]) => ({ file: `commercial-${name}-dong.json`, label: commercial + label,
    areaField: 'dong_code', scope: 'dong', business: false, rowsKey }))
].map(Object.freeze));

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const validQuarter = value => typeof value === 'string' && /^[1-9][0-9]{3}[1-4]$/.test(value);
const validDong = value => typeof value === 'string' && /^11[0-9]{6}$/.test(value);
const validBusiness = value => typeof value === 'string' && /^CS[0-9]{6}$/.test(value);
const timestamp = value => text(value) && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
function check(condition, message) { if (!condition) throw Error(message); }
function same(actual, expected, label) {
  try { assert.deepStrictEqual(actual, expected); } catch { throw Error(label + ' mismatch'); }
}

function validateOperationalSnapshot(payloads, { targetQuarter } = {}) {
  check(record(payloads), 'snapshot payloads required');
  const daily = payloads['living-population-daily-gu.json'];
  check(record(daily) && typeof daily.date === 'string' && /^\d{8}$/.test(daily.date), 'invalid daily date');
  const dailyIso = daily.date.slice(0, 4) + '-' + daily.date.slice(4, 6) + '-' + daily.date.slice(6, 8);
  const parsedDaily = new Date(dailyIso + 'T00:00:00.000Z');
  check(Number.isFinite(parsedDaily.getTime()) && parsedDaily.toISOString().slice(0, 10) === dailyIso, 'invalid daily calendar date');
  check(Array.isArray(daily.gu) && daily.gu.length === 25, 'daily feed requires 25 Seoul gu');
  const dailyGu = new Set();
  for (const row of daily.gu) {
    check(record(row) && SEOUL_GU_CODES.has(row.code) && !dailyGu.has(row.code) && row.date === daily.date, 'daily gu identifiers/date inconsistent');
    dailyGu.add(row.code);
  }
  const view = payloads['commercial-view-dong.json'];
  check(record(view) && Array.isArray(view.rows) && view.rows.length, 'nonempty view required');
  const quarter = view.quarter;
  check(validQuarter(quarter), 'invalid view quarter');
  if (targetQuarter !== undefined) check(validQuarter(targetQuarter) && targetQuarter === quarter, 'target quarter mismatch');
  check(timestamp(view.generated_at), 'invalid view generated_at');
  check(Array.isArray(view.business_types) && view.business_types.length, 'nonempty business types required');
  const types = new Map();
  for (const type of view.business_types) {
    check(record(type) && text(type.label) && !types.has(type.id), 'invalid or duplicate business identifier');
    check(type.kind === 'service' ? validBusiness(type.code) && type.id === 'svc_' + type.code :
      type.kind === 'group' && Object.hasOwn(BIZ, type.id), 'invalid business identifier');
    types.set(type.id, type);
  }
  const dongs = new Set();
  for (const row of view.rows) {
    check(record(row) && validDong(row.code) && !dongs.has(row.code), 'invalid or duplicate view dong identifier');
    check(record(row.biz), 'invalid view industry buckets');
    for (const [id, bucket] of Object.entries(row.biz)) check(types.has(id) && record(bucket), 'undeclared or invalid view business');
    dongs.add(row.code);
  }

  const selected = new Map(), sourceCounts = {};
  for (const feed of FEEDS) {
    const payload = payloads[feed.file];
    check(record(payload), 'missing required feed: ' + feed.file);
    check(validQuarter(payload.quarter) && payload.quarter === quarter, 'feed quarter mismatch: ' + feed.file);
    const rows = payload[feed.rowsKey];
    check(Array.isArray(rows) && rows.length, 'nonempty required feed: ' + feed.file);
    const keys = new Set();
    for (const row of rows) {
      const area = row?.[feed.areaField];
      const validArea = typeof area === 'string' && (feed.scope === 'dong' ? validDong(area) :
        feed.scope === 'mega' ? area === '11' : feed.scope === 'signgu' ? /^11[0-9]{3}$/.test(area) : /^[0-9]{7}$/.test(area));
      check(record(row) && validQuarter(row.quarter) && validArea && (!feed.business || validBusiness(row.business_code)), 'invalid feed identifiers/quarter: ' + feed.file);
      const key = row.quarter + '|' + area + (feed.business ? '|' + row.business_code : '');
      check(!keys.has(key), 'duplicate feed identifiers: ' + feed.file);
      keys.add(key);
    }
    const current = rows.filter(row => row.quarter === quarter);
    check(current.length, 'nonempty current-quarter feed required: ' + feed.file);
    if (feed.scope === 'dong') check(current.some(row => dongs.has(row.dong_code)), 'empty feed for view dongs: ' + feed.file);
    selected.set(feed.file, current);
    sourceCounts[feed.file] = current.length;
  }
  const rows = file => selected.get(file);
  const coreBusiness = new Set([...rows('commercial-sales-dong.json'), ...rows('commercial-stores-dong.json')].map(row => 'svc_' + row.business_code));
  same(new Set([...types.keys()].filter(id => id.startsWith('svc_'))), coreBusiness, 'view business identifiers');
  let core;
  try {
    core = validateCore({ quarter, viewRows: view.rows, dongSales: rows('commercial-sales-dong.json'),
      dongStores: rows('commercial-stores-dong.json'), guSales: rows('commercial-sales-signgu.json'), guStores: rows('commercial-stores-signgu.json') });
  } catch { throw Error('core sales/store counts inconsistent'); }

  const search = payloads['commercial-search-index.json'];
  check(record(search) && search.quarter === quarter, 'search quarter mismatch');
  // Compare the serialized derivative: the builder leaves optional undefined properties in memory.
  same(search, JSON.parse(JSON.stringify(buildIndex(view))), 'search derivative');
  const coverage = payloads['commercial-coverage.json'];
  check(record(coverage) && coverage.quarter === quarter, 'coverage quarter mismatch');
  check(timestamp(coverage.generated_at) && coverage.rows === view.rows.length && Array.isArray(coverage.items), 'invalid coverage metadata');
  check(coverage.items.length === types.size, 'coverage business identifiers mismatch');
  const covered = new Set();
  for (const item of coverage.items) {
    const type = types.get(item?.id);
    check(type && !covered.has(item.id), 'coverage business identifiers mismatch');
    covered.add(item.id);
    for (const field of ['kind', 'label']) same(item[field], type[field], 'coverage ' + field);
    same(item.code, type.code || null, 'coverage code');
    const buckets = view.rows.map(row => row.biz[item.id]).filter(Boolean);
    const sales = buckets.filter(bucket => bucket.sales && !bucket.sales_incomplete);
    const stores = buckets.filter(bucket => bucket.stores);
    const expected = { sales_dongs: sales.length, store_dongs: stores.length,
      sales_total: sales.reduce((sum, bucket) => sum + bucket.sales, 0), store_total: stores.reduce((sum, bucket) => sum + bucket.stores, 0),
      has_sales: sales.length > 0, has_stores: stores.length > 0 };
    for (const [field, value] of Object.entries(expected)) same(item[field], value, 'coverage ' + field);
    check(['map_points', 'map_dongs'].every(field => Number.isSafeInteger(item[field]) && item[field] >= 0), 'invalid coverage map counts');
    same(item.has_map_points, item.map_points > 0, 'coverage map flag');
    same(item.coverage_level, coverageStatus(item).coverage_level, 'coverage status');
  }
  const services = coverage.items.filter(item => item.kind === 'service');
  const summary = { business_types: types.size, service_types: services.length,
    service_with_sales: services.filter(item => item.has_sales).length, service_without_sales: services.filter(item => !item.has_sales).length,
    service_with_map_points: services.filter(item => item.has_map_points).length };
  same(coverage.summary, summary, 'coverage summary');

  const dates = payloads['dates.json'];
  check(record(dates) && typeof dates.built === 'string' && /^\d{4}\.\d{2}\.\d{2}$/.test(dates.built), 'invalid dates built');
  const builtIso = dates.built.replaceAll('.', '-');
  const parsedBuilt = new Date(builtIso + 'T00:00:00.000Z');
  check(Number.isFinite(parsedBuilt.getTime()) && parsedBuilt.toISOString().slice(0, 10) === builtIso, 'invalid dates built');
  check(Array.isArray(dates.items) && dates.items.length, 'nonempty dates items required');
  const dateItems = new Map();
  for (const item of dates.items) {
    check(record(item) && ['what', 'src', 'when'].every(field => text(item[field])) && !dateItems.has(item.what), 'invalid or duplicate dates item');
    dateItems.set(item.what, item);
  }
  const period = quarter.slice(0, 4) + '\ub144 ' + quarter.slice(4) + '\ubd84\uae30';
  for (const feed of FEEDS) check(dateItems.get(feed.label)?.when === period, 'dates source period mismatch: ' + feed.file);
  // A newly built label file proves no new import; only source quarter alignment is checked here.
  return { quarter, viewDongs: dongs.size, businessTypes: types.size, core, sourceCounts, datesBuilt: dates.built,
    daily: { date: daily.date, gu: dailyGu.size } };
}

function readJson(dataDir, relative) {
  try {
    const absolute = path.resolve(dataDir, relative);
    const root = path.parse(absolute).root;
    let current = root;
    for (const part of absolute.slice(root.length).split(path.sep)) {
      current = path.join(current, part);
      check(!fs.lstatSync(current).isSymbolicLink(), 'symlink refused');
    }
    check(fs.lstatSync(absolute).isFile(), 'regular file required');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(fs.readFileSync(absolute)));
  } catch { throw Error('missing or invalid JSON: ' + relative); }
}

function validateReferences(dataDir) {
  const report = { placeFiles: 0, storeMode: 'legacy', storeKeys: 0, storeShards: 0, totalPoints: 0 };
  let storeIndex;
  const storeShards = new Map();
  function checkBuckets(points) {
    check(record(points), 'invalid store point buckets');
    for (const list of Object.values(points)) {
      check(Array.isArray(list) && list.every(record), 'invalid store point list');
      report.totalPoints += list.length;
    }
  }
  const placesDir = path.join(dataDir, 'places');
  if (fs.existsSync(placesDir)) {
    const index = readJson(dataDir, 'places/index.json');
    check(record(index) && record(index.dongs) && Object.keys(index.dongs).length, 'invalid places index');
    const files = new Set();
    for (const entry of Object.values(index.dongs)) {
      const name = entry?.f;
      check(record(entry) && typeof name === 'string' && /^[\p{L}\p{N}_-]+$/u.test(name) &&
        !/^(index|con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(name), 'unsafe place reference');
      if (!files.has(name)) readJson(dataDir, 'places/' + name + '.json');
      files.add(name);
    }
    report.placeFiles = files.size;
  }
  const indexed = fs.existsSync(path.join(dataDir, 'store-points'));
  if (indexed) {
    const index = readJson(dataDir, 'store-points/index.json');
    check(record(index) && index.version === 1 && record(index.keys) && Object.keys(index.keys).length, 'invalid store-points index');
    const files = new Set();
    for (const [key, file] of Object.entries(index.keys)) {
      check(key.includes('/') && typeof file === 'string' && /^[a-f0-9]{16}\.json$/.test(file) && !files.has(file), 'unsafe or duplicate store reference');
      files.add(file);
      const shard = readJson(dataDir, 'store-points/' + file);
      check(record(shard) && shard.version === 1 && shard.key === key, 'invalid store-point shard');
      checkBuckets(shard.points);
      storeShards.set(file, shard);
    }
    report.storeMode = 'indexed';
    storeIndex = index;
    report.storeKeys = files.size;
    report.storeShards = files.size;
  }
  // The operating UI still reads the legacy summary, even if optional shards also exist.
  if (!indexed || fs.existsSync(path.join(dataDir, 'store-summary.json'))) {
    const summary = readJson(dataDir, 'store-summary.json');
    check(record(summary) && record(summary.points) && Object.keys(summary.points).length, 'nonempty legacy store points required');
    const indexedPoints = report.totalPoints;
    report.totalPoints = 0;
    for (const [key, buckets] of Object.entries(summary.points)) {
      check(key.includes('/'), 'invalid legacy store key');
      checkBuckets(buckets);
    }
    if (indexed) {
      const expected = compileStorePoints(summary);
      same(storeIndex, expected.index, 'store reference index/source');
      for (const [file, shard] of expected.shards) same(storeShards.get(file), shard, 'store reference shard/source');
      report.storeMode = 'indexed+legacy';
      // Keep this count scoped to the indexed representation, without counting both copies.
      report.totalPoints = indexedPoints;
    } else report.storeKeys = Object.keys(summary.points).length;
  }
  const tasis = 'tasis-living-business-seoul.json';
  if (fs.existsSync(path.join(dataDir, tasis))) readJson(dataDir, tasis);
  return report;
}

function validateFromDisk({ dataDir = path.join(__dirname, '..', 'web', 'data'), targetQuarter } = {}) {
  const absoluteData = path.resolve(dataDir);
  const payloads = {};
  const files = [...FEEDS.map(feed => feed.file), 'commercial-view-dong.json', 'commercial-search-index.json', 'commercial-coverage.json', 'dates.json', 'living-population-daily-gu.json'];
  for (const file of files) {
    payloads[file] = readJson(absoluteData, file);
  }
  const report = validateOperationalSnapshot(payloads, { targetQuarter });
  let references;
  try { references = validateReferences(absoluteData); } catch (error) { throw Error('invalid references: ' + error.message); }
  return { ...report, references };
}

if (require.main === module) {
  try {
    const options = {}, args = process.argv.slice(2);
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i] === '--data-dir' ? 'dataDir' : args[i] === '--quarter' ? 'targetQuarter' : null;
      check(key && !Object.hasOwn(options, key) && args[i + 1] && !args[i + 1].startsWith('--'),
        'Usage: node build/validate_operational_snapshot.js [--data-dir <web/data>] [--quarter <YYYYQ>]');
      options[key] = args[i + 1];
    }
    process.stdout.write(JSON.stringify(validateFromDisk(options)) + '\n');
  } catch (error) {
    process.stderr.write('Operational snapshot rejected: ' + error.message + '\n');
    process.exitCode = 1;
  }
}

module.exports = { FEEDS, validateOperationalSnapshot, validateFromDisk, validateReferences };


