# Date Picker 2.0 (qAHSDatePicker2)

A Power BI custom visual: a date-range picker with a calendar that adapts its grid to a
selected granularity (Day / Week / Month / Quarter / Semester / Year), with a real,
report-level self-filter — not a cosmetic selector — that stays in sync across report
pages.

## What it does

- Lets the report user pick a date range from a calendar that reshapes itself to the
  chosen granularity (day grid, week rows, month/quarter/semester/year tiles). This
  selector always works, regardless of any data binding.
- Optionally binds a physical "granularity code" column (e.g. `AUX_PERIOD[Aux_Period]`
  with values D/W/M/Q/S/Y) — a small, ordinary, disconnected table, no special shaping
  needed. When bound, the granularity choice becomes part of the same real,
  self-applied, cross-page-synced filter as the date range, and both dimensions sync
  correctly even though the two tables have no relationship to each other at all —
  Power BI's own query engine resolves the categorical dataView for both roles together
  at query time (see Architecture notes for why no cartesian join is required). When
  Granularity Column is **not** bound, the selector and adaptive calendar still work
  exactly the same — granularity is just UI-only in that case, with no real filter sent.
- Ships with built-in shortcuts (Today, Yesterday, This Week, This Month, MTD/QTD/YTD,
  This Quarter/Semester/Year, "Last N" dynamic periods), popup / inline-vertical /
  inline-horizontal layout modes, and PT/EN localization (auto-detected from the report
  locale, or overridable via an optional measure).

## Data roles

| Role | Kind | Required | Purpose |
|---|---|---|---|
| Date Column | Grouping | Yes | The date column the picker filters (e.g. `DT_DATE[Date_D]`). |
| Granularity Column (optional) | Grouping | No | A physical column with granularity codes (D/W/M/Q/S/Y), e.g. `AUX_PERIOD[Aux_Period]` — an ordinary small disconnected table, no cartesian join or special shaping needed (see Architecture notes). Not bound: selector still fully functional, just UI-only (no real filter, no cross-page sync for granularity specifically). |
| Language | Measure | No | Overrides the auto-detected report locale with an explicit `"PT"`/`"EN"` value. |
| Reference Date | Measure | No | Overrides "today" for shortcut calculations — use `CALCULATE(MAX(DT_DATE[Date_D]), ALL())` for a value that stays stable across pages/refreshes. |

## Architecture notes (for future maintainers)

- **Filtering mechanism**: the visual applies its own filter via
  `host.applyJsonFilter(filter, "general", "filter", FilterAction.merge)`. This is the
  *only* object/property combination Power BI treats as a genuine, cross-visual,
  cross-page-syncable self-filter — confirmed by direct testing, not assumption. Any
  other object or property name persists as an inert visual property but never
  actually filters other visuals' data.
- `applyJsonFilter`'s `filter` parameter accepts `IFilter | IFilter[]`. When
  Granularity Column is bound, the visual sends **two** filters together — an Advanced
  filter (date range, on Date Column) and a Basic filter (granularity equality, on
  Granularity Column) — which Power BI combines with AND.
- **No cartesian join needed, confirmed in production**: both `dateColumn` and
  `granColumn` are declared as categories in the *same* `dataViewMapping` (see
  capabilities.json). Earlier in this project's history it was assumed this required
  Granularity Column to physically live on the same table as Date Column (a manual
  cartesian join in Power Query). That assumption was wrong. When the two roles are
  bound from genuinely separate, unrelated tables, Power BI's own query engine performs
  the equivalent of a cross-join **implicitly, at query time, scoped to this visual's
  own query only** — never materialized or persisted anywhere in the model. Confirmed
  directly in production: binding `AUX_PERIOD` in its original small, disconnected,
  non-multiplied form still produces correct, fully-synced results for both dimensions.
  The `dataReductionAlgorithm` cap (30,000 rows on Date Column's mapping) is what
  bounds this — comfortably above any realistic date-range × granularity-level count.
- **Why Granularity Column must share a `dataViewMapping` with Date Column**: two
  independent `dataViewMappings` (one per role) were tried, twice, in two separate
  investigations. Both times it crashed Power BI Desktop's own dataview-resolution
  engine — a captured stack trace shows a `TypeError` inside Power BI's own
  `CompiledDataViewMappingsByRole.visitRole`, i.e. a bug in Power BI itself, not
  something fixable from this visual's capabilities.json. Report this to Microsoft via
  the in-app "Reportar este problema" / "Report this problem" dialog if you hit it
  again. This turned out not to matter in practice, since the single-mapping design
  works correctly with two fully unrelated tables anyway (see previous point) — the
  two-mapping approach would only have been needed if the implicit cross-join had
  turned out to be a real problem, which it isn't at realistic data sizes.
- Certification note: Microsoft's certification tests audit the visual's *code*
  (no external calls, secure patterns) — they do not audit or care about the data
  model of whoever installs the visual. Confirmed via Microsoft's own certification
  documentation. (Moot in practice now that no cartesian table is needed at all, but
  worth knowing regardless.)
- `update()` never calls the filter-apply function as a side effect of a passive
  render — only in direct response to user interaction (date pick, granularity click).
  Doing otherwise overwrites a not-yet-read synced value with a local default and
  breaks cross-page sync. This rule is called out inline at the relevant call site.

## Building

```bash
npm install
npm run package
```

Output `.pbiviz` is written to `dist/`. Lint runs as part of `package` and must report
zero errors (Microsoft's certification process runs the same `pbiviz package` command).

## No external dependencies at runtime

This visual makes no network calls (no `fetch`, `XMLHttpRequest`, or `WebSocket`) and
loads no external scripts or resources. All computation is local to the browser/report
sandbox.
