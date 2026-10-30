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
test('only accepted main data commits request the existing Pages deployment',()=>{
  for(const name of ['update-living-population','update-store-data']){
    const text=read(name);
    assert.match(text,/permissions:[\s\S]*pages: write/);
    const commit=text.split('      - name: ').find(x=>x.startsWith('Commit updated data'));
    assert.match(commit,/id: commit/);
    const step=text.split('      - name: ').find(x=>x.startsWith('Refresh existing GitHub Pages'));
    assert.ok(step);
    assert.match(step,/github\.ref == 'refs\/heads\/main'/);
    assert.match(step,/steps\.commit\.outputs\.changes_detected == 'true'/);
    assert.match(step,/EXPECTED_DATA_COMMIT: \$\{\{ steps\.commit\.outputs\.commit_hash \}\}/);
    assert.match(step,/GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
    assert.match(step,/node build\/refresh_existing_pages\.js/);
    assert.ok(text.indexOf('Refresh existing GitHub Pages')>text.indexOf('Guard final data before commit'));
  }
});
test('weekly refresh is preserved and catch-up cannot run collection after a healthy publication',()=>{
  const text=read('update-living-population');
  assert.match(text,/cron: '30 21 \* \* 2'/);
  assert.match(text,/cron: '30 21 \* \* 0,1,3,4,5,6'/);
  assert.match(text,/actions: read/);
  assert.match(text,/node build\/decide_refresh_run\.js/);
  assert.match(text,/SCHEDULE: \$\{\{ github\.event\.schedule \}\}/);
  for(const title of ['Test refresh scripts','Resolve published quarter','Fetch living population','Guard final data before commit','Commit updated data']){
    const step=text.split('      - name: ').find(x=>x.startsWith(title+'\n')||x.startsWith(title+'\r\n'));
    assert.match(step,/steps\.refresh\.outputs\.run == 'true'/,title);
  }
});
