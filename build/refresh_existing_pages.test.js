const test = require('node:test');
const assert = require('node:assert/strict');
const {refreshExistingPages, main} = require('./refresh_existing_pages');

const expected = 'a'.repeat(40), old = 'b'.repeat(40);
const configuration = {build_type:'legacy', source:{branch:'main',path:'/'}};
const build = (commit = expected, status = 'built') => ({commit,status});
const response = (data, status = 200) => ({status,ok:status >= 200 && status < 300,text:async()=>JSON.stringify(data)});
function harness(entries, options = {}){
  let time = 0;
  const calls = [], sleeps = [];
  const fetchImpl = async (url, init) => {
    calls.push({url,init});
    assert.ok(entries.length, 'unexpected request');
    const entry = entries.shift();
    if (entry instanceof Error) throw entry;
    return entry;
  };
  const params = {repository:'owner/repo',token:'PRIVATE_TOKEN',expectedCommit:expected,
    fetchImpl,clock:()=>time,sleep:async ms=>{sleeps.push(ms);time+=ms;},
    maxWaitMs:5000,pollIntervalMs:100,requestTimeoutMs:50,...options};
  return {calls,sleeps,params,run:()=>refreshExistingPages(params)};
}

test('verifies existing legacy main root before exactly one build request, then waits for the expected built commit',async()=>{
  const h = harness([response(configuration),response({},201),response(build(old)),
    response(build(expected,'queued')),response(build(expected,'building')),response(build())]);
  const result = await h.run();
  assert.equal(result.commit,expected);assert.equal(result.status,'built');
  assert.deepEqual(h.calls.map(call=>call.init.method),['GET','POST','GET','GET','GET','GET']);
  assert.equal(h.calls[0].url,'https://api.github.com/repos/owner/repo/pages');
  assert.equal(h.calls[1].url,'https://api.github.com/repos/owner/repo/pages/builds');
  assert.ok(h.calls.slice(2).every(call=>call.url==='https://api.github.com/repos/owner/repo/pages/builds/latest'));
  assert.ok(h.calls.every(call=>call.init.redirect==='error' && call.init.headers.Authorization==='Bearer PRIVATE_TOKEN'));
  assert.equal(h.sleeps.length,3);
});

test('different or malformed hosting never receives a POST',async()=>{
  for(const data of [null,{}, {...configuration,build_type:'workflow'},
    {...configuration,source:{branch:'dev',path:'/'}},{...configuration,source:{branch:'main',path:'/web'}}]){
    const h=harness([response(data)]);
    await assert.rejects(h.run(),/legacy|hosting/i);assert.equal(h.calls.length,1);
  }
});

test('repository, commit, token and timing validation rejects before any request',async()=>{
  for(const options of [
    {repository:'owner/repo/other'},{repository:'../repo'},{repository:'owner/repo?SECRET'},
    {repository:'https://host/repo'},{repository:'owner/..'}, {expectedCommit:'a'.repeat(39)},
    {expectedCommit:'z'.repeat(40)}, {token:''}, {token:'token\nSECRET'},
    {maxWaitMs:600001}, {maxWaitMs:0}, {pollIntervalMs:0}, {requestTimeoutMs:0}
  ]){
    const h=harness([],options);await assert.rejects(h.run());assert.equal(h.calls.length,0);
  }
});

test('matching failed build rejects immediately; an unrelated failed build cannot fail or satisfy this commit',async()=>{
  for(const status of ['errored','failed']){
    const h=harness([response(configuration),response({},201),response(build(expected,status))]);
    await assert.rejects(h.run(),/failed/i);assert.equal(h.sleeps.length,0);
  }
  const h=harness([response(configuration),response({},201),response(build(old,'errored')),response(build())]);
  assert.equal((await h.run()).commit,expected);
});

