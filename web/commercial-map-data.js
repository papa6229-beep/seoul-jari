(function(root, factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CommercialMapData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  const currentDongs = {
    '11230536': ['용두동', '신설동'],
    '11680740': ['개포3동'],
    '11740520': ['상일1동']
  };

  function linkedDongs(code){
    return currentDongs[code] || null;
  }

  function storeKeys(row){
    const linked = linkedDongs(row.code);
    const names = linked || [row.name, row.name.replace(/(\d+(?:\.\d+)*)동$/, '동')];
    return [...new Set(names.map(name => row.gu + '/' + name))];
  }

  function pointsFor(all, row, business){
    const linked = linkedDongs(row.code);
    const lists = storeKeys(row).map(key => all[key]?.[business]).filter(list => Array.isArray(list) && list.length);
    return linked ? lists.flat() : (lists[0] || []);
  }

  return {linkedDongs, storeKeys, pointsFor};
});
