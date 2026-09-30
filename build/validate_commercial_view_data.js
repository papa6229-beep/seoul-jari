#!/usr/bin/env node
const path = require('node:path');
const {BIZ: groups} = require('./build_commercial_view_data');

function totalStores(row){
  return row.similar_store_count ?? (row.store_count || 0) + (row.franchise_store_count || 0);
}

function validate({quarter, dongSales, dongStores, guSales, guStores, viewRows}){
  const current = rows => rows.filter(row => row.quarter === quarter);
  const sales = current(dongSales);
  const stores = current(dongStores);
  const view = new Map(viewRows.map(row => [row.code, row]));
  const sourceCodes = new Set([...sales, ...stores].map(row => row.dong_code));
  if (view.size !== viewRows.length) throw new Error('화면 행정동 코드 중복');
  for (const code of sourceCodes) if (!view.has(code)) throw new Error(`화면에서 행정동 ${code} 누락`);
  for (const code of view.keys()) if (!sourceCodes.has(code)) throw new Error(`원본에 없는 행정동 ${code}`);

  const groupedSales = new Map();
  const groupedStores = new Map();
  function addGrouped(map, row, value){
    for (const [id, words] of Object.entries(groups)){
      if (!words.some(word => String(row.business_name || '').includes(word))) continue;
      const key = row.dong_code + '|' + id;
      map.set(key, (map.get(key) || 0) + value);
    }
  }
  for (const row of sales){
    const bucket = view.get(row.dong_code).biz?.['svc_' + row.business_code];
    if (!bucket || bucket.sales !== row.amount || bucket.sales_count !== row.count){
      throw new Error(`동 매출 불일치: ${row.dong_code} ${row.business_code}`);
    }
    addGrouped(groupedSales, row, row.amount || 0);
  }
  for (const row of stores){
    const bucket = view.get(row.dong_code).biz?.['svc_' + row.business_code];
    if (!bucket || bucket.stores !== totalStores(row) ||
        bucket.independent_stores !== (row.store_count || 0) ||
        bucket.franchises !== (row.franchise_store_count || 0)){
      throw new Error(`동 점포 불일치: ${row.dong_code} ${row.business_code}`);
    }
    addGrouped(groupedStores, row, totalStores(row));
  }
  for (const row of viewRows){
    for (const id of Object.keys(groups)){
      const key = row.code + '|' + id;
      const bucket = row.biz?.[id];
      if ((bucket?.sales || 0) !== (groupedSales.get(key) || 0) ||
          (bucket?.stores || 0) !== (groupedStores.get(key) || 0)){
        throw new Error(`묶음 값 불일치: ${key}`);
      }
    }
  }

  const key = (area, code) => area + '|' + code;
  const districtSales = new Map(current(guSales).map(row => [key(row.area_code, row.business_code), row]));
  const districtStores = new Map(current(guStores).map(row => [key(row.area_code, row.business_code), row]));
  let references = 0;
  for (const row of viewRows){
    for (const [id, bucket] of Object.entries(row.biz || {})){
      if (!id.startsWith('svc_') || !bucket.reference_sales) continue;
      const ref = bucket.reference_sales;
      const lookup = key(row.code.slice(0, 5), id.slice(4));
      const sourceSales = districtSales.get(lookup);
      const sourceStores = districtStores.get(lookup);
      if (!sourceSales || !sourceStores || ref.scope !== '자치구' ||
          ref.amount !== sourceSales.amount || ref.count !== sourceSales.count ||
          ref.stores !== totalStores(sourceStores) ||
          ref.monthly_sales_per_store !== Math.round(sourceSales.amount / totalStores(sourceStores) / 3)){
        throw new Error(`구 참고값 불일치: ${row.code} ${id}`);
      }
      references++;
    }
  }
  return {dong_sales: sales.length, dong_stores: stores.length,
    grouped_cells: viewRows.length * Object.keys(groups).length, references};
}

if (require.main === module){
  const data = path.resolve(__dirname, '..', 'web', 'data');
  const read = name => require(path.join(data, name + '.json'));
  const view = read('commercial-view-dong');
  const result = validate({quarter: view.quarter, viewRows: view.rows,
    dongSales: read('commercial-sales-dong').rows,
    dongStores: read('commercial-stores-dong').rows,
    guSales: read('commercial-sales-signgu').rows,
    guStores: read('commercial-stores-signgu').rows});
  console.log(JSON.stringify({quarter: view.quarter, ...result}, null, 2));
}

module.exports = {validate};
