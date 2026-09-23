#!/usr/bin/env node
/*
  서울시 상권분석서비스 행정동 직장인구를 수집한다.

  출력:
    web/data/commercial-worker-population-dong.json
*/
const path = require('path');
const {ROOT, getArg, getKey, normalizeNumber, latestOnly, latestClosedQuarter, fetchPagedRows, writeJson} = require('./commercial_api_common');

const SERVICE = 'VwsmAdstrdWrcPopltnW';
const DEFAULT_OUT = path.join(ROOT, 'web', 'data', 'commercial-worker-population-dong.json');

function normalizeRows(rows){
  return rows.map(row => ({
    quarter: row.STDR_YYQU_CD,
    dong_code: row.ADSTRD_CD,
    dong_name: row.ADSTRD_CD_NM,
    gu_code: String(row.ADSTRD_CD || '').slice(0, 5),
    total: normalizeNumber(row.TOT_WRC_POPLTN_CO),
    male: normalizeNumber(row.ML_WRC_POPLTN_CO),
    female: normalizeNumber(row.FML_WRC_POPLTN_CO),
    age_10: normalizeNumber(row.AGRDE_10_WRC_POPLTN_CO),
    age_20: normalizeNumber(row.AGRDE_20_WRC_POPLTN_CO),
    age_30: normalizeNumber(row.AGRDE_30_WRC_POPLTN_CO),
    age_40: normalizeNumber(row.AGRDE_40_WRC_POPLTN_CO),
    age_50: normalizeNumber(row.AGRDE_50_WRC_POPLTN_CO),
    age_60_plus: normalizeNumber(row.AGRDE_60_ABOVE_WRC_POPLTN_CO),
    male_age_20: normalizeNumber(row.MAG_20_WRC_POPLTN_CO),
    male_age_30: normalizeNumber(row.MAG_30_WRC_POPLTN_CO),
    male_age_40: normalizeNumber(row.MAG_40_WRC_POPLTN_CO),
    male_age_50: normalizeNumber(row.MAG_50_WRC_POPLTN_CO),
    female_age_20: normalizeNumber(row.FAG_20_WRC_POPLTN_CO),
    female_age_30: normalizeNumber(row.FAG_30_WRC_POPLTN_CO),
    female_age_40: normalizeNumber(row.FAG_40_WRC_POPLTN_CO),
    female_age_50: normalizeNumber(row.FAG_50_WRC_POPLTN_CO)
  })).sort((a, b) => {
    const q = String(b.quarter || '').localeCompare(String(a.quarter || ''));
    return q || String(a.dong_code || '').localeCompare(String(b.dong_code || ''));
  });
}

async function fetchCommercialWorkerPopulationDong({key, quarter = '', pageSize = 1000, fetchImpl = fetch}){
  const fetched = await fetchPagedRows({key, service: SERVICE, quarter, pageSize, fetchImpl});
  const normalized = normalizeRows(fetched.rows);
  const rows = quarter ? normalized : latestOnly(normalized);
  return {
    title: '서울시 상권분석서비스 행정동 직장인구',
    source: '서울 열린데이터광장 VwsmAdstrdWrcPopltnW',
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
  const summary = await fetchCommercialWorkerPopulationDong({key: getKey(), quarter});
  writeJson(out, summary);
  console.log(`저장: ${path.relative(ROOT, out)}  기준분기=${summary.quarter || '-'}  ${summary.rows.length.toLocaleString('ko-KR')}행`);
}

if (require.main === module){
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {SERVICE, normalizeRows, fetchCommercialWorkerPopulationDong};
