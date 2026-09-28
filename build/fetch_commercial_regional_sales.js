#!/usr/bin/env node
/*
  서울시 상권분석서비스 권역별 추정매출을 수집한다.

  출력:
    web/data/commercial-sales-signgu.json
    web/data/commercial-sales-mega.json
    web/data/commercial-sales-trdar.json
    web/data/commercial-sales-trdhl.json
*/
const path = require('path');
const {ROOT, getArg, getKey, normalizeNumber, latestOnly, latestClosedQuarter, fetchPagedRows, writeJson} = require('./commercial_api_common');
const {unitPrice} = require('./fetch_commercial_sales_dong');

const OUT_DIR = path.join(ROOT, 'web', 'data');

const configs = {
  signgu: {
    service: 'VwsmSignguSelngW',
    title: '서울시 상권분석서비스 자치구 추정매출',
    file: 'commercial-sales-signgu.json',
    areaType: 'signgu',
    codeField: 'SIGNGU_CD',
    nameField: 'SIGNGU_CD_NM'
  },
  mega: {
    service: 'VwsmMegaSelngW',
    title: '서울시 상권분석서비스 서울시 추정매출',
    file: 'commercial-sales-mega.json',
    areaType: 'mega',
    codeField: 'MEGA_CD',
    nameField: 'MEGA_CD_NM'
  },
  trdar: {
    service: 'VwsmTrdarSelngQq',
    title: '서울시 상권분석서비스 상권 추정매출',
    file: 'commercial-sales-trdar.json',
    areaType: 'trdar',
    codeField: 'TRDAR_CD',
    nameField: 'TRDAR_CD_NM',
    market: true
  },
  trdhl: {
    service: 'VwsmTrdhlSelngQq',
    title: '서울시 상권분석서비스 상권배후지 추정매출',
    file: 'commercial-sales-trdhl.json',
    areaType: 'trdhl',
    codeField: 'TRDAR_CD',
    nameField: 'TRDAR_CD_NM',
    market: true
  }
};

function normalizeRows(rows, config){
  return rows.map(row => {
    const item = {
      quarter: row.STDR_YYQU_CD,
      area_code: row[config.codeField],
      area_name: row[config.nameField],
      area_type: config.areaType,
      business_code: row.SVC_INDUTY_CD,
      business_name: row.SVC_INDUTY_CD_NM,
      amount: normalizeNumber(row.THSMON_SELNG_AMT),
      count: normalizeNumber(row.THSMON_SELNG_CO),
      customer_unit_price: unitPrice(row.THSMON_SELNG_AMT, row.THSMON_SELNG_CO)
    };
    if (config.market){
      item.market_type_code = row.TRDAR_SE_CD || null;
      item.market_type_name = row.TRDAR_SE_CD_NM || null;
    }
    return item;
  }).sort((a, b) => {
    const q = String(b.quarter || '').localeCompare(String(a.quarter || ''));
    return q || String(a.area_code || '').localeCompare(String(b.area_code || '')) ||
      String(a.business_code || '').localeCompare(String(b.business_code || ''));
  });
}

async function fetchCommercialRegionalSales({key, scope, quarter = '', pageSize = 1000, fetchImpl = fetch}){
  const config = configs[scope];
  if (!config) throw new Error(`알 수 없는 scope: ${scope}`);
  const fetched = await fetchPagedRows({key, service: config.service, quarter, pageSize, fetchImpl});
  const normalized = normalizeRows(fetched.rows, config);
  const rows = quarter ? normalized : latestOnly(normalized);
  return {
    title: config.title,
    source: `서울 열린데이터광장 ${config.service}`,
    service: config.service,
    scope,
    requested_quarter: quarter || null,
    quarter: rows[0] ? rows[0].quarter : null,
    total_count: fetched.total,
    rows
  };
}

async function main(){
  const key = getKey();
  const quarter = getArg('quarter', latestClosedQuarter());
  const scopes = getArg('scope', Object.keys(configs).join(',')).split(',').map(v => v.trim()).filter(Boolean);
  for (const scope of scopes){
    const config = configs[scope];
    if (!config) throw new Error(`알 수 없는 scope: ${scope}`);
    const out = path.join(OUT_DIR, config.file);
    const summary = await fetchCommercialRegionalSales({key, scope, quarter});
    writeJson(out, summary);
    console.log(`저장: ${path.relative(ROOT, out)}  기준분기=${summary.quarter || '-'}  ${summary.rows.length.toLocaleString('ko-KR')}행`);
  }
}

if (require.main === module){
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {configs, normalizeRows, fetchCommercialRegionalSales};
