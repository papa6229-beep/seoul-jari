const assert = require('assert');
const test = require('node:test');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const {spawnSync} = require('child_process');
const api = require('./fetch_stores_api');
const {buildUrl, fetchGu, fetchSeoulStores} = require('./fetch_stores_api');
const {summarizeRows} = require('./prep_stores');

const url = buildUrl({serviceKey: 'KEY', guCode: '11680', pageNo: 2});
assert.equal(url.pathname.endsWith('/storeListInDong'), true);
assert.equal(url.searchParams.get('divId'), 'signguCd');
assert.equal(url.searchParams.get('key'), '11680');
assert.equal(url.searchParams.get('pageNo'), '2');
assert.equal(url.searchParams.get('type'), 'json');

const pages = [
  {
    body: {
      totalCount: 2,
      items: [
        {ctprvnNm:'서울', signguNm:'강남구', adongNm:'대치1동', bizesNm:'대치커피', indsMclsNm:'커피점/카페', indsSclsNm:'커피전문점'},
        {ctprvnNm:'서울', signguNm:'강남구', adongNm:'대치1동', bizesNm:'대치필라테스', indsMclsNm:'운동/스포츠', indsSclsNm:'필라테스'}
      ]
    }
  }
];
let called = 0;
const fakeFetch = async () => ({
  ok: true,
  text: async () => JSON.stringify(pages[called++])
});

(async () => {
  const gu = await fetchGu({serviceKey:'KEY', guCode:'11680', guName:'강남구', fetchImpl:fakeFetch});
  assert.equal(gu.rows.length, 2);
  assert.equal(gu.totalCount, 2);
  const summary = summarizeRows(gu.rows, '2026-09-23');
  assert.equal(summary.totals.cafe, 1);
  assert.equal(summary.totals.fitness, 1);

  const seoul = await fetchSeoulStores({
    serviceKey:'KEY',
    limitGu:'강남구',
    maxPages:1,
    fetchImpl: async () => ({
      ok: true,
      text: async () => JSON.stringify({body:{totalCount:1, items:[gu.rows[0]]}})
    })
  });
  assert.equal(seoul.rows.length, 1);
  assert.equal(seoul.fetched[0].guName, '강남구');
  console.log('fetch_stores_api test ok');
})();

function fakePages(pages){
  let calls = 0;
  return async () => {
    assert.ok(calls < pages.length, 'unexpected extra API request');
    return {ok: true, text: async () => JSON.stringify(pages[calls++])};
  };
}
const collect = (pages, options = {}) => fetchGu({serviceKey: 'SECRET', guCode: '11680', guName: '강남구', fetchImpl: fakePages(pages), ...options});
const batch = (start, count) => Array.from({length: count}, (_, i) => ({bizesId: String(start + i), bizesNm: '점포'}));

test('header failure, malformed bodies/counts/items and short pages cannot become successful empty data', async () => {
  for (const payload of [
    {header: {resultCode: '30', resultMsg: 'SECRET'}},
    {header: {}, body: {totalCount: 0, items: []}},
    {}, {body: []}, {body: {items: []}},
    ...[null, '', false, -1, 1.5, 'NaN', '1e3'].map(totalCount => ({body: {totalCount, items: []}})),
    {body: {totalCount: 3, items: [{name: 'only one'}]}},
    {body: {totalCount: 0, items: [{name: 'not empty'}]}},
    {body: {totalCount: 1, items: 'bad'}},
    {body: {totalCount: 1, items: [null]}},
    {body: {totalCount: 1001, items: batch(0, 999)}}
  ]) await assert.rejects(collect([payload]));
});

test('documented 00 header, absent header and legacy item wrappers remain valid', async () => {
  for (const items of [[{name: 'a'}], {item: [{name: 'a'}]}, {item: {name: 'a'}}]) {
    const result = await collect([{header: {resultCode: '00'}, body: {totalCount: '1', items}}]);
    assert.equal(result.rows.length, 1);
    assert.equal(result.complete, true);
  }
  assert.equal((await collect([{body: {totalCount: 0, items: []}}])).complete, true);
});

test('later empty/truncated pages, changing totals and repeated identities are rejected', async () => {
  const first = {body: {totalCount: 1001, items: batch(0, 1000)}};
  for (const second of [
    {body: {totalCount: 1001, items: []}},
    {body: {totalCount: 1002, items: batch(1000, 2)}},
    {body: {totalCount: 1001, items: [{bizesId: '0', changed: true}]}}
  ]) await assert.rejects(collect([first, second]));
  await assert.rejects(collect([{body: {totalCount: 2, items: [{a: 1, b: 2}, {b: 2, a: 1}]}}]));
  await assert.rejects(collect([
    {body: {totalCount: 2000, items: batch(0, 1000)}},
    {body: {totalCount: 2000, items: batch(0, 1000).reverse()}}
  ]));
  const complete = await collect([first, {body: {totalCount: 1001, items: batch(1000, 1)}}]);
  assert.equal(complete.complete, true);
  const sample = await collect([first], {maxPages: 1});
  assert.equal(sample.complete, false);
  assert.equal(sample.totalCount, 1001);
  await assert.rejects(collect([{body: {totalCount: 3, items: [{a: 1}]}}], {maxPages: 1}));
});

test('invalid programmatic and CLI page limits reject rather than silently requesting full data', async () => {
  for (const maxPages of [0, -1, 1.2, NaN, false, null, '1']) {
    await assert.rejects(collect([], {maxPages}));
  }
  for (const value of ['0', '-1', 'false', '1.2', '', 'Infinity', 'NaN']) {
    assert.throws(() => api.parseCliOptions(['--max-pages=' + value, '--out=sample.json']));
  }
  assert.throws(() => api.parseCliOptions(['--max-pages']));
});

