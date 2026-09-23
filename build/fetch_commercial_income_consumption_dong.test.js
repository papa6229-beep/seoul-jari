const assert = require('assert');
const {SERVICE, normalizeRows, fetchCommercialIncomeConsumptionDong} = require('./fetch_commercial_income_consumption_dong');

const rows = normalizeRows([{
  STDR_YYQU_CD: '20262',
  ADSTRD_CD: '11710720',
  ADSTRD_CD_NM: '잠실7동',
  EXPNDTR_TOTAMT: '468190000',
  FDSTFFS_EXPNDTR_TOTAMT: '177943000',
  EDC_EXPNDTR_TOTAMT: '23104000',
  LSR_CLTUR_EXPNDTR_TOTAMT: '113248000',
  FD_EXPNDTR_TOTAMT: '78107000'
}]);

assert.equal(rows[0].dong_name, '잠실7동');
assert.equal(rows[0].total_spending, 468190000);
assert.equal(rows[0].education_spending, 23104000);
assert.equal(rows[0].food_spending, 78107000);

(async () => {
  const fetched = await fetchCommercialIncomeConsumptionDong({
    key: 'KEY',
    quarter: '20262',
    fetchImpl: async url => {
      assert.ok(url.includes('/' + SERVICE + '/'));
      assert.ok(url.endsWith('/20262'));
      return {
        ok: true,
        text: async () => JSON.stringify({
          [SERVICE]: {
            list_total_count: 1,
            RESULT: {CODE: 'INFO-000', MESSAGE: '정상 처리되었습니다'},
            row: [{
              STDR_YYQU_CD: '20262',
              ADSTRD_CD: '11590530',
              ADSTRD_CD_NM: '상도1동',
              EXPNDTR_TOTAMT: '8506938000',
              FD_EXPNDTR_TOTAMT: '2736815000'
            }]
          }
        })
      };
    }
  });

  assert.equal(fetched.quarter, '20262');
  assert.equal(fetched.rows[0].dong_name, '상도1동');
  assert.equal(fetched.rows[0].total_spending, 8506938000);
  assert.equal(fetched.rows[0].food_spending, 2736815000);
  console.log('fetch_commercial_income_consumption_dong test ok');
})();
