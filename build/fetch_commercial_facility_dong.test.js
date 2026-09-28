const assert = require('assert');
const {SERVICE, normalizeRows, fetchCommercialFacilityDong} = require('./fetch_commercial_facility_dong');

const rows = normalizeRows([{
  STDR_YYQU_CD: '20221',
  ADSTRD_CD: '11110515',
  ADSTRD_CD_NM: '청운효자동',
  VIATR_FCLTY_CO: '93',
  PBLOFC_CO: '6',
  BANK_CO: '3',
  PARMACY_CO: '4',
  ELESCH_CO: '1',
  UNIV_CO: '8',
  BUS_STTN_CO: '26',
  SUBWAY_STATN_CO: ''
}]);

assert.equal(rows[0].total_facilities, 93);
assert.equal(rows[0].public_offices, 6);
assert.equal(rows[0].pharmacies, 4);
assert.equal(rows[0].universities, 8);
assert.equal(rows[0].bus_stops, 26);
assert.equal(rows[0].subway_stations, null);

(async () => {
  const fetched = await fetchCommercialFacilityDong({
    key: 'KEY',
    quarter: '20221',
    fetchImpl: async url => {
      assert.ok(url.includes('/' + SERVICE + '/'));
      return {
        ok: true,
        text: async () => JSON.stringify({
          [SERVICE]: {
            list_total_count: 1,
            RESULT: {CODE: 'INFO-000', MESSAGE: '정상 처리되었습니다'},
            row: [{STDR_YYQU_CD: '20221', ADSTRD_CD: '11110515', ADSTRD_CD_NM: '청운효자동', VIATR_FCLTY_CO: '93'}]
          }
        })
      };
    }
  });

  assert.equal(fetched.rows[0].total_facilities, 93);
  console.log('fetch_commercial_facility_dong test ok');
})();
