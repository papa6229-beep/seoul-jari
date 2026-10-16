const assert = require('assert');
const test = require('node:test');
const daily = require('./fetch_living_population_daily');
const {SERVICE, defaultLivingPopulationDate, normalizeRows, fetchDailyGuPopulation} = require('./fetch_living_population_daily');

const rows = normalizeRows([
  {
    STDR_DE_ID: '20260918',
    SIGNGU_CODE_SE: '11000',
    SIGNGU_NM: '서울시',
    TOT_LVPOP_CO: '11517000.49032'
  },
  {
    STDR_DE_ID: '20260918',
    SIGNGU_CODE_SE: '11110',
    SIGNGU_NM: '종로구',
    TOT_LVPOP_CO: '353670.46250',
    LVPOP_CO: '328377.08083',
    LNGTR_STAY_FRGNR_CO: '15728.15375',
    SRTPD_STAY_FRGNR_CO: '9565.22791',
    DAIL_MXMM_LVPOP_CO: '539163.92000',
    DAIL_MUMM_LVPOP_CO: '198114.56000',
    DAY_LVPOP_CO: '495247.72100',
    NIGHT_LVPOP_CO: '252543.84928',
    SU_ELSE_INFLOW_LVPOP_CO: '100891.72000',
    SIGNGU_MVMN_LVPOP_CO: '258390.03000',
    LDADNG_DT: '20260922'
  }
]);

assert.equal(rows.length, 1);
assert.equal(rows[0].name, '종로구');
assert.equal(rows[0].total, 353670);
assert.equal(rows[0].daytime, 495248);
assert.equal(defaultLivingPopulationDate(new Date('2026-09-23T00:00:00+09:00')), '20260919');

(async () => {
  const fetched = await fetchDailyGuPopulation({
    key: 'KEY',
    date: '20260918',
    fetchImpl: async url => {
      assert.ok(url.includes('/' + SERVICE + '/'));
      assert.ok(url.endsWith('/20260918'));
      return {
        ok: true,
        text: async () => JSON.stringify({
          [SERVICE]: {
            list_total_count: 2,
            RESULT: {CODE: 'INFO-000', MESSAGE: '정상 처리되었습니다'},
            row: [
              {STDR_DE_ID: '20260918', SIGNGU_CODE_SE: '11000', SIGNGU_NM: '서울시'},
              {
                STDR_DE_ID: '20260918',
                SIGNGU_CODE_SE: '11140',
                SIGNGU_NM: '중구',
                TOT_LVPOP_CO: '341203.29541',
                DAY_LVPOP_CO: '493088.17700',
                NIGHT_LVPOP_CO: '232714.09428',
                LDADNG_DT: '20260922'
              }
            ]
          }
        })
      };
    }
  });

  assert.equal(fetched.date, '20260918');
  assert.equal(fetched.gu.length, 1);
  assert.equal(fetched.gu[0].name, '중구');
  assert.equal(fetched.gu[0].night, 232714);
  console.log('fetch_living_population_daily test ok');
})();

function dailyPages(payloads){
  const urls=[];
  return {urls,fetchImpl:async url=>{
    urls.push(url);assert.ok(payloads.length,'unexpected request');
    return {ok:true,text:async()=>JSON.stringify(payloads.shift())};
  }};
}
const row=(date,code='11110')=>({STDR_DE_ID:date,SIGNGU_CODE_SE:code,SIGNGU_NM:'종로구',TOT_LVPOP_CO:'12.4'});
const page=rows=>({[SERVICE]:{list_total_count:rows.length,row:rows}});
const noData={RESULT:{CODE:'INFO-200',MESSAGE:'no data'}};

test('daily validates explicit dates, every source date and date/district identity; mixed valid history selects latest only',async()=>{
  for(const date of ['20260230','bad'])await assert.rejects(fetchDailyGuPopulation({key:'KEY',date,fetchImpl:dailyPages([]).fetchImpl}));
  for(const rows of [[row('bad')],[row('20261009')],[row('20261012'),{...row('20261012'),TOT_LVPOP_CO:'14'}]]){
    const h=dailyPages([page(rows)]);await assert.rejects(fetchDailyGuPopulation({key:'KEY',date:'20261012',fetchImpl:h.fetchImpl}));
  }
  const rows=[row('20261009'),row('20261012','11000'),row('20261012'),row('20261012','11140')];
  const h=dailyPages([page(rows)]);
  const result=await fetchDailyGuPopulation({key:'KEY',fetchImpl:h.fetchImpl});
  assert.equal(result.date,'20261012');assert.equal(result.gu.length,2);
  assert.ok(result.gu.every(item=>item.date==='20261012'));assert.equal(result.gu[0].total,12);
});

test('implicit date moves back only on validated INFO-200; explicit date never rolls back',async()=>{
  const h=dailyPages([noData,page([row('20261009')])]);
  const result=await daily.fetchPublishedDailyGuPopulation({key:'KEY',now:new Date('2026-10-14T00:00:00+09:00'),fetchImpl:h.fetchImpl});
  assert.equal(result.date,'20261009');assert.equal(h.urls.length,2);
  assert.ok(h.urls[0].endsWith('/20261010'));assert.ok(h.urls[1].endsWith('/20261009'));
  const explicit=dailyPages([noData]);
  await assert.rejects(daily.fetchPublishedDailyGuPopulation({key:'KEY',date:'20261010',fetchImpl:explicit.fetchImpl}));
  assert.equal(explicit.urls.length,1);
});

test('default date search is finite and refuses server/auth/schema/empty-data failures',async()=>{
  for(const payload of [{RESULT:{CODE:'ERROR-300'}},page([]),{[SERVICE]:{list_total_count:3,row:[row('20261010')]}}]){
    const h=dailyPages([payload]);
    await assert.rejects(daily.fetchPublishedDailyGuPopulation({key:'KEY',now:new Date('2026-10-14T00:00:00+09:00'),fetchImpl:h.fetchImpl}));
    assert.equal(h.urls.length,1);
  }
  const h=dailyPages([noData,noData,noData]);
  await assert.rejects(daily.fetchPublishedDailyGuPopulation({key:'KEY',now:new Date('2026-10-14T00:00:00+09:00'),maxLookbackDays:2,fetchImpl:h.fetchImpl}));
  assert.equal(h.urls.length,3);
});

test('transient server retries stay on the same daily date, never roll back to a different date',async()=>{
  const urls=[];
  await assert.rejects(daily.fetchPublishedDailyGuPopulation({key:'KEY',now:new Date('2026-10-14T00:00:00+09:00'),
    requestOptions:{maxAttempts:2,retryDelayMs:0},fetchImpl:async url=>{
      urls.push(url);return {ok:true,text:async()=>'<RESULT><CODE>ERROR-500</CODE></RESULT>'};
    }}),error=>error.code==='ERROR-500');
  assert.equal(urls.length,2);assert.ok(urls.every(url=>url.endsWith('/20261010')));
});
