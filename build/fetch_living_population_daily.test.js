const assert = require('assert');
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
