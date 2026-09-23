const assert = require('assert');
const {SERVICE, normalizeRows, latestOnly, fetchCommercialFloatingPopulation} = require('./fetch_commercial_floating_population');

const rows = normalizeRows([
  {
    STDR_YYQU_CD: '20244',
    ADSTRD_CD: '11500604',
    ADSTRD_CD_NM: '가양2동',
    TOT_FLPOP_CO: '100'
  },
  {
    STDR_YYQU_CD: '20251',
    ADSTRD_CD: '11500604',
    ADSTRD_CD_NM: '가양2동',
    TOT_FLPOP_CO: '2113025',
    ML_FLPOP_CO: '964253',
    FML_FLPOP_CO: '1148772',
    AGRDE_10_FLPOP_CO: '181836',
    AGRDE_20_FLPOP_CO: '209924',
    AGRDE_30_FLPOP_CO: '378585',
    AGRDE_40_FLPOP_CO: '296039',
    AGRDE_50_FLPOP_CO: '267557',
    AGRDE_60_ABOVE_FLPOP_CO: '779085',
    TMZON_11_14_FLPOP_CO: '251175',
    TMZON_17_21_FLPOP_CO: '352949',
    SAT_FLPOP_CO: '301305',
    SUN_FLPOP_CO: '304463'
  }
]);

assert.equal(rows.length, 2);
assert.equal(rows[0].quarter, '20251');
assert.equal(rows[0].dong_name, '가양2동');
assert.equal(rows[0].gu_code, '11500');
assert.equal(rows[0].total, 2113025);
assert.equal(rows[0].t_11_14, 251175);
assert.equal(latestOnly(rows).length, 1);

(async () => {
  const fetched = await fetchCommercialFloatingPopulation({
    key: 'KEY',
    quarter: '20251',
    fetchImpl: async url => {
      assert.ok(url.includes('/' + SERVICE + '/'));
      assert.ok(url.endsWith('/20251'));
      return {
        ok: true,
        text: async () => JSON.stringify({
          [SERVICE]: {
            list_total_count: 1,
            RESULT: {CODE: 'INFO-000', MESSAGE: '정상 처리되었습니다'},
            row: [
              {
                STDR_YYQU_CD: '20251',
                ADSTRD_CD: '11500605',
                ADSTRD_CD_NM: '가양3동',
                TOT_FLPOP_CO: '1867782',
                TMZON_17_21_FLPOP_CO: '250823'
              }
            ]
          }
        })
      };
    }
  });

  assert.equal(fetched.quarter, '20251');
  assert.equal(fetched.dong.length, 1);
  assert.equal(fetched.dong[0].dong_name, '가양3동');
  assert.equal(fetched.dong[0].t_17_21, 250823);
  console.log('fetch_commercial_floating_population test ok');
})();
