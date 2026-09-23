#!/usr/bin/env node
/*
  서울 행정동 코드정보 zip에서 최신 월 CSV를 꺼내 화면용 JSON으로 줄인다.

  입력 예:
    node build/prep_admin_dong_codes.js C:/Downloads/전국_행정동_코드정보.zip

  출력:
    web/data/admin-dong-codes.json
*/
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUT = path.join(ROOT, 'web', 'data', 'admin-dong-codes.json');

function getArg(name, fallback = ''){
  const prefix = '--' + name + '=';
  const hit = process.argv.find(a => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function parseCsvLine(line){
  const out = [];
  let cell = '', quoted = false;
  for (let i = 0; i < line.length; i++){
    const ch = line[i], next = line[i + 1];
    if (quoted){
      if (ch === '"' && next === '"'){ cell += '"'; i++; }
      else if (ch === '"'){ quoted = false; }
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ','){ out.push(cell); cell = ''; }
    else cell += ch;
  }
  out.push(cell);
  return out;
}

function zipList(zipPath){
  const r = spawnSync('tar', ['-tf', zipPath], {encoding: 'utf8'});
  if (r.status !== 0) throw new Error(`zip 목록 읽기 실패: ${zipPath}\n${r.stderr}`);
  return r.stdout.split(/\r?\n/).filter(v => /ADMI_\d{6}\.csv$/.test(v)).sort();
}

function zipRead(zipPath, member){
  const r = spawnSync('tar', ['-xOf', zipPath, member], {encoding: 'buffer', maxBuffer: 64 * 1024 * 1024});
  if (r.status !== 0) throw new Error(`zip 파일 읽기 실패: ${zipPath} ${member}\n${String(r.stderr || '')}`);
  return new TextDecoder('utf-8').decode(r.stdout).replace(/^\uFEFF/, '');
}

function parseAdminDongCsv(text){
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map(v => v.trim());
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  return lines.slice(1).map(line => {
    const cols = parseCsvLine(line);
    return {
      sido: cols[idx.SIDO_NM],
      gu: cols[idx.SGG_NM],
      name: cols[idx.ADMI_NM],
      code: cols[idx.ADMI_CD],
      full_name: cols[idx.FULL_NM],
      base_ym: cols[idx.BASE_YM]
    };
  }).filter(row => row.sido === '서울특별시' && row.code && row.name);
}

function buildAdminDongCodes(zipPath, member = ''){
  const members = zipList(zipPath);
  const target = member || members[members.length - 1];
  if (!target) throw new Error('ADMI_YYYYMM.csv 파일을 찾지 못했습니다.');
  const dongs = parseAdminDongCsv(zipRead(zipPath, target)).sort((a, b) => a.code.localeCompare(b.code));
  return {
    title: '서울 행정동 코드정보',
    source: '서울 생활인구 행정구역 코드정보',
    base_ym: dongs[0] ? dongs[0].base_ym : path.basename(target).match(/\d{6}/)?.[0] || '',
    file: target,
    count: dongs.length,
    dongs
  };
}

function main(){
  const zipPath = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || '');
  if (!zipPath) throw new Error('행정동 코드정보 zip 파일 경로를 넣어주세요.');
  const out = path.resolve(getArg('out', DEFAULT_OUT));
  const member = getArg('member', '');
  const payload = buildAdminDongCodes(zipPath, member);
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.writeFileSync(out, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`저장: ${path.relative(ROOT, out)}  ${payload.base_ym}  ${payload.count}개 행정동`);
}

if (require.main === module){
  try { main(); }
  catch (err){ console.error(err.message); process.exit(1); }
}

module.exports = {parseCsvLine, parseAdminDongCsv, buildAdminDongCodes};
