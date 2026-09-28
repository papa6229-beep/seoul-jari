const assert = require('assert');
const {normalizeRows, configs} = require('./fetch_commercial_regional_stores');

assert.equal(configs.signgu.service, 'VwsmSignguStorW');
assert.equal(configs.mega.service, 'VwsmMegaStorW');
assert.equal(configs.trdar.service, 'VwsmTrdarStorQq');
assert.equal(configs.trdhl.service, 'VwsmTrdhlStorQq');

assert.deepStrictEqual(normalizeRows([{
  STDR_YYQU_CD: '20262',
  SIGNGU_CD: '11740',
  SIGNGU_CD_NM: '강동구',
  SVC_INDUTY_CD: 'CS300043',
  SVC_INDUTY_CD_NM: '전자상거래업',
  SIMILR_INDUTY_STOR_CO: '749.0',
  STOR_CO: '749.0',
  FRC_STOR_CO: '0.0',
  OPBIZ_STOR_CO: '0.0',
  CLSBIZ_STOR_CO: '30.0'
}], configs.signgu), [{
  quarter: '20262',
  area_code: '11740',
  area_name: '강동구',
  area_type: 'signgu',
  business_code: 'CS300043',
  business_name: '전자상거래업',
  similar_store_count: 749,
  store_count: 749,
  franchise_store_count: 0,
  open_store_count: 0,
  close_store_count: 30
}]);

assert.deepStrictEqual(normalizeRows([{
  STDR_YYQU_CD: '20241',
  TRDAR_SE_CD: 'U',
  TRDAR_SE_CD_NM: '관광특구',
  TRDAR_CD: '3001491',
  TRDAR_CD_NM: '이태원 관광특구',
  SVC_INDUTY_CD: 'CS100001',
  SVC_INDUTY_CD_NM: '한식음식점',
  SIMILR_INDUTY_STOR_CO: '134',
  STOR_CO: '122',
  FRC_STOR_CO: '12',
  OPBIZ_STOR_CO: '10',
  CLSBIZ_STOR_CO: '4'
}], configs.trdar), [{
  quarter: '20241',
  area_code: '3001491',
  area_name: '이태원 관광특구',
  area_type: 'trdar',
  market_type_code: 'U',
  market_type_name: '관광특구',
  business_code: 'CS100001',
  business_name: '한식음식점',
  similar_store_count: 134,
  store_count: 122,
  franchise_store_count: 12,
  open_store_count: 10,
  close_store_count: 4
}]);

console.log('fetch_commercial_regional_stores test ok');
