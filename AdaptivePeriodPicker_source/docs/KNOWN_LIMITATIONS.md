# Known limitations & open items

Written honestly for whoever maintains this next — including future-you.

## 1. ~~Granularity Column requires a cartesian join~~ — NOT TRUE, corrected 2026-07-10

This went through several wrong turns before landing on the actual, simple truth.
Final state:

- **Granularity Column is a genuinely optional data role.** Leave it unbound and the
  D/W/M/Q/S/Y selector and adaptive calendar still work fully — granularity is just
  UI-only in that case (no real filter sent for it, so it won't sync across pages or
  affect other visuals, though dates still sync normally either way).
- **If you bind it, no cartesian join or special table shaping is required at all.**
  `AUX_PERIOD` (or whatever the granularity table is called) can stay in its original,
  small, ordinary, disconnected form — confirmed directly in production. Both
  `dateColumn` and `granColumn` are declared as categories in the *same*
  `dataViewMapping` (see capabilities.json), and when bound from two genuinely separate,
  unrelated tables, Power BI's own query engine performs the equivalent of a cross-join
  **implicitly, at query time, scoped only to this visual's own query** — never
  materialized or persisted anywhere in the model. It just works. The
  `dataReductionAlgorithm` cap (30,000 rows) bounds this comfortably for any realistic
  date-range × granularity-level count (a full decade of daily dates × 6 granularity
  levels is still well under 30,000).

**Where the cartesian-join belief came from**: an earlier iteration of this project
built a genuine cartesian join in Power Query (multiplying the date table by the number
of granularity levels) because it seemed necessary at the time — nobody had actually
tested binding two truly separate, non-multiplied tables together in one
`dataViewMapping` and checking whether it worked. It does. The cartesian-table version
still exists in project history as a working fallback, but it was solving a problem
that didn't actually exist. Worth remembering: an assumption that "feels necessary"
based on how the API is typically documented/used isn't the same as a confirmed
limitation — test the simpler thing first next time.

**Why not two independent `dataViewMappings` (which was explored on the theory that it
would be needed to keep Granularity Column fully decoupled from Date Column)?** Tried
twice, in two separate investigations. Both times it crashed Power BI Desktop's own
dataview-resolution engine, not something in our capabilities.json. Captured stack
trace (via Desktop's "Copiar detalhes para a área de transferência"):

```
JS Error Message: Cannot read properties of null (reading 'items')
Component: CompiledDataViewMappingsByRole, MethodDef: visitRole
at CompiledDataViewMappingsByRole.findActive → QueryGenerator.rewriteQuery → prepareQuery
```

This is a `TypeError` inside Power BI's own internal dataview-mapping resolver — a bug
in the product (build 2.155.756.0 / June 2026), not a limitation we can design around
from the visual's side. Turned out to be moot anyway, since the single-mapping design
(above) works correctly with two fully unrelated tables regardless. If you hit this
crash again for some other reason, report it via the in-app "Reportar este problema"
dialog.

Also confirmed directly against Microsoft's certification documentation: certification
tests audit the visual's *code* (external calls, secure coding patterns) — they do not
evaluate the data model of whoever installs the visual. Moot now that no cartesian
table is needed at all, but worth knowing regardless if this ever comes up again for
a different feature.

A separate approach — naming the granularity table via plain text settings instead of a
bound field, to sidestep the dataViewMapping question entirely — was also tried. It
compiled and ran without error, but the resulting filter had no observable effect
(`SELECTEDVALUE` on the target table never changed) — Power BI appears to require the
target table be known to the visual through an actual binding for a self-filter to take
effect, not just named by string. Confirmed by direct testing; not documented anywhere
found. Abandoned — turned out to be unnecessary anyway once the bound-but-optional
design was confirmed to work without any cartesian join.

## 2. Only ONE self-filter per visual is real

Confirmed by direct testing (not assumption): `host.applyJsonFilter` can be called with
any object/property name pair, and Power BI will happily persist it as a visual
property — but only the exact pair `"general"` / `"filter"` is treated as a genuine,
cross-visual, cross-page-syncable filter. Every other combination tested (`generalGran`/
`filter`, `general`/`filterGran`, a dedicated `granFilter`/`filter` object, and a
Selection-API-based approach) either did nothing to other visuals' data or didn't
survive a page switch.

The current code works around this by sending **two filters together** in a single
`applyJsonFilter` call (`filter: IFilter[]`), which Power BI combines with AND — see
the README's Architecture Notes section.

## 3. Intermittent granularity-bar flicker (not fully root-caused)

Rarely (observed roughly 1 in 10 interactions in manual testing), the granularity
selector bar has been seen to disappear briefly after a filter change, then reappear on
its own after a few seconds or on the next page navigation. One likely contributing
cause was identified and removed (an "auto-heal" block that cleared the entire filter
whenever the visual's own data view came back empty — a safety net built for the old
Tuple-filter approach, which is actively harmful with the current two-filter approach
since it can fire on ordinary query latency). Whether removing it fully eliminates the
flicker, or whether there's a second contributing cause, was **not confirmed** at the
time of writing — the separate-tables experiment (which would have made queries much
cheaper and possibly eliminated latency-related flicker entirely) is blocked by
limitation #1 above.

If this resurfaces: check whether it correlates with query duration (Performance
Analyzer in Power BI Desktop) before assuming it's a code bug again.

## 4. Recommended-features gaps (non-blocking for basic AppSource publish)

`pbiviz package` reports these as "recommended for all custom visuals" — none are
required for a basic AppSource listing, but several matter for certification or general
polish:

- **Implemented this pass**: Rendering Events API, Context Menu, Color Palette
  (including high-contrast mode), a landing page for the no-data-bound state, and
  locale-aware default language.
- **Not yet implemented**: Bookmarks support, full keyboard navigation (the calendar
  grid and popup are mouse-only), and a formal multi-locale `stringResources` setup
  (current PT/EN support is a hand-rolled internal dictionary, not Power BI's own
  localization file mechanism — functionally fine, but won't satisfy an automated
  "Localizations" check that looks for that specific mechanism).
- **Allow Interactions**: not implemented — would let report authors control whether
  this visual participates in cross-visual highlight/filter interactions from other
  visuals on the page. Not applicable in the usual sense since this visual is itself a
  filter source, not a filter target, but worth reviewing against the current API guidance
  before submission.

None of these block a first AppSource submission. Keyboard navigation is the one worth
prioritizing if accessibility compliance becomes a requirement (e.g. government/
enterprise customers, or pursuing certification specifically).
