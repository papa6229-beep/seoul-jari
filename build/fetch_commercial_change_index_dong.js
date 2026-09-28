#!/usr/bin/env node
/*
  서울시 상권분석서비스 행정동 상권변화지표를 수집한다.

  출력:
    web/data/commercial-change-index-dong.json
*/
const path = require('path');
const {ROOT, getArg, getKey, normalizeNumber, latestOnly, latestClosedQuarter, fetchPagedRows, writeJson} = require('./commercial_api_common');

const SERVICE = 'VwsmAdstrdIxQq';
const DEFAULT_OUT = path.join(ROOT, 'web', 'data', 'commercial-change-index-dong.json');

function normalizeRows(rows){
  return rows.map(row => ({
    quarter: row.STDR_YYQU_CD,
    dong_code: row.ADSTRD_CD,
    dong_name: row.ADSTRD_CD_NM,
    gu_code: String(row.ADSTRD_CD || '').slice(0, 5),
    change_code: row.TRDAR_CHNGE_IX || null,
    change_name: row.TRDAR_CHNGE_IX_NM || null,
    operation_months_avg: normalizeNumber(row.OPR_SALE_MT_AVRG),
    close_months_avg: normalizeNumber(row.CLS_SALE_MT_AVRG),
    seoul_operation_months_avg: normalizeNumber(row.SU_OPR_SALE_MT_AVRG),
    seoul_close_months_avg: normalizeNumber(row.SU_CLS_SALE_MT_AVRG)
  })).sort((a, b) => {
    const q = String(b.quarter || '').localeCompare(String(a.quarter || ''));
    return q || String(a.dong_code || '').localeCompare(String(b.dong_code || ''));
  });
}

async function fetchCommercialChangeIndexDong({key, quarter = '', pageSize = 1000, fetchImpl = fetch}){
  const fetched = await fetchPagedRows({key, service: SERVICE, quarter, pageSize, fetchImpl});
  const normalized = normalizeRows(fetched.rows);
  const rows = quarter ? normalized : latestOnly(normalized);
  return {
    title: '서울시 상권분석서비스 행정동 상권변화지표',
    source: '서울 열린데이터광장 VwsmAdstrdIxQq',
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
  const summary = await fetchCommercialChangeIndexDong({key: getKey(), quarter});
  writeJson(out, summary);
  console.log(`저장: ${path.relative(ROOT, out)}  기준분기=${summary.quarter || '-'}  ${summary.rows.length.toLocaleString('ko-KR')}행`);
}

if (require.main === module){
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {SERVICE, normalizeRows, fetchCommercialChangeIndexDong};
