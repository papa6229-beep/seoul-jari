# Dong-level sales estimate validation (2026-09-30)

## Display policy

Keep published dong card-sales averages intact. When those values are missing, an exact/equivalent TASIS Seoul industry average and at least five other industries with published dong card sales can support a clearly labeled, rounded **dong estimate**. Show the local estimate first, then the separately labeled TASIS Seoul average. Never present a broader-category TASIS match, a citywide average, or an individual map pin as observed dong revenue.

The estimate compares each peer industry's per-store sales in the dong with its published-sales Seoul per-store average. It excludes the target industry from the peers, takes the median log ratio, applies 75% of that ratio, and limits the result to 45-160% of the TASIS Seoul baseline. It is used only when the selected industry has no published dong sales anywhere in the view; mixing TASIS-based estimates into a card-sales industry would create incomparable rows. This is a practical local adjustment, not a statistically validated interval. The displayed amount is rounded (for example, `about 2.0 hundred million KRW`), because one-won precision would be misleading.

## Backtest

The former model multiplied a district or Seoul per-store monthly reference by a dong factor constrained to 0.75-1.35. The factor combined demand, spending, working-age population, and inverse store competition. For service industries with published dong card-sales averages, the dong value was hidden and predicted with that same factor. Reproduce the figures with `node build/validate_commercial_sales_estimate.js`.

| Reference used for the hidden dong | Pairs | Median absolute percentage error | Within 0.5-2x of published value | Reference alone: median error |
| --- | ---: | ---: | ---: | ---: |
| District, excluding the tested dong; only districts with no missing store sales | 3,896 | 45.6% | 64.3% | 50.3% |
| District, excluding the tested dong; only published-sales dongs in the reference | 16,513 | 64.2% | 49.5% | 70.6% |
| Seoul, only published-sales dongs in the reference; former demand-factor model | 16,551 | 72.6% | 47.4% | 86.3% |
| Seoul, only published-sales dongs in the reference; peer-industry local adjustment | 16,550 | 60.7% | 49.9% | 86.3% |

These are service-industry/dong pairs, not independent businesses. The target is Seoul's published card-sales-based per-store estimate, not audited revenue. The district tests remove the tested dong from the reference to avoid direct target leakage. The full-coverage district subset excludes every district with a store count but no published sales. The wider district and Seoul tests exclude such stores from both numerator and denominator, so their references describe only the published-sales subset and may have selection bias. The Seoul reference still includes the tested dong. The error distribution varies substantially by industry, and very small published values can make percentage errors extreme.

The previous report's 63% district figure mixed published sales with store counts from dongs whose sales were missing. That denominator was invalid for this comparison, so the old figure is superseded. The corrected results do not justify an unqualified or precise dong amount. They do support showing a rounded, clearly labeled planning estimate when a relevant TASIS baseline and enough local peer data exist.

The 12 exact/equivalent TASIS-matched industries have no published dong card-sales values in this dataset, so their dong predictions cannot be validated directly. Their TASIS reference also uses a different tax year and income definition from the Seoul card-sales data. The backtest therefore tests the *geographic adjustment method*, not the accuracy of TASIS values for those industries.

Even a broad 0.5-2x band captured only about half of the published values in the peer-model proxy test. Do not portray that band as a reliable uncertainty interval or the displayed estimate as a promise. The purpose is a directional planning reference with explicit scope and source, not a verified forecast of one shop's takings. The local signal uses 2026 Q2 card sales while the current TASIS baseline uses 2024 tax-year receipts; their definitions and populations differ. For example, the app's Seoul gas-station store count and TASIS's Seoul filer count are not interchangeable.
