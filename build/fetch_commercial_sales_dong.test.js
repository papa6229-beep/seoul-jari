const assert = require('assert');
const {SERVICE, normalizeRows, unitPrice, fetchCommercialSalesDong} = require('./fetch_commercial_sales_dong');

const rows = normalizeRows([{
  STDR_YYQU_CD: '20211',
  ADSTRD_CD: '11710720',
  ADSTRD_CD_NM: '잠실7동',
  SVC_INDUTY_CD: 'CS100001',
  SVC_INDUTY_CD_NM: '한식음식점',
  THSMON_SELNG_AMT: '23947025',
  THSMON_SELNG_CO: '1574',
  TMZON_11_14_SELNG_AMT: '17664188',
  TMZON_17_21_SELNG_AMT: '2645537',
  AGRDE_40_SELNG_AMT: '5535015'
}]);

assert.equal(rows[0].dong_name, '잠실7동');
assert.equal(rows[0].business_name, '한식음식점');
assert.equal(rows[0].amount, 23947025);
assert.equal(rows[0].lunch_amount, 17664188);
assert.equal(unitPrice('23947025', '1574'), 15214);

(async () => {
  const fetched = await fetchCommercialSalesDong({
    key: 'KEY',
    quarter: '20211',
    fetchImpl: async url => {
      assert.ok(url.includes('/' + SERVICE + '/'));
      assert.ok(url.endsWith('/20211'));
      return {
        ok: true,
        text: async () => JSON.stringify({
          [SERVICE]: {
            list_total_count: 1,
            RESULT: {CODE: 'INFO-000', MESSAGE: '정상 처리되었습니다'},
            row: [{
              STDR_YYQU_CD: '20211',
              ADSTRD_CD: '11710720',
              ADSTRD_CD_NM: '잠실7동',
              SVC_INDUTY_CD: 'CS100010',
              SVC_INDUTY_CD_NM: '커피-음료',
              THSMON_SELNG_AMT: '503135509',
              THSMON_SELNG_CO: '51551'
            }]
          }
        })
      };
    }
  });

  assert.equal(fetched.quarter, '20211');
  assert.equal(fetched.rows[0].business_name, '커피-음료');
  assert.equal(fetched.rows[0].customer_unit_price, 9760);
  console.log('fetch_commercial_sales_dong test ok');
})();
