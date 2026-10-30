const test=require('node:test');
const assert=require('node:assert/strict');
const {decideRefresh}=require('./decide_refresh_run');
const context={eventName:'schedule',schedule:'30 21 * * 0,1,3,4,5,6',repository:'papa6229-beep/seoul-jari',ref:'refs/heads/main',token:'SECRET'};
const run=(id,conclusion='success',event='schedule')=>({id,conclusion,event,head_branch:'main'});
function api(runs,commits={}){
  const calls=[];
  return {calls,fetchImpl:async url=>{
    calls.push(url);
    const data=url.includes('/jobs')?{jobs:[{steps:[{name:'Commit updated data',conclusion:commits[Number(url.match(/runs\/(\d+)/)[1])]||'skipped'}]}]}:{workflow_runs:runs};
    return {ok:true,status:200,json:async()=>data};
  }};
}
test('manual and normal weekly refresh never depend on metadata or actual weekday',async()=>{
  for(const extra of [{eventName:'workflow_dispatch'},{schedule:'30 21 * * 2'}]){
    const f=api([]);const d=await decideRefresh({...context,...extra,fetchImpl:f.fetchImpl});
    assert.equal(d.run,true);assert.equal(f.calls.length,0);
  }
});
test('failed refresh is retried on the next scheduled catch-up',async()=>{
  const f=api([run(7,'failure')]);const d=await decideRefresh({...context,fetchImpl:f.fetchImpl});
  assert.equal(d.run,true);assert.equal(d.reason,'recover_failure');assert.equal(d.previousRun,7);
});
test('skipped catch-ups and verification-only success cannot conceal a failed refresh',async()=>{
  const f=api([run(9),run(8,'success','workflow_dispatch'),run(7,'failure')]);
  const d=await decideRefresh({...context,fetchImpl:f.fetchImpl});assert.equal(d.run,true);assert.equal(d.previousRun,7);
});
test('successful scheduled or manual publication suppresses unnecessary collection',async()=>{
  for(const event of ['schedule','workflow_dispatch']){
    const f=api([run(9),run(8,'success',event),run(7,'failure')],{8:'success'});
    const d=await decideRefresh({...context,fetchImpl:f.fetchImpl});assert.equal(d.run,false);assert.equal(d.reason,'already_refreshed');
  }
});
test('unknown or malformed metadata fails closed; missing successful history requests bounded recovery',async()=>{
  assert.equal((await decideRefresh({...context,...api([])})).run,true);
  for(const fetchImpl of [async()=>({ok:false,status:403}),async()=>({ok:true,status:200,json:async()=>({})})]){
    await assert.rejects(decideRefresh({...context,fetchImpl}),e=>!e.message.includes('SECRET'));
  }
  await assert.rejects(decideRefresh({...context,ref:'refs/heads/other',...api([])}));
});
test('history calls are bounded even if transport ignores abort and repository paths are validated',async()=>{
  await assert.rejects(decideRefresh({...context,timeoutMs:5,fetchImpl:async()=>new Promise(()=>{})}),/timeout/);
  for(const repository of ['../repo','owner/..','owner/repo/other'])
    await assert.rejects(decideRefresh({...context,repository,...api([])}),/configuration/);
  await assert.rejects(decideRefresh({...context,fetchImpl:async()=>({status:200,json:async()=>({workflow_runs:[run(8,'unexpected')]})})}));
});
