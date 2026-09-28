#!/usr/bin/env node
/*
  서울시 상권분석서비스 권역별 점포 정보를 수집한다.

  출력:
    web/data/commercial-stores-signgu.json
    web/data/commercial-stores-mega.json
    web/data/commercial-stores-trdar.json
    web/data/commercial-stores-trdhl.json
*/
const path = require('path');
const {ROOT, getArg, getKey, normalizeNumber, latestOnly, latestClosedQuarter, fetchPagedRows, writeJson} = require('./commercial_api_common');

const OUT_DIR = path.join(ROOT, 'web', 'data');

const configs = {
  signgu: {
    service: 'VwsmSignguStorW',
    title: '서울시 상권분석서비스 자치구 점포',
    file: 'commercial-stores-signgu.json',
    areaType: 'signgu',
    codeField: 'SIGNGU_CD',
    nameField: 'SIGNGU_CD_NM'
  },
  mega: {
    service: 'VwsmMegaStorW',
    title: '서울시 상권분석서비스 서울시 점포',
    file: 'commercial-stores-mega.json',
    areaType: 'mega',
    codeField: 'MEGA_CD',
    nameField: 'MEGA_CD_NM'
  },
  trdar: {
    service: 'VwsmTrdarStorQq',
    title: '서울시 상권분석서비스 상권 점포',
    file: 'commercial-stores-trdar.json',
    areaType: 'trdar',
    codeField: 'TRDAR_CD',
    nameField: 'TRDAR_CD_NM',
    market: true
  },
  trdhl: {
    service: 'VwsmTrdhlStorQq',
    title: '서울시 상권분석서비스 상권배후지 점포',
    file: 'commercial-stores-trdhl.json',
    areaType: 'trdhl',
    codeField: 'TRDAR_CD',
    nameField: 'TRDAR_CD_NM',
    market: true
  }
};

function normalizeRows(rows, config){
  return rows.map(row => {
    const item = {
      quarter: row.STDR_YYQU_CD,
      area_code: row[config.codeField],
      area_name: row[config.nameField],
      area_type: config.areaType,
      business_code: row.SVC_INDUTY_CD,
      business_name: row.SVC_INDUTY_CD_NM,
      similar_store_count: normalizeNumber(row.SIMILR_INDUTY_STOR_CO),
      store_count: normalizeNumber(row.STOR_CO),
      franchise_store_count: normalizeNumber(row.FRC_STOR_CO),
      open_store_count: normalizeNumber(row.OPBIZ_STOR_CO),
      close_store_count: normalizeNumber(row.CLSBIZ_STOR_CO)
    };
    if (config.market){
      item.market_type_code = row.TRDAR_SE_CD || null;
      item.market_type_name = row.TRDAR_SE_CD_NM || null;
    }
    return item;
  }).sort((a, b) => {
    const q = String(b.quarter || '').localeCompare(String(a.quarter || ''));
    return q || String(a.area_code || '').localeCompare(String(b.area_code || '')) ||
      String(a.business_code || '').localeCompare(String(b.business_code || ''));
  });
}

async function fetchCommercialRegionalStores({key, scope, quarter = '', pageSize = 1000, fetchImpl = fetch}){
  const config = configs[scope];
  if (!config) throw new Error(`알 수 없는 scope: ${scope}`);
  const fetched = await fetchPagedRows({key, service: config.service, quarter, pageSize, fetchImpl});
  const normalized = normalizeRows(fetched.rows, config);
  const rows = quarter ? normalized : latestOnly(normalized);
  return {
    title: config.title,
    source: `서울 열린데이터광장 ${config.service}`,
    service: config.service,
    scope,
    requested_quarter: quarter || null,
    quarter: rows[0] ? rows[0].quarter : null,
    total_count: fetched.total,
    rows
  };
}

async function main(){
  const key = getKey();
  const quarter = getArg('quarter', latestClosedQuarter());
  const scopes = getArg('scope', Object.keys(configs).join(',')).split(',').map(v => v.trim()).filter(Boolean);
  for (const scope of scopes){
    const config = configs[scope];
    if (!config) throw new Error(`알 수 없는 scope: ${scope}`);
    const out = path.join(OUT_DIR, config.file);
    const summary = await fetchCommercialRegionalStores({key, scope, quarter});
    writeJson(out, summary);
    console.log(`저장: ${path.relative(ROOT, out)}  기준분기=${summary.quarter || '-'}  ${summary.rows.length.toLocaleString('ko-KR')}행`);
  }
}

if (require.main === module){
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {configs, normalizeRows, fetchCommercialRegionalStores};
