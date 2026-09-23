# 서울자리

서울에서 자영업 창업 후보지를 살펴보는 **입지·상권 데이터 도구**.
`supot`의 영어학원 분석 기반을 복제해, 서울 한정 창업 입지 서비스로 개조하는 중이다.

현재 즉시 분석 가능한 업종은 학원·교습소이고, 카페·분식·피트니스·무인점포는 상가업소·생활인구 데이터를 붙이는 단계다.
창업·투자·임대차 계약의 최종 판단 근거가 아니라 후보지를 좁히는 참고 도구로 둔다.

---

## 화면

```
메인 (index.html)
 ├ 01 서울 입지 분석 (location.html)
 ├ 02 업종별 기준 (parents.html)
 ├ 03 상권 데이터 (commercial.html)
 └ 04 창업 체크리스트 (highschool.html)
```

**서울 입지 분석** — 왼쪽은 컨트롤, 오른쪽은 결과다. 지표 하나로 지역 순위를 매기고
다른 지표를 최대 4개까지 옆에 나란히 붙인다. 한 번에 10개씩 넘겨 보고,
줄을 누르면 아래에 그 지역 상세가 열린다. 막대마다 중앙값 선이 그어진다.

| 그룹 | 지표 |
|---|---|
| 학원 | 영어 학원 수 · 영어 학원(전문+복합) · └ 전문학원 · └ 영어+타 과목 · 영어 교습소 · 최근 3년에 생긴 곳 · 전 과목 학원 수 · 월 수강료(중간값) |
| 학교 | 초·중학교 수 · 초등학교 수 · 중학교 수 |
| 인구 | 초4~중3 인구 · 초등학생 나이 인구 · 중학생 나이 인구 |

지역 단위는 서울 **구**와 **법정동** 중심으로 본다. 둘 다 인구까지 붙는다.

인구 통계에는 행정동판(상계1동…)과 법정동판(상계동)이 따로 있다. 학원 주소가
법정동 기준이므로 **법정동판**을 쓴다. 그래야 각 동이 하나씩 그대로 나온다.
읍·면은 인구가 리까지 쪼개져 있어 읍·면으로 합쳐 올린다.

**상권 데이터** — 행정동 기준으로 수요·매출·경쟁·구매력 신호를 묶어 본다.
서울시 상권분석서비스의 유동인구, 추정매출, 점포, 직장인구, 상주인구, 소득소비
자료가 생성되면 업종별 후보 행정동 순위를 보여준다.

---

## 데이터

| 자료 | 출처 | 갱신 |
|---|---|---|
| 학원·교습소 | 나이스 교육정보 개방포털 · 학원교습소정보 | 매주 |
| 초·중학교 | 나이스 교육정보 개방포털 · 학교기본정보 | 매주 |
| 연령별 인구 | 행정안전부 · 주민등록 인구통계 (법정동 × 1세) | 매월 |
| 행정동↔법정동 | 국가데이터처 · 법정동 연계정보 (주소 검증용) | 분기 |

기준 시점 **2026-08**. 복제 원본에는 서울 + 경기 데이터가 있으나, 서울자리는 화면과 해석 범위를 서울로 제한한다.

```
학원·교습소 64,759건   그중 영어 13,059곳
                       = 전문학원 6,911 + 영어+타과목 1,250 + 교습소 4,898
초·중학교   3,082개교
초4~중3 인구 116만 명
```

### 다시 만들기

