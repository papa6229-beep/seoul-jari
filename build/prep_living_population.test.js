const assert = require('assert');
const {detectDelimiter, processCsvText, finalizeAgg} = require('./prep_living_population');

const semicolonText = [
  '"기준일";"시간";"행정동코드";"생활인구합계"',
  '"20260801";"11";"11680545     ";"100.5"',
  '"20260801";"20";"11680545     ";"200"',
  '"20260802";"02";"11110515     ";"300"'
].join('\n');

const state = {gu: new Map(), dong: new Map(), rows: 0, minDate: '', maxDate: '', headers: null, files: []};
processCsvText(semicolonText, state);

assert.equal(state.rows, 3);
assert.equal(state.minDate, '20260801');
assert.equal(state.maxDate, '20260802');
assert.equal(state.gu.get('11680').name, '강남구');
assert.equal(state.gu.get('11110').name, '종로구');

const gangnam = finalizeAgg(state.gu.get('11680').agg);
assert.equal(gangnam.avg, 150);
assert.equal(gangnam.lunch, 101);
assert.equal(gangnam.evening, 200);

assert.equal(detectDelimiter('"기준일","시간","행정동코드","생활인구합계"'), ',');
const commaState = {gu: new Map(), dong: new Map(), rows: 0, minDate: '', maxDate: '', headers: null, files: []};
processCsvText([
  '"기준일","시간","행정동코드","생활인구합계"',
  '"20260401","09","11680545","120"'
].join('\n'), commaState);
assert.equal(commaState.rows, 1);
assert.equal(finalizeAgg(commaState.gu.get('11680').agg).daytime, 120);

console.log('prep_living_population test ok');
