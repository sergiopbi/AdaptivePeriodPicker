# Privacy Policy — Adaptive Period Picker

**Last updated: July 2026**

Adaptive Period Picker ("the visual") is a Power BI custom visual developed by Sergio
Borges.

## Data collection

The visual does **not** collect, store, transmit, or share any data, personal or
otherwise. Specifically:

- It makes no network requests of any kind (no calls to any server, API, analytics, or
  telemetry endpoint).
- It does not use cookies, local storage, or any browser storage mechanism outside of
  what Power BI's own visual framework provides for persisting report/visual settings
  (date range, granularity, and format-pane choices), which stays inside the report
  file itself and is never transmitted anywhere by this visual.
- It does not load any external scripts, fonts, images, or other resources at runtime.
- All computation (date arithmetic, calendar rendering, filter construction) happens
  locally in the browser/report sandbox, using only the data already present in the
  Power BI report the visual is placed in.

## Data the visual reads

The visual reads only the fields explicitly bound to it by the report author (a date
column, and optionally a granularity column and two optional measures for language and
reference-date override), exactly as with any other Power BI visual. This data never
leaves the report/Power BI session.

## Third parties

No third-party services, SDKs, or libraries that transmit data are used. The visual's
own code depends only on the standard Power BI Visuals API/tooling and `powerbi-models`
(used locally to construct the visual's own self-applied filter) — nothing that sends
data anywhere.

## Contact

Questions about this privacy policy can be raised via the support channel listed in
the AppSource listing, or as an issue on the source repository:
https://github.com/sergiopbi/AdaptivePeriodPicker

