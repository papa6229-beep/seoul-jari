"""자료마다 언제 기준인지 한 파일로 모은다. 다른 prep_* 를 모두 돌린 뒤 마지막에 돌린다.

입력  web/data/regions.json · realestate.json · rent.json · market.json
      data/raw/aca_*.csv 파일 이름 (학원 비교 시점)
출력  web/data/dates.json

기준일은 각 파일에 적힌 값에서 읽는다. 원천을 새로 받으면 fetch_* 스크립트의
기준 연월 상수(BASE_YM, YEAR 등)를 먼저 바꿔야 여기에도 반영된다.
"""
from __future__ import annotations

import calendar
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "web/data"
RAW = ROOT / "data/raw"
OUT = DATA / "dates.json"

# 학교알리미 공시 연도. fetch_schoolinfo.py 의 YEAR 와 맞춘다.
SCHOOLINFO_YEAR = 2026

# 원본 raw 스냅샷이 없는 배포 작업 폴더에서도 기준일 문구가 사라지지 않게 둔다.
DEFAULT_OLD_ACADEMY_YM = "2023-08"


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def load_optional(name: str) -> dict | None:
    path = DATA / name
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def month_end(ym: str) -> str:
    y, m = map(int, ym.split("-"))
    return f"{y}.{m:02d}.{calendar.monthrange(y, m)[1]:02d}"


def month_shift(ym: str, back: int) -> str:
    y, m = map(int, ym.split("-"))
    m -= back
    while m <= 0:
        y, m = y - 1, m + 12
    return f"{y}.{m:02d}"


def quarter_label(q: str | int | None) -> str:
    value = str(q or "")
    if len(value) == 5 and value.isdigit():
        return f"{value[:4]}년 {value[4]}분기"
    return "최신 분기"


def source_meta(ledger: dict | None, file_name: str) -> dict:
    if not ledger:
        return {}
    for item in ledger.get("items", []):
        if item.get("file") == file_name:
            return item
    return {}


def license_more(meta: dict, fallback: str = "") -> str:
    parts = [fallback] if fallback else []
    license_text = meta.get("license")
    commercial = meta.get("commercial_use")
    derivative = meta.get("derivative_use")
    verified = meta.get("verified_on")
    if license_text:
        parts.append(f"이용조건: {license_text}")
    if commercial or derivative:
        parts.append(f"상업 {commercial or '-'} · 변경 {derivative or '-'}")
    if verified:
        parts.append(f"확인일 {verified.replace('-', '.')}")
    return " / ".join(parts)


def main() -> None:
    regions = load("regions.json")
    estate = load("realestate.json")
    rent = load("rent.json")
    market = load("market.json")
    ledger = load_optional("source-ledger.json")

    base = regions["base_ym"]
    olds = sorted(p.stem.split("_")[1] for p in RAW.glob("aca_*.csv") if p.stem.split("_")[1] != base)
    old = olds[-1] if olds else DEFAULT_OLD_ACADEMY_YM

    e_ym = estate["base_ym"]
    items = [
        {"what": "학원·교습소 목록", "src": "나이스 교육정보 개방포털",
         "when": month_end(base) + " 스냅샷",
         "more": ("최근 3년 신규·폐업은 " + month_end(old) + " 스냅샷과 비교") if old else ""},
        {"what": "학교 목록·위치", "src": "나이스 교육정보 개방포털",
         "when": month_end(base) + " 스냅샷", "more": ""},
        {"what": "학교 재학생·전입·전출", "src": "학교알리미",
         "when": f"{SCHOOLINFO_YEAR} 공시", "more": "학교가 공시한 값"},
        {"what": "주민등록 인구", "src": "행정안전부",
         "when": month_end(base), "more": "법정동별 연령별"},
        {"what": "아파트·상가 거래", "src": "국토교통부 실거래가",
         "when": month_shift(e_ym, estate["months"] - 1) + " ~ " + e_ym.replace("-", "."),
         "more": f"최근 {estate['months']}개월 계약분"},
        {"what": "상가 임대료", "src": "한국부동산원", "when": rent["quarter"], "more": "소규모 상가"},
        {"what": "시장 해석", "src": "개원시장 분석 조사 문서",
         "when": market["as_of"].replace("-", "."), "more": "문서의 추정"},
    ]

    commercial_files = [
        ("상권 유동인구", "commercial-floating-population-dong.json"),
        ("상권 추정매출", "commercial-sales-dong.json"),
        ("상권 점포", "commercial-stores-dong.json"),
        ("상권 직장인구", "commercial-worker-population-dong.json"),
        ("상권 상주인구", "commercial-resident-population-dong.json"),
        ("상권 소득소비", "commercial-income-consumption-dong.json"),
        ("상가업소 지도", "store-summary.json"),
    ]
    for what, file_name in commercial_files:
        payload = load_optional(file_name)
        if not payload:
            continue
        meta = source_meta(ledger, file_name)
        src = meta.get("provider") or payload.get("source") or "-"
        when = quarter_label(payload.get("quarter")) if payload.get("quarter") else payload.get("updated_at") or "최신 수집본"
        items.append({
            "what": what,
            "src": src,
            "when": when,
            "more": license_more(meta, payload.get("source", "")),
            "url": meta.get("url", ""),
        })

    out = {"built": date.today().isoformat().replace("-", "."), "items": items}
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {len(items)}개 자료")


if __name__ == "__main__":
    main()
