#!/usr/bin/env node
/*
  서울 열린데이터광장 OpenAPI 공통 호출기.

  필요한 환경변수:
    SEOUL_OPENAPI_KEY=서울 열린데이터광장 일반 인증키

  예:
    node build/fetch_seoul_openapi.js --service=서비스명 --start=1 --end=1000 --out=data/raw/seoul-service-sample.json
*/
const fs = require('fs');
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

async function fetchSeoulOpenApi({key, service, start = 1, end = 1000, format = 'json', args = [], fetchImpl = fetch}){
  const url = buildSeoulUrl({key, service, start, end, format, args});
  const res = await fetchImpl(url);
  const text = await res.text();
  if (!res.ok) throw new Error('서울 OpenAPI HTTP ' + res.status + ': ' + text.slice(0, 200));
  if (format !== 'json') return {url, text};
  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error('서울 OpenAPI JSON 파싱 실패: ' + text.slice(0, 200));
  }
  const firstKey = Object.keys(json)[0];
  const payload = json[firstKey];
  const result = payload && payload.RESULT;
  if (result && result.CODE && result.CODE !== 'INFO-000'){
    throw new Error('서울 OpenAPI 오류 ' + result.CODE + ': ' + result.MESSAGE);
  }
  return {url, json, serviceKey: firstKey, payload};
}

async function main(){
  const key = getKey();
  const service = getArg('service');
  const start = Number(getArg('start', '1'));
  const end = Number(getArg('end', '1000'));
  const out = getArg('out', path.join(ROOT, 'data', 'raw', `${service || 'seoul-openapi'}-${start}-${end}.json`));
  const args = getArg('args', '').split(',').map(v => v.trim()).filter(Boolean);
  const data = await fetchSeoulOpenApi({key, service, start, end, args});
  fs.mkdirSync(path.dirname(path.resolve(out)), {recursive: true});
  fs.writeFileSync(path.resolve(out), JSON.stringify(data.json, null, 2) + '\n', 'utf8');
  console.log(`저장: ${path.relative(ROOT, path.resolve(out))}  service=${data.serviceKey}`);
}

if (require.main === module){
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {BASE_URL, buildSeoulUrl, fetchSeoulOpenApi};
