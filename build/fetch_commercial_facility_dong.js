#!/usr/bin/env node
/*
  서울시 상권분석서비스 행정동 집객시설을 수집한다.

  출력:
    web/data/commercial-facility-dong.json
*/
const path = require('path');
const {ROOT, getArg, getKey, normalizeNumber, latestOnly, latestClosedQuarter, fetchPagedRows, writeJson} = require('./commercial_api_common');

const SERVICE = 'VwsmAdstrdFcltyW';
const DEFAULT_OUT = path.join(ROOT, 'web', 'data', 'commercial-facility-dong.json');

function numberOrNull(value){
  return value === '' || value === undefined || value === null ? null : normalizeNumber(value);
}

function normalizeRows(rows){
  return rows.map(row => ({
    quarter: row.STDR_YYQU_CD,
    dong_code: row.ADSTRD_CD,
    dong_name: row.ADSTRD_CD_NM,
    gu_code: String(row.ADSTRD_CD || '').slice(0, 5),
    total_facilities: numberOrNull(row.VIATR_FCLTY_CO),
    public_offices: numberOrNull(row.PBLOFC_CO),
    banks: numberOrNull(row.BANK_CO),
    general_hospitals: numberOrNull(row.GEHSPT_CO),
    hospitals: numberOrNull(row.GNRL_HSPTL_CO),
    pharmacies: numberOrNull(row.PARMACY_CO ?? row['PARMACY_CO']),
    kindergartens: numberOrNull(row.KNDRGR_CO),
    elementary_schools: numberOrNull(row.ELESCH_CO),
    middle_schools: numberOrNull(row.MSKUL_CO),
    high_schools: numberOrNull(row.HGSCHL_CO),
    universities: numberOrNull(row.UNIV_CO),
    department_stores: numberOrNull(row.DRTS_CO),
    supermarkets: numberOrNull(row.SUPMK_CO),
    theaters: numberOrNull(row.THEAT_CO),
    lodging_facilities: numberOrNull(row.STAYNG_FCLTY_CO),
    subway_stations: numberOrNull(row.SUBWAY_STATN_CO),
    bus_stops: numberOrNull(row.BUS_STTN_CO)
  })).sort((a, b) => {
    const q = String(b.quarter || '').localeCompare(String(a.quarter || ''));
    return q || String(a.dong_code || '').localeCompare(String(b.dong_code || ''));
  });
}

async function fetchCommercialFacilityDong({key, quarter = '', pageSize = 1000, fetchImpl = fetch}){
  const fetched = await fetchPagedRows({key, service: SERVICE, quarter, pageSize, fetchImpl});
  const normalized = normalizeRows(fetched.rows);
  const rows = quarter ? normalized : latestOnly(normalized);
  return {
    title: '서울시 상권분석서비스 행정동 집객시설',
    source: '서울 열린데이터광장 VwsmAdstrdFcltyW',
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
  const summary = await fetchCommercialFacilityDong({key: getKey(), quarter});
  writeJson(out, summary);
  console.log(`저장: ${path.relative(ROOT, out)}  기준분기=${summary.quarter || '-'}  ${summary.rows.length.toLocaleString('ko-KR')}행`);
}

if (require.main === module){
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {SERVICE, normalizeRows, fetchCommercialFacilityDong};
