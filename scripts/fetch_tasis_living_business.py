#!/usr/bin/env python3
"""Fetch Seoul NTS TASIS 100 living-business statistics.

This collector intentionally stays separate from Seoul Jari app data. It only
creates source CSV/JSON files and a verification report.
"""

from __future__ import annotations

import argparse
import csv
import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


SOURCE = "NTS_TASIS_LIVING_BUSINESS"
API_URL = "https://tasis.nts.go.kr/wqAction.do?actionId=ATWEPFLA001R03"
SUBMISSION_ID = "mf_wfm_main_subMain_sbm_selectDetail"
TABLE_ID = "TTQSNAI01T088712"
DEFAULT_YEAR = "2025"
DEFAULT_SIDO = "11"
DEFAULT_SGG = "00000"
DEFAULT_GIN_AMT = "30000"

# Official 100 living-business list verified from the TASIS R03 API response.
LIVING_BUSINESSES = [
    ("001", "가구점"),
    ("002", "가전제품판매점"),
    ("003", "건강보조식품가게"),
    ("004", "건어물가게"),
    ("005", "곡물가게"),
    ("006", "과일가게"),
    ("007", "꽃가게"),
    ("008", "담배ㆍ복권소매업"),
    ("009", "문구점"),
    ("010", "생선가게"),
    ("011", "서점"),
    ("012", "슈퍼마켓"),
    ("013", "스포츠용품점"),
    ("014", "시계ㆍ귀금속점"),
    ("015", "식료품가게"),
    ("016", "신발가게"),
    ("017", "안경점"),
    ("018", "애완용품점"),
    ("019", "약국"),
    ("020", "옷가게"),
    ("021", "의료용품가게"),
    ("022", "이륜자동차판매점"),
    ("023", "자전거판매점"),
    ("024", "장난감가게"),
    ("025", "정육점"),
    ("026", "주유소"),
    ("027", "중고차판매점"),
    ("028", "채소가게"),
    ("029", "철물점"),
    ("030", "침구ㆍ커튼가게"),
    ("031", "컴퓨터판매점"),
    ("032", "통신판매업"),
    ("033", "편의점"),
    ("034", "화장품가게"),
    ("035", "휴대폰가게"),
    ("036", "간이주점"),
    ("037", "구내식당"),
    ("038", "기타외국식음식점"),
    ("039", "기타음식점"),
    ("040", "분식점"),
    ("041", "여관ㆍ모텔"),
    ("042", "일식음식점"),
    ("043", "제과점"),
    ("044", "중식음식점"),
    ("045", "커피음료점"),
    ("046", "패스트푸드점"),
    ("047", "펜션ㆍ게스트하우스"),
    ("048", "한식음식점"),
    ("049", "호프주점"),
    ("050", "pc방"),
    ("051", "가전제품수리점"),
    ("052", "결혼상담소"),
    ("053", "노래방"),
    ("054", "당구장"),
    ("055", "독서실"),
    ("056", "목욕탕"),
    ("057", "미용실"),
    ("058", "부동산중개업"),
    ("059", "사진촬영업"),
    ("060", "세탁소"),
    ("061", "스포츠시설운영업"),
    ("062", "실내스크린골프점"),
    ("063", "실외골프연습장"),
    ("064", "여행사"),
    ("065", "예식장"),
    ("066", "이발소"),
    ("067", "자동차수리점"),
    ("068", "LPG 충전소"),
    ("069", "피부관리업"),
    ("070", "헬스클럽"),
    ("071", "교습학원"),
    ("072", "교습소ㆍ공부방"),
    ("073", "기술ㆍ직업훈련학원"),
    ("074", "스포츠교육기관"),
    ("075", "예술학원"),
    ("076", "감정평가사"),
    ("077", "건축사"),
    ("078", "공인노무사"),
    ("079", "공인회계사"),
    ("080", "기술사"),
    ("081", "법무사"),
    ("082", "변리사"),
    ("083", "변호사"),
    ("084", "세무사"),
    ("085", "기타일반의원"),
    ("086", "내과ㆍ소아과의원"),
    ("087", "동물병원"),
    ("088", "산부인과의원"),
    ("089", "성형외과의원"),
    ("090", "신경정신과의원"),
    ("091", "안과의원"),
    ("092", "이비인후과의원"),
    ("093", "일반외과의원"),
    ("094", "종합병원"),
    ("095", "치과의원"),
    ("096", "피부ㆍ비뇨기과의원"),
    ("097", "한방병원ㆍ한의원"),
    ("098", "간판광고물업"),
    ("099", "실내장식가게"),
    ("100", "주차장운영업"),
]

