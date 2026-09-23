#!/usr/bin/env node
/*
  서울시 상권분석서비스 행정동 추정매출을 수집한다.

  출력:
    web/data/commercial-sales-dong.json
*/
const path = require('path');
const {ROOT, getArg, getKey, normalizeNumber, latestOnly, fetchPagedRows, writeJson} = require('./commercial_api_common');

const SERVICE = 'VwsmAdstrdSelngW';
const DEFAULT_OUT = path.join(ROOT, 'web', 'data', 'commercial-sales-dong.json');

function normalizeRows(rows){
  return rows.map(row => ({
    quarter: row.STDR_YYQU_CD,
    dong_code: row.ADSTRD_CD,
    dong_name: row.ADSTRD_CD_NM,
    gu_code: String(row.ADSTRD_CD || '').slice(0, 5),
    business_code: row.SVC_INDUTY_CD,
    business_name: row.SVC_INDUTY_CD_NM,
    amount: normalizeNumber(row.THSMON_SELNG_AMT),
    count: normalizeNumber(row.THSMON_SELNG_CO),
    weekday_amount: normalizeNumber(row.MDWK_SELNG_AMT),
    weekend_amount: normalizeNumber(row.WKEND_SELNG_AMT),
    lunch_amount: normalizeNumber(row.TMZON_11_14_SELNG_AMT),
    afternoon_amount: normalizeNumber(row.TMZON_14_17_SELNG_AMT),
    evening_amount: normalizeNumber(row.TMZON_17_21_SELNG_AMT),
    night_amount: normalizeNumber(row.TMZON_21_24_SELNG_AMT),
    age_20_amount: normalizeNumber(row.AGRDE_20_SELNG_AMT),
    age_30_amount: normalizeNumber(row.AGRDE_30_SELNG_AMT),
    age_40_amount: normalizeNumber(row.AGRDE_40_SELNG_AMT),
    age_50_amount: normalizeNumber(row.AGRDE_50_SELNG_AMT),
    age_60_plus_amount: normalizeNumber(row.AGRDE_60_ABOVE_SELNG_AMT),
    weekday_count: normalizeNumber(row.MDWK_SELNG_CO),
    weekend_count: normalizeNumber(row.WKEND_SELNG_CO),
    lunch_count: normalizeNumber(row.TMZON_11_14_SELNG_CO),
    afternoon_count: normalizeNumber(row.TMZON_14_17_SELNG_CO),
    evening_count: normalizeNumber(row.TMZON_17_21_SELNG_CO),
    customer_unit_price: unitPrice(row.THSMON_SELNG_AMT, row.THSMON_SELNG_CO)
  })).sort((a, b) => {
    const q = String(b.quarter || '').localeCompare(String(a.quarter || ''));
    return q || String(a.dong_code || '').localeCompare(String(b.dong_code || '')) ||
      String(a.business_code || '').localeCompare(String(b.business_code || ''));
  });
}

function unitPrice(amount, count){
  const a = normalizeNumber(amount);
  const c = normalizeNumber(count);
  return a && c ? Math.round(a / c) : null;
}

async function fetchCommercialSalesDong({key, quarter = '', pageSize = 1000, fetchImpl = fetch}){
  const fetched = await fetchPagedRows({key, service: SERVICE, quarter, pageSize, fetchImpl});
  const normalized = normalizeRows(fetched.rows);
  const rows = quarter ? normalized : latestOnly(normalized);
  return {
    title: '서울시 상권분석서비스 행정동 추정매출',
    source: '서울 열린데이터광장 VwsmAdstrdSelngW',
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
  const summary = await fetchCommercialSalesDong({key: getKey(), quarter});
  writeJson(out, summary);
  console.log(`저장: ${path.relative(ROOT, out)}  기준분기=${summary.quarter || '-'}  ${summary.rows.length.toLocaleString('ko-KR')}행`);
}

if (require.main === module){
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {SERVICE, normalizeRows, unitPrice, fetchCommercialSalesDong};
