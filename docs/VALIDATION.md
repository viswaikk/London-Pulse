# Validation

Validated locally on 30 September 2026.

- Full Python pipeline completed against the supplied workbook. All numeric demand values are finite and nonnegative; every daily total reconciles to its 96 bins within the 0.00001 absolute tolerance.
- All 471 station records resolved geographically, with the two documented adjustments. 432 stations with positive daily demand are rendered.
- All 10 code cells in `02_london_pulse_eda.ipynb` executed, with outputs saved and no cell errors.
- Eight Python tests passed, covering day boundaries, TOTAL exclusion, zero preservation, invalid demand, total mismatches, platform composite keys, flow provenance and coordinate correction.
- Five JavaScript data-contract tests passed, covering time order, coordinate/end-point joins, vectors, export reconciliation and active coverage.
- Production Vite build passed. Dependency installation reported no known vulnerabilities at installation time.
- Production browser preview checked at 1440 × 960 and 390 × 844. No horizontal document overflow was observed. No browser error logs were recorded during checks.
- Browser interactions checked: Victoria line focus, entries/exits, station search, Custom House location-proxy disclosure, time presets, end-of-day slider, animated playback, 2D mode, data story and methodology.
- Python figures visually inspected for readable labels and complete plots.

The source workbook, station reference, and original starter notebook remain preserved. Ambiguous Station_Flows records are deliberately reported rather than silently repaired. GitHub Actions workflows are supplied but have not been executed on GitHub. Browser context-loss and reduced-motion handling are implemented; forced WebGL loss and reduced-motion emulation were not exercised in the browser checks.