MISSING_INDUSTRIES = [
    "가정용품임대",
    "건축물청소",
    "게스트하우스",
    "기타법무서비스",
    "기타오락장",
    "녹음실",
    "독서실",
    "동물병원",
    "모터사이클및부품",
    "모터사이클수리",
    "미용재료",
    "법무사사무소",
    "변리사사무소",
    "변호사사무소",
    "복권방",
    "볼링장",
    "비디오/서적임대",
    "사진관",
    "세무사사무소",
    "악기",
    "여행사",
    "예술품",
    "유아의류",
    "의류임대",
    "자동차부품",
    "재생용품 판매점",
    "전자게임장",
    "주류도매",
    "주유소",
    "중고가구",
    "중고차판매",
    "컴퓨터학원",
    "통번역서비스",
    "통신기기수리",
    "한복점",
    "회계사사무소",
    "DVD방",
    "고시원",
]

MANUAL_MAPPING = {
    "게스트하우스": ("047", "펜션ㆍ게스트하우스", "broader_category", "펜션과 게스트하우스가 함께 묶인 TASIS 업종입니다."),
    "독서실": ("055", "독서실", "exact", ""),
    "동물병원": ("087", "동물병원", "exact", ""),
    "모터사이클및부품": ("022", "이륜자동차판매점", "equivalent", "TASIS 적용범위가 모터사이클 및 부품 판매업입니다."),
    "모터사이클수리": ("067", "자동차수리점", "broader_category", "자동차수리점은 이륜차 수리보다 넓은 범주입니다."),
    "법무사사무소": ("081", "법무사", "equivalent", ""),
    "변리사사무소": ("082", "변리사", "equivalent", ""),
    "변호사사무소": ("083", "변호사", "equivalent", ""),
    "복권방": ("008", "담배ㆍ복권소매업", "broader_category", "담배 소매와 복권 소매가 함께 묶여 있습니다."),
    "사진관": ("059", "사진촬영업", "equivalent", ""),
    "세무사사무소": ("084", "세무사", "equivalent", ""),
    "여행사": ("064", "여행사", "exact", ""),
    "주유소": ("026", "주유소", "exact", ""),
    "중고차판매": ("027", "중고차판매점", "equivalent", ""),
    "컴퓨터학원": ("071", "교습학원", "broader_category", "컴퓨터학원만 분리되지 않고 교습학원 전체입니다."),
    "회계사사무소": ("079", "공인회계사", "equivalent", ""),
    "고시원": ("041", "여관ㆍ모텔", "broader_category", "고시원 직접 업종이 아니라 숙박업 일부 참고값입니다."),
}

FIELDNAMES = [
    "source",
    "industry_code",
    "industry_name",
    "query_year",
    "sales_tax_year",
    "business_count_year",
    "sido_code",
    "sido_name",
    "sgg_code",
    "sgg_name",
    "avg_annual_sales_manwon",
    "avg_monthly_sales_manwon",
    "sales_yoy_rate",
    "business_count",
    "business_count_yoy_rate",
    "avg_business_age_year",
    "avg_business_age_month",
    "male_business_count",
    "female_business_count",
    "raw_response",
]


@dataclass
class FetchResult:
    code: str
    expected_name: str
    ok: bool
    row: dict[str, Any] | None = None
    raw: dict[str, Any] | None = None
    error: str | None = None


def to_number(value: Any) -> float | int | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return value
    text = str(value).replace(",", "").strip()
    if not text:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    return int(number) if number.is_integer() else number


