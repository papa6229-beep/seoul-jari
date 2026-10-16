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
const path = require('path');
const {fetchPagedRows, writeJson, isCompactDate} = require('./commercial_api_common');

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

function defaultLivingPopulationDate(date = new Date()){
  return compactDate(new Date(date.getTime() - (4 * 24 * 60 * 60 * 1000)));
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
  fetchImpl = fetch,
  requestOptions = {}
}){
  const {rows, total} = await fetchPagedRows({key, service: SERVICE, date, pageSize, fetchImpl, requestOptions,
    rowIdentity: row => {
      if (!isCompactDate(row.STDR_DE_ID) || !/^11\d{3}$/.test(row.SIGNGU_CODE_SE || '')) throw new Error('Invalid daily date/district');
      return row.STDR_DE_ID + ':' + row.SIGNGU_CODE_SE;
    }});
  const latest = date || rows.reduce((max, row) => row.STDR_DE_ID > max ? row.STDR_DE_ID : max, '');
  const gu = normalizeRows(rows.filter(row => row.STDR_DE_ID === latest));
  if (!gu.length) throw new Error('No district rows for selected daily date');
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

async function fetchPublishedDailyGuPopulation({key, date = '', now = new Date(), maxLookbackDays = 7, pageSize = 1000, fetchImpl = fetch, requestOptions = {}}){
  if (!Number.isInteger(maxLookbackDays) || maxLookbackDays < 0 || maxLookbackDays > 7) throw new Error('Invalid daily lookback bound');
  if (date) return fetchDailyGuPopulation({key, date, pageSize, fetchImpl, requestOptions});
  const initial = defaultLivingPopulationDate(now);
  const base = new Date(initial.slice(0, 4) + '-' + initial.slice(4, 6) + '-' + initial.slice(6, 8) + 'T00:00:00Z');
  for (let offset = 0; offset <= maxLookbackDays; offset++) {
    const candidate = new Date(base.getTime() - offset * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
    try { return await fetchDailyGuPopulation({key, date: candidate, pageSize, fetchImpl, requestOptions}); }
    catch (error) { if (error.code !== 'INFO-200' || offset === maxLookbackDays) throw error; }
  }
}

async function main(){
  const key = getKey();
  const date = getArg('date', '');
  const out = path.resolve(getArg('out', DEFAULT_OUT));
  const summary = await fetchPublishedDailyGuPopulation({key, date});
  writeJson(out, summary);
  console.log(`저장: ${path.relative(ROOT, out)}  기준일=${summary.date || '-'}  ${summary.gu.length}개 구`);
}

if (require.main === module){
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {SERVICE, compactDate, defaultLivingPopulationDate, normalizeRows, fetchDailyGuPopulation, fetchPublishedDailyGuPopulation};