```bash
python build/fetch_neis.py                       # 학원·학교 스냅샷
python build/fetch_neis.py 43                    # 3년 전(2023-08) 학원 스냅샷 -> aca_2023-08.csv 로 이름 바꿔 둔다
python build/fetch_population.py                 # 법정동별 연령 인구 (56회 호출)
python build/fetch_schoolinfo.py                 # 학교알리미: 학년별 재학생·전입·전출 (키 필요)
python build/prep_dongmap.py <연계정보.csv>       # 82MB 원본 -> 126KB 추출
python build/prep.py                             # -> web/data/regions.json
python build/prep_places.py                      # -> web/data/places/ (동별 지도·학원 목록)
python build/prep_market.py                      # -> web/data/market.json (개원시장 동별 분석)
python build/prep_hubs.py                        # -> web/data/hubs.json (큰 학원가까지 거리, places 다음에)
python build/prep_dates.py                       # -> web/data/dates.json (자료별 기준일, 맨 마지막에)
node build/prep_stores.test.js                   # 상가업소 집계 테스트
node build/prep_stores.js data/raw/store_businesses.csv web/data/store-summary.json 2026-09-23
                                                   # -> web/data/store-summary.json (서울 상가업소 업종 요약)
set DATA_GO_KR_SERVICE_KEY=발급받은_일반_인증키
node build/fetch_stores_api.js --limit-gu=강남구 --max-pages=1
                                                   # 상가(상권)정보 API 빠른 점검
node build/fetch_stores_api.js                    # 서울 25개 구 전체 수집
set SEOUL_OPENAPI_KEY=서울_열린데이터광장_일반_인증키
node build/fetch_seoul_openapi.js --service=서비스명 --start=1 --end=1000
                                                   # 서울 열린데이터광장 API 공통 호출
node build/fetch_living_population_daily.test.js   # 자치구 생활인구 API 테스트
node build/fetch_living_population_daily.js --date=20260918
                                                   # -> web/data/living-population-daily-gu.json (최신 자치구 생활인구)
node build/fetch_commercial_floating_population.test.js
node build/fetch_commercial_floating_population.js --quarter=20251
                                                   # -> web/data/commercial-floating-population-dong.json (상권분석 행정동 유동인구)
node build/fetch_commercial_sales_dong.test.js
node build/fetch_commercial_sales_dong.js --quarter=20251
                                                   # -> web/data/commercial-sales-dong.json (상권분석 행정동 추정매출)
node build/fetch_commercial_stores_dong.test.js
node build/fetch_commercial_stores_dong.js --quarter=20251
                                                   # -> web/data/commercial-stores-dong.json (상권분석 행정동 점포)
node build/fetch_commercial_worker_population_dong.test.js
node build/fetch_commercial_worker_population_dong.js --quarter=20261
                                                   # -> web/data/commercial-worker-population-dong.json (상권분석 행정동 직장인구)
node build/fetch_commercial_resident_population_dong.test.js
node build/fetch_commercial_resident_population_dong.js --quarter=20241
                                                   # -> web/data/commercial-resident-population-dong.json (상권분석 행정동 상주인구)
node build/fetch_commercial_income_consumption_dong.test.js
node build/fetch_commercial_income_consumption_dong.js --quarter=20262
                                                   # -> web/data/commercial-income-consumption-dong.json (상권분석 행정동 소득소비)
node build/prep_admin_dong_codes.test.js
node build/prep_admin_dong_codes.js C:\Users\BNN\Downloads\전국_행정동_코드정보.zip
                                                   # -> web/data/admin-dong-codes.json (서울 행정동 코드·이름)
node build/prep_living_population_grid.test.js
node build/prep_living_population_grid.js C:\Users\BNN\Downloads\서울생활인구_250m격자정보_EPSG5179.zip
                                                   # -> web/data/living-population-grid.json (250m 격자 중심점)
node build/prep_living_population.test.js          # 생활인구 zip 집계 테스트
node build/prep_living_population.js C:\Users\BNN\Downloads\250_LOCAL_RESD_ADMDONG_202604.zip C:\Users\BNN\Downloads\250_LOCAL_RESD_ADMDONG_202605.zip
                                                   # -> web/data/living-population.json (서울 생활인구 구·행정동 요약)
```

### 상가(상권)정보 API 자동 갱신

공공데이터포털 인증키는 코드에 넣지 않는다.

GitHub 저장소에서는 `Settings → Secrets and variables → Actions → New repository secret`에 아래 이름으로 저장한다.

```
DATA_GO_KR_SERVICE_KEY
```

그 다음 `Actions → Update Store Data → Run workflow`에서 수동 실행한다. 처음에는 `limit_gu=강남구`, `max_pages=1`로 테스트하고, 응답이 맞으면 입력값을 비워 서울 25개 구 전체를 갱신한다.

### 서울 열린데이터광장 API

서울 열린데이터광장 인증키도 코드에 넣지 않는다.

GitHub Actions secret 이름:

```
SEOUL_OPENAPI_KEY
```

