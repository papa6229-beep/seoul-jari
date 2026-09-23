const assert = require('assert');
const {buildSeoulUrl, fetchSeoulOpenApi} = require('./fetch_seoul_openapi');

const url = buildSeoulUrl({
  key: 'KEY',
  service: 'CardSubwayStatsNew',
  start: 1,
  end: 5,
  args: ['20260923']
});

  assert.equal(url, 'http://openapi.seoul.go.kr:8088/KEY/json/CardSubwayStatsNew/1/5/20260923');

(async () => {
  const data = await fetchSeoulOpenApi({
    key: 'KEY',
    service: 'SampleService',
    fetchImpl: async () => ({
      ok: true,
      text: async () => JSON.stringify({
        SampleService: {
          list_total_count: 1,
          RESULT: {CODE: 'INFO-000', MESSAGE: '정상 처리되었습니다'},
          row: [{A: 'B'}]
        }
      })
    })
  });
  assert.equal(data.serviceKey, 'SampleService');
  assert.equal(data.payload.row[0].A, 'B');
  console.log('fetch_seoul_openapi test ok');
})();
