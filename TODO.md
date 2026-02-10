# TODO
Single running list of future work items. Add new items at the top under the appropriate section.

## Mr. Brady deliverables
- [ ] Deliverable 1: Weather data — ingest last 10 years of weather data for Cavan and document/select a canonical source (with provenance) for use in the system.
- [ ] Deliverable 2: Grants — make hotel grants comprehensive and accurate; add provenance links to the underlying grant source pages/datasets; capture effective dates and caps.
  - [x] Add SEAI Non-Domestic Microgen (Solar PV) with kWp-tiered calculation + source link.
  - [x] Add TAMS SCIS source link + align to published ceiling/rate (farm-only).
  - [ ] Add/verify any additional hotel-relevant schemes and document whether schemes can be stacked (avoid double-counting).
- [ ] Audit: verify everything is working end-to-end (data ingestion, calculation engine, and UI flows) and note any gaps/issues.

## Done (recent)
- [x] ROI-DA day-ahead price fetcher (`Other tools/dayahead_ireland.py`): handle missing `Index prices;30;EUR` by supporting alternate SEMOpx formats (e.g. `Index prices;60;EUR` and multi-line blocks).

## Next up
- Multi-scenario comparison (save multiple runs, compare side-by-side, export a comparison report)
- “Best fit” sizing / optimization (suggest PV + battery sizes that maximize NPV or hit a payback target, with constraints)
- Battery step (separate wizard step: battery sizing, dispatch strategy, constraints, and audit visibility)
- Variable tariff support (full TOU calendars, weekends/holidays, seasonal schedules, standing charges by period)
- Grants coverage expansion (all hotel/farm variants; clarify eligibility rules + add sources)
- Weather / solar resource coverage (all counties; at least 10 years; data provenance + update strategy)

## Product/UI
- Add “Edit inputs” / “Back to wizard” button on the full-page report view
- Add PDF export implementation (current UI is a placeholder)
- Calendar sidebar polish: quarter separators, legend for solar intensity (cool→warm), and optional compact mode
- Accessibility pass: labels for selects/inputs, focus states, keyboard navigation, modal ARIA

## Calculation engine / audit
- Battery model v2: explicit dispatch policies (self-consumption maximization vs peak shaving) with auditor-traceable decisions
- Formalize baseline vs with-solar cost model to ensure tariff edge cases (standing charges, levies) are consistent
- Validate invariants for leap years (8784) end-to-end across UI + audit export

## Data
- Tariff dataset: versioning + effective dates + change log; ability to plug in user-entered tariffs
- Grants dataset: per-program effective dates and caps; model multiple grants stacking rules (if applicable)
- Solar/weather datasets: caching strategy, update schedule, and deterministic “as-of” metadata for reproducibility

## Testing / quality
- Add integration tests for the full wizard path using realistic fixtures (multi-year solar CSV + year selection)
- Snapshot-like visual regression checks for the report layout and calendar sidebar (if/when tooling is added)
- Performance guardrails for Auditor Mode (large tables): pagination, memoization, and export time
