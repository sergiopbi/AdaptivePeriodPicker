"use strict";
// Generic drag-to-resize handle for flex layouts. A handle sits between two
// flex siblings; dragging it changes ONE of them (the "target") via an
// explicit px flex-basis, while its flex:1 neighbour absorbs the difference
// automatically — no manual recalculation of the other side needed.
//
// `sign` encodes which side of the handle the target sits on:
//   +1 → target is BEFORE the handle in DOM order (dragging further away grows it)
//   -1 → target is AFTER  the handle in DOM order (dragging further away shrinks it)

export interface ResizerOptions {
    axis: "row" | "col";      // "row" = horizontal bar, drag changes height; "col" = vertical bar, drag changes width
    target: HTMLElement;      // the element whose flex-basis is being set
    sign: 1 | -1;
    min: number;
    max?: number;
    // Alternative to a fixed `max`: recomputed on every drag frame, click, and the initial
    // apply — lets the caller cap growth against the ACTUAL current layout (e.g. "don't let
    // this zone grow past whatever would push the flexible middle column below its own
    // min-width") instead of a number that's only ever right for one particular widget size.
    getMax?: () => number;
    initialPx?: number;       // restore a size chosen in a previous render of this same visual instance
    // Starting size when nothing was ever saved — defaults to `min` (most zones should open
    // as compact as possible), but a few (the start/end panel) need to stay usable out of
    // the box even though the viewer can still collapse them to 0 by choice.
    defaultPx?: number;
    onResize?: (px: number) => void;
    onCommit?: () => void;    // fired once per gesture (pointerup / dblclick), never on every drag frame — use this to persist
    // Double-click-to-reveal shows this fraction of the natural (unconstrained CSS) size
    // instead of the full 100% — the shortcuts panel's natural size reads as too large to
    // pop open at, so it opens at 60% of that instead. Defaults to 1 (full natural size)
    // for every other zone.
    revealScale?: number;
    // Alternative to revealScale: skip measuring "natural" size altogether and reveal to
    // this exact px value instead. Für zones whose content needs a specific, known-good
    // height regardless of the drag bar's own state — e.g. the Início/Fim panel, where
    // "natural" (measured via a temporary flex:"" reflow) was coming out shorter than the
    // label+date actually need, clipping them right after a double-click reveal.
    revealPx?: number;
    // When true, the handle still renders (so the layout doesn't shift) but stops
    // responding to drag or double-click entirely — lets a report author dial in sizes
    // while editing, then freeze them for anyone viewing the published report.
    locked?: boolean;
}

