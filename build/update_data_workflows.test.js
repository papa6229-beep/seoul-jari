const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.resolve(__dirname,'../.github/workflows/'+name+'.yml'),'utf8');
test('both update jobs resolve published quarters and run final gates after derivatives',()=>{
  for(const name of ['update-living-population','update-store-data']){
    const text=read(name);
    assert.match(text,/resolve_commercial_quarter\.js/);
    assert.match(text,/SELECTED_QUARTER/);
    assert.ok(text.indexOf('node build/validate_operational_snapshot.js')>text.indexOf('python3 build/prep_dates.py'));
    assert.match(text,/node build\/validate_data_refresh\.js/);
    for(const helper of ['prep_commercial_search','prep_store_points'])assert.match(text,new RegExp('node build/'+helper+'\\.js'));
    assert.match(text,/verify_only:[\s\S]*type: boolean/);
    assert.match(text,/inputs\.verify_only != true/);
    assert.match(text,/group: seoul-jari-data-\$\{\{ github\.ref \}\}/);
    assert.match(text,/cancel-in-progress: false/);
    assert.doesNotMatch(text,/curl .*serviceKey|curl .*openapi/);
  }
});
test('limited store runs cannot mutate or commit canonical files',()=>{
  const text=read('update-store-data');
  assert.match(text,/Fetch limited store sample[\s\S]*--out=\$RUNNER_TEMP\/seoul-jari-store-sample\.json/);
  for(const title of ['Resolve published quarter','Fetch store data','Guard final data before commit','Commit updated data']){
    const step=text.split('      - name: ').find(x=>x.startsWith(title+'\n')||x.startsWith(title+'\r\n'));
    assert.ok(step,title);assert.match(step,/inputs\.limit_gu == '' && inputs\.max_pages == ''/,title);
  }
});
