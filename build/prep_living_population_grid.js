#!/usr/bin/env node
/*
  서울 생활인구 250m 격자정보 Shapefile zip에서 중심점 목록을 만든다.

  입력 예:
    node build/prep_living_population_grid.js C:/Downloads/서울생활인구_250m격자정보_EPSG5179.zip

  출력:
    web/data/living-population-grid.json
*/
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUT = path.join(ROOT, 'web', 'data', 'living-population-grid.json');

function getArg(name, fallback = ''){
  const prefix = '--' + name + '=';
  const hit = process.argv.find(a => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function zipRead(zipPath, member){
  const r = spawnSync('tar', ['-xOf', zipPath, member], {encoding: 'buffer', maxBuffer: 64 * 1024 * 1024});
  if (r.status !== 0) throw new Error(`zip 파일 읽기 실패: ${zipPath} ${member}\n${String(r.stderr || '')}`);
  return r.stdout;
}

function parseDbf(buffer){
  const recordCount = buffer.readUInt32LE(4);
  const headerLength = buffer.readUInt16LE(8);
  const recordLength = buffer.readUInt16LE(10);
  const fields = [];
  let offset = 32;
  while (buffer[offset] !== 0x0d){
    fields.push({
      name: buffer.subarray(offset, offset + 11).toString('ascii').replace(/\0.*$/, ''),
      type: String.fromCharCode(buffer[offset + 11]),
      length: buffer[offset + 16]
    });
    offset += 32;
  }

  const rows = [];
  for (let i = 0; i < recordCount; i++){
    const record = buffer.subarray(headerLength + i * recordLength, headerLength + (i + 1) * recordLength);
    if (record[0] === 0x2a) continue;
    let p = 1;
    const row = {};
    for (const field of fields){
      const value = record.subarray(p, p + field.length).toString('utf8').trim();
      row[field.name] = field.type === 'N' ? Number(value) : value;
      p += field.length;
    }
    rows.push(row);
  }
  return {fields, rows};
}

function epsg5179ToWgs84(x, y){
  const a = 6378137.0;
  const invF = 298.257222101;
  const f = 1 / invF;
  const e2 = 2 * f - f * f;
  const ep2 = e2 / (1 - e2);
  const lat0 = 38 * Math.PI / 180;
  const lon0 = 127.5 * Math.PI / 180;
  const k0 = 0.9996;
  const x0 = 1000000;
  const y0 = 2000000;
  const m0 = meridionalArc(a, e2, lat0);
  const m = m0 + (y - y0) / k0;
  const mu = m / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const fp = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const sinfp = Math.sin(fp);
  const cosfp = Math.cos(fp);
  const tanfp = Math.tan(fp);
  const c1 = ep2 * cosfp * cosfp;
  const t1 = tanfp * tanfp;
  const n1 = a / Math.sqrt(1 - e2 * sinfp * sinfp);
  const r1 = a * (1 - e2) / Math.pow(1 - e2 * sinfp * sinfp, 1.5);
  const d = (x - x0) / (n1 * k0);
  const lat = fp - (n1 * tanfp / r1) * (
    d * d / 2
    - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4 / 24
    + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * d ** 6 / 720
  );
  const lon = lon0 + (
    d
    - (1 + 2 * t1 + c1) * d ** 3 / 6
    + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5 / 120
  ) / cosfp;
  return {lon: round(lon * 180 / Math.PI, 7), lat: round(lat * 180 / Math.PI, 7)};
}

function meridionalArc(a, e2, lat){
  return a * (
    (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256) * lat
    - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * lat)
    + (15 * e2 * e2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * lat)
    - (35 * e2 ** 3 / 3072) * Math.sin(6 * lat)
  );
}

function round(value, digits = 0){
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function buildGrid(zipPath){
  const {rows} = parseDbf(zipRead(zipPath, 'match/match.dbf'));
  const cells = rows.map(row => {
    const center = epsg5179ToWgs84(row.CELL_X, row.CELL_Y);
    return {
      cell_id: row.CELL_ID,
      gid: row.GID,
      x: row.CELL_X,
      y: row.CELL_Y,
      lon: center.lon,
      lat: center.lat
    };
  }).sort((a, b) => a.cell_id.localeCompare(b.cell_id, 'ko'));
  return {
    title: '서울 생활인구 250m 격자 중심점',
    source: '서울생활인구_250m격자정보_EPSG5179',
    crs: 'EPSG:5179',
    output_crs: 'EPSG:4326',
    cell_size_m: 250,
    count: cells.length,
    cells
  };
}

function main(){
  const zipPath = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || '');
  if (!zipPath) throw new Error('서울생활인구 250m 격자정보 zip 파일 경로를 넣어주세요.');
  const out = path.resolve(getArg('out', DEFAULT_OUT));
  const payload = buildGrid(zipPath);
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.writeFileSync(out, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`저장: ${path.relative(ROOT, out)}  ${payload.count.toLocaleString('ko-KR')}개 격자`);
}

if (require.main === module){
  try { main(); }
  catch (err){ console.error(err.message); process.exit(1); }
}

module.exports = {parseDbf, epsg5179ToWgs84, buildGrid};
