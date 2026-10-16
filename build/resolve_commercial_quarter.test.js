const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {resolveCommercialQuarter, quarterCandidates, REQUIRED_SERVICES} = require('./resolve_commercial_quarter');

const noData = {RESULT: {CODE: 'INFO-200'}};
function fixture(handler){
  const calls = [];
  return {calls, fetchImpl: async url => {
    const parts = new URL(url).pathname.split('/');
    const request = {service: parts[3], start: Number(parts[4]), end: Number(parts[5]), quarter: parts[6] || ''};
    calls.push(request);
    return {ok: true, text: async () => JSON.stringify(handler(request))};
  }};
}
const present = ({service, quarter}) => ({[service]: {list_total_count: 1, row: [{STDR_YYQU_CD: quarter}]}});
const base = {key: 'SECRET', baseline: '20262', now: new Date('2026-10-16T00:00:00+09:00'), services: ['Sales', 'Stores']};

test('latest common published quarter, not calendar quarter, is chosen with first-page probes', async () => {
  const f = fixture(request => request.quarter === '20263' && request.service === 'Stores' ? noData : present(request));
  const result = await resolveCommercialQuarter({...base, fetchImpl: f.fetchImpl});
  assert.equal(result.quarter, '20262');
  assert.equal(f.calls.length, 4);
  assert.ok(f.calls.every(call => call.start === 1 && call.end === 1));
  assert.equal(REQUIRED_SERVICES.length, 17);
});

test('explicit quarter has no silent rollback and authentication/schema failures never imply unpublished', async () => {
  for (const payload of [noData, {RESULT: {CODE: 'ERROR-300'}}, {}, {Sales: {list_total_count: 0, row: []}}, present({service: 'Sales', quarter: '20261'})]) {
    const f = fixture(() => payload);
    await assert.rejects(resolveCommercialQuarter({...base, quarter: '20263', fetchImpl: f.fetchImpl}));
    assert.equal(f.calls.length, 1);
  }
  const f = fixture(() => ({RESULT: {CODE: 'ERROR-300'}}));
  await assert.rejects(resolveCommercialQuarter({...base, fetchImpl: f.fetchImpl}));
  assert.equal(f.calls.length, 1);
});

test('history feed is fully read once, validated then checked for requested quarter membership', async () => {
  const history = [{STDR_YYQU_CD:'20251',id:1},{STDR_YYQU_CD:'20262',id:2}];
  const f = fixture(request => request.service === 'VwsmAdstrdFlpopW'
    ? {[request.service]: {list_total_count: 2, row: history}} : present(request));
  const result = await resolveCommercialQuarter({...base, services: ['VwsmAdstrdFlpopW', 'Sales'], fetchImpl: f.fetchImpl});
  assert.equal(result.quarter, '20262');
  assert.equal(f.calls.filter(call => call.service === 'VwsmAdstrdFlpopW').length, 1);
  assert.equal(f.calls[0].quarter, '');
  const bad = fixture(request => ({[request.service]: {list_total_count: 2, row: history.slice(0,1)}}));
  await assert.rejects(resolveCommercialQuarter({...base, services: ['VwsmAdstrdFlpopW'], fetchImpl: bad.fetchImpl}));
});

test('probe interval is bounded at approved baseline, handles year rollover and rejects invalid scope', async () => {
  assert.deepEqual(quarterCandidates({baseline:'20254',now:new Date('2026-04-01T00:00:00+09:00')}), ['20261','20254']);
  for (const baseline of ['20264','bad','20201']) assert.throws(() => quarterCandidates({...base, baseline}));
  const f = fixture(() => noData);
  await assert.rejects(resolveCommercialQuarter({...base, fetchImpl:f.fetchImpl}));
  assert.equal(f.calls.length,2);
  await assert.rejects(resolveCommercialQuarter({...base, services:[], fetchImpl:f.fetchImpl}));
});

test('CLI reads approved baseline and emits just one selected YYYYQ, with no data write',async()=>{
  const output=[], reads=[];
  const module={exports:{}};
  const f=fixture(request=> request.service==='VwsmAdstrdFlpopW'
    ? {[request.service]:{list_total_count:1,row:[{STDR_YYQU_CD:'20262'}]}}
    : request.quarter==='20262'?present(request):noData);
  const context={module,__dirname,console:{log:value=>output.push(value)},fetch:f.fetchImpl,process:{argv:['node','resolver']},
    require(name){
      if(name==='fs')return {readFileSync:file=>{reads.push(file);return JSON.stringify({quarter:'20262'});}};
      if(name==='./commercial_api_common')return {...require(name),getKey:()=> 'KEY'};
      return require(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'resolve_commercial_quarter.js'),'utf8')+'\nmodule.exports.testMain=main;',context);
  await module.exports.testMain();
  assert.deepEqual(output,['20262']);assert.equal(reads.length,1);
  assert.ok(reads[0].endsWith(path.join('data','commercial-view-dong.json')));
});
