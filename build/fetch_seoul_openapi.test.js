const test=require('node:test');
const assert=require('node:assert/strict');
const {buildSeoulUrl,fetchSeoulOpenApi}=require('./fetch_seoul_openapi');
const fetchJson=value=>async()=>({ok:true,text:async()=>JSON.stringify(value)});
const request=(json,extra={})=>fetchSeoulOpenApi({key:'KEY',service:'Test',fetchImpl:fetchJson(json),...extra});

test('transport recovery uses spaced bounded retries and safe diagnostic codes',async()=>{
  const waits=[],diagnostics=[];let calls=0;
  const result=await fetchSeoulOpenApi({key:'SECRET',service:'Test',sleep:async ms=>waits.push(ms),
    onDiagnostic:entry=>diagnostics.push(entry),fetchImpl:async()=>{
      if(++calls<4)throw Object.assign(Error('http://SECRET/ address=private'),{cause:{code:'UND_ERR_CONNECT_TIMEOUT',address:'SECRET'}});
      return {ok:true,text:async()=>JSON.stringify({Test:{list_total_count:1,row:[{}]}})};
    }});
  assert.equal(result.payload.row.length,1);assert.equal(calls,4);
  assert.deepEqual(waits,[5000,30000,60000]);
  assert.equal(diagnostics[0].network_code,'UND_ERR_CONNECT_TIMEOUT');
  assert.equal(diagnostics[0].phase,'connect');
  assert.equal(diagnostics.at(-1).outcome,'recovered');
  assert.doesNotMatch(JSON.stringify(diagnostics),/SECRET|http:|private/);
});

test('final transport failure preserves safe phase/code and never retries TLS configuration errors',async()=>{
  let calls=0;const entries=[];
  await assert.rejects(fetchSeoulOpenApi({key:'SECRET',service:'Test',retryDelayMs:0,onDiagnostic:x=>entries.push(x),
    fetchImpl:async()=>{calls++;return {ok:true,text:async()=>{throw Object.assign(Error('SECRET'),{cause:{code:'ECONNRESET'}});}};}}),
    error=>error.code==='NETWORK'&&error.network_code==='ECONNRESET'&&error.phase==='body'&&error.attempts===4&&!error.message.includes('SECRET'));
  assert.equal(calls,4);assert.equal(entries.at(-1).will_retry,false);
  calls=0;
  await assert.rejects(fetchSeoulOpenApi({key:'SECRET',service:'Test',retryDelayMs:0,onDiagnostic:()=>{},fetchImpl:async()=>{
    calls++;throw Object.assign(Error('SECRET'),{cause:{code:'CERT_HAS_EXPIRED'}});
  }}),error=>error.code==='TLS'&&error.network_code==='CERT_HAS_EXPIRED');
  assert.equal(calls,1);
});
test('URL and requested wrappers remain compatible with unrelated metadata first',async()=>{
  assert.equal(buildSeoulUrl({key:'KEY',service:'CardSubwayStatsNew',start:1,end:5,args:['20260923']}),'http://openapi.seoul.go.kr:8088/KEY/json/CardSubwayStatsNew/1/5/20260923');
  for(const RESULT of [undefined,{CODE:'INFO-000',MESSAGE:'ok'}]){
    const payload={list_total_count:1,row:[{A:'B'}],...(RESULT?{RESULT}:{})};
    const result=await request({metadata:{note:'first'},Test:payload});assert.equal(result.serviceKey,'Test');assert.deepEqual(result.payload,payload);
  }
});
test('root and requested service errors cannot become successful empty data',async()=>{
  for(const json of [{RESULT:{CODE:'ERROR-300',MESSAGE:'test'}},{Test:{RESULT:{CODE:'ERROR-300',MESSAGE:'test'}}},
    {RESULT:{CODE:'ERROR-300',MESSAGE:'test'},Test:{list_total_count:0,row:[]}}])await assert.rejects(request(json),/ERROR-300/);
});
test('missing, mismatched or malformed service/result envelopes are rejected',async()=>{
  for(const json of [null,[],{}, {Other:{list_total_count:0,row:[]}},{Test:null},{Test:[]},
    {Test:{RESULT:{}}},{RESULT:'bad',Test:{list_total_count:0,row:[]}}])await assert.rejects(request(json));
});
test('JSON HTTP and transport failures reject, while non-JSON remains compatible',async()=>{
  for(const fetchImpl of [async()=>{throw Error('offline');},async()=>({ok:false,status:503,text:async()=>''}),async()=>({ok:true,text:async()=>'{bad'})])
    await assert.rejects(fetchSeoulOpenApi({key:'KEY',service:'Test',fetchImpl,maxAttempts:1}));
  assert.equal((await fetchSeoulOpenApi({key:'KEY',service:'Test',format:'xml',fetchImpl:async()=>({ok:true,text:async()=>'<xml/>'})})).text,'<xml/>');
});

