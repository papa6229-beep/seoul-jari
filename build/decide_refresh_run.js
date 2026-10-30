#!/usr/bin/env node
const WEEKLY='30 21 * * 2';
const CATCH_UP='30 21 * * 0,1,3,4,5,6';

async function decideRefresh({eventName,schedule,repository,ref,token,fetchImpl=fetch,timeoutMs=20000}){
  if(eventName==='workflow_dispatch')return {run:true,reason:'manual'};
  if(eventName!=='schedule'||![WEEKLY,CATCH_UP].includes(schedule)||ref!=='refs/heads/main')throw Error('Invalid refresh trigger');
  if(schedule===WEEKLY)return {run:true,reason:'weekly'};
  if(typeof repository!=='string'||! /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9._-]{1,100}$/.test(repository)||
    ['.','..'].includes(repository.split('/')[1])||
    typeof token!=='string'||!token||/[\r\n]/.test(token)||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>20000)
    throw Error('Invalid refresh history configuration');
  const base='https://api.github.com/repos/'+repository;
  async function read(suffix){
    const controller=new AbortController();let timer;
    try{
      return await Promise.race([(async()=>{
        let response;
        try{response=await fetchImpl(base+suffix,{redirect:'error',signal:controller.signal,
          headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','User-Agent':'SeoulJari-Recovery','X-GitHub-Api-Version':'2022-11-28'}});}
        catch{throw Error('Refresh history connection failed');}
        if(response.status!==200)throw Error('Refresh history HTTP '+(Number.isInteger(response.status)?response.status:'invalid'));
        try{return await response.json();}catch{throw Error('Invalid refresh history JSON');}
      })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Refresh history timeout'));},timeoutMs);})]);
    }finally{clearTimeout(timer);controller.abort();}
  }
  const data=await read('/actions/workflows/update-living-population.yml/runs?branch=main&status=completed&per_page=10');
  if(!Array.isArray(data?.workflow_runs)||data.workflow_runs.length>10)throw Error('Invalid refresh history');
  for(const previous of data.workflow_runs){
    if(!Number.isSafeInteger(previous?.id)||previous.id<1||previous.head_branch!=='main'||
      !['schedule','workflow_dispatch'].includes(previous.event))throw Error('Invalid refresh run metadata');
    if(['failure','timed_out','cancelled','action_required','startup_failure'].includes(previous.conclusion))
      return {run:true,reason:'recover_failure',previousRun:previous.id};
    if(previous.conclusion!=='success'){
      if(['skipped','neutral','stale'].includes(previous.conclusion))continue;
      throw Error('Invalid refresh conclusion');
    }
    const result=await read('/actions/runs/'+previous.id+'/jobs');
    if(!Array.isArray(result?.jobs)||!result.jobs.length||result.jobs.some(job=>!Array.isArray(job.steps)))
      throw Error('Invalid refresh job metadata');
    // A green verify-only or skipped catch-up has not published a validated refresh.
    if(result.jobs.some(job=>job.steps.some(step=>step.name==='Commit updated data'&&step.conclusion==='success')))
      return {run:false,reason:'already_refreshed',previousRun:previous.id};
  }
  return {run:true,reason:'no_confirmed_publication'};
}

async function main(env=process.env){
  const decision=await decideRefresh({eventName:env.GITHUB_EVENT_NAME,schedule:env.SCHEDULE,
    repository:env.GITHUB_REPOSITORY,ref:env.GITHUB_REF,token:env.GITHUB_TOKEN});
  console.log('run='+decision.run+'\nreason='+decision.reason);
  if(decision.previousRun)console.log('previous_run='+decision.previousRun);
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={decideRefresh};
