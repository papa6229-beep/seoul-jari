#!/usr/bin/env node
/*
  공공데이터포털 소상공인시장진흥공단 상가(상권)정보 API에서
  서울 상가업소를 정기 수집해 web/data/store-summary.json 으로 저장한다.

  필요한 환경변수:
    DATA_GO_KR_SERVICE_KEY=공공데이터포털 일반 인증키

  기본 호출:
    node build/fetch_stores_api.js

  빠른 점검:
    node build/fetch_stores_api.js --limit-gu=강남구 --max-pages=1
*/
const fs = require('fs');
const path = require('path');
const {summarizeRows, CATEGORIES} = require('./prep_stores');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUT = path.join(ROOT, 'web', 'data', 'store-summary.json');
const API_BASE = 'https://apis.data.go.kr/B553077/api/open/sdsc2';
const NUM_ROWS = 1000;

const SEOUL_GU = [
  ['11110', '종로구'], ['11140', '중구'], ['11170', '용산구'], ['11200', '성동구'], ['11215', '광진구'],
  ['11230', '동대문구'], ['11260', '중랑구'], ['11290', '성북구'], ['11305', '강북구'], ['11320', '도봉구'],
  ['11350', '노원구'], ['11380', '은평구'], ['11410', '서대문구'], ['11440', '마포구'], ['11470', '양천구'],
  ['11500', '강서구'], ['11530', '구로구'], ['11545', '금천구'], ['11560', '영등포구'], ['11590', '동작구'],
  ['11620', '관악구'], ['11650', '서초구'], ['11680', '강남구'], ['11710', '송파구'], ['11740', '강동구']
];

function getArg(name, fallback = ''){
  const prefix = '--' + name + '=';
  const hit = process.argv.find(a => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function getServiceKey(){
  const key = process.env.DATA_GO_KR_SERVICE_KEY || process.env.SEMAS_SERVICE_KEY || '';
  if (!key) throw new Error('DATA_GO_KR_SERVICE_KEY 환경변수가 필요합니다.');
  return key;
}

function itemsFromJson(json){
  const body = json && json.body;
  const items = body && body.items;
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (Array.isArray(items.item)) return items.item;
  if (items.item) return [items.item];
  return [];
}

async function fetchJson(url, fetchImpl = fetch){
  const res = await fetchImpl(url);
  const text = await res.text();
  if (!res.ok) throw new Error('API HTTP ' + res.status + ': ' + text.slice(0, 200));
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error('JSON 파싱 실패: ' + text.slice(0, 200));
  }
}

function buildUrl({serviceKey, guCode, pageNo}){
  const url = new URL(API_BASE + '/storeListInDong');
  url.searchParams.set('serviceKey', serviceKey);
  url.searchParams.set('pageNo', String(pageNo));
  url.searchParams.set('numOfRows', String(NUM_ROWS));
  url.searchParams.set('divId', 'signguCd');
  url.searchParams.set('key', guCode);
  url.searchParams.set('type', 'json');
  return url;
}

async function fetchGu({serviceKey, guCode, guName, maxPages = Infinity, fetchImpl = fetch}){
  const rows = [];
  let totalCount = null;
  for (let pageNo = 1; pageNo <= maxPages; pageNo++){
    const url = buildUrl({serviceKey, guCode, pageNo});
    const json = await fetchJson(url, fetchImpl);
    const body = json.body || {};
    if (totalCount === null) totalCount = Number(body.totalCount || 0);
    const items = itemsFromJson(json);
    rows.push(...items);
    if (!items.length || rows.length >= totalCount) break;
  }
  return {guCode, guName, totalCount: totalCount || rows.length, rows};
}

async function fetchSeoulStores({serviceKey, limitGu = '', maxPages = Infinity, fetchImpl = fetch}){
  const targets = limitGu ? SEOUL_GU.filter(([, name]) => name === limitGu) : SEOUL_GU;
  if (!targets.length) throw new Error('알 수 없는 서울 구 이름입니다: ' + limitGu);
  const all = [];
  const fetched = [];
  for (const [guCode, guName] of targets){
    const result = await fetchGu({serviceKey, guCode, guName, maxPages, fetchImpl});
    fetched.push({guCode, guName, totalCount: result.totalCount, rows: result.rows.length});
    all.push(...result.rows);
    console.log(`${guName}: ${result.rows.length.toLocaleString('ko-KR')} / ${result.totalCount.toLocaleString('ko-KR')}`);
  }
  return {rows: all, fetched};
}

async function main(){
  const serviceKey = getServiceKey();
  const output = path.resolve(getArg('out', DEFAULT_OUT));
  const limitGu = getArg('limit-gu', '');
  const maxPages = Number(getArg('max-pages', '0')) || Infinity;
  const asOf = getArg('as-of', new Date().toISOString().slice(0, 10));

  const {rows, fetched} = await fetchSeoulStores({serviceKey, limitGu, maxPages});
  const summary = summarizeRows(rows, asOf);
  summary.fetch = {
    endpoint: API_BASE + '/storeListInDong',
    divId: 'signguCd',
    fetched,
    categories: CATEGORIES.map(({id, label}) => ({id, label}))
  };

  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  console.log(`저장: ${path.relative(ROOT, output)}  서울 ${summary.source_rows.toLocaleString('ko-KR')}행`);
}

if (require.main === module){
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {SEOUL_GU, buildUrl, itemsFromJson, fetchGu, fetchSeoulStores};