자치구별 서울 생활인구(250m) 일별집계는 `SPOP_DAILYSUM_JACHI_250` 서비스를 쓴다.
`fetch_living_population_daily.js`가 최신 또는 지정 기준일의 구 단위 생활인구를
`web/data/living-population-daily-gu.json`으로 저장한다.

서울시 상권분석서비스 행정동 유동인구는 `VwsmAdstrdFlpopW` 서비스를 쓴다.
`fetch_commercial_floating_population.js`가 최신 또는 지정 분기의 행정동별 연령·시간대·요일별
유동인구를 `web/data/commercial-floating-population-dong.json`으로 저장한다.
행정동 추정매출은 `VwsmAdstrdSelngW`, 행정동 점포는 `VwsmAdstrdStorW` 서비스를 쓴다.
각각 `web/data/commercial-sales-dong.json`, `web/data/commercial-stores-dong.json`으로 저장한다.
행정동 직장인구는 `VwsmAdstrdWrcPopltnW` 서비스를 쓰고,
`web/data/commercial-worker-population-dong.json`으로 저장한다.
행정동 상주인구는 `VwsmAdstrdRepopW` 서비스를 쓰고,
`web/data/commercial-resident-population-dong.json`으로 저장한다.
행정동 소득소비는 `VwsmAdstrdNcmCnsmpW` 서비스를 쓰고,
`web/data/commercial-income-consumption-dong.json`으로 저장한다.

서울 생활인구의 행정구역 코드정보 zip은 `prep_admin_dong_codes.js`로 서울 427개 행정동
코드·이름만 추출해 `web/data/admin-dong-codes.json`으로 저장한다. 이 파일이 있으면
`prep_living_population.js`가 행정동 생활인구 요약에 `name`, `full_name`을 함께 붙인다.

서울 생활인구 250m 격자정보는 `prep_living_population_grid.js`로 격자 중심점을 추출한다.
원본은 EPSG:5179 좌표계이고, 배포 파일에는 브라우저 지도에서 쓰기 쉬운 WGS84 위경도도 함께 둔다.

현재는 서울 열린데이터광장의 `[내국인] 행정동별 서울 생활인구(250m)` 내려받기 파일을
`prep_living_population.js`로 먼저 요약한다. 원본 zip은 용량이 커서 저장소에 담지 않고,
`web/data/living-population.json`만 배포한다.

`data/raw/aca_*.csv`, `school_*.csv`는 커서 저장소에 담지 않는다. 위 스크립트로 받는다.
법정동 연계정보 원본은 공공데이터포털 로그인이 필요해 추출본(`dongmap.csv`)만 담았다.
개원시장 분석 원본(`data/raw/market_analysis_2026-09.docx`)은 개인 표현이 있어 담지 않는다.
이 문서의 동별 내용은 대부분 유형 추정(근거 등급 E2)이고, 같은 유형이면 설명이 똑같다.
그래서 `market.json`은 설명을 유형에 한 번만 두고, 동에는 유형·등급과 그 동만을 위해 쓴 문장(31곳)만 싣는다.

### 버전 올리기

화면을 고치면 세 군데 숫자를 같이 올린다. 브라우저가 옛 화면을 붙잡고 있으면
페이지가 `version.json`을 보고 한 번 새로 불러온다.

- `web/version.json` 의 `v`
- `web/index.html`, `web/location.html` 의 `PAGE_V` 와 `styles.css?v=`
- `web/location.html` 의 `const V` (자료 파일 캐시용)

### 보기

```bash
python -m http.server 5178 --directory web
```

---

## 판별 규칙과 함정

데이터를 그대로 믿으면 틀린다. 실제로 걸러낸 것들:

**영어학원 고르기** — 교습과정명에 `영어`라는 값이 아예 없다. `보습` 같은 대분류만
들어간다. 그래서 학원명·교습과정목록·수강료 내역을 함께 본다.

- `어학원`은 **국어학원 658곳**·헤어학원·중국어학원을 끌고 온다 → 앞글자 배제
- 교습소는 법으로 **1과목만** 가르치므로 이름이 곧 과목이다. `김보영과학교습소`처럼
  교습과정에 `영어`가 잘못 입력된 46건이 있어 교습소는 이름 신호를 요구한다

**전문 / 복합 가르기**

