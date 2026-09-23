const assert = require('assert');
const {SERVICE, normalizeRows, fetchCommercialStoresDong} = require('./fetch_commercial_stores_dong');

const rows = normalizeRows([{
  STDR_YYQU_CD: '20241',
  ADSTRD_CD: '11110515',
  ADSTRD_CD_NM: '청운효자동',
  SVC_INDUTY_CD: 'CS100003',
  SVC_INDUTY_CD_NM: '일식음식점',
  SIMILR_INDUTY_STOR_CO: '19',
  STOR_CO: '18',
  FRC_STOR_CO: '1',
  OPBIZ_RT: '11',
  OPBIZ_STOR_CO: '2',
  CLSBIZ_RT: '11',
  CLSBIZ_STOR_CO: '2'
}]);

assert.equal(rows[0].dong_name, '청운효자동');
assert.equal(rows[0].business_name, '일식음식점');
assert.equal(rows[0].similar_store_count, 19);
assert.equal(rows[0].franchise_store_count, 1);
assert.equal(rows[0].close_rate, 11);

(async () => {
  const fetched = await fetchCommercialStoresDong({
    key: 'KEY',
    quarter: '20241',
    fetchImpl: async url => {
      assert.ok(url.includes('/' + SERVICE + '/'));
      assert.ok(url.endsWith('/20241'));
      return {
        ok: true,
        text: async () => JSON.stringify({
          [SERVICE]: {
            list_total_count: 1,
            RESULT: {CODE: 'INFO-000', MESSAGE: '정상 처리되었습니다'},
            row: [{
              STDR_YYQU_CD: '20241',
              ADSTRD_CD: '11110515',
              ADSTRD_CD_NM: '청운효자동',
              SVC_INDUTY_CD: 'CS200005',
              SVC_INDUTY_CD_NM: '스포츠 강습',
              STOR_CO: '17'
            }]
          }
        })
      };
    }
  });

  assert.equal(fetched.quarter, '20241');
  assert.equal(fetched.rows[0].business_name, '스포츠 강습');
  assert.equal(fetched.rows[0].store_count, 17);
  console.log('fetch_commercial_stores_dong test ok');
})();
