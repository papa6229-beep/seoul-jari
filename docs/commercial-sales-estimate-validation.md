# Dong-level sales estimate validation (2026-09-30)

## Decision

Do not display a single dong-level monthly sales estimate when dong sales are missing. Keep published dong card-sales averages and clearly scoped district/Seoul reference averages. Use store counts and demand indicators to compare dongs without sales data.

## Backtest

The former model multiplied a district or Seoul per-store monthly reference by a dong factor constrained to 0.75-1.35. The factor combined demand, spending, working-age population, and inverse store competition. For service industries with published dong card-sales averages, the dong value was hidden and predicted with that same factor. Reproduce the figures with `node build/validate_commercial_sales_estimate.js`.

| Reference used for the hidden dong | Pairs | Median absolute percentage error | Within 0.5-2x of published value | Reference alone: median error |
| --- | ---: | ---: | ---: | ---: |
| District, excluding the tested dong; only districts with no missing store sales | 3,896 | 45.6% | 64.3% | 50.3% |
| District, excluding the tested dong; only published-sales dongs in the reference | 16,513 | 64.2% | 49.5% | 70.6% |
| Seoul, only published-sales dongs in the reference | 16,551 | 72.6% | 47.4% | 86.3% |

These are service-industry/dong pairs, not independent businesses. The target is Seoul's published card-sales-based per-store estimate, not audited revenue. The district tests remove the tested dong from the reference to avoid direct target leakage. The full-coverage district subset excludes every district with a store count but no published sales. The wider district and Seoul tests exclude such stores from both numerator and denominator, so their references describe only the published-sales subset and may have selection bias. The Seoul reference still includes the tested dong. The error distribution varies substantially by industry, and very small published values can make percentage errors extreme.

The previous report's 63% district figure mixed published sales with store counts from dongs whose sales were missing. That denominator was invalid for this comparison, so the old figure is superseded. The corrected results still do not justify a single dong-level amount: even on the complete-district subset, the median error is 45.6% and about one third of predictions fall outside a half-to-double range.

The 12 exact/equivalent TASIS-matched industries have no published dong card-sales values in this dataset, so their dong predictions cannot be validated directly. Their TASIS reference also uses a different tax year and income definition from the Seoul card-sales data. The backtest therefore tests the *geographic adjustment method*, not the accuracy of TASIS values for those industries.

Even a broad 0.5-2x band captured only about half of the published values in these proxy tests. It would not be honest to present that band as a reliable uncertainty interval. Reintroduce dong-level amounts only after an industry-specific holdout test against an independent, comparable sales source meets an agreed accuracy standard.
