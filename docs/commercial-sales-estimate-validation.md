# Dong-level sales estimate validation (2026-09-30)

## Decision

Do not display a single dong-level monthly sales estimate when dong sales are missing. Keep published dong card-sales averages and clearly scoped district/Seoul reference averages. Use store counts and demand indicators to compare dongs without sales data.

## Backtest

The former model multiplied a district or Seoul per-store monthly reference by a dong factor constrained to 0.75-1.35. The factor combined demand, spending, working-age population, and inverse store competition. For service industries with published dong card-sales averages, the dong value was hidden and predicted with that same factor.

| Reference used for the hidden dong | Pairs | Median absolute percentage error | Within 0.5-2x of published value | Reference alone: median error |
| --- | ---: | ---: | ---: | ---: |
| District average, excluding the tested dong from numerator and store count | 16,526 | 63% | 49% | 68% |
| Seoul card-sales average | 16,551 | 68% | 48% | 78% |

These are service-industry/dong pairs, not independent businesses. The target is Seoul's published card-sales-based per-store estimate, not audited revenue. The district test removes the tested dong from its reference to avoid direct target leakage. The Seoul test still includes it in the citywide reference; its influence is small but not zero. The error distribution varies substantially by industry, and very small published values can make percentage errors extreme.

The 12 exact/equivalent TASIS-matched industries have no published dong card-sales values in this dataset, so their dong predictions cannot be validated directly. Their TASIS reference also uses a different tax year and income definition from the Seoul card-sales data. The backtest therefore tests the *geographic adjustment method*, not the accuracy of TASIS values for those industries.

Even a broad 0.5-2x band captured only about half of the published values in these proxy tests. It would not be honest to present that band as a reliable uncertainty interval. Reintroduce dong-level amounts only after an industry-specific holdout test against an independent, comparable sales source meets an agreed accuracy standard.
