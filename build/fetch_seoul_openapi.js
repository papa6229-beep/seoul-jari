#!/usr/bin/env node
/*
  서울 열린데이터광장 OpenAPI 공통 호출기.

  필요한 환경변수:
    SEOUL_OPENAPI_KEY=서울 열린데이터광장 일반 인증키

  예:
    node build/fetch_seoul_openapi.js --service=서비스명 --start=1 --end=1000 --out=data/raw/seoul-service-sample.json
*/
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASE_URL = 'http://openapi.seoul.go.kr:8088';

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

function buildSeoulUrl({key, service, start = 1, end = 1000, format = 'json', args = []}){
  if (!service) throw new Error('--service=서울_OpenAPI_서비스명 이 필요합니다.');
  const parts = [BASE_URL, encodeURIComponent(key), encodeURIComponent(format), encodeURIComponent(service), start, end]
    .concat(args.map(v => encodeURIComponent(v)));
  return parts.join('/');
}

function apiError(code, message){
  const error = new Error(message);
  error.code = code;
  return error;
}

async function fetchSeoulOpenApi({key, service, start = 1, end = 1000, format = 'json', args = [], fetchImpl = fetch,
  maxAttempts = 3, timeoutMs = 20000, retryDelayMs = 500}){
  if (!Number.isSafeInteger(start) || start < 1 || !Number.isSafeInteger(end) || end < start || end - start >= 1000)
    throw new Error('서울 OpenAPI 페이지 범위 오류');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3 ||
    !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000 ||
    !Number.isInteger(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 2000) throw new Error('Invalid request bounds');
  const url = buildSeoulUrl({key, service, start, end, format, args});
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    let timer;
    try {
      const response = (async () => {
        let res, text;
        try {
          res = await fetchImpl(url, {signal: controller.signal});
          text = await res.text();
        } catch { throw apiError('NETWORK', '서울 OpenAPI 연결/응답 읽기 실패'); }
        if (!res.ok) throw apiError(res.status >= 500 && res.status <= 599 ? 'HTTP_5XX' : 'HTTP_ERROR',
          '서울 OpenAPI HTTP ' + (Number.isInteger(res.status) ? res.status : '오류'));
        return parseResponse({url, text, format, service, start, end});
      })();
      const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => { reject(apiError('TIMEOUT', '서울 OpenAPI 응답 시간 초과')); controller.abort(); }, timeoutMs);
      });
      return await Promise.race([response, timeout]);
    } catch (error) {
      if (attempt === maxAttempts || !['NETWORK', 'TIMEOUT', 'HTTP_5XX', 'ERROR-500'].includes(error.code)) throw error;
    } finally { clearTimeout(timer); }
    await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt));
  }
}

function parseResponse({url, text, format, service, start, end}){
  // A JSON request can receive the provider's XML error envelope. Never echo its body/key.
  const xmlCode = /^\s*</.test(text) && text.match(/<CODE>\s*((?:ERROR|INFO)-\d{3})\s*<\/CODE>/);
  if (xmlCode && xmlCode[1] !== 'INFO-000') throw apiError(xmlCode[1], '서울 OpenAPI 오류 ' + xmlCode[1]);
  if (format !== 'json') return {url, text};
  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw apiError('SCHEMA', '서울 OpenAPI JSON 파싱 실패');
  }
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  if (!record(json)) throw new Error('서울 OpenAPI 응답 형식 오류');
  const checkResult = container => {
    if (!Object.hasOwn(container, 'RESULT')) return;
    const result = container.RESULT;
    if (!record(result) || typeof result.CODE !== 'string' || !result.CODE) throw new Error('서울 OpenAPI RESULT 형식 오류');
    if (result.CODE !== 'INFO-000') {
      if (result.CODE === 'INFO-200') {
        const evidence = container === json && Object.hasOwn(json, service) ? json[service] : container;
        if (!record(evidence) || Object.hasOwn(evidence, 'row') && (!Array.isArray(evidence.row) || evidence.row.length) ||
          Object.hasOwn(evidence, 'list_total_count') && evidence.list_total_count !== 0 && evidence.list_total_count !== '0')
          throw apiError('SCHEMA', '서울 OpenAPI no-data 응답 모순');
      }
      const code = /^(?:ERROR|INFO)-\d{3}$/.test(result.CODE) ? result.CODE : 'API_RESULT';
      throw apiError(code, '서울 OpenAPI 오류 ' + code);
    }
  };
  checkResult(json);
  if (!Object.hasOwn(json, service) || !record(json[service])) throw new Error('서울 OpenAPI 요청 서비스 응답 없음: ' + service);
  const payload = json[service];
  checkResult(payload);
  const rawTotal = payload.list_total_count;
  const total = Number(rawTotal);
  if (!(typeof rawTotal === 'number' || typeof rawTotal === 'string' && /^\d+$/.test(rawTotal)) ||
    !Number.isSafeInteger(total) || total < 0) throw new Error('서울 OpenAPI total 형식 오류: ' + service);
  if (!Array.isArray(payload.row) || payload.row.some(row => !record(row))) throw new Error('서울 OpenAPI row 형식 오류: ' + service);
  const expected = Math.min(end - start + 1, Math.max(0, total - start + 1));
  if (payload.row.length !== expected) throw new Error('서울 OpenAPI 불완전한 페이지: ' + service + ' start=' + start);
  return {url, json, serviceKey: service, payload};
}

async function main(){
  const key = getKey();
  const service = getArg('service');
  const start = Number(getArg('start', '1'));
  const end = Number(getArg('end', '1000'));
  const out = getArg('out', path.join(ROOT, 'data', 'raw', `${service || 'seoul-openapi'}-${start}-${end}.json`));
  const args = getArg('args', '').split(',').map(v => v.trim()).filter(Boolean);
  const data = await fetchSeoulOpenApi({key, service, start, end, args});
  // Lazy import avoids the common helper's fetchSeoulOpenApi dependency cycle.
  require('./commercial_api_common').writeJson(path.resolve(out), data.json);
  console.log(`저장: ${path.relative(ROOT, path.resolve(out))}  service=${data.serviceKey}`);
}

if (require.main === module){
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {BASE_URL, buildSeoulUrl, fetchSeoulOpenApi};
