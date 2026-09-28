#!/usr/bin/env node
/*
  서울시 상권분석서비스 행정동 아파트를 수집한다.

  출력:
    web/data/commercial-apartment-dong.json
*/
const path = require('path');
const {ROOT, getArg, getKey, normalizeNumber, latestOnly, latestClosedQuarter, fetchPagedRows, writeJson} = require('./commercial_api_common');

const SERVICE = 'VwsmAdstrdAptW';
const DEFAULT_OUT = path.join(ROOT, 'web', 'data', 'commercial-apartment-dong.json');

function normalizeRows(rows){
  return rows.map(row => ({
    quarter: row.STDR_YYQU_CD,
    dong_code: row.ADSTRD_CD,
    dong_name: row.ADSTRD_CD_NM,
    gu_code: String(row.ADSTRD_CD || '').slice(0, 5),
    apartment_complexes: normalizeNumber(row.APT_HSMP_CO),
    small_households: normalizeNumber(row.AE_66_SQMT_BELO_HSHLD_CO),
    area_66_households: normalizeNumber(row.AE_66_SQMT_HSHLD_CO),
    area_99_households: normalizeNumber(row.AE_99_SQMT_HSHLD_CO),
    large_households: normalizeNumber(row.AE_132_SQMT_HSHLD_CO),
    extra_large_households: normalizeNumber(row.AE_165_SQMT_HSHLD_CO),
    low_price_households: normalizeNumber(row.PC_1_HDMIL_BELO_HSHLD_CO),
    mid_price_households: (normalizeNumber(row.PC_2_HDMIL_HSHLD_CO) || 0) + (normalizeNumber(row.PC_3_HDMIL_HSHLD_CO) || 0),
    high_price_households: normalizeNumber(row.PC_6_HDMIL_ABOVE_HSHLD_CO),
    average_area: normalizeNumber(row.AVRG_AE),
    average_market_price: normalizeNumber(row.AVRG_MKTC)
  })).sort((a, b) => {
    const q = String(b.quarter || '').localeCompare(String(a.quarter || ''));
    return q || String(a.dong_code || '').localeCompare(String(b.dong_code || ''));
  });
}

async function fetchCommercialApartmentDong({key, quarter = '', pageSize = 1000, fetchImpl = fetch}){
  const fetched = await fetchPagedRows({key, service: SERVICE, quarter, pageSize, fetchImpl});
  const normalized = normalizeRows(fetched.rows);
  const rows = quarter ? normalized : latestOnly(normalized);
  return {
    title: '서울시 상권분석서비스 행정동 아파트',
    source: '서울 열린데이터광장 VwsmAdstrdAptW',
    service: SERVICE,
    requested_quarter: quarter || null,
    quarter: rows[0] ? rows[0].quarter : null,
    total_count: fetched.total,
    rows
  };
}

async function main(){
  const quarter = getArg('quarter', latestClosedQuarter());
  const out = path.resolve(getArg('out', DEFAULT_OUT));
  const summary = await fetchCommercialApartmentDong({key: getKey(), quarter});
  writeJson(out, summary);
  console.log(`저장: ${path.relative(ROOT, out)}  기준분기=${summary.quarter || '-'}  ${summary.rows.length.toLocaleString('ko-KR')}행`);
}

if (require.main === module){
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {SERVICE, normalizeRows, fetchCommercialApartmentDong};
