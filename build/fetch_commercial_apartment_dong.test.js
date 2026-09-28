const assert = require('assert');
const {SERVICE, normalizeRows, fetchCommercialApartmentDong} = require('./fetch_commercial_apartment_dong');

const rows = normalizeRows([{
  STDR_YYQU_CD: '20262',
  ADSTRD_CD: '11110530',
  ADSTRD_CD_NM: '사직동',
  APT_HSMP_CO: '89',
  AE_66_SQMT_BELO_HSHLD_CO: '309',
  AE_132_SQMT_HSHLD_CO: '81',
  PC_6_HDMIL_ABOVE_HSHLD_CO: '138',
  AVRG_AE: '73',
  AVRG_MKTC: '371237211'
}]);

assert.equal(rows[0].apartment_complexes, 89);
assert.equal(rows[0].small_households, 309);
assert.equal(rows[0].large_households, 81);
assert.equal(rows[0].high_price_households, 138);
assert.equal(rows[0].average_market_price, 371237211);

(async () => {
  const fetched = await fetchCommercialApartmentDong({
    key: 'KEY',
    quarter: '20262',
    fetchImpl: async url => {
      assert.ok(url.includes('/' + SERVICE + '/'));
      return {
        ok: true,
        text: async () => JSON.stringify({
          [SERVICE]: {
            list_total_count: 1,
            RESULT: {CODE: 'INFO-000', MESSAGE: '정상 처리되었습니다'},
            row: [{STDR_YYQU_CD: '20262', ADSTRD_CD: '11110550', ADSTRD_CD_NM: '부암동', APT_HSMP_CO: '189'}]
          }
        })
      };
    }
  });

  assert.equal(fetched.rows[0].dong_name, '부암동');
  console.log('fetch_commercial_apartment_dong test ok');
})();
