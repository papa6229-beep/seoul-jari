const assert = require('assert');
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