test('limited CLI requires explicit noncanonical output, full default remains compatible', () => {
  const canonical = path.resolve(__dirname, '../web/data/store-summary.json');
  for (const args of [['--limit-gu=강남구'], ['--max-pages=1'], ['--limit-gu=강남구', '--out=' + canonical], ['--max-pages=1', '--out=' + path.join(path.dirname(canonical), '..', 'data', 'store-summary.json')]]) {
    assert.throws(() => api.parseCliOptions(args), /out|canonical/i);
  }
  assert.equal(api.parseCliOptions([]).output, canonical);
  assert.equal(api.parseCliOptions(['--max-pages=1', '--out=sample.json']).maxPages, 1);
});

test('full Seoul fetch completes every target; subset is explicitly not a full Seoul collection', async () => {
  let calls = 0;
  const result = await fetchSeoulStores({serviceKey: 'KEY', fetchImpl: async () => {
    calls++;
    return {ok: true, text: async () => JSON.stringify({body: {totalCount: 0, items: []}})};
  }});
  assert.equal(calls, api.SEOUL_GU.length);
  assert.equal(result.complete, true);
  assert.ok(result.fetched.every(item => item.complete));
  assert.equal((await fetchSeoulStores({serviceKey: 'KEY', limitGu: '강남구', fetchImpl: fakePages([{body: {totalCount: 0, items: []}}])})).complete, false);
  await assert.rejects(fetchSeoulStores({serviceKey: 'KEY', fetchImpl: fakePages([{body: {totalCount: 0, items: []}}, {}])}));
});

test('transport, HTTP and JSON diagnostics never echo URL, key or response body', async () => {
  for (const fetchImpl of [
    async () => { throw new Error('https://example.com/?serviceKey=SECRET'); },
    async () => ({ok: false, status: 403, text: async () => 'SECRET'}),
    async () => ({ok: true, text: async () => 'SECRET'}),
    async () => ({ok: true, text: async () => { throw new Error('SECRET'); }})
  ]) await assert.rejects(api.fetchJson('https://example.com/?serviceKey=SECRET', fetchImpl), error => !/SECRET|example\.com/.test(error.message));
});

test('CLI uses the shared atomic JSON writer, never a direct target write', () => {
  const source = fs.readFileSync(path.join(__dirname, 'fetch_stores_api.js'), 'utf8');
  assert.match(source, /writeJson\(output, summary\)/);
  assert.doesNotMatch(source, /fs\.writeFileSync\(output/);
});

test('store transport/body timeout is bounded; auth and malformed JSON are classified non-retryable',async()=>{
  await assert.rejects(api.fetchJson('https://example.com/SECRET',async()=>new Promise(resolve=>setTimeout(()=>resolve({ok:true,text:async()=> '{}'}),40)),{timeoutMs:10}),error=>error.code==='TIMEOUT');
  for(const response of [{ok:false,status:401,text:async()=> 'SECRET'},{ok:true,text:async()=> '{SECRET'}]){
    await assert.rejects(api.fetchJson('https://example.com/SECRET',async()=>response),error=>error.retryable===false && !error.message.includes('SECRET'));
    let calls=0;
    await assert.rejects(fetchGu({serviceKey:'KEY',guCode:'11680',guName:'강남구',fetchImpl:async()=>{calls++;return response;}}));
    assert.equal(calls,1);
  }
});

test('duplicate business identity across different gu cannot be published twice', async () => {
  await assert.rejects(fetchSeoulStores({serviceKey: 'KEY', fetchImpl: fakePages([
    {body: {totalCount: 1, items: [{bizesId: 'same', signguNm: '종로구'}]}},
    {body: {totalCount: 1, items: [{bizesId: 'same', signguNm: '중구'}]}},
    ...api.SEOUL_GU.slice(2).map(() => ({body: {totalCount: 0, items: []}}))
  ])}), /Duplicate/);
});

test('actual CLI rejects limited canonical output before credentials or network are needed', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'fetch_stores_api.js'), '--max-pages=1'], {
    encoding: 'utf8', env: {...process.env, DATA_GO_KR_SERVICE_KEY: '', SEMAS_SERVICE_KEY: ''}
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /noncanonical --out/);
});

function mainHarness(args, pages){
  const writes = [];
  const module = {exports: {}};
  const context = {
    module, __dirname, URL, AbortController, fetch: fakePages(pages), setTimeout, clearTimeout,
    console: {log() {}, warn() {}},
    process: {argv: ['node', 'fetch_stores_api.js', ...args], env: {DATA_GO_KR_SERVICE_KEY: 'KEY'}},
    require(name){
      if (name === './commercial_api_common') return {writeJson: (out, data) => writes.push({out, data})};
      return require(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'fetch_stores_api.js'), 'utf8') + '\nmodule.exports.testMain = main;', context);
  return {run: module.exports.testMain, writes};
}

test('last target failure never reaches writer; isolated sample writes truthful completeness metadata', async () => {
  const failed = mainHarness([], [...api.SEOUL_GU.slice(1).map(() => ({body: {totalCount: 0, items: []}})), {body: {totalCount: 3, items: [{name: 'short'}]}}]);
  await assert.rejects(failed.run(), /Incomplete/);
  assert.equal(failed.writes.length, 0);
  const sample = mainHarness(['--limit-gu=강남구', '--max-pages=1', '--out=sample.json'], [{body: {totalCount: 1001, items: batch(0, 1000)}}]);
  await sample.run();
  assert.equal(sample.writes.length, 1);
  assert.equal(sample.writes[0].data.fetch.complete, false);
  assert.equal(sample.writes[0].data.fetch.sample, true);
  assert.equal(sample.writes[0].data.fetch.fetched[0].complete, false);
});