def request_detail(code: str, year: str) -> dict[str, Any]:
    payload = {
        "dc_search": {
            "SCH_YR": year,
            "SCH_THMA_STT_TBL_ID": TABLE_ID,
            "SCH_SIDO_CD": DEFAULT_SIDO,
            "SCH_SGG_CD": DEFAULT_SGG,
            "SCH_N100_LVNG_TFB_CD": code,
            "SCH_GIN_AMT": DEFAULT_GIN_AMT,
        }
    }
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        API_URL,
        data=data,
        headers={
            "Content-Type": "application/json; charset=UTF-8",
            "submissionid": SUBMISSION_ID,
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read()
    text = raw.decode("utf-8")
    return json.loads(text)


def extract_row(raw: dict[str, Any], code: str, year: str) -> dict[str, Any]:
    detail = raw.get("dc_lvngTfbDetail") or {}
    avg_annual = to_number(detail.get("AVG_GIN_AMT"))
    business_count = to_number(detail.get("TOTA_BMAN_CNT"))
    return {
        "source": SOURCE,
        "industry_code": detail.get("N100_LVNG_TFB_CD") or code,
        "industry_name": detail.get("N100_LVNG_TFB_NM"),
        "query_year": int(year),
        # Verified against the 2025 TASIS UI: 2025 query shows 2024 sales and 2025 business count.
        "sales_tax_year": int(year) - 1,
        "business_count_year": int(year),
        "sido_code": detail.get("SIDO_CD"),
        "sido_name": detail.get("SIDO_NM"),
        "sgg_code": detail.get("SGG_CD"),
        "sgg_name": detail.get("SGG_NM"),
        "avg_annual_sales_manwon": avg_annual,
        "avg_monthly_sales_manwon": round(avg_annual / 12, 6) if isinstance(avg_annual, (int, float)) else None,
        "sales_yoy_rate": to_number(detail.get("PYR_CPR_AVG_GIN_AMT_INCR_RTE")),
        "business_count": business_count,
        "business_count_yoy_rate": to_number(detail.get("PYR_CPR_TOT_BMAN_CNT_INCR_RTE")),
        "avg_business_age_year": to_number(detail.get("AVG_ASCD_YY_CNT")),
        "avg_business_age_month": to_number(detail.get("AVG_ASCD_MM_CNT")),
        "male_business_count": to_number(detail.get("SEX_CNT_01")),
        "female_business_count": to_number(detail.get("SEX_CNT_02")),
        "raw_response": json.dumps(raw, ensure_ascii=False, separators=(",", ":")),
    }


def fetch_with_retry(code: str, expected_name: str, year: str, retries: int, delay: float) -> FetchResult:
    last_error = None
    for attempt in range(retries + 1):
        try:
            raw = request_detail(code, year)
            detail = raw.get("dc_lvngTfbDetail") or {}
            valid = (
                raw.get("result") == "S"
                and bool(detail.get("N100_LVNG_TFB_CD"))
                and bool(detail.get("N100_LVNG_TFB_NM"))
            )
            if not valid:
                return FetchResult(code, expected_name, False, raw=raw, error="invalid_response")
            return FetchResult(code, expected_name, True, row=extract_row(raw, code, year), raw=raw)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = repr(exc)
            if attempt < retries:
                time.sleep(delay * (2**attempt))
    return FetchResult(code, expected_name, False, error=last_error)


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def build_mapping(rows_by_code: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    mapping_rows = []
    for missing_name in MISSING_INDUSTRIES:
        code, tasis_name, status, note = MANUAL_MAPPING.get(missing_name, ("", "", "no_match", "TASIS 100대 생활업종 직접 대응 없음"))
        source_row = rows_by_code.get(code, {}) if code else {}
        mapping_rows.append(
            {
                "missing_industry_name": missing_name,
                "match_status": status,
                "tasis_industry_code": code,
                "tasis_industry_name": tasis_name,
                "source": SOURCE if code else "",
                "sales_tax_year": source_row.get("sales_tax_year", ""),
                "business_count_year": source_row.get("business_count_year", ""),
                "avg_annual_sales_manwon": source_row.get("avg_annual_sales_manwon", ""),
                "avg_monthly_sales_manwon": source_row.get("avg_monthly_sales_manwon", ""),
                "business_count": source_row.get("business_count", ""),
                "note": note,
            }
        )
    return mapping_rows


def write_report(
    path: Path,
    rows: list[dict[str, Any]],
    mapping_rows: list[dict[str, Any]],
    failures: list[FetchResult],
    verification_rows: list[dict[str, Any]],
) -> None:
    status_counts: dict[str, int] = {}
    for row in mapping_rows:
        status_counts[row["match_status"]] = status_counts.get(row["match_status"], 0) + 1
    exact_equiv = status_counts.get("exact", 0) + status_counts.get("equivalent", 0)

    lines = [
        "# TASIS 100대 생활업종 서울 매출 데이터 수집 보고서",
        "",
        "## 요약",
        "",
        f"- source: `{SOURCE}`",
        f"- 유효 TASIS 업종 수: {len(rows)}",
        f"- 실패 요청 수: {len(failures)}",
        f"- 누락 38개 중 exact/equivalent 보완 가능: {exact_equiv}",
        f"- broader_category: {status_counts.get('broader_category', 0)}",
        f"- no_match: {status_counts.get('no_match', 0)}",
        "",
        "## 연도 기준 검증",
        "",
        "- TASIS 2025 조회 화면에서 평균 연매출은 `2024년 귀속`, 사업자 수는 `2025년 말`로 표시되는 것을 사용자가 화면으로 확인했다.",
        "- 수집 결과에는 `query_year`, `sales_tax_year`, `business_count_year`를 분리 저장했다.",
        "- 현재 수집기 규칙: `sales_tax_year = query_year - 1`, `business_count_year = query_year`.",
        "- 다른 연도 화면 비교는 자동으로 확정하지 않았고, 화면 기준 재확인이 필요한 항목으로 남긴다.",
        "",
        "검증 샘플:",
    ]
    for row in verification_rows:
        lines.append(
            f"- {row['industry_code']} {row['industry_name']}: 연평균 {row['avg_annual_sales_manwon']}만원, "
            f"사업자 {row['business_count']}명, sales_tax_year={row['sales_tax_year']}, business_count_year={row['business_count_year']}"
        )

    lines.extend(["", "## 전체 업종코드 목록", ""])
    for row in rows:
        lines.append(
            f"- {row['industry_code']} {row['industry_name']}: 연 {row['avg_annual_sales_manwon']}만원 / 월 {row['avg_monthly_sales_manwon']}만원 / 사업자 {row['business_count']}명"
        )

    lines.extend(["", "## 누락 38개 매칭 결과", ""])
    for row in mapping_rows:
        value = (
            f"연 {row['avg_annual_sales_manwon']}만원 / 월 {row['avg_monthly_sales_manwon']}만원"
            if row["tasis_industry_code"]
            else "매칭 없음"
        )
        note = f" - {row['note']}" if row["note"] else ""
        lines.append(
            f"- {row['missing_industry_name']}: {row['match_status']} → "
            f"{row['tasis_industry_code']} {row['tasis_industry_name']} ({value}){note}"
        )

    lines.extend(["", "## 실패 요청", ""])
    if failures:
        for failure in failures:
            lines.append(f"- {failure.code} {failure.expected_name}: {failure.error}")
    else:
        lines.append("- 없음")

    lines.extend(
        [
            "",
            "## 주의",
            "",
            "- 이 데이터는 기존 서울시 상권분석 추정매출을 덮어쓰지 않는다.",
            "- 서울 전체 기준이며 행정동 기준이 아니다.",
            "- TASIS 화면 문구 기준으로 개인사업자 종합소득세 신고 총수입금액 기반 평균 연매출로 해석한다.",
            "- `broader_category`는 직접 매칭이 아니므로 서비스 화면에 붙일 때 별도 표시가 필요하다.",
        ]
    )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", default=DEFAULT_YEAR)
    parser.add_argument("--delay", type=float, default=0.8)
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument("--out-dir", default="data")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    results: list[FetchResult] = []
    for index, (code, name) in enumerate(LIVING_BUSINESSES):
        result = fetch_with_retry(code, name, args.year, args.retries, args.delay)
        results.append(result)
        status = "ok" if result.ok else f"fail:{result.error}"
        print(f"[{index + 1:03d}/{len(LIVING_BUSINESSES)}] {code} {name} {status}", flush=True)
        if index < len(LIVING_BUSINESSES) - 1:
            time.sleep(args.delay)

    rows = [result.row for result in results if result.ok and result.row]
    failures = [result for result in results if not result.ok]
    rows_by_code = {str(row["industry_code"]): row for row in rows}
    mapping_rows = build_mapping(rows_by_code)

    csv_rows = [dict(row) for row in rows]
    write_csv(out_dir / "tasis_living_business_seoul.csv", csv_rows, FIELDNAMES)

    json_rows = []
    for row in rows:
        clone = dict(row)
        clone["raw_response"] = json.loads(str(clone["raw_response"]))
        json_rows.append(clone)
    (out_dir / "tasis_living_business_seoul.json").write_text(
        json.dumps(json_rows, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    mapping_fields = [
        "missing_industry_name",
        "match_status",
        "tasis_industry_code",
        "tasis_industry_name",
        "source",
        "sales_tax_year",
        "business_count_year",
        "avg_annual_sales_manwon",
        "avg_monthly_sales_manwon",
        "business_count",
        "note",
    ]
    write_csv(out_dir / "tasis_missing_38_mapping.csv", mapping_rows, mapping_fields)

    verification_rows = [rows_by_code[code] for code in ("026", "053", "071", "083") if code in rows_by_code]
    write_report(out_dir / "tasis_living_business_report.md", rows, mapping_rows, failures, verification_rows)

    if failures:
        raise SystemExit(f"Completed with {len(failures)} failed requests")


if __name__ == "__main__":
    main()
