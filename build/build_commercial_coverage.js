#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'web', 'data');
const VIEW = path.join(DATA_DIR, 'commercial-view-dong.json');
const STORES = path.join(DATA_DIR, 'store-summary.json');
const OUT = path.join(DATA_DIR, 'commercial-coverage.json');

function readJson(file){
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function countMapDongs(points, id){
  let dongs = 0;
  let pointsCount = 0;
  for (const buckets of Object.values(points || {})){
    const list = buckets && buckets[id];
    if (Array.isArray(list) && list.length){
      dongs++;
      pointsCount += list.length;
    }
  }
  return {map_dongs: dongs, map_points: pointsCount};
}

function build(){
  const view = readJson(VIEW);
  const stores = fs.existsSync(STORES) ? readJson(STORES) : {};
  const rows = view.rows || [];
  const points = stores.points || {};

  const items = (view.business_types || []).map(type => {
    let salesDongs = 0;
    let storeDongs = 0;
    let salesTotal = 0;
    let storeTotal = 0;
    for (const row of rows){
      const bucket = row.biz && row.biz[type.id];
      if (!bucket) continue;
      if (bucket.sales){
        salesDongs++;
        salesTotal += bucket.sales || 0;
      }
      if (bucket.stores){
        storeDongs++;
        storeTotal += bucket.stores || 0;
      }
    }
    const map = countMapDongs(points, type.id);
    return {
      id: type.id,
      code: type.code || null,
      label: type.label,
      kind: type.kind,
      has_sales: salesDongs > 0,
      has_stores: storeDongs > 0,
      has_map_points: map.map_points > 0,
      sales_dongs: salesDongs,
      store_dongs: storeDongs,
      sales_total: salesTotal,
      store_total: storeTotal,
      map_dongs: map.map_dongs,
      map_points: map.map_points
    };
  });

  const payload = {
    title: '상권 업종별 데이터 커버리지',
    generated_at: new Date().toISOString(),
    quarter: view.quarter || null,
    rows: rows.length,
    summary: {
      business_types: items.length,
      service_types: items.filter(item => item.kind === 'service').length,
      service_with_sales: items.filter(item => item.kind === 'service' && item.has_sales).length,
      service_without_sales: items.filter(item => item.kind === 'service' && !item.has_sales).length,
      service_with_map_points: items.filter(item => item.kind === 'service' && item.has_map_points).length
    },
    items
  };

  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`저장: ${path.relative(ROOT, OUT)} 업종=${items.length}`);
}

if (require.main === module) build();

module.exports = {build, countMapDongs};
