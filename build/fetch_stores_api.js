#!/usr/bin/env node
/*
  공공데이터포털 소상공인시장진흥공단 상가(상권)정보 API에서
  서울 상가업소를 정기 수집해 web/data/store-summary.json 으로 저장한다.

  필요한 환경변수:
    DATA_GO_KR_SERVICE_KEY=공공데이터포털 일반 인증키

  기본 호출:
    node build/fetch_stores_api.js

  빠른 점검:
    node build/fetch_stores_api.js --limit-gu=강남구 --max-pages=1 --out=sample-stores.json
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {writeJson} = require('./commercial_api_common');
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

function getArg(args, name, fallback = ''){
  const prefix = '--' + name + '=';
  const matches = args.filter(a => a.startsWith(prefix));
  if (args.includes('--' + name) || matches.length > 1) throw new Error('Invalid --' + name);
  const hit = matches[0];
  return hit ? hit.slice(prefix.length) : fallback;
}

function validateMaxPages(maxPages){
  if (maxPages !== Infinity && (!Number.isSafeInteger(maxPages) || maxPages < 1)) throw new Error('Invalid max-pages');
}

function parseCliOptions(args = process.argv.slice(2)){
  const out = getArg(args, 'out');
  if (args.includes('--out=') || args.includes('--out')) throw new Error('Invalid --out');
  const output = path.resolve(out || DEFAULT_OUT);
  const limitGu = getArg(args, 'limit-gu');
  const rawPages = getArg(args, 'max-pages', null);
  if (rawPages !== null && !/^[1-9]\d*$/.test(rawPages)) throw new Error('Invalid max-pages');
  const maxPages = rawPages === null ? Infinity : Number(rawPages);
  validateMaxPages(maxPages);
  const resolvedTarget = fs.existsSync(output) ? fs.realpathSync(output) : output;
  const canonical = fs.existsSync(DEFAULT_OUT) ? fs.realpathSync(DEFAULT_OUT) : DEFAULT_OUT;
  const samePath = process.platform === 'win32' ? resolvedTarget.toLowerCase() === canonical.toLowerCase() : resolvedTarget === canonical;
  if ((limitGu || maxPages !== Infinity) && (!out || samePath)) throw new Error('Limited collection requires explicit noncanonical --out');
  return {output, limitGu, maxPages, asOf: getArg(args, 'as-of', new Date().toISOString().slice(0, 10))};
}

function getServiceKey(){
  const key = process.env.DATA_GO_KR_SERVICE_KEY || process.env.SEMAS_SERVICE_KEY || '';
  if (!key) throw new Error('DATA_GO_KR_SERVICE_KEY 환경변수가 필요합니다.');
  return key;
}

function itemsFromJson(json){
  const body = json && json.body;
  if (!isObject(body)) throw new Error('Invalid API body');
  const items = body && body.items;
  if (items === undefined || items === null || items === '') return [];
  if (Array.isArray(items)) return items;
  if (isObject(items) && Array.isArray(items.item)) return items.item;
  if (isObject(items) && isObject(items.item)) return [items.item];
  throw new Error('Invalid API items');
}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const stable = value => Array.isArray(value) ? value.map(stable) : isObject(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
function rowIdentity(row){
  if (!isObject(row)) throw new Error('Invalid API item');
  if (Object.hasOwn(row, 'bizesId')) {
    if (!(typeof row.bizesId === 'string' && row.bizesId.trim() || typeof row.bizesId === 'number' && Number.isFinite(row.bizesId))) throw new Error('Invalid bizesId');
    return 'id:' + row.bizesId;
  }
  // Fixtures/older responses without IDs use the entire record, not an invented business key.
  return 'row:' + crypto.createHash('sha256').update(JSON.stringify(stable(row))).digest('hex');
}

function requestError(code, message, retryable = false){
  return Object.assign(new Error(message), {code, retryable});
}

async function fetchJson(url, fetchImpl = fetch, {timeoutMs = 20000} = {}){
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new Error('Invalid request timeout');
  const controller = new AbortController();
  let timer;
  try {
    const request = (async () => {
      let res, text;
      try {
        res = await fetchImpl(url, {signal: controller.signal});
        text = await res.text();
      } catch { throw requestError('NETWORK', 'API 연결/응답 읽기 실패', true); }
      if (!res.ok) throw requestError('HTTP_ERROR', 'API HTTP ' + (Number.isInteger(res.status) ? res.status : '오류'), res.status >= 500 && res.status <= 599);
      try { return JSON.parse(text); } catch { throw requestError('SCHEMA', 'JSON 파싱 실패'); }
    })();
    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => { reject(requestError('TIMEOUT', 'API 응답 시간 초과', true)); controller.abort(); }, timeoutMs);
    });
    return await Promise.race([request, timeout]);
  } finally { clearTimeout(timer); }
}

async function fetchJsonWithRetry(url, fetchImpl = fetch){
  const tries = 4;
  let lastError = null;
  for (let i = 1; i <= tries; i++){
    try {
      return await fetchJson(url, fetchImpl);
    } catch (err) {
      lastError = err;
      if (i === tries || !err.retryable) break;
      const waitMs = i * 2500;
      console.warn(`API 호출 실패, ${waitMs / 1000}초 후 재시도 ${i}/${tries - 1}: ${err.message}`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
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
  validateMaxPages(maxPages);
  const rows = [];
  const identities = new Set();
  let totalCount = null;
  for (let pageNo = 1; pageNo <= maxPages; pageNo++){
    const url = buildUrl({serviceKey, guCode, pageNo});
    const json = await fetchJsonWithRetry(url, fetchImpl);
    if (!isObject(json)) throw new Error('Invalid API response');
    // SEMAS OpenAPI guide documents resultCode "00" as NORMAL SERVICE.
    if (Object.hasOwn(json, 'header') && (!isObject(json.header) || json.header.resultCode !== '00')) throw new Error('API header failure');
    const body = json.body;
    if (!isObject(body)) throw new Error('Invalid API body');
    const count = body.totalCount;
    if (!(typeof count === 'number' || typeof count === 'string' && /^\d+$/.test(count)) || !Number.isSafeInteger(Number(count)) || Number(count) < 0) throw new Error('Invalid API totalCount');
    const pageTotal = Number(count);
    if (totalCount !== null && pageTotal !== totalCount) throw new Error('API totalCount changed');
    totalCount = pageTotal;
    const items = itemsFromJson(json);
    if (items.length !== Math.min(NUM_ROWS, Math.max(0, totalCount - rows.length))) throw new Error('Incomplete API page');
    for (const row of items) {
      const identity = rowIdentity(row);
      if (identities.has(identity)) throw new Error('Duplicate API item/page');
      identities.add(identity);
    }
    rows.push(...items);
    if (rows.length === totalCount) break;
  }
  return {guCode, guName, totalCount, rows, complete: rows.length === totalCount};
}

async function fetchSeoulStores({serviceKey, limitGu = '', maxPages = Infinity, fetchImpl = fetch}){
  validateMaxPages(maxPages);
  const targets = limitGu ? SEOUL_GU.filter(([, name]) => name === limitGu) : SEOUL_GU;
  if (!targets.length) throw new Error('알 수 없는 서울 구 이름입니다.');
  const all = [];
  const fetched = [];
  const identities = new Set();
  for (const [guCode, guName] of targets){
    const result = await fetchGu({serviceKey, guCode, guName, maxPages, fetchImpl});
    for (const row of result.rows) {
      const identity = rowIdentity(row);
      if (identities.has(identity)) throw new Error('Duplicate API item across gu');
      identities.add(identity);
    }
    fetched.push({guCode, guName, totalCount: result.totalCount, rows: result.rows.length, complete: result.complete});
    all.push(...result.rows);
    console.log(`${guName}: ${result.rows.length.toLocaleString('ko-KR')} / ${result.totalCount.toLocaleString('ko-KR')}`);
  }
  return {rows: all, fetched, complete: !limitGu && fetched.length === SEOUL_GU.length && fetched.every(item => item.complete)};
}

async function main(){
  const {output, limitGu, maxPages, asOf} = parseCliOptions();
  const serviceKey = getServiceKey();

  const {rows, fetched, complete} = await fetchSeoulStores({serviceKey, limitGu, maxPages});
  const summary = summarizeRows(rows, asOf);
  summary.fetch = {
    endpoint: API_BASE + '/storeListInDong',
    divId: 'signguCd',
    complete,
    sample: !!limitGu || maxPages !== Infinity,
    fetched,
    categories: CATEGORIES.map(({id, label}) => ({id, label}))
  };

  writeJson(output, summary);
  console.log(`저장: ${path.relative(ROOT, output)}  서울 ${summary.source_rows.toLocaleString('ko-KR')}행`);
}

if (require.main === module){
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {SEOUL_GU, buildUrl, itemsFromJson, fetchJson, fetchGu, fetchSeoulStores, parseCliOptions};
