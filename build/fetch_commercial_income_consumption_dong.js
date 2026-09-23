#!/usr/bin/env node
/*
  서울시 상권분석서비스 행정동 소득소비를 수집한다.

  출력:
    web/data/commercial-income-consumption-dong.json
*/
const path = require('path');
const {ROOT, getArg, getKey, normalizeNumber, latestOnly, fetchPagedRows, writeJson} = require('./commercial_api_common');

const SERVICE = 'VwsmAdstrdNcmCnsmpW';
const DEFAULT_OUT = path.join(ROOT, 'web', 'data', 'commercial-income-consumption-dong.json');

function normalizeRows(rows){
  return rows.map(row => ({
    quarter: row.STDR_YYQU_CD,
    dong_code: row.ADSTRD_CD,
    dong_name: row.ADSTRD_CD_NM,
    gu_code: String(row.ADSTRD_CD || '').slice(0, 5),
    total_spending: normalizeNumber(row.EXPNDTR_TOTAMT),
    grocery_spending: normalizeNumber(row.FDSTFFS_EXPNDTR_TOTAMT),
    clothing_footwear_spending: normalizeNumber(row.CLTHS_FTWR_EXPNDTR_TOTAMT),
    household_goods_spending: normalizeNumber(row.LVSPL_EXPNDTR_TOTAMT),
    medical_spending: normalizeNumber(row.MCP_EXPNDTR_TOTAMT),
    transport_spending: normalizeNumber(row.TRNSPORT_EXPNDTR_TOTAMT),
    education_spending: normalizeNumber(row.EDC_EXPNDTR_TOTAMT),
    pleasure_spending: normalizeNumber(row.PLESR_EXPNDTR_TOTAMT),
    leisure_culture_spending: normalizeNumber(row.LSR_CLTUR_EXPNDTR_TOTAMT),
    other_spending: normalizeNumber(row.ETC_EXPNDTR_TOTAMT),
    food_spending: normalizeNumber(row.FD_EXPNDTR_TOTAMT)
  })).sort((a, b) => {
    const q = String(b.quarter || '').localeCompare(String(a.quarter || ''));
    return q || String(a.dong_code || '').localeCompare(String(b.dong_code || ''));
  });
}

async function fetchCommercialIncomeConsumptionDong({key, quarter = '', pageSize = 1000, fetchImpl = fetch}){
  const fetched = await fetchPagedRows({key, service: SERVICE, quarter, pageSize, fetchImpl});
  const normalized = normalizeRows(fetched.rows);
  const rows = quarter ? normalized : latestOnly(normalized);
  return {
    title: '서울시 상권분석서비스 행정동 소득소비',
    source: '서울 열린데이터광장 VwsmAdstrdNcmCnsmpW',
    service: SERVICE,
    requested_quarter: quarter || null,
    quarter: rows[0] ? rows[0].quarter : null,
    total_count: fetched.total,
    rows
  };
}

async function main(){
  const quarter = getArg('quarter', '');
  const out = path.resolve(getArg('out', DEFAULT_OUT));
  const summary = await fetchCommercialIncomeConsumptionDong({key: getKey(), quarter});
  writeJson(out, summary);
  console.log(`저장: ${path.relative(ROOT, out)}  기준분기=${summary.quarter || '-'}  ${summary.rows.length.toLocaleString('ko-KR')}행`);
}

if (require.main === module){
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {SERVICE, normalizeRows, fetchCommercialIncomeConsumptionDong};
