#!/usr/bin/env node
/*
  서울 열린데이터광장 자치구별 서울 생활인구(250m) 일별집계를 수집한다.

  필요한 환경변수:
    SEOUL_OPENAPI_KEY=서울 열린데이터광장 일반 인증키

  예:
    node build/fetch_living_population_daily.js
    node build/fetch_living_population_daily.js --date=20260918

  출력:
    web/data/living-population-daily-gu.json
*/
const fs = require('fs');
const path = require('path');
const {fetchSeoulOpenApi} = require('./fetch_seoul_openapi');

const ROOT = path.resolve(__dirname, '..');
const SERVICE = 'SPOP_DAILYSUM_JACHI_250';
const DEFAULT_OUT = path.join(ROOT, 'web', 'data', 'living-population-daily-gu.json');

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

function compactDate(date = new Date()){
  const kst = new Date(date.getTime() + (9 * 60 * 60 * 1000));
  return [
    kst.getUTCFullYear(),
    String(kst.getUTCMonth() + 1).padStart(2, '0'),
    String(kst.getUTCDate()).padStart(2, '0')
  ].join('');
}

function normalizeNumber(value){
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function normalizeRows(rows){
  return rows
    .filter(row => row.SIGNGU_CODE_SE && row.SIGNGU_CODE_SE !== '11000')
    .map(row => ({
      date: row.STDR_DE_ID,
      code: row.SIGNGU_CODE_SE,
      name: row.SIGNGU_NM,
      total: normalizeNumber(row.TOT_LVPOP_CO),
      korean: normalizeNumber(row.LVPOP_CO),
      long_stay_foreigner: normalizeNumber(row.LNGTR_STAY_FRGNR_CO),
      short_stay_foreigner: normalizeNumber(row.SRTPD_STAY_FRGNR_CO),
      max: normalizeNumber(row.DAIL_MXMM_LVPOP_CO),
      min: normalizeNumber(row.DAIL_MUMM_LVPOP_CO),
      daytime: normalizeNumber(row.DAY_LVPOP_CO),
      night: normalizeNumber(row.NIGHT_LVPOP_CO),
      seoul_outside_inflow: normalizeNumber(row.SU_ELSE_INFLOW_LVPOP_CO),
      gu_movement: normalizeNumber(row.SIGNGU_MVMN_LVPOP_CO),
      loaded_at: row.LDADNG_DT
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

async function fetchDailyGuPopulation({
  key,
  date = '',
  pageSize = 1000,
  fetchImpl = fetch
}){
  const rows = [];
  let start = 1;
  let total = null;

  while (total === null || start <= total){
    const end = start + pageSize - 1;
    const data = await fetchSeoulOpenApi({
      key,
      service: SERVICE,
      start,
      end,
      args: date ? [date] : [],
      fetchImpl
    });
    const payload = data.payload || {};
    total = Number(payload.list_total_count || 0);
    rows.push(...(payload.row || []));
    if (!payload.row || payload.row.length === 0) break;
    start = end + 1;
  }

  const gu = normalizeRows(rows);
  return {
    title: '자치구별 서울 생활인구(250m) 일별집계',
    source: '서울 열린데이터광장 SPOP_DAILYSUM_JACHI_250',
    service: SERVICE,
    requested_date: date || null,
    date: gu[0] ? gu[0].date : null,
    loaded_at: gu[0] ? gu[0].loaded_at : null,
    total_count: total,
    metrics: {
      total: '총생활인구수',
      korean: '내국인생활인구수',
      long_stay_foreigner: '장기체류외국인수',
      short_stay_foreigner: '단기체류외국인수',
      max: '일최대인구수',
      min: '일최소인구수',
      daytime: '주간인구수',
      night: '야간인구수',
      seoul_outside_inflow: '서울외부유입인구수',
      gu_movement: '자치구간이동인구수'
    },
    gu
  };
}

async function main(){
  const key = getKey();
  const date = getArg('date', '');
  const out = path.resolve(getArg('out', DEFAULT_OUT));
  const summary = await fetchDailyGuPopulation({key, date});
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.writeFileSync(out, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  console.log(`저장: ${path.relative(ROOT, out)}  기준일=${summary.date || '-'}  ${summary.gu.length}개 구`);
}

if (require.main === module){
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {SERVICE, compactDate, normalizeRows, fetchDailyGuPopulation};