test('pending statuses wait, malformed build JSON/status never counts as success',async()=>{
  const h=harness([response(configuration),response({},201),response(build(expected,'pending')),
    response(build(expected,'in_progress')),response(build())]);
  await h.run();assert.equal(h.sleeps.length,2);
  for(const data of [null,{},build(expected,'unknown'),build('short'),{status:'built'}]){
    const bad=harness([response(configuration),response({},201),response(data)]);
    await assert.rejects(bad.run(),/response/i);
  }
});

test('old built commits time out within the total deadline and polling has a finite count even with a stationary injected clock',async()=>{
  const h=harness([response(configuration),response({},201),...Array.from({length:5},()=>response(build(old)))],{maxWaitMs:250});
  await assert.rejects(h.run(),/deadline|timed out/i);
  assert.ok(h.calls.length<=5);assert.equal(h.sleeps.reduce((a,b)=>a+b,0),250);
  const stationary=harness([response(configuration),response({},201),...Array.from({length:5},()=>response(build(old)))],
    {maxWaitMs:2,pollIntervalMs:1,clock:()=>0,sleep:async()=>{}});
  await assert.rejects(stationary.run(),/deadline|timed out/i);assert.ok(stationary.calls.length<=5);
});

test('safe GET transient retries are finite; auth and redirect responses fail without a POST',async()=>{
  const h=harness([response({},503),response(configuration),response({},201),
    Error('https://host/PRIVATE_TOKEN'),response(build())]);
  await h.run();assert.equal(h.calls.length,5);
  for(const entry of [response({message:'PRIVATE_TOKEN'},403),response({},302),
    {...response(configuration),redirected:true}]){
    const bad=harness([entry]);await assert.rejects(bad.run(),error=>!/PRIVATE_TOKEN|https:/.test(error.message));
    assert.equal(bad.calls.length,1);
  }
});

test('an ambiguous POST failure is never retried and never reports success',async()=>{
  for(const failure of [Error('https://host/PRIVATE_TOKEN'),response({message:'PRIVATE_TOKEN'},503)]){
    const h=harness([response(configuration),failure]);
    await assert.rejects(h.run(),error=>!/PRIVATE_TOKEN|https:/.test(error.message));
    assert.equal(h.calls.length,2);
  }
});

test('request and response-body hangs are bounded and aborted, without leaking transport or parse text',async()=>{
  for(const bodyHang of [false,true]){
    const signals=[];
    await assert.rejects(refreshExistingPages({repository:'owner/repo',token:'PRIVATE_TOKEN',expectedCommit:expected,
      maxWaitMs:200,requestTimeoutMs:10,pollIntervalMs:10,
      sleep:async()=>{},fetchImpl:async(url,{signal})=>{
        signals.push(signal);
        return bodyHang?{status:200,ok:true,text:()=>new Promise(()=>{})}:new Promise(()=>{});
      }}),error=>/timeout|timed out/i.test(error.message) && !error.message.includes('PRIVATE_TOKEN'));
    assert.equal(signals.length,2);assert.ok(signals.every(signal=>signal.aborted));
  }
  const bad=harness([{status:200,ok:true,text:async()=>'{PRIVATE_TOKEN https://host'}]);
  await assert.rejects(bad.run(),error=>!/PRIVATE_TOKEN|https:/.test(error.message));
  assert.equal(bad.calls.length,1);
});

test('CLI entry reads only the agreed environment and logs only a verified commit',async()=>{
  const h=harness([response(configuration),response({},201),response(build())]);
  const messages=[];
  const result=await main({...h.params,env:{GITHUB_REPOSITORY:'owner/repo',GITHUB_TOKEN:'PRIVATE_TOKEN',EXPECTED_DATA_COMMIT:expected},
    log:message=>messages.push(message)});
  assert.equal(result.commit,expected);assert.equal(messages.length,1);
  assert.ok(messages[0].includes(expected));assert.ok(!/PRIVATE_TOKEN|https:/.test(messages[0]));
});
