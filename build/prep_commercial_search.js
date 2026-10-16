const fs = require('node:fs');
const path = require('node:path');

function buildIndex(view) {
  const business_types = (view.business_types || []).map(({id, label, kind, group, words}) => ({id, label, kind, group, words}));
  const rows = (view.rows || []).map(row => {
    const industries = {};
    for (const [id, item] of Object.entries(row.biz || {})) {
      if (!item.stores && !item.sales) continue;
      const direct = !item.sales_incomplete && item.sales > 0 && item.stores > 0;
      industries[id] = {
        stores: item.stores || 0,
        sales_per_store_month_won: direct ? Math.round(item.sales / item.stores / 3) : null,
        sales_state: direct ? 'direct' : 'unavailable',
        sales_incomplete: !!item.sales_incomplete
      };
    }
    return {
      code: row.code, gu: row.gu, name: row.name, full_name: row.full_name,
      residents: row.residents ?? null, workers: row.workers ?? null,
      floating: row.floating ?? null, industries
    };
  });
  return {source: view.source, quarter: view.quarter, generated_at: view.generated_at, business_types, rows};
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  try {
    const options = {}, args = process.argv.slice(2);
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i] === '--source' ? 'source' : args[i] === '--out' ? 'out' : null;
      if (!key || Object.hasOwn(options, key) || !args[i + 1] || args[i + 1].startsWith('--')) {
        throw Error('Usage: node build/prep_commercial_search.js [--source <view.json>] [--out <search.json>]');
      }
      options[key] = args[i + 1];
    }
    const source = options.source || path.join(root, 'web', 'data', 'commercial-view-dong.json');
    const output = options.out || path.join(root, 'web', 'data', 'commercial-search-index.json');
    const index = buildIndex(JSON.parse(fs.readFileSync(source, 'utf8')));
    fs.writeFileSync(output, JSON.stringify(index) + '\n');
    console.log(JSON.stringify({ quarter: index.quarter, rows: index.rows.length, businessTypes: index.business_types.length }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {buildIndex};