test('only transient network, HTTP 5xx and JSON/XML ERROR-500 retry, with finite attempts',async()=>{
  const good=()=>({ok:true,text:async()=>JSON.stringify({Test:{list_total_count:1,row:[{}]}})});
  for(const failure of [()=>{throw Error('http://host/SECRET');},()=>({ok:false,status:503,text:async()=> 'SECRET'}),
    ()=>({ok:true,text:async()=>'<RESULT><CODE>ERROR-500</CODE><MESSAGE>SECRET</MESSAGE></RESULT>'}),
    ()=>({ok:true,text:async()=>JSON.stringify({RESULT:{CODE:'ERROR-500',MESSAGE:'SECRET'}})})]){
    let calls=0;
    await fetchSeoulOpenApi({key:'SECRET',service:'Test',retryDelayMs:0,fetchImpl:async()=>++calls===1?failure():good()});
    assert.equal(calls,2);
    calls=0;
    await assert.rejects(fetchSeoulOpenApi({key:'SECRET',service:'Test',maxAttempts:2,retryDelayMs:0,fetchImpl:async()=>{calls++;return failure();}}),error=>!error.message.includes('SECRET'));
    assert.equal(calls,2);
  }
});

test('auth, INFO-200, malformed JSON/schema and page count errors do not retry or expose raw messages',async()=>{
  for(const value of [
    '<RESULT><CODE>ERROR-300</CODE><MESSAGE>SECRET</MESSAGE></RESULT>',
    JSON.stringify({RESULT:{CODE:'INFO-200',MESSAGE:'SECRET'}}),
    JSON.stringify({RESULT:{CODE:'ERROR-300',MESSAGE:'SECRET'}}),
    '{SECRET', JSON.stringify({Test:{list_total_count:3,row:[{}]}})
  ]){
    let calls=0;
    await assert.rejects(fetchSeoulOpenApi({key:'SECRET',service:'Test',retryDelayMs:0,fetchImpl:async()=>{calls++;return{ok:true,text:async()=>value};}}),error=>!error.message.includes('SECRET'));
    assert.equal(calls,1);
  }
});

test('timeout covers fetch and response body, aborts each attempt and cannot hang even when fetch ignores signal',async()=>{
  for(const bodyHang of [false,true]){
    const signals=[];
    const fetchImpl=async(url,{signal})=>{signals.push(signal);return bodyHang?{ok:true,text:()=>new Promise(()=>{})}:new Promise(()=>{});};
    await assert.rejects(fetchSeoulOpenApi({key:'SECRET',service:'Test',fetchImpl,timeoutMs:10,retryDelayMs:0,maxAttempts:2}),error=>error.code==='TIMEOUT');
    assert.equal(signals.length,2);assert.ok(signals.every(signal=>signal.aborted));
  }
});

test('INFO-200 contradicting nonempty rows/counts is schema failure, never a validated no-data signal',async()=>{
  for(const json of [
    {RESULT:{CODE:'INFO-200'},Test:{list_total_count:1,row:[{}]}},
    {Test:{RESULT:{CODE:'INFO-200'},list_total_count:1,row:[{}]}}
  ])await assert.rejects(request(json),error=>error.code!=='INFO-200');
});
