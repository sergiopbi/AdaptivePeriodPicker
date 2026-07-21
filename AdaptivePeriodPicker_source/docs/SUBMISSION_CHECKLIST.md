# AppSource submission checklist

Two separate things, don't conflate them:

- **Publishing to AppSource** — required to distribute/sell the visual at all. Moderate
  bar: general guidelines, working package, required listing metadata.
- **Certification** (optional, separate request, can be done later) — adds the "PBI
  Certified" badge, export-to-PowerPoint/PDF, and visibility in emailed subscriptions.
  Stricter: Microsoft reviews source code, requires a public-reviewable GitHub repo
  with a `certification` branch matching the submitted package, and re-reviews on every
  update.

You don't need certification to publish or to monetize. It's worth doing later once the
visual is stable and has real users, not before.

## Before you can submit to Partner Center at all

- [ ] **Partner Center account** — enroll if you haven't (partner.microsoft.com).
- [ ] **Real support URL** — `pbiviz.json` currently has `"supportUrl": "https://example.com"`,
      a placeholder. Needs a real page (even a simple one) before submission.
- [ ] **Privacy policy hosted at a public URL** — see `docs/PRIVACY.md` in this repo;
      fill in the placeholders and publish it somewhere reachable (GitHub Pages is the
      easiest free option).
- [ ] **Terms of use** (if charging money) — similar requirement, needs a public URL.
- [ ] **Icon** — 300×300 PNG for the AppSource listing (separate from the small icon
      already embedded in `assets/icon.png` for the visual itself — check current size,
      Partner Center has its own icon requirements for the *listing*, distinct from the
      visual package icon).
- [ ] **Screenshots** — at least one, showing the visual in a real report. Recommended:
      2–3, showing popup mode, inline mode, and the granularity selector in use.
- [ ] **Short + long description** for the listing — short description is a one-liner;
      long description should cover what's in this repo's `README.md` "What it does"
      section, adapted for a customer audience (less technical, more benefit-focused).
- [ ] **Sample .pbix report** — AppSource strongly recommends (and the certification
      process for certified visuals requires) a sample report demonstrating the visual
      with realistic data, so customers can download and see it working before adding
      it to their own report.
- [ ] **Pricing decision** — free, "additional purchase may be required" (freemium with
      paid advanced features via Microsoft's Licensing API), or fully paid. If you want
      a free tier with paid advanced features, note Microsoft's rule: existing free
      functionality must stay free after any such change — decide the free/paid feature
      split up front rather than after publishing.

## Before requesting certification (later, optional)

- [ ] Public (or reviewable-on-request) GitHub repo containing only this visual's code.
- [ ] A branch literally named `certification` (lowercase) whose code matches exactly
      the `.pbiviz` package you submit — this branch can only be updated on the next
      resubmission.
- [ ] Re-run `npm run package` and confirm zero lint errors (already true as of this
      cleanup pass) — this is checked automatically as part of certification.
- [ ] Review `docs/KNOWN_LIMITATIONS.md` — none of the current gaps (bookmarks,
      keyboard nav, formal localization files) are certification-blocking per
      Microsoft's published requirements, but keyboard navigation in particular is
      worth reviewing against Microsoft's current accessibility guidance before
      requesting certification, since accessibility expectations tend to tighten over
      time — check the current guidance at submission time rather than relying on this
      note.

## Versioning reminder

If you resubmit an update later: **never change the visual's GUID**
(`adaptivePeriodPicker4CDBAD3DF37FB290A9740D47E25B1F0D` in `pbiviz.json` /
`capabilities.json`) — that's how Partner Center recognizes it as an update to the same
visual rather than a new submission.
