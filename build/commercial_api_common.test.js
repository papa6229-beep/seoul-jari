const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {fetchPagedRows,writeJson}=require('./commercial_api_common');
function pages(payloads,extra={}){
  let calls=0;return {calls:()=>calls,run:()=>fetchPagedRows({key:'KEY',service:'Test',pageSize:2,fetchImpl:async()=>{
    const payload=payloads[calls++];assert.ok(payload,'unexpected page');return {ok:true,text:async()=>JSON.stringify(payload)};
  },...extra})};
}
const page=(total,row)=>({Test:{list_total_count:total,row}});

test('only the explicit floating history service filters a complete history to the requested quarter',async()=>{
  const service='VwsmAdstrdFlpopW';
  const history=[{STDR_YYQU_CD:'20251',id:1},{STDR_YYQU_CD:'20262',id:2},{STDR_YYQU_CD:'20262',id:3}];
  const run=quarter=>fetchPagedRows({key:'KEY',service,quarter,pageSize:2,fetchImpl:async url=>({ok:true,text:async()=>JSON.stringify({[service]:{list_total_count:3,row:url.includes('/1/2/')?history.slice(0,2):history.slice(2)}})})});
  const result=await run('20262');assert.equal(result.total,3);assert.deepEqual(result.rows,history.slice(1));
  await assert.rejects(run('20263'),/quarter|분기/i);
  await assert.rejects(pages([page(1,[{STDR_YYQU_CD:'20251'}])],{quarter:'20262'}).run());
});

test('shared daily paging validates real requested dates and caps resolver history reads',async()=>{
  for(const date of ['20260230','20261301','bad'])await assert.rejects(pages([],{date}).run());
  await assert.rejects(pages([page(1,[{STDR_DE_ID:'20261009'}])],{date:'20261010'}).run());
  assert.equal((await pages([page(1,[{STDR_DE_ID:'20261012'}])],{date:'20261012'}).run()).rows.length,1);
  const capped=pages([page(3,[{a:1},{a:2}])],{maxPages:1});
  await assert.rejects(capped.run(),/limit|pages/i);assert.equal(capped.calls(),1);
});
test('complete final pages, zero results and numeric count strings are accepted',async()=>{
  const h=pages([page('3',[{a:1},{a:2}]),page(3,[{a:3}])]);assert.deepEqual(await h.run(),{total:3,rows:[{a:1},{a:2},{a:3}]});assert.equal(h.calls(),2);
  assert.deepEqual(await pages([page(0,[])]).run(),{total:0,rows:[]});
});
test('root errors and malformed counts/rows cannot become total zero',async()=>{
  await assert.rejects(pages([{RESULT:{CODE:'ERROR-300',MESSAGE:'test'}}]).run());
  for(const total of [undefined,null,'',false,-1,1.5,'2x',{},'Infinity'])await assert.rejects(pages([page(total,[])]).run());
  for(const row of [undefined,null,{},'bad',[null],['bad']])await assert.rejects(pages([page(1,row)]).run());
});
test('truncated, early-empty, overflowing and changing-count pages reject',async()=>{
  for(const payloads of [[page(3,[{a:1}])],[page(3,[])],[page(0,[{a:1}])],[page(1,[{a:1},{a:2}])],
    [page(3,[{a:1},{a:2}]),page(3,[])],[page(3,[{a:1},{a:2}]),page(4,[{a:3},{a:4}])],
    [{Test:{list_total_count:1,RESULT:{CODE:'INFO-200'},row:[{a:1}]}}]])await assert.rejects(pages(payloads).run());
});
test('invalid pagination inputs reject before fetch; requested quarters must match every row',async()=>{
  for(const pageSize of [0,-1,1.5,Infinity,1001])await assert.rejects(pages([],{pageSize}).run());
  for(const quarter of ['20260','20265','bad','00001'])await assert.rejects(pages([],{quarter}).run());
  for(const row of [{},{STDR_YYQU_CD:'20261'},{STDR_YYQU_CD:'2026Q2'}])await assert.rejects(pages([page(1,[row])],{quarter:'20262'}).run());
  assert.equal((await pages([page(1,[{STDR_YYQU_CD:'20262'}])],{quarter:'20262'}).run()).rows.length,1);
});
test('repeated pages reject regardless of property order; explicit identities reject duplicates without a universal key',async()=>{
  await assert.rejects(pages([page(4,[{a:1,b:2},{a:3}]),page(4,[{a:3},{b:2,a:1}])]).run());
  await assert.rejects(pages([page(2,[{a:1,b:2},{b:2,a:1}])]).run());
  await assert.rejects(pages([page(2,[{id:'a',value:1},{id:'a',value:2}])],{rowIdentity:row=>row.id}).run());
  await assert.rejects(pages([page(3,[{id:'a'},{id:'b'}]),page(3,[{id:'a',value:2}])],{rowIdentity:row=>row.id}).run());
  assert.equal((await pages([page(2,[{district:'a',business:'x'},{district:'a',business:'y'}])]).run()).rows.length,2);
});
test('atomic write retains old bytes on write/sync/rename failure and cleans only its own temp',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'commercial-write-')),target=path.join(dir,'data.json'),other=path.join(dir,'other.tmp');
  try{
    fs.writeFileSync(target,'OLD');fs.writeFileSync(other,'OTHER');
    for(const method of ['writeFileSync','fsyncSync','renameSync']){
      const fsImpl=Object.create(fs);fsImpl[method]=()=>{throw Error(method);};
      assert.throws(()=>writeJson(target,{new:true},{fsImpl}),new RegExp(method));
      assert.equal(fs.readFileSync(target,'utf8'),'OLD');assert.deepEqual(fs.readdirSync(dir).sort(),['data.json','other.tmp']);
    }
    const circular={};circular.self=circular;assert.throws(()=>writeJson(target,circular));assert.equal(fs.readFileSync(target,'utf8'),'OLD');
    writeJson(target,{new:true});assert.deepEqual(JSON.parse(fs.readFileSync(target,'utf8')),{new:true});assert.equal(fs.readFileSync(other,'utf8'),'OTHER');
    assert.deepEqual(fs.readdirSync(dir).sort(),['data.json','other.tmp']);
  }finally{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}
});
