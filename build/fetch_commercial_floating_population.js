#!/usr/bin/env node
/*
  서울시 상권분석서비스 행정동 단위 유동인구를 수집한다.

  필요한 환경변수:
    SEOUL_OPENAPI_KEY=서울 열린데이터광장 일반 인증키

  예:
    node build/fetch_commercial_floating_population.js
    node build/fetch_commercial_floating_population.js --quarter=20251

  출력:
    web/data/commercial-floating-population-dong.json
*/
const fs = require('fs');
const path = require('path');
const {fetchPagedRows, latestOnly, normalizeNumber} = require('./commercial_api_common');

const ROOT = path.resolve(__dirname, '..');
const SERVICE = 'VwsmAdstrdFlpopW';
const DEFAULT_OUT = path.join(ROOT, 'web', 'data', 'commercial-floating-population-dong.json');

function getArg(name, fallback = ''){
  const prefix = '--' + name + '=';
  const hit = process.argv.find(a => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function getKey(){
  const key = process.env.SEOUL_OPENAPI_KEY || '';
  if (!key) throw new Error('SEOUL_OPENAPI_KEY 환경변수가 필요합니다.');
  return key;
}

function normalizeRows(rows){
  return rows.map(row => ({
    quarter: row.STDR_YYQU_CD,
    dong_code: row.ADSTRD_CD,
    dong_name: row.ADSTRD_CD_NM,
    gu_code: String(row.ADSTRD_CD || '').slice(0, 5),
    total: normalizeNumber(row.TOT_FLPOP_CO),
    male: normalizeNumber(row.ML_FLPOP_CO),
    female: normalizeNumber(row.FML_FLPOP_CO),
    age_10: normalizeNumber(row.AGRDE_10_FLPOP_CO),
    age_20: normalizeNumber(row.AGRDE_20_FLPOP_CO),
    age_30: normalizeNumber(row.AGRDE_30_FLPOP_CO),
    age_40: normalizeNumber(row.AGRDE_40_FLPOP_CO),
    age_50: normalizeNumber(row.AGRDE_50_FLPOP_CO),
    age_60_plus: normalizeNumber(row.AGRDE_60_ABOVE_FLPOP_CO),
    t_00_06: normalizeNumber(row.TMZON_00_06_FLPOP_CO),
    t_06_11: normalizeNumber(row.TMZON_06_11_FLPOP_CO),
    t_11_14: normalizeNumber(row.TMZON_11_14_FLPOP_CO),
    t_14_17: normalizeNumber(row.TMZON_14_17_FLPOP_CO),
    t_17_21: normalizeNumber(row.TMZON_17_21_FLPOP_CO),
    t_21_24: normalizeNumber(row.TMZON_21_24_FLPOP_CO),
    monday: normalizeNumber(row.MON_FLPOP_CO),
    tuesday: normalizeNumber(row.TUES_FLPOP_CO),
    wednesday: normalizeNumber(row.WED_FLPOP_CO),
    thursday: normalizeNumber(row.THUR_FLPOP_CO),
    friday: normalizeNumber(row.FRI_FLPOP_CO),
    saturday: normalizeNumber(row.SAT_FLPOP_CO),
    sunday: normalizeNumber(row.SUN_FLPOP_CO)
  })).sort((a, b) => {
    const q = String(b.quarter || '').localeCompare(String(a.quarter || ''));
    return q || String(a.dong_code || '').localeCompare(String(b.dong_code || ''));
  });
}

async function fetchCommercialFloatingPopulation({
  key,
  quarter = '',
  pageSize = 1000,
  fetchImpl = fetch
}){
  const fetched = await fetchPagedRows({key, service: SERVICE, quarter, pageSize, fetchImpl});
  const normalized = normalizeRows(fetched.rows);
  const dong = quarter ? normalized : latestOnly(normalized);
  return {
    title: '서울시 상권분석서비스 행정동 유동인구',
    source: '서울 열린데이터광장 VwsmAdstrdFlpopW',
    service: SERVICE,
    requested_quarter: quarter || null,
    quarter: dong[0] ? dong[0].quarter : null,
    total_count: fetched.total,
    metrics: {
      total: '총 유동인구',
      male: '남성 유동인구',
      female: '여성 유동인구',
      age_10: '10대 유동인구',
      age_20: '20대 유동인구',
      age_30: '30대 유동인구',
      age_40: '40대 유동인구',
      age_50: '50대 유동인구',
      age_60_plus: '60대 이상 유동인구',
      t_00_06: '00~06시 유동인구',
      t_06_11: '06~11시 유동인구',
      t_11_14: '11~14시 유동인구',
      t_14_17: '14~17시 유동인구',
      t_17_21: '17~21시 유동인구',
      t_21_24: '21~24시 유동인구'
    },
    dong
  };
}

async function main(){
  const key = getKey();
  const quarter = getArg('quarter', '');
  const out = path.resolve(getArg('out', DEFAULT_OUT));
  const summary = await fetchCommercialFloatingPopulation({key, quarter});
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.writeFileSync(out, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  console.log(`저장: ${path.relative(ROOT, out)}  기준분기=${summary.quarter || '-'}  ${summary.dong.length}개 행정동`);
}

if (require.main === module){
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {SERVICE, normalizeRows, latestOnly, fetchCommercialFloatingPopulation};
