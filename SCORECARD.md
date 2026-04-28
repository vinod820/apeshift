# ApeShift Hackathon Scorecard

Formula:

```text
Score = 100 × (1 − ((FP × wFP) + (FN × wFN)) ÷ (N × (wFP + wFN)))
```

Default benchmark weights:
- `wFP = 5`
- `wFN = 1`

Current measured proof:
- False positives: `0`
- Benchmark repos: `5`
- Total migration patterns: `279`
- Automated patterns: `260`
- Manual-review TODOs / false negatives: `11`
- Automation: `93%`
- Score: `99.34%`

Run `npm run benchmark` to refresh `test-results/benchmark-results.json`, `test-results/combined-results.md`, and per-repo reports.
