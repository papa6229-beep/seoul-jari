#!/usr/bin/env node
/*
  서울시 상권분석서비스 행정동 점포 정보를 수집한다.

  출력:
    web/data/commercial-stores-dong.json
*/
const path = require('path');
const {ROOT, getArg, getKey, normalizeNumber, latestOnly, fetchPagedRows, writeJson} = require('./commercial_api_common');

const SERVICE = 'VwsmAdstrdStorW';
const DEFAULT_OUT = path.join(ROOT, 'web', 'data', 'commercial-stores-dong.json');

function normalizeRows(rows){
  return rows.map(row => ({
    quarter: row.STDR_YYQU_CD,
    dong_code: row.ADSTRD_CD,
    dong_name: row.ADSTRD_CD_NM,
    gu_code: String(row.ADSTRD_CD || '').slice(0, 5),
    business_code: row.SVC_INDUTY_CD,
    business_name: row.SVC_INDUTY_CD_NM,
    similar_store_count: normalizeNumber(row.SIMILR_INDUTY_STOR_CO),
    store_count: normalizeNumber(row.STOR_CO),
    franchise_store_count: normalizeNumber(row.FRC_STOR_CO),
    open_rate: normalizeNumber(row.OPBIZ_RT),
    open_store_count: normalizeNumber(row.OPBIZ_STOR_CO),
    close_rate: normalizeNumber(row.CLSBIZ_RT),
    close_store_count: normalizeNumber(row.CLSBIZ_STOR_CO)
  })).sort((a, b) => {
    const q = String(b.quarter || '').localeCompare(String(a.quarter || ''));
    return q || String(a.dong_code || '').localeCompare(String(b.dong_code || '')) ||
      String(a.business_code || '').localeCompare(String(b.business_code || ''));
  });
}

async function fetchCommercialStoresDong({key, quarter = '', pageSize = 1000, fetchImpl = fetch}){
  const fetched = await fetchPagedRows({key, service: SERVICE, quarter, pageSize, fetchImpl});
  const normalized = normalizeRows(fetched.rows);
  const rows = quarter ? normalized : latestOnly(normalized);
  return {
    title: '서울시 상권분석서비스 행정동 점포',
    source: '서울 열린데이터광장 VwsmAdstrdStorW',
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
  const summary = await fetchCommercialStoresDong({key: getKey(), quarter});
  writeJson(out, summary);
  console.log(`저장: ${path.relative(ROOT, out)}  기준분기=${summary.quarter || '-'}  ${summary.rows.length.toLocaleString('ko-KR')}행`);
}

if (require.main === module){
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {SERVICE, normalizeRows, fetchCommercialStoresDong};
