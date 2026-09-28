const assert = require('assert');
const {SERVICE, normalizeRows, fetchCommercialChangeIndexDong} = require('./fetch_commercial_change_index_dong');

const rows = normalizeRows([{
  STDR_YYQU_CD: '20243',
  ADSTRD_CD: '11110640',
  ADSTRD_CD_NM: '이화동',
  TRDAR_CHNGE_IX: 'LH',
  TRDAR_CHNGE_IX_NM: '상권확장',
  OPR_SALE_MT_AVRG: '99',
  CLS_SALE_MT_AVRG: '56',
  SU_OPR_SALE_MT_AVRG: '107',
  SU_CLS_SALE_MT_AVRG: '52'
}]);

assert.equal(rows[0].dong_name, '이화동');
assert.equal(rows[0].change_name, '상권확장');
assert.equal(rows[0].operation_months_avg, 99);
assert.equal(rows[0].seoul_close_months_avg, 52);

(async () => {
  const fetched = await fetchCommercialChangeIndexDong({
    key: 'KEY',
    quarter: '20243',
    fetchImpl: async url => {
      assert.ok(url.includes('/' + SERVICE + '/'));
      assert.ok(url.endsWith('/20243'));
      return {
        ok: true,
        text: async () => JSON.stringify({
          [SERVICE]: {
            list_total_count: 1,
            RESULT: {CODE: 'INFO-000', MESSAGE: '정상 처리되었습니다'},
            row: [{
              STDR_YYQU_CD: '20243',
              ADSTRD_CD: '11110630',
              ADSTRD_CD_NM: '종로5·6가동',
              TRDAR_CHNGE_IX: 'HH',
              TRDAR_CHNGE_IX_NM: '정체',
              OPR_SALE_MT_AVRG: '140',
              CLS_SALE_MT_AVRG: '66'
            }]
          }
        })
      };
    }
  });

  assert.equal(fetched.quarter, '20243');
  assert.equal(fetched.rows[0].change_name, '정체');
  console.log('fetch_commercial_change_index_dong test ok');
})();
