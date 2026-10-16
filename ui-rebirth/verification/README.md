# Verification material

`browser-checks.json` records the passed UI assertions and final sampled axe results. Browser QA used the actual practice service and intercepted API fixtures for real-profile presentation, as explained in ../VALIDATION.md.

`realMapping.test.ts` contains the two meaningful regression cases for changed presentation mapping. Copy/merge it into the full repository's tests directory and run with its existing Vitest setup and @ alias. Equivalent assertions passed here in a bundled Node harness; the full repository runner was not present in the export.

No browser mocks, harness configs, downloaded browser binary or test dependency updates belong in production.
