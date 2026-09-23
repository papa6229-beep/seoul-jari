const assert = require('assert');
const {parseCsvLine, parseAdminDongCsv} = require('./prep_admin_dong_codes');

assert.deepEqual(parseCsvLine('"서울특별시","종로구","청운효자동"'), ['서울특별시', '종로구', '청운효자동']);

const rows = parseAdminDongCsv([
  '\uFEFFSIDO_NM,SGG_NM,ADMI_NM,ADMI_CD,FULL_NM,BASE_YM',
  '서울특별시,종로구,청운효자동,11110515,서울특별시 종로구 청운효자동,202608',
  '부산광역시,중구,중앙동,26110510,부산광역시 중구 중앙동,202608'
].join('\n'));

assert.equal(rows.length, 1);
assert.equal(rows[0].code, '11110515');
assert.equal(rows[0].gu, '종로구');
assert.equal(rows[0].name, '청운효자동');
console.log('prep_admin_dong_codes test ok');