- `실용외국어`의 '국어'가 순수 어학원을 복합으로 보냈다 → 앞글자 배제
- `보습·논술`의 '논술', `영어독서`의 '독서'는 영어학원에도 흔하다 → 신호에서 제외
- 분야명 `종합(대)`는 종합학원이라는 뜻이 **아니다**. 분류 코드 이름이고
  `대치심슨어학원` 같은 순수 어학원 427곳이 여기 들어간다 → 신호에서 제외

**주소에서 동 뽑기** — 원본에 좌표가 없어 도로명상세주소에서 뽑는다.

```
', 2층 211호(상가동) (대치동, 대치삼성아파트)'
              ↑ 아파트 상가동. 이걸 지역명으로 읽고 있었다
```

연계정보의 실제 동 이름 목록으로 검증해서 고른다. `퇴계원면→퇴계원읍` 같은
읍·면 승격 표기 차이도 맞춘다.

---

## 알려진 한계

- **좌표가 없다.** 학원·학교 원본에 위경도가 없어 지도를 못 그린다.
  주소 6.7만 건을 좌표로 바꾸는 작업이 따로 필요하다
- **수강료는 21%만 공개**돼 있다. 시세로 읽을 때 주의
- **개원·폐원은 3년 전 스냅샷과 맞춰 센다.** 스냅샷에는 `개원`만 담기고, 이전·변경
  등록을 하면 **개설일자가 새 날짜로 바뀐다**(2022년 개원이 2025년 개원으로 적힘). 그래서
  2023-08 스냅샷(fileSeq 43)과 학원지정번호로 맞춰 새로 생긴 곳·사라진 곳·실제 문 연 해를 낸다.
  **학원지정번호는 교육청마다 따로 매겨 서울과 경기에 같은 번호가 있다.** 반드시 (시도, 번호)로 맞춘다.
  fileSeq는 날짜 순이 아니다. 목록은 `POST /portal/data/file/searchFileData.do`.
- 사라진 곳에는 폐원 말고도 번호가 바뀐 재등록이 섞일 수 있다. 같은 구에 같은 이름이 있으면 뺐다.
- **개인과외교습자(공부방)는 전국 데이터가 없다.** 잡히는 건 학원·교습소까지
- **학교 재학생·전입·전출은 학교알리미 오픈API(apiType=10)**에서 받는다. 공공데이터포털 키가 아니라
  학교알리미에서 따로 받은 키(`data/secrets/schoolinfo_key.txt`)를 쓰고, 2026년 이후 키는
  `sidoCode`(2자리)·`sggCode`(5자리)가 필수다. 일반구가 있는 시는 구 코드로 부른다(부천은 옛 구 코드).
  (구시, 학교명)으로 99% 맞는다. 특목·자사고 진학률은 이 API에 없다.
- 영어학원의 4.7%는 주소에 동 정보가 없거나 인구 통계와 이름이 어긋나
  동 단위 인구가 붙지 않는다 (구·시 단위는 전부 붙는다)
- **일반구가 있는 8개 시는 부동산 자료가 비어 있다.** 실거래 API의 `LAWD_CD`는
  시가 아니라 일반구 코드라야 한다. `41130 성남시`는 0건, `41135 분당구`는 145건.
  부천은 2019년에 행정구가 폐지됐는데도 옛 구 코드(`41192` 등)를 그대로 쓴다.
  채우려면 `fetch_realestate.py`의 `SIGUNGU`에서 아래를 바꿔 넣고 다시 받는다.

  | 시 | 시 코드(0건) | 써야 할 구 코드 |
  |---|---|---|
  | 성남 | 41130 | 41131 41133 41135 |
  | 고양 | 41280 | 41281 41285 41287 |
  | 안양 | 41170 | 41171 41173 |
  | 부천 | 41190 | 41192 41194 41196 |
  | 수원 | 41110 | 41111 41113 41115 41117 |
  | 안산 | 41270 | 41271 41273 |
  | 용인 | 41460 | 41461 41463 41465 |
  | 화성 | 41590 | — (일반구 신설분 확인 필요) |

  이 시들은 학원·학교·인구는 다 있고 아파트값과 상가 핀만 없다.

- **목록에 올리는 동의 기준**: 초4~중3이 100명 이상. 종로 관철동처럼 사무실만
  있는 법정동을 빼기 위한 것이다 (`prep.py`의 `MIN_POP`)
