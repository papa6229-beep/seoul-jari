const assert = require('assert');
const {SERVICE, normalizeRows, fetchCommercialWorkerPopulationDong} = require('./fetch_commercial_worker_population_dong');

const rows = normalizeRows([{
  STDR_YYQU_CD: '20261',
  ADSTRD_CD: '11170580',
  ADSTRD_CD_NM: '효창동',
  TOT_WRC_POPLTN_CO: '1419',
  ML_WRC_POPLTN_CO: '829',
  FML_WRC_POPLTN_CO: '590',
  AGRDE_20_WRC_POPLTN_CO: '195',
  AGRDE_30_WRC_POPLTN_CO: '372',
  AGRDE_40_WRC_POPLTN_CO: '395',
  MAG_30_WRC_POPLTN_CO: '220',
  FAG_30_WRC_POPLTN_CO: '152'
}]);

assert.equal(rows[0].dong_name, '효창동');
assert.equal(rows[0].total, 1419);
assert.equal(rows[0].age_30, 372);
assert.equal(rows[0].male_age_30, 220);
assert.equal(rows[0].female_age_30, 152);

(async () => {
  const fetched = await fetchCommercialWorkerPopulationDong({
    key: 'KEY',
    quarter: '20261',
    fetchImpl: async url => {
      assert.ok(url.includes('/' + SERVICE + '/'));
      assert.ok(url.endsWith('/20261'));
      return {
        ok: true,
        text: async () => JSON.stringify({
          [SERVICE]: {
            list_total_count: 1,
            RESULT: {CODE: 'INFO-000', MESSAGE: '정상 처리되었습니다'},
            row: [{
              STDR_YYQU_CD: '20261',
              ADSTRD_CD: '11200590',
              ADSTRD_CD_NM: '금호1가동',
              TOT_WRC_POPLTN_CO: '1732',
              FML_WRC_POPLTN_CO: '1099',
              AGRDE_40_WRC_POPLTN_CO: '709'
            }]
          }
        })
      };
    }
  });

  assert.equal(fetched.quarter, '20261');
  assert.equal(fetched.rows[0].dong_name, '금호1가동');
  assert.equal(fetched.rows[0].female, 1099);
  assert.equal(fetched.rows[0].age_40, 709);
  console.log('fetch_commercial_worker_population_dong test ok');
})();
