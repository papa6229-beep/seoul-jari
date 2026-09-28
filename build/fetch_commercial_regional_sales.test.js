const assert = require('assert');
const {normalizeRows, configs} = require('./fetch_commercial_regional_sales');

assert.equal(configs.signgu.service, 'VwsmSignguSelngW');
assert.equal(configs.mega.service, 'VwsmMegaSelngW');
assert.equal(configs.trdar.service, 'VwsmTrdarSelngQq');
assert.equal(configs.trdhl.service, 'VwsmTrdhlSelngQq');

assert.deepStrictEqual(normalizeRows([{
  STDR_YYQU_CD: '20262',
  SIGNGU_CD: '11740',
  SIGNGU_CD_NM: '강동구',
  SVC_INDUTY_CD: 'CS100001',
  SVC_INDUTY_CD_NM: '한식음식점',
  THSMON_SELNG_AMT: '300000000',
  THSMON_SELNG_CO: '15000'
}], configs.signgu), [{
  quarter: '20262',
  area_code: '11740',
  area_name: '강동구',
  area_type: 'signgu',
  business_code: 'CS100001',
  business_name: '한식음식점',
  amount: 300000000,
  count: 15000,
  customer_unit_price: 20000
}]);

assert.deepStrictEqual(normalizeRows([{
  STDR_YYQU_CD: '20241',
  TRDAR_SE_CD: 'U',
  TRDAR_SE_CD_NM: '관광특구',
  TRDAR_CD: '3001491',
  TRDAR_CD_NM: '이태원 관광특구',
  SVC_INDUTY_CD: 'CS100005',
  SVC_INDUTY_CD_NM: '제과점',
  THSMON_SELNG_AMT: '90000000',
  THSMON_SELNG_CO: '3000'
}], configs.trdar), [{
  quarter: '20241',
  area_code: '3001491',
  area_name: '이태원 관광특구',
  area_type: 'trdar',
  market_type_code: 'U',
  market_type_name: '관광특구',
  business_code: 'CS100005',
  business_name: '제과점',
  amount: 90000000,
  count: 3000,
  customer_unit_price: 30000
}]);

console.log('fetch_commercial_regional_sales test ok');