export function attachResizer(opts: ResizerOptions): HTMLElement {
    const { axis, target, sign, min } = opts;
    const handle = document.createElement("div");
    handle.className = axis === "row" ? "dp-resizer dp-resizer-row" : "dp-resizer dp-resizer-col";
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", axis === "row" ? "horizontal" : "vertical");
    handle.tabIndex = -1;
    if (opts.locked) handle.classList.add("dp-resizer-locked");

    const clampSize = (px: number): number => {
        let v = px;
        if (v < min) v = min;
        const max = opts.getMax ? opts.getMax() : opts.max;
        if (max !== undefined && v > max) v = max;
        return v;
    };
    // Dragging by hand rarely lands on the EXACT pixel of min or max — releasing a few
    // pixels short leaves a sliver that's neither cleanly collapsed (still has its own
    // padding/border, so it isn't caught by the dp-resize-zeroed 0-only check) nor usable
    // (too small to actually read anything in). Snapping anything within SNAP_PX of an
    // edge onto that edge means "drag it as far as it'll go" reliably reaches a clean
    // state without needing pixel-perfect precision.
    const SNAP_PX = 10;
    const snapToEdge = (px: number): number => {
        const max = opts.getMax ? opts.getMax() : opts.max;
        if (px - min <= SNAP_PX) return min;
        if (max !== undefined && max - px <= SNAP_PX) return max;
        return px;
    };
    // getMax() typically measures sibling layout that may not exist yet at construction
    // time (this handle and its neighbours are still being built and appended by the
    // caller) — the very first, synchronous size application below uses the static min/max
    // only. Interactive resizing (drag, double-click) always happens well after the whole
    // row is in the DOM, so those safely use the full clampSize with getMax().
    const clampInitial = (px: number): number => {
        let v = px;
        if (v < min) v = min;
        if (opts.max !== undefined && v > opts.max) v = opts.max;
        return v;
    };
    // Static-max counterpart to snapToEdge, for the same reason clampInitial exists
    // separately from clampSize — safe to call before the rest of the row is in the DOM.
    // This matters here specifically because a value SAVED before this snapping existed
    // (or saved by a slightly-off drag under the old rules) can be sitting a few px shy of
    // 0 in someone's already-published report — self-correcting it on load, not just
    // during a fresh drag, is the only way that old data ever gets cleaned up.
    const snapToEdgeInitial = (px: number): number => {
        if (px - min <= SNAP_PX) return min;
        if (opts.max !== undefined && opts.max - px <= SNAP_PX) return opts.max;
        return px;
    };

    const applySize = (px: number) => {
        target.style.flex = `0 0 ${px}px`;
        // At a literal 0 target size, fixed-px padding/border can't shrink below their own
        // specified size — box-sizing:border-box only redistributes space FROM the content
        // area, and there's none left to take once content is already 0. The result is a
        // few leftover pixels of background/border (and whatever text fragment still fits
        // in them) even though the flex-basis itself is exactly 0. This class (paired with
        // a CSS rule zeroing padding/border) is the only way to get a genuinely invisible
        // collapse rather than "collapsed except for its own padding".
        target.classList.toggle("dp-resize-zeroed", px <= 0);
    };

    // No saved size (first-ever render, or the viewer hasn't touched this handle yet) now
    // means "start at minimum" for most zones — but a few need defaultPx instead, since
    // starting fully collapsed would make the widget non-functional out of the box.
    const effectiveDefault = opts.defaultPx ?? min;
    const startPx = snapToEdgeInitial(clampInitial(opts.initialPx ?? effectiveDefault));
    applySize(startPx);
    let isAtMin = startPx <= min;
    // "No override, use the default" is only a safe thing to stop persisting when the
    // resulting size actually IS that default — for most zones default===min, so this
    // collapses to the old min-means-no-override rule, but the start/end panel's default
    // sits above its min (0), and dragging or double-clicking it down to 0 must persist a
    // real 0, not silently snap back to the default on the next reload/publish.
    const isDefault = (px: number) => px === effectiveDefault;

    let startPos = 0, startSize = 0, dragging = false;

    if (opts.locked) return handle; // frozen: initial size already applied above, nothing else to wire up

    const onMove = (ev: PointerEvent) => {
        if (!dragging) return;
        const pos = axis === "row" ? ev.clientY : ev.clientX;
        const next = snapToEdge(clampSize(startSize + (pos - startPos) * sign));
        applySize(next);
        isAtMin = next <= min;
        opts.onResize?.(isDefault(next) ? -1 : next);
    };
    const onUp = () => {
        dragging = false;
        handle.classList.remove("dragging");
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        opts.onCommit?.();
    };
    handle.addEventListener("pointerdown", (ev: PointerEvent) => {
        ev.preventDefault();
        dragging = true;
        handle.classList.add("dragging");
        document.body.style.userSelect = "none";
        startPos = axis === "row" ? ev.clientY : ev.clientX;
        const rect = target.getBoundingClientRect();
        startSize = axis === "row" ? rect.height : rect.width;
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    });
    // Simple two-state toggle: double-click while collapsed reveals the zone at its
    // natural (unconstrained CSS) size — e.g. bringing back a hidden shortcuts panel —
    // and double-click again puts it back to minimum. Manual dragging updates which
    // state a following double-click resolves against.
    handle.addEventListener("dblclick", () => {
        if (isAtMin) {
            let revealed: number;
            if (opts.revealPx !== undefined) {
                revealed = clampSize(opts.revealPx);
            } else {
                target.style.flex = "";
                const rect = target.getBoundingClientRect();
                const natural = axis === "row" ? rect.height : rect.width;
                revealed = clampSize(Math.max(natural * (opts.revealScale ?? 1), min));
            }
            applySize(revealed);
            isAtMin = false;
            opts.onResize?.(isDefault(revealed) ? -1 : revealed);
        } else {
            applySize(min);
            isAtMin = true;
            opts.onResize?.(isDefault(min) ? -1 : min);
        }
        opts.onCommit?.();
    });

    return handle;
}
