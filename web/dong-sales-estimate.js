(function(root){
  function median(values){
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  function create(view){
    const rows = Array.isArray(view && view.rows) ? view.rows : [];
    const ids = (view && Array.isArray(view.business_types) ? view.business_types : [])
      .map(type => type.id)
      .filter(id => id && id.startsWith('svc_'));
    const cityAverage = new Map();
    for (const id of ids){
      let amount = 0;
      let stores = 0;
      for (const row of rows){
        const item = row.biz && row.biz[id];
        if (!item || item.sales_incomplete || !item.sales || !item.stores) continue;
        amount += item.sales;
        stores += item.stores;
      }
      if (stores) cityAverage.set(id, amount / stores);
    }
    const byDong = new Map(rows.map(row => {
      const peers = [];
      for (const id of ids){
        const item = row.biz && row.biz[id];
        const city = cityAverage.get(id);
        if (!item || item.sales_incomplete || !item.sales || item.stores < 3 || !city) continue;
        peers.push({id, logRatio: Math.log((item.sales / item.stores) / city)});
      }
      return [row.code, {row, peers}];
    }));

    return {
      forDong(industryId, dongCode, baseMonthlyWon){
        const entry = byDong.get(dongCode);
        const stores = entry && entry.row.biz && entry.row.biz[industryId] && entry.row.biz[industryId].stores;
        if (!entry || !stores || !Number.isFinite(baseMonthlyWon) || baseMonthlyWon <= 0) return null;
        const comparable = entry.peers.filter(peer => peer.id !== industryId).map(peer => peer.logRatio);
        if (comparable.length < 5) return null;
        const factor = Math.max(.45, Math.min(1.6, Math.exp(.75 * median(comparable))));
        return {
          monthly_won: Math.round(baseMonthlyWon * factor),
          factor,
          peer_count: comparable.length
        };
      }
    };
  }

  function approxMoney(value){
    if (!Number.isFinite(value) || value <= 0) return '자료 없음';
    if (value >= 100000000) return '약 ' + (Math.round(value / 10000000) / 10).toFixed(1) + '억원';
    if (value >= 10000000) return '약 ' + (Math.round(value / 1000000) * 100).toLocaleString('ko-KR') + '만원';
    if (value >= 1000000) return '약 ' + (Math.round(value / 500000) * 50).toLocaleString('ko-KR') + '만원';
    return '약 ' + (Math.round(value / 100000) * 10).toLocaleString('ko-KR') + '만원';
  }

  const api = {create, approxMoney};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DongSalesEstimate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
