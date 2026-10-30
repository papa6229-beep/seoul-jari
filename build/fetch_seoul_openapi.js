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

const NETWORK_CODES = new Set(['EAI_AGAIN','ENOTFOUND','ECONNREFUSED','ECONNRESET','ETIMEDOUT','EHOSTUNREACH','ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET',
  'CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID',
  'SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','REQUEST_TIMEOUT','UNKNOWN']);
const TLS_CODES = new Set(['CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_GET_ISSUER_CERT_LOCALLY']);

function transportError(original, phase){
  const candidates=[original,original?.cause,...(Array.isArray(original?.cause?.errors)?original.cause.errors.slice(0,4):[])];
  const code=candidates.map(x=>x?.code).find(x=>NETWORK_CODES.has(x)) || 'UNKNOWN';
  return Object.assign(apiError(TLS_CODES.has(code)?'TLS':'NETWORK','서울 OpenAPI 연결/응답 읽기 실패'),{network_code:code,phase});
}

function safeRequestDiagnostic(error){
  return {
    code:/^(?:(?:ERROR|INFO)-\d{3}|NETWORK|TIMEOUT|TLS|HTTP_5XX|HTTP_ERROR)$/.test(error?.code||'')?error.code:'SCHEMA',
    ...(NETWORK_CODES.has(error?.network_code)?{network_code:error.network_code}:{}),
    ...(['connect','body','request'].includes(error?.phase)?{phase:error.phase}:{}),
    ...(Number.isInteger(error?.attempts)&&error.attempts>=1&&error.attempts<=4?{attempts:error.attempts}:{})
  };
}

async function fetchSeoulOpenApi({key, service, start = 1, end = 1000, format = 'json', args = [], fetchImpl = fetch,
  maxAttempts = 4, timeoutMs = 20000, retryDelayMs = null,
  sleep = ms => new Promise(resolve => setTimeout(resolve,ms)),
  onDiagnostic = entry => process.stderr.write(JSON.stringify(entry)+'\n')}){
  if (!Number.isSafeInteger(start) || start < 1 || !Number.isSafeInteger(end) || end < start || end - start >= 1000)
    throw new Error('서울 OpenAPI 페이지 범위 오류');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 4 ||
    !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000 ||
    retryDelayMs!==null&&(!Number.isInteger(retryDelayMs)||retryDelayMs<0||retryDelayMs>2000) ||
    typeof sleep!=='function'||typeof onDiagnostic!=='function') throw new Error('Invalid request bounds');
  const url = buildSeoulUrl({key, service, start, end, format, args});
  const report=entry=>{
    try {onDiagnostic({event:'seoul_api_request',service:/^[A-Za-z][A-Za-z0-9_]*$/.test(service)?service:'invalid',start,end,...entry});} catch {}
  };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    let timer;
    try {
      const response = (async () => {
        let res, text;
        try {
          res = await fetchImpl(url, {signal: controller.signal});
        } catch(error) { throw transportError(error,'connect'); }
        try {text=await res.text();} catch(error) {throw transportError(error,'body');}
        if (!res.ok) throw apiError(res.status >= 500 && res.status <= 599 ? 'HTTP_5XX' : 'HTTP_ERROR',
          '서울 OpenAPI HTTP ' + (Number.isInteger(res.status) ? res.status : '오류'));
        return parseResponse({url, text, format, service, start, end});
      })();
      const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => { reject(Object.assign(apiError('TIMEOUT', '서울 OpenAPI 응답 시간 초과'),
          {network_code:'REQUEST_TIMEOUT',phase:'request'})); controller.abort(); }, timeoutMs);
      });
      const result=await Promise.race([response, timeout]);
      if(attempt>1)report({outcome:'recovered',attempt,max_attempts:maxAttempts});
      return result;
    } catch (error) {
      error.attempts=attempt;
      const retry=attempt<maxAttempts&&['NETWORK','TIMEOUT','HTTP_5XX','ERROR-500'].includes(error.code);
      const wait=retry?(retryDelayMs===null?[5000,30000,60000][attempt-1]:retryDelayMs*attempt):0;
      if(error.code!=='INFO-200')report({outcome:retry?'retry':'failed',...safeRequestDiagnostic(error),
        attempt,max_attempts:maxAttempts,will_retry:retry,wait_ms:wait});
      if(!retry)throw error;
      clearTimeout(timer);
      await sleep(wait);
    } finally { clearTimeout(timer); }
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

module.exports = {BASE_URL, buildSeoulUrl, fetchSeoulOpenApi, safeRequestDiagnostic};
