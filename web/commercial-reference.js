(function(root, factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CommercialReference = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  function assessReference(reference, dongTotals){
    if (!reference || reference.scope !== '자치구' || !dongTotals ||
        !Number.isFinite(reference.amount) || !Number.isFinite(reference.stores) ||
        !Number.isFinite(dongTotals.amount) || !Number.isFinite(dongTotals.stores)){
      return {comparable: false};
    }
    return {
      comparable: reference.amount === dongTotals.amount && reference.stores === dongTotals.stores,
      sales_match: reference.amount === dongTotals.amount,
      stores_match: reference.stores === dongTotals.stores
    };
  }

  function rankWithinGu(rows, selected){
    if (!selected || !selected.sales_per_store_month) return null;
    const comparable = rows.filter(row => row.gu === selected.gu && row.sales_per_store_month > 0)
      .sort((a, b) => b.sales_per_store_month - a.sales_per_store_month || a.code.localeCompare(b.code));
    const index = comparable.findIndex(row => row.code === selected.code);
    return index < 0 ? null : {rank: index + 1, total: comparable.length};
  }

  return {assessReference, rankWithinGu};
});
