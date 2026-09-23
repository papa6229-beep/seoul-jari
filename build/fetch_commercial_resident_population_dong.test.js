const assert = require('assert');
const {SERVICE, normalizeRows, fetchCommercialResidentPopulationDong} = require('./fetch_commercial_resident_population_dong');

const rows = normalizeRows([{
  STDR_YYQU_CD: '20241',
  ADSTRD_CD: '11740590',
  ADSTRD_CD_NM: '암사3동',
  TOT_REPOP_CO: '17136',
  ML_REPOP_CO: '8416',
  FML_REPOP_CO: '8720',
  AGRDE_10_REPOP_CO: '3437',
  AGRDE_40_REPOP_CO: '3124',
  TOT_HSHLD_CO: '6078',
  APT_HSHLD_CO: '0',
  NON_APT_HSHLD_CO: '6078'
}]);

assert.equal(rows[0].dong_name, '암사3동');
assert.equal(rows[0].total, 17136);
assert.equal(rows[0].age_10, 3437);
assert.equal(rows[0].households, 6078);

(async () => {
  const fetched = await fetchCommercialResidentPopulationDong({
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
              ADSTRD_CD: '11470550',
              ADSTRD_CD_NM: '목5동',
              TOT_REPOP_CO: '40702',
              AGRDE_10_REPOP_CO: '10213',
              TOT_HSHLD_CO: '13447'
            }]
          }
        })
      };
    }
  });

  assert.equal(fetched.quarter, '20241');
  assert.equal(fetched.rows[0].dong_name, '목5동');
  assert.equal(fetched.rows[0].total, 40702);
  assert.equal(fetched.rows[0].households, 13447);
  console.log('fetch_commercial_resident_population_dong test ok');
})();
