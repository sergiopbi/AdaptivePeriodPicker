"use strict";
import powerbi from "powerbi-visuals-api";
import * as pbModels from "powerbi-models";
import "./../style/visual.less";
import "./dialog";
import { DIALOG_ID, DialogInitialState, DialogResultState } from "./dialog";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { VisualFormattingSettingsModel } from "./settings";
import { attachResizer } from "./resize";
import {
    Gran, Lang, normalizeGran, GRAN_SING, GRAN_LETTER, I18N, SHORTCUTS,
    d0, dMs, same, fmt, resolveEffectiveGran, calRange, shortcutRange, parseDate, isoWeekNumber
} from "./shared";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions      = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual                  = powerbi.extensibility.visual.IVisual;
import IVisualHost              = powerbi.extensibility.visual.IVisualHost;
import IVisualEventService      = powerbi.extensibility.IVisualEventService;
import FilterAction             = powerbi.FilterAction;
import VisualDialogPositionType = powerbi.VisualDialogPositionType;


// ── State persisted across page navigation via general.objects ────────────────
// We store activeSC + dynN as a small JSON string in a separate property so we
// can restore the shortcut on the next page without re-applying the filter.


export class Visual implements IVisual {
    private host:   IVisualHost;
    private events: IVisualEventService;
    private selectionManager: powerbi.extensibility.ISelectionManager;
    private root:   HTMLElement;
    private fmtSvc: FormattingSettingsService;
    private fmtSettings: VisualFormattingSettingsModel;

    private gran:   Gran = "M";
    private lang:   Lang = "PT";
    private refDate: Date = new Date(); // overridable by refDateMeasure; falls back to system clock
    private lastGranOptionsKey: string = "";
    private lastShowAutoGranToggle: boolean|null = null;
    private lastHoverExpand: boolean|null = null;
    private lastLockResizers: boolean|null = null;
    private defaultN = 12; // configurable default number of periods for the refresh button
    private defaultType = "dynamic"; // what the refresh button applies
    private applyImmediate = true; // true = apply on click, false = require Apply button
    private hoverExpandEnabled = false; // Inline Vertical only — see hoverExpand's description
    private resizersLocked = false;
    private scVisible: Record<string,boolean> = {}; // per-shortcut visibility toggles
    private dataMinDate: Date|null = null; // min date from the date table
    private dataMaxDate: Date|null = null; // max date from the date table
    private dataMinMaxScannedLen: number = -1; // row count last scanned for min/max (perf cache)
    private rangeS: Date|null = null;
    private rangeE: Date|null = null;
    private activeSC: string|null = null;
    private dynN: number = 12;
    private dialogOpen = false;
    private dateCat: powerbi.DataViewCategoryColumn|null = null;
    private granCat: powerbi.DataViewCategoryColumn|null = null;
    private granMode: "column"|"fixed" = "fixed";
    private granOptions: string[] = []; // distinct literal values found in granColumn, in natural D..Y order
    private granSelected: string|null = null; // literal currently selected (column mode only)
    private granAutoRuntime: boolean = true; // session-only; re-initialized from fmtSettings on each load, never persisted
    private granAutoTouchedByViewer: boolean = false; // once the viewer touches the runtime toggle (inline or popup), stop re-syncing from the format-pane default so update() re-renders don't stomp their in-session choice — until then, keep syncing, so changing the default while testing/authoring takes effect immediately
    private manualGranOverride: Gran|null = null; // session-only; set once the viewer picks Manual and possibly changes the dropdown
    // True from the moment a top-bar granularity click (selectGran) changes the calendar
    // shape without applying anything, until the next applyFilter() actually commits
    // something. While true, update()'s gran-sync block leaves this.granSelected alone —
    // otherwise the still-unchanged, now-stale applied filter round-trips back via
    // opts.jsonFilters and silently reverts the browse-only click a moment later (the
    // shape flickering back to whatever was last actually applied). Once the viewer
    // commits a real pick, applyFilter() clears this and normal syncing (including the
    // desired auto-downgrade-on-a-too-small-range behaviour) resumes on the fresh range.
    private granSelectedDiverged = false;
    private autoGranRowInline: HTMLElement|null = null;
    private manualGranSelectInline!: HTMLSelectElement;
    private effectiveGranLblInline!: HTMLElement;

    // DOM
    private wrap!:        HTMLElement;
    private closedEl!:    HTMLElement;
    private closedGran!:  HTMLElement;
    private closedRange!: HTMLElement;

    // Inline calendar DOM refs (populated by buildCalendarUI / buildHorizontalUI)
    private calContainer: HTMLElement|null = null;
    private shortcutsEl!: HTMLElement;
    private calAreaEl!:   HTMLElement; // wraps nav header + grid; rebuilt whole when granularity changes shape
    // Root element of the "Datas Início/Fim" zone specifically — used to scope that
    // zone's own selected/unselected/value colors (via applyColors' setZone) to just
    // this subtree, the same way granBarEl/shortcutsEl/calAreaEl/autoGranRowInline
    // scope theirs. In vertical mode this is the dedicated full-width "di" strip; in
    // horizontal mode there's no separate strip (the two date boxes sit directly in
    // the side column), so buildHorizontalUI wraps them in one for this purpose only.
    private datesWrapEl: HTMLElement|null = null;
    private calDaysEl!:   HTMLElement;
    private mSel!:        HTMLSelectElement;
    private ySel!:        HTMLSelectElement;
    private yearRangeLbl: HTMLElement|null = null; // "2021 – 2032" label, used only in Year-granularity grid
    private inS!:         HTMLInputElement;
    private inE!:         HTMLInputElement;
    private inputWrapStart!: HTMLElement;
    private inputWrapEnd!:   HTMLElement;
    private footerInfo!:  HTMLElement;
    private footerBtnsRow: HTMLElement|null = null;
    private dynInput!:    HTMLInputElement;
    private dynUnit!:     HTMLElement;
    private lastSyncedS = "";
    private lastSyncedE = "";

    // Draft state (edited inside calendar before Apply)
    private draftRangeS: Date|null = null;
    private draftRangeE: Date|null = null;
    private draftActiveSC: string|null = null;
    private draftDynN: number = 12;
    private picking = false;
    private hov: Date|null = null;
    private pendingPeriodEnd: Date|null = null; // remembers the end of the first-clicked period, for period-grid range picking
    private calY = new Date().getFullYear();
    private calM = new Date().getMonth();

    private currentMode: "popup"|"inline-vertical"|"inline-horizontal" = "popup";

    // User-dragged zone sizes (px) — persisted (see persistPaneSizes()) so publishing or
    // reopening the report keeps whatever layout was set up, same as gran/activeSC already do.
    // Point 7: this is per VISUAL INSTANCE, not per visual TYPE — copy/pasting this exact
    // visual onto another page carries its persisted properties (including sizes) along,
    // but inserting a fresh copy on another page does not; there's no cross-instance default
    // in Power BI's object model to hook into for that.
    private paneSizes: Record<string, number> = {};
    private paneSizesLoaded = false; // read from persisted state at most once — afterwards this.paneSizes is the live source of truth
    // Round-trips through persistProperties as one JSON blob together with activeSC/dynN/gran
    // (see applyFilter()) — merged in here rather than overwritten, so a resize doesn't clobber
    // those fields and vice versa.
    private lastIntent: Record<string, unknown> = {};
    // axis="row": target's height in px. axis="col": target's width in px.
    private addResizer(axis:"row"|"col", target:HTMLElement, sign:1|-1, key:string, min:number, max?:number, getMax?:()=>number, defaultPx?:number, revealScale?:number, revealPx?:number, alwaysFree?:boolean):HTMLElement{
        return attachResizer({
            axis, target, sign, min, max, getMax, defaultPx, revealScale, revealPx,
            locked: alwaysFree ? false : this.resizersLocked,
            initialPx: this.paneSizes[key],
            onResize:(px)=>{ if(px<0) delete this.paneSizes[key]; else this.paneSizes[key]=px; },
            onCommit:()=>this.persistPaneSizes()
        });
    }
    private persistPaneSizes(){
        this.lastIntent={...this.lastIntent, sizes:this.paneSizes};
        this.host.persistProperties({
            merge:[{ objectName:"general", selector:null, properties:{ state: JSON.stringify(this.lastIntent) } }]
        });
    }

    constructor(o:VisualConstructorOptions){
        this.host   = o.host;
        this.events = o.host.eventService;
        this.root   = o.element;
        this.fmtSvc = new FormattingSettingsService(o.host.createLocalizationManager());
        this.selectionManager = o.host.createSelectionManager();
        this.lang = (o.host.locale||"").toLowerCase().startsWith("pt") ? "PT" : "EN";
        this.buildShell();
        // Standard right-click context menu (Format visual / Filter / etc.) — Microsoft's
        // guidelines recommend every Power BI visual enable this for a consistent
        // experience, even visuals like this one with no individual data points to select.
        this.root.addEventListener("contextmenu", (e:MouseEvent) => {
            if (this.host.hostCapabilities.allowInteractions === false) return;
            const emptySelectionId = this.host.createSelectionIdBuilder().createSelectionId();
            this.selectionManager.showContextMenu(emptySelectionId, {x: e.clientX, y: e.clientY});
            e.preventDefault();
        });
    }

    private e(tag:string,cls?:string):HTMLElement{const el=document.createElement(tag);if(cls)el.className=cls;return el;}

    private t(){return I18N[this.lang];}

    // Letter shown on a granularity-bar button for a given Gran code: the free-text
    // override from "Texto da Granularidade" if the report author set one, otherwise
    // the language-appropriate default from GRAN_LETTER (was always the raw English
    // Gran code itself before this existed, regardless of report language).
    private granLabel(g:Gran):string{
        const gl=this.fmtSettings?.granularityOptions;
        const override=(gl?({D:gl.granLabelD,W:gl.granLabelW,M:gl.granLabelM,Q:gl.granLabelQ,S:gl.granLabelS,Y:gl.granLabelY}[g].value):"")?.trim();
        return override || GRAN_LETTER[this.lang][g];
    }
    // Pre-resolved map for the full Gran set, handed to the pop-up dialog (a separate
    // DOM/bundle instance) so it doesn't need its own copy of the override+fallback logic.
    private granLabelsResolved():Record<Gran,string>{
        return {D:this.granLabel("D"),W:this.granLabel("W"),M:this.granLabel("M"),Q:this.granLabel("Q"),S:this.granLabel("S"),Y:this.granLabel("Y")};
    }

    private buildShell(){
        this.root.replaceChildren();
        this.wrap=this.e("div","qahs-dp-root");
        this.root.append(this.wrap);
    }

    private applyColors(target:HTMLElement){
        // High-contrast accessibility mode: Microsoft's guidelines require drawing with
        // only the host-provided foreground/background/selection colors in this mode,
        // ignoring the format pane's custom colors, so the visual respects the user's
        // OS/Power BI accessibility theme instead of an author-chosen palette that might
        // not meet contrast requirements.
        const palette=this.host.colorPalette as powerbi.extensibility.ISandboxExtendedColorPalette;
        if(palette?.isHighContrast){
            const fg=palette.foreground.value, bg=palette.background.value, sel=palette.foregroundSelected.value;
            target.style.setProperty("--dp-bg",          bg);
            target.style.setProperty("--dp-zone-gran-bg",      bg);
            target.style.setProperty("--dp-zone-gran-box-bg",  bg);
            target.style.setProperty("--dp-zone-dates-bg",     bg);
            target.style.setProperty("--dp-zone-dates-box-bg", bg);
            target.style.setProperty("--dp-zone-shortcuts-bg", bg);
            target.style.setProperty("--dp-zone-shortcuts-box-bg", bg);
            target.style.setProperty("--dp-zone-cal-bg",       bg);
            target.style.setProperty("--dp-zone-control-bg",   bg);
            target.style.setProperty("--dp-accent",      sel);
            target.style.setProperty("--dp-title",       fg);
            target.style.setProperty("--dp-value",       fg);
            target.style.setProperty("--dp-accent-text", bg);
            target.style.setProperty("--dp-border",       fg);
            target.style.setProperty("--dp-border-width", "1px");
            // Clear any per-zone color overrides left on the zone elements themselves
            // (see setZone below) from a previous normal-mode render — those are more
            // specific than the ones just set on `target` and would otherwise keep
            // winning the cascade, defeating high-contrast mode in whichever zones had
            // a custom color configured.
            [this.granBarEl,this.datesWrapEl,this.shortcutsEl,this.calAreaEl,this.autoGranRowInline].forEach(el=>{
                if(!el) return;
                el.style.removeProperty("--dp-accent"); el.style.removeProperty("--dp-accent-text");
                el.style.removeProperty("--dp-title");  el.style.removeProperty("--dp-value");
            });
            return;
        }
        const g=this.fmtSettings?.globalStyle;
        if(!g) return;
        // These are labelled "Transparência" (transparency), so the value itself has to
        // mean "% transparent" — 100 fully see-through, 0 fully solid — not "% opaque" the
        // way the underlying color-mix() call wants it, hence the 100-minus below.
        const op=(v:number|undefined,def:number)=>100-Math.max(0,Math.min(100,v??def));
        target.style.setProperty("--dp-bg", `color-mix(in srgb, ${g.backgroundColor.value.value} ${op(g.backgroundOpacity.value,0)}%, transparent)`);
        // This is specifically the widget's OWN background while collapsed (hover mode,
        // not hovering) — granularity and Início/Fim keep their normal, independently-set
        // zone boxes either way (painted on top of it), so the only area this actually
        // shows through is the blank space left behind by the hidden shortcuts+calendar+
        // control-panel zones. On hover it reverts to the plain --dp-bg (see
        // .dp-hover-mode.dp-hover-active in the CSS).
        target.style.setProperty("--dp-hover-reveal-bg", `color-mix(in srgb, ${g.backgroundColor.value.value} ${op(g.hoverRevealOpacity.value,0)}%, transparent)`);
        // One shared typeface for the whole widget — font SIZE still varies per zone
        // (below), but mixing typefaces zone-to-zone was never wanted and just made the
        // format pane harder to reason about.
        target.style.setProperty("--dp-font-family", g.fontFamily.value||"Segoe UI");
        // Selected/unselected/value colors are now per-zone (see setZone below) — these
        // four are just the fallback for anything NOT inside one of the 5 zone elements
        // (e.g. the footer Apply/Cancel buttons), so every zone's own setting always
        // wins there via the normal CSS cascade (more specific element wins).
        target.style.setProperty("--dp-accent",      "#2d6bc4");
        target.style.setProperty("--dp-title",       "#9ab0cc");
        target.style.setProperty("--dp-value",       "#ffffff");
        target.style.setProperty("--dp-accent-text", "#ffffff");
        target.style.setProperty("--dp-border",       g.borderColor.value.value);
        target.style.setProperty("--dp-border-width", `${g.borderWidth.value}px`);
        target.style.setProperty("--dp-resizer-color",     g.resizerColor.value.value);
        target.style.setProperty("--dp-resizer-thickness", `${g.resizerThickness.value||1}px`);

        // 5 fully independent zones (granularity / Início-Fim / atalhos / calendário /
        // painel de controlo), each with its own background, corner radius ("forma"),
        // box size (like the Chiclet Slicer's tile size) and font size. Three zones
        // (gran/dates/shortcuts) ALSO carry a second, independent "box" background —
        // the fix for the bug where hiding a zone's outer shape also erased the
        // background of every individual button/field inside it, because both used to
        // be the same CSS variable. Falls back to the same literal defaults the
        // settings themselves use when the card hasn't been created yet.
        const z=this.fmtSettings?.zonesCard;
        // zoneEl: the zone's own root DOM element (granBarEl, datesWrapEl, shortcutsEl,
        // calAreaEl, autoGranRowInline) — the 4 selected/unselected/value colors are set
        // on THAT element, not `target`, so they only cascade to that zone's own
        // descendants (plain CSS custom-property scoping — every selector in visual.less/
        // dialog.less already just reads var(--dp-accent) etc. unchanged, no renaming
        // needed). The bg/radius/boxsize/fontsize vars stay on `target` since their CSS
        // variable NAMES are already zone-specific (--dp-zone-gran-bg etc.), so scoping
        // doesn't matter for those.
        const setZone=(key:string, defs:{color:string,opacity:number,radius:number,fontSize:number,boxSize:number,box?:{color:string,opacity:number}}, zoneEl?:HTMLElement|null)=>{
            const zone=z?(z as any)[key]?.slices:undefined;
            const color=zone?.color.value.value??defs.color;
            const opacity=zone?.opacity.value??defs.opacity;
            const radius=zone?.radius.value??defs.radius;
            const boxSize=zone?.boxSize.value??defs.boxSize;
            const fontSize=zone?.fontSize.value??defs.fontSize;
            target.style.setProperty(`--dp-zone-${key}-bg`,     `color-mix(in srgb, ${color} ${op(opacity,defs.opacity)}%, transparent)`);
            target.style.setProperty(`--dp-zone-${key}-radius`, `${radius}px`);
            target.style.setProperty(`--dp-zone-${key}-boxsize`,`${boxSize}px`);
            target.style.setProperty(`--dp-font-size-${key}`,   `${(fontSize||defs.fontSize)*4/3}px`);
            if(defs.box){
                const boxColor=zone?.boxColor?.value.value??defs.box.color;
                const boxOpacity=zone?.boxOpacity?.value??defs.box.opacity;
                target.style.setProperty(`--dp-zone-${key}-box-bg`, `color-mix(in srgb, ${boxColor} ${op(boxOpacity,defs.box.opacity)}%, transparent)`);
            }
            if(zoneEl){
                const selColor=zone?.selectedColor?.value.value??"#2d6bc4";
                const selTextColor=zone?.selectedTextColor?.value.value??"#ffffff";
                const unselColor=zone?.unselectedColor?.value.value??"#9ab0cc";
                const valColor=zone?.valueColor?.value.value??"#ffffff";
                zoneEl.style.setProperty("--dp-accent",      selColor);
                zoneEl.style.setProperty("--dp-accent-text", selTextColor);
                zoneEl.style.setProperty("--dp-title",       unselColor);
                zoneEl.style.setProperty("--dp-value",       valColor);
            }
        };
        setZone("gran",       {color:"#16243f",opacity:0,  radius:5,fontSize:7,boxSize:5, box:{color:"#16243f",opacity:100}}, this.granBarEl);
        setZone("dates",      {color:"#16243f",opacity:100,radius:5,fontSize:9,boxSize:3, box:{color:"#16243f",opacity:40}}, this.datesWrapEl);
        setZone("shortcuts",  {color:"#16243f",opacity:65, radius:4,fontSize:9,boxSize:8, box:{color:"#16243f",opacity:65}}, this.shortcutsEl);
        setZone("cal",        {color:"#16243f",opacity:100,radius:6,fontSize:9,boxSize:24}, this.calAreaEl);
        setZone("control",    {color:"#16243f",opacity:0,  radius:5,fontSize:9,boxSize:5}, this.autoGranRowInline);
    }

    // ── CLOSED BAR ───────────────────────────────────────────────────────────
    private buildClosedBar(){
        this.wrap.replaceChildren();
        this.closedEl=this.e("div","dp-closed");
        const icon=this.e("span","dp-closed-icon"); icon.textContent="📅";
        const txt=this.e("div","dp-closed-text");
        this.closedGran=this.e("div","dp-closed-gran");
        this.closedRange=this.e("div","dp-closed-hint");
        txt.append(this.closedGran,this.closedRange);
        // Refresh button: applies the default "last N periods" (per granularity) without opening the popup
        const refreshBtn=this.e("span","dp-closed-refresh") as HTMLElement;
        // eslint-disable-next-line powerbi-visuals/no-inner-outer-html -- static, hardcoded SVG markup, no external/user data involved
        refreshBtn.innerHTML=`<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>`;
        refreshBtn.title=this.lang==="PT"?"Aplicar período predefinido":"Apply default period";
        refreshBtn.addEventListener("click",(ev)=>{ ev.stopPropagation(); this.applyDefaultDynamic(); });
        const arr=this.e("span","dp-closed-arrow"); arr.textContent="▼";
        this.closedEl.append(icon,txt,refreshBtn,arr);
        this.closedEl.setAttribute("tabindex","0");
        this.closedEl.setAttribute("role","button");
        this.closedEl.setAttribute("aria-label", this.lang==="PT" ? "Abrir seletor de período" : "Open period picker");
        this.closedEl.addEventListener("click",()=>this.openNativeDialog());
        this.closedEl.addEventListener("keydown",(ev:KeyboardEvent)=>{
            if(ev.key==="Enter"||ev.key===" "){ ev.preventDefault(); this.openNativeDialog(); }
        });
        refreshBtn.setAttribute("tabindex","0");
        refreshBtn.setAttribute("role","button");
        refreshBtn.setAttribute("aria-label", refreshBtn.title);
        refreshBtn.addEventListener("keydown",(ev:KeyboardEvent)=>{
            if(ev.key==="Enter"||ev.key===" "){ ev.preventDefault(); ev.stopPropagation(); this.applyDefaultDynamic(); }
        });
        this.wrap.append(this.closedEl);
        this.updateClosedLabel();
    }

    // Applies the default dynamic range ("last N periods") based on current granularity,
    // directly from the closed bar without opening the dialog. N comes from this.dynN.
    private applyDefaultDynamic(){
        const today=new Date(this.refDate); today.setHours(0,0,0,0);
        let r:{s:Date,e:Date}|null;
        if(this.defaultType==="dynamic"){
            this.dynN=this.defaultN;
            r=calRange(today,this.dynN,this.gran);
            this.activeSC="dynamic";
        } else {
            r=shortcutRange(this.defaultType,today);
            this.activeSC=this.defaultType;
        }
        if(!r) return;
        this.rangeS=r.s; this.rangeE=r.e;
        this.applyFilter();
        this.updateClosedLabel();
    }

    private updateClosedLabel(){
        if(!this.closedGran) return;
        this.closedGran.textContent=GRAN_SING[this.lang][this.gran];
        if(this.rangeS&&this.rangeE){
            this.closedRange.className="dp-closed-range";
            this.closedRange.textContent=same(this.rangeS,this.rangeE)
                ? fmt(this.rangeS)
                : `${fmt(this.rangeS)} – ${fmt(this.rangeE)}`;
        } else {
            this.closedRange.className="dp-closed-hint";
            this.closedRange.textContent=this.t().nsel;
        }
    }

    // ── NATIVE DIALOG ────────────────────────────────────────────────────────
    private openNativeDialog(){
        if(this.dialogOpen) return;
        this.dialogOpen=true;
        const g=this.fmtSettings?.globalStyle;
        const z=this.fmtSettings?.zonesCard;
        const zv=(key:string,slice:"color"|"opacity"|"radius"|"fontSize"|"boxSize"|"boxColor"|"boxOpacity"|"selectedColor"|"selectedTextColor"|"unselectedColor"|"valueColor",def:any)=>{
            const zone=z?(z as any)[key]?.slices:undefined;
            const s=zone?zone[slice]:undefined;
            if(!s) return def;
            const isColorPicker=slice==="color"||slice==="boxColor"||slice==="selectedColor"||slice==="selectedTextColor"||slice==="unselectedColor"||slice==="valueColor";
            return isColorPicker?(s.value.value??def):(s.value??def);
        };
        const go=this.fmtSettings?.granularityOptions;
        const granVisibleForDialog:Record<Gran,boolean>={D:false,W:false,M:false,Q:false,S:false,Y:false};
        this.granOptions.forEach(g=>granVisibleForDialog[g]=true);
        const state:DialogInitialState={
            gran:this.gran, lang:this.lang,
            rangeStart:this.rangeS?.toISOString()||null,
            rangeEnd:this.rangeE?.toISOString()||null,
            activeShortcut:this.activeSC,
            dynamicN:this.dynN,
            refDate:this.refDate.toISOString(),
            scVisible:this.scVisible,
            dataMinDate:this.dataMinDate?this.dataMinDate.toISOString():null,
            dataMaxDate:this.dataMaxDate?this.dataMaxDate.toISOString():null,
            granMode:this.granMode, granOptions:this.granOptions, granSelected:this.granSelected,
            showAutoGranToggle: go?.showAutoGranToggle.value ?? true,
            applyImmediate: this.applyImmediate,
            granAutoDefault: this.granAutoRuntime,
            granVisible: granVisibleForDialog,
            granThresholds: go
                ? {W:go.granWThreshold.value,M:go.granMThreshold.value,Q:go.granQThreshold.value,S:go.granSThreshold.value,Y:go.granYThreshold.value}
                : {W:2,M:2,Q:2,S:2,Y:2},
            lockResizers: this.fmtSettings?.displayMode?.lockResizers.value ?? false,
            granLabelsText: this.granLabelsResolved(),
            colors:{
                bg:g?.backgroundColor.value.value||"#1e3055",
                bgOpacity:g?.backgroundOpacity.value??0,
                hoverRevealOpacity:g?.hoverRevealOpacity.value??0,
                fontFamily:g?.fontFamily.value||"Segoe UI",
                // Selected/unselected/value colors are per-zone now (see zone*Selected*/
                // zone*Unselected*/zone*Value* below) — these three plain ones remain only
                // as the dialog's own generic fallback for anything outside all 5 zones
                // (e.g. its Apply/Cancel buttons), mirroring applyColors() in visual.ts.
                accent:"#2d6bc4", title:"#9ab0cc", value:"#ffffff", accentText:"#ffffff",
                borderColor:g?.borderColor.value.value||"#2d4470",
                borderWidth:g?.borderWidth.value??1,
                resizerColor:g?.resizerColor.value.value||"#2d4470",
                resizerThickness:g?.resizerThickness.value??1,
                zoneGranColor:zv("gran","color","#16243f"), zoneGranOpacity:zv("gran","opacity",0), zoneGranRadius:zv("gran","radius",5),
                zoneGranBoxSize:zv("gran","boxSize",5), zoneGranFontSize:zv("gran","fontSize",7),
                zoneGranBoxColor:zv("gran","boxColor","#16243f"), zoneGranBoxOpacity:zv("gran","boxOpacity",100),
                zoneGranSelectedColor:zv("gran","selectedColor","#2d6bc4"), zoneGranSelectedTextColor:zv("gran","selectedTextColor","#ffffff"),
                zoneGranUnselectedColor:zv("gran","unselectedColor","#9ab0cc"), zoneGranValueColor:zv("gran","valueColor","#ffffff"),
                zoneDatesColor:zv("dates","color","#16243f"), zoneDatesOpacity:zv("dates","opacity",100), zoneDatesRadius:zv("dates","radius",5),
                zoneDatesBoxSize:zv("dates","boxSize",3), zoneDatesFontSize:zv("dates","fontSize",9),
                zoneDatesSelectedColor:zv("dates","selectedColor","#2d6bc4"), zoneDatesSelectedTextColor:zv("dates","selectedTextColor","#ffffff"),
                zoneDatesUnselectedColor:zv("dates","unselectedColor","#9ab0cc"), zoneDatesValueColor:zv("dates","valueColor","#ffffff"),
                zoneDatesBoxColor:zv("dates","boxColor","#16243f"), zoneDatesBoxOpacity:zv("dates","boxOpacity",40),
                zoneShortcutsColor:zv("shortcuts","color","#16243f"), zoneShortcutsOpacity:zv("shortcuts","opacity",65), zoneShortcutsRadius:zv("shortcuts","radius",4),
                zoneShortcutsBoxSize:zv("shortcuts","boxSize",8), zoneShortcutsFontSize:zv("shortcuts","fontSize",9),
                zoneShortcutsBoxColor:zv("shortcuts","boxColor","#16243f"), zoneShortcutsBoxOpacity:zv("shortcuts","boxOpacity",65),
                zoneShortcutsSelectedColor:zv("shortcuts","selectedColor","#2d6bc4"), zoneShortcutsSelectedTextColor:zv("shortcuts","selectedTextColor","#ffffff"),
                zoneShortcutsUnselectedColor:zv("shortcuts","unselectedColor","#9ab0cc"), zoneShortcutsValueColor:zv("shortcuts","valueColor","#ffffff"),
                zoneCalColor:zv("cal","color","#16243f"), zoneCalOpacity:zv("cal","opacity",100), zoneCalRadius:zv("cal","radius",6),
                zoneCalBoxSize:zv("cal","boxSize",24), zoneCalFontSize:zv("cal","fontSize",9),
                zoneCalSelectedColor:zv("cal","selectedColor","#2d6bc4"), zoneCalSelectedTextColor:zv("cal","selectedTextColor","#ffffff"),
                zoneCalUnselectedColor:zv("cal","unselectedColor","#9ab0cc"), zoneCalValueColor:zv("cal","valueColor","#ffffff"),
                zoneControlColor:zv("control","color","#16243f"), zoneControlOpacity:zv("control","opacity",0), zoneControlRadius:zv("control","radius",5),
                zoneControlBoxSize:zv("control","boxSize",5), zoneControlFontSize:zv("control","fontSize",9),
                zoneControlSelectedColor:zv("control","selectedColor","#2d6bc4"), zoneControlSelectedTextColor:zv("control","selectedTextColor","#ffffff"),
                zoneControlUnselectedColor:zv("control","unselectedColor","#9ab0cc"), zoneControlValueColor:zv("control","valueColor","#ffffff")
            }
        };
        // RelativeToVisual (positioning the dialog near the visual) can't be auto-corrected
        // with client-side math: confirmed via a debug log that this.root.getBoundingClientRect()
        // and window.innerWidth only ever see this visual's own small sandboxed rendering
        // area (windowInnerWidth came back as exactly this widget's own width, visualRect.left
        // as 0 regardless of where the visual actually sits on the report page) — there's no
        // coordinate readable from here that reflects the real page position, so nothing
        // computed in this function can know which side is safe to extend the popup toward.
        // That's what popupHorizontalAnchor is for: the report author knows where they put
        // the visual, even though the code doesn't — "right" (default) extends the popup
        // rightward from the visual's own left edge (matches the plain behavior this
        // shipped with for most of this feature's life); "left" extends it leftward from
        // the visual's own right edge instead, for reports where the visual sits close to
        // the page's right margin (the one case with a known, minor issue — an occasional
        // scrollbar — in the default direction).
        const visualRect = this.root.getBoundingClientRect();
        const dm = this.fmtSettings?.displayMode;
        const popupWidth = dm?.popupWidth.value ?? 480;
        const popupHeight = dm?.popupHeight.value ?? 440;
        const anchorLeft = dm?.popupHorizontalAnchor.value.value !== "left";
        const leftOffset = anchorLeft ? 0 : Math.round(visualRect.width - popupWidth);
        this.host.openModalDialog(DIALOG_ID,{
            title:"", size:{width:popupWidth,height:popupHeight}, actionButtons:[],
            position:{ type: VisualDialogPositionType.RelativeToVisual, left:leftOffset, top:Math.round(visualRect.height) }
        },state)
        .then((result)=>{
            this.dialogOpen=false;
            if(!result||result.actionId!==1) return;
            const rs=result.resultState as DialogResultState;
            if(rs.cancelled) return;
            if(rs.rangeStart){
                this.rangeS=new Date(rs.rangeStart);
                this.rangeE=new Date(rs.rangeEnd||rs.rangeStart);
                this.activeSC=rs.activeSC!==undefined?rs.activeSC:"manual";
                if(rs.dynN!==undefined) this.dynN=rs.dynN;
                if(rs.granAuto!==undefined){ this.granAutoRuntime=rs.granAuto; this.granAutoTouchedByViewer=true; }
                if(rs.manualGran!==undefined) this.manualGranOverride=(rs.manualGran as Gran)??null;
                this.applyFilter();
                this.updateClosedLabel();
            }
            if(this.granMode==="column" && rs.granSelected && rs.granSelected!==this.granSelected){
                this.granSelected=rs.granSelected;
                const mapped=normalizeGran(rs.granSelected);
                if(mapped) this.gran=mapped;
                this.applyFilter();
            }
        })
        .catch(()=>{this.dialogOpen=false;});
    }

    // ── INLINE MODE ──────────────────────────────────────────────────────────
    private buildInlineMode(){
        this.wrap.replaceChildren();
        this.wrap.classList.remove("dp-inline-mode","dp-horizontal-mode");
        this.draftRangeS=this.rangeS; this.draftRangeE=this.rangeE;
        this.draftActiveSC=this.activeSC; this.draftDynN=this.dynN;
        const ref=this.draftRangeE||new Date(this.refDate);
        this.calY=ref.getFullYear(); this.calM=ref.getMonth();
        this.picking=false; this.hov=null;
        if(this.currentMode==="inline-horizontal"){
            this.wrap.classList.add("dp-horizontal-mode");
            this.calContainer=this.e("div","dp-horiz-root");
            this.buildHorizontalUI(this.calContainer);
        } else {
            this.wrap.classList.add("dp-inline-mode");
            this.calContainer=this.e("div","dp-inline-root");
            this.buildCalendarUI(this.calContainer);
        }
        this.wrap.append(this.calContainer);
        this.applyColors(this.wrap);
        this.refreshCalendarUI();
    }

    // ── HORIZONTAL LAYOUT ────────────────────────────────────────────────────
    private buildHorizontalUI(root:HTMLElement){
        root.className="dp-horiz-root";
        this.shortcutsEl=this.e("div","dp-horiz-shortcuts");

        // Column 2: calendar (header + grid adapt to granularity — see buildCalArea)
        const colCal=this.e("div","dp-horiz-col dp-horiz-cal");
        this.calAreaEl=this.e("div","dp-cal-area");
        colCal.append(this.calAreaEl);
        this.buildCalArea();

        // Column 3: dates + day count + actions (merges the former 2nd and 4th columns)
        const colSide=this.e("div","dp-horiz-col dp-horiz-side");
        const ws=this.e("div","dp-pop-iw"); const ls=this.e("label"); ls.textContent=this.t().start;
        this.inS=document.createElement("input"); this.inS.type="text"; this.inS.placeholder="dd-mm-aa";
        this.inS.addEventListener("keydown",(ev)=>{if(ev.key==="Enter"){ev.preventDefault();this.confirmInput("start");this.inS.blur();}});
        this.inS.addEventListener("blur",()=>{if(this.inS.value!==this.lastSyncedS) this.confirmInput("start");});
        this.inS.addEventListener("focus",()=>this.setEditingField("start"));
        ws.append(ls,this.inS); this.inputWrapStart=ws;
        const we=this.e("div","dp-pop-iw"); const le=this.e("label"); le.textContent=this.t().end;
        this.inE=document.createElement("input"); this.inE.type="text"; this.inE.placeholder="dd-mm-aa";
        this.inE.addEventListener("keydown",(ev)=>{if(ev.key==="Enter"){ev.preventDefault();this.confirmInput("end");this.inE.blur();}});
        this.inE.addEventListener("blur",()=>{if(this.inE.value!==this.lastSyncedE) this.confirmInput("end");});
        this.inE.addEventListener("focus",()=>this.setEditingField("end"));
        we.append(le,this.inE); this.inputWrapEnd=we;
        this.footerInfo=this.e("div","dp-horiz-infotext");
        const btnRow=this.e("div","dp-horiz-btnrow");
        const btnCancel=this.e("button","dp-pop-btn cancel") as HTMLButtonElement; btnCancel.textContent=this.t().cancel; btnCancel.addEventListener("click",()=>this.cancelInlineDraft());
        const btnApply=this.e("button","dp-pop-btn apply") as HTMLButtonElement; btnApply.textContent=this.t().apply; btnApply.addEventListener("click",()=>this.submitFromInline());
        btnRow.append(btnCancel,btnApply);
        // Thin wrapper purely so the Dates zone's own colors (set in applyColors) can be
        // scoped to just these two boxes — the horizontal layout has no other natural
        // container for them (they sit loose in colSide alongside auto/manual + footer).
        const datesWrap=this.e("div","dp-horiz-dates-wrap");
        datesWrap.append(ws,we);
        this.datesWrapEl=datesWrap;
        colSide.append(datesWrap);
        const autoRowV=this.buildAutoGranRow(true);
        if(autoRowV) colSide.append(autoRowV);
        colSide.append(this.footerInfo,btnRow);
        this.footerBtnsRow=btnRow;

        const granBar=this.buildGranBar(true);
        const rowWrap=this.e("div","dp-horiz-row");
        // Each of these three zones can, in principle, grow enough (especially combined)
        // to push colCal below its own CSS min-width (200px) — and since the row has no
        // horizontal scrollbar, that overflow doesn't get a scrollbar either: the excess
        // just renders past the widget's right edge, unreachable. getMax() below caps
        // each zone's growth to whatever colCal (at its floor) and the OTHER zones (at
        // their current size) can actually spare, measured fresh on every drag frame —
        // a static px cap could only ever be right for one particular widget width.
        const dynMaxFor=(excludeEl:HTMLElement|null):number=>{
            const zones=[granBar,this.shortcutsEl,colSide].filter((z):z is HTMLElement=>!!z && z!==excludeEl);
            const zonesW=zones.reduce((sum,el)=>sum+el.getBoundingClientRect().width,0);
            const resizersW=Array.from(rowWrap.querySelectorAll<HTMLElement>(".dp-resizer-col"))
                .reduce((sum,el)=>sum+el.getBoundingClientRect().width,0);
            return rowWrap.clientWidth-110/* .dp-horiz-cal min-width */-zonesW-resizersW;
        };
        if(granBar){
            rowWrap.append(granBar);
            rowWrap.append(this.addResizer("col",granBar,1,"hGranBar",26,90,()=>Math.max(26,dynMaxFor(granBar))));
        }
        rowWrap.append(
            this.shortcutsEl, this.addResizer("col",this.shortcutsEl,1,"hShortcuts",0,320,()=>Math.max(0,dynMaxFor(this.shortcutsEl)),undefined,0.85,undefined,true),
            colCal,
            this.addResizer("col",colSide,-1,"hColSide",0,260,()=>Math.max(0,dynMaxFor(colSide)),72), colSide
        );
        root.append(rowWrap);
        this.updateGranPreviewInline();
    }

    // ── SHARED CALENDAR UI ───────────────────────────────────────────────────
    private buildCalendarUI(root:HTMLElement){
        root.className="dp-inline-root";
        const granBar=this.buildGranBar();
        if(granBar){
            root.append(granBar);
            root.append(this.addResizer("row",granBar,1,"vGranBar",10,110));
        }
        const body=this.e("div","dp-pop-body");
        this.shortcutsEl=this.e("div","dp-pop-shortcuts");
        const cal=this.e("div","dp-pop-cal");
        const di=this.e("div","dp-pop-inputs");
        const ws=this.e("div","dp-pop-iw"); const ls=this.e("label"); ls.textContent=this.t().start;
        this.inS=document.createElement("input"); this.inS.type="text"; this.inS.placeholder="dd-mm-aa";
        this.inS.addEventListener("keydown",(ev)=>{if(ev.key==="Enter"){ev.preventDefault();this.confirmInput("start");this.inS.blur();}});
        this.inS.addEventListener("blur",()=>{if(this.inS.value!==this.lastSyncedS) this.confirmInput("start");});
        this.inS.addEventListener("focus",()=>this.setEditingField("start"));
        ws.append(ls,this.inS); this.inputWrapStart=ws;
        const we=this.e("div","dp-pop-iw"); const le=this.e("label"); le.textContent=this.t().end;
        this.inE=document.createElement("input"); this.inE.type="text"; this.inE.placeholder="dd-mm-aa";
        this.inE.addEventListener("keydown",(ev)=>{if(ev.key==="Enter"){ev.preventDefault();this.confirmInput("end");this.inE.blur();}});
        this.inE.addEventListener("blur",()=>{if(this.inE.value!==this.lastSyncedE) this.confirmInput("end");});
        this.inE.addEventListener("focus",()=>this.setEditingField("end"));
        we.append(le,this.inE); this.inputWrapEnd=we;
        di.append(ws,we);
        this.datesWrapEl=di;
        // Start/End is now a full-width strip of its own — a root-level sibling of `body`,
        // not nested inside the calendar column — so it gets its own independent resizer
        // and dragging the shortcuts↔calendar divider (which only ever should change
        // WIDTH) can no longer squeeze its height as a side effect.
        root.append(di, this.addResizer("row",di,1,"vDateInputs",0,80,undefined,46,undefined,46));
        this.calAreaEl=this.e("div","dp-cal-area");
        cal.append(this.calAreaEl);
        this.buildCalArea();
        body.append(this.shortcutsEl, this.addResizer("col",this.shortcutsEl,1,"vShortcuts",0,320,undefined,undefined,0.85,undefined,true), cal);
        const footer=this.e("div","dp-pop-footer");
        this.footerInfo=this.e("span","dp-pop-info");
        const footerBtns=this.e("div","dp-pop-footer-btns");
        const btnCancel=this.e("button","dp-pop-btn cancel") as HTMLButtonElement; btnCancel.textContent=this.t().cancel; btnCancel.addEventListener("click",()=>this.cancelInlineDraft());
        const btnApply=this.e("button","dp-pop-btn apply") as HTMLButtonElement; btnApply.textContent=this.t().apply; btnApply.addEventListener("click",()=>this.submitFromInline());
        footerBtns.append(btnCancel,btnApply);
        footer.append(this.footerInfo,footerBtns);
        const autoRow=this.buildAutoGranRow(false);
        // Everything from here down (shortcuts+calendar, Auto/Man., footer) is what
        // "Mostrar apenas ao passar o rato" hides by default — granularity and Início/Fim,
        // built above, always stay visible regardless of that setting. Grouped in one
        // wrapper purely so the hover toggle only has one element to show/hide, not four.
        const revealWrap=this.e("div","dp-hover-reveal");
        revealWrap.append(body);
        if(autoRow){
            revealWrap.append(this.addResizer("row",autoRow,-1,"vAutoRow",0,140));
            revealWrap.append(autoRow);
        }
        revealWrap.append(this.addResizer("row",footer,-1,"vFooter",18,200));
        revealWrap.append(footer);
        root.append(revealWrap);
        if(this.hoverExpandEnabled){
            // The hover classes go on this.wrap (the .dp-inline-mode outer element), not
            // root (.dp-inline-root) — wrap has its OWN background (needed for the normal,
            // non-hover case), and that background was never reacting to hover at all,
            // just root's did. With root's background made transparent while collapsed,
            // that left wrap's own opaque background showing through underneath it, which
            // is what kept looking solid regardless of the "área expansível" setting.
            this.wrap.classList.add("dp-hover-mode");
            this.wrap.addEventListener("mouseenter",()=>this.wrap.classList.add("dp-hover-active"));
            this.wrap.addEventListener("mouseleave",()=>this.wrap.classList.remove("dp-hover-active"));
        }
        this.footerBtnsRow=footerBtns;
        this.updateGranPreviewInline();
    }

    // ── ADAPTIVE CALENDAR AREA (v2.0) ───────────────────────────────────────────
    // Rebuilds the nav header + grid to match the current granularity:
    //   D    → classic day grid, month+year selectors, prev/next month
    //   W    → grid of week numbers (W1…W53) for one year, prev/next year
    //   M    → 12-month grid for one year, prev/next year
    //   Q    → quarter grid spanning a window of years (label shows "Q1 25"…), prev/next shifts the whole window
    //   S    → semester grid, wider window so the grid keeps the same 6×6-ish shape
    //   Y    → year grid spanning up to 12 years (fewer if the data table is smaller), prev/next shifts the whole window
    // All windows/years are clamped to the min/max dates actually present in the
    // loaded date table (this.dataMinDate/this.dataMaxDate), so you can never
    // navigate to — or select — a period with no data behind it.
    // Fallbacks used only before the date table's min/max are known (e.g. very first render).
    private static readonly Q_WINDOW_YEARS_FALLBACK=5;
    private static readonly S_WINDOW_YEARS_FALLBACK=10;
    private static readonly MAX_PERIOD_CELLS=54; // same ceiling as the week grid (9×6)

    // How many years of quarters/semesters actually exist in the loaded date table,
    // capped so the grid never exceeds MAX_PERIOD_CELLS. This is what keeps years with
    // no data (e.g. 2028+ when the table ends in 2027) from ever being generated.
    private dataYearSpan():number|null{
        if(!this.dataMinDate||!this.dataMaxDate) return null;
        return this.dataMaxDate.getFullYear()-this.dataMinDate.getFullYear()+1;
    }
    private static readonly Q_MAX_ROWS=6; // never more than 6 rows, or it gets hard to read
    // Set by fitPeriodWindowToHeight() from the actually-available pixel height — when the
    // widget (or a dragged zone) leaves less room than the data-span window needs, this trims
    // the window down to what fits, instead of the old behaviour of rendering the full window
    // and letting the grid overflow into a vertical scrollbar that could hide the current row
    // entirely (reported: viewing Q3 26 required scrolling to find it). Anchored at calY (the
    // window always ENDS at the year in view — see qWindowYears/sWindowYears/yWindowYears
    // callers), so trimming always drops the OLDEST years first, keeping the current one visible.
    private measuredRowCap: number|null = null;
    private periodResizeObserver: ResizeObserver|null = null;
    private autoGranResizeObserver: ResizeObserver|null = null;
    private static readonly MIN_ROW_PX_VERTICAL=26;
    private static readonly MIN_ROW_PX_HORIZONTAL=22; // matches the existing .dp-horiz-cal .dp-period-cell min-height
    // `gridEl` is the direct .dp-period-grid(wrap) parent, already flex-sized by CSS regardless
    // of its (possibly not yet populated) content — safe to measure before rendering cells.
    private fitPeriodWindowToHeight(gridEl:HTMLElement):void{
        if(this.gran!=="Q" && this.gran!=="S" && this.gran!=="Y"){ this.measuredRowCap=null; return; }
        const availH=gridEl.clientHeight;
        if(availH<=0){ this.measuredRowCap=null; return; }
        const minRow=this.currentMode==="inline-horizontal"?Visual.MIN_ROW_PX_HORIZONTAL:Visual.MIN_ROW_PX_VERTICAL;
        const gap=4; // matches .dp-period-grid { gap: 4px }
        this.measuredRowCap=Math.max(1,Math.floor((availH+gap)/(minRow+gap)));
    }
    // `gridEl` is .dp-pop-grid, already in the DOM with a real width by the time this runs.
    // Re-checked on every resize (widget resize, or dragging a neighbouring zone), not just
    // once at build time — a one-shot check at whatever width happened to be current when
    // the day grid was built would go stale the moment the widget's width changes without
    // a granularity switch to trigger a fresh buildCalArea() call.
    private static readonly MIN_PX_PER_WEEKDAY_COL=29; // ~what 3 uppercase letters need at this font, plus breathing room
    private fitWeekdayHeaderToWidth(gridEl:HTMLElement):void{
        if(this.gran!=="D") return;
        const t=this.t();
        const cells=gridEl.querySelectorAll<HTMLElement>(".dp-pop-wd:not(.dp-pop-wn-header)");
        if(cells.length===0) return;
        const useShort=gridEl.clientWidth>0 && gridEl.clientWidth<Visual.MIN_PX_PER_WEEKDAY_COL*7.65;
        cells.forEach((c,i)=>{ c.textContent=(useShort?t.wdaysShort[i]:t.wdays[i])??t.wdays[i]; });
    }
    private qWindowYears():number{
        const span=this.dataYearSpan();
        let cap=Math.min(Visual.Q_MAX_ROWS,Math.floor(Visual.MAX_PERIOD_CELLS/4));
        if(this.measuredRowCap!==null) cap=Math.min(cap,this.measuredRowCap); // 1 year per row for Q
        return span!==null?Math.min(span,cap):Math.min(Visual.Q_WINDOW_YEARS_FALLBACK,cap);
    }
    private static readonly S_MAX_ROWS=6; // 6 columns × 6 rows = 36 cells max
    private sWindowYears():number{
        const span=this.dataYearSpan();
        let cap=Math.min(Visual.S_MAX_ROWS*3,Math.floor(Visual.MAX_PERIOD_CELLS/2)); // 3 years per row at 6 cols
        if(this.measuredRowCap!==null) cap=Math.min(cap,this.measuredRowCap*3); // 3 years per row for S
        return span!==null?Math.min(span,cap):Math.min(Visual.S_WINDOW_YEARS_FALLBACK,cap);
    }

    private buildCalArea(){
        if(!this.calAreaEl) return;
        this.calAreaEl.replaceChildren();
        // Granularity-scoped class so the header (yrlabel / month+year selects) can track
        // whatever adaptive font-size reduction the grid cells use for this granularity —
        // see the .dp-cal-area-q/-s/-w rules — without duplicating the per-gran reduction
        // logic on the header's own selector chain.
        this.calAreaEl.className="dp-cal-area dp-cal-area-"+this.gran.toLowerCase();
        this.periodResizeObserver?.disconnect();
        this.periodResizeObserver=null;
        const isDayGrid=this.gran==="D";
        const isSingleYear=this.gran==="M"||this.gran==="W";
        this.calY=this.clampCalY(this.calY);
        const ch=this.e("div","dp-pop-calh");
        const bp=this.e("button","dp-pop-nav") as HTMLButtonElement; bp.textContent="‹"; bp.addEventListener("click",()=>this.navCal(-1));
        const bn=this.e("button","dp-pop-nav") as HTMLButtonElement; bn.textContent="›"; bn.addEventListener("click",()=>this.navCal(1));
        const my=this.e("div","dp-pop-my");
        this.yearRangeLbl=null;
        if(isDayGrid){
            this.mSel=document.createElement("select"); this.ySel=document.createElement("select");
            this.t().months.forEach((m,i)=>{const o=document.createElement("option");o.value=String(i);o.textContent=m;this.mSel.append(o);});
            this.mSel.addEventListener("change",()=>{this.calM=+this.mSel.value;this.renderCalendarBody();});
            const {minY,maxY}=this.yearSelectBounds();
            for(let y=minY;y<=maxY;y++){const o=document.createElement("option");o.value=String(y);o.textContent=String(y);this.ySel.append(o);}
            this.ySel.addEventListener("change",()=>{this.calY=this.clampCalY(+this.ySel.value);this.syncSel();this.renderCalendarBody();});
            my.append(this.mSel,this.ySel);
        } else if(isSingleYear){
            this.ySel=document.createElement("select");
            const {minY,maxY}=this.yearSelectBounds();
            for(let y=minY;y<=maxY;y++){const o=document.createElement("option");o.value=String(y);o.textContent=String(y);this.ySel.append(o);}
            this.ySel.addEventListener("change",()=>{this.calY=this.clampCalY(+this.ySel.value);this.syncSel();this.renderCalendarBody();});
            my.append(this.ySel);
        } else {
            // Q, S, Y all show a year-range label instead of a single year select.
            const lbl=this.e("span","dp-pop-yrlabel");
            this.yearRangeLbl=lbl; my.append(lbl);
        }
        ch.append(bp,my,bn);

        const grid=this.e("div","dp-pop-grid");
        if(isDayGrid){
            const wdRow=this.e("div","dp-pop-wds");
            const wnH=this.e("div","dp-pop-wd dp-pop-wn-header"); wnH.textContent=this.lang==="PT"?"Sem":"Wk"; wdRow.append(wnH);
            this.t().wdays.forEach(w=>{const d=this.e("div","dp-pop-wd");d.textContent=w;wdRow.append(d);});
            this.calDaysEl=this.e("div","dp-pop-days");
            grid.append(wdRow,this.calDaysEl);
        } else {
            grid.classList.add("dp-period-gridwrap");
            grid.classList.add(`dp-period-gridwrap-${this.gran.toLowerCase()}`);
            this.calDaysEl=this.e("div","dp-period-grid");
            grid.append(this.calDaysEl);
        }
        this.calAreaEl.append(ch,grid);
        if(isDayGrid){
            this.fitWeekdayHeaderToWidth(grid);
            this.periodResizeObserver=new ResizeObserver(()=>this.fitWeekdayHeaderToWidth(grid));
            this.periodResizeObserver.observe(grid);
        }
        if(!isDayGrid && !isSingleYear){
            // Measure once now (covers granularity/mode switches), then keep watching —
            // dragging a neighbouring zone bigger (footer, shortcuts, etc.) shrinks this
            // grid's available height without ever calling buildCalArea() again, so a
            // one-shot measurement alone would go stale the moment the user resizes.
            this.fitPeriodWindowToHeight(grid);
            this.periodResizeObserver=new ResizeObserver(()=>{
                const before=this.measuredRowCap;
                this.fitPeriodWindowToHeight(grid);
                if(this.measuredRowCap!==before){ this.syncSel(); this.renderCalendarBody(); }
            });
            this.periodResizeObserver.observe(grid);
        } else {
            this.measuredRowCap=null;
        }
        this.syncSel();
        this.renderCalendarBody();
    }

    // Plain year-select bounds (D/M/W), clamped to the data table when known.
    private yearSelectBounds():{minY:number;maxY:number}{
        const cy=new Date().getFullYear();
        const minY=this.dataMinDate?this.dataMinDate.getFullYear():2018;
        const maxY=this.dataMaxDate?this.dataMaxDate.getFullYear():cy+2;
        return {minY,maxY};
    }

    // Number of ISO weeks in a given year (52 or 53).
    private weeksInISOYear(year:number):number{
        const p=(y:number)=>(y+Math.floor(y/4)-Math.floor(y/100)+Math.floor(y/400))%7;
        return (p(year)===4||p(year-1)===3)?53:52;
    }
    // Monday of ISO week `week` in `year`.
    private isoWeekStart(year:number,week:number):Date{
        const jan4=new Date(year,0,4);
        const dow=(jan4.getDay()+6)%7; // 0=Monday
        const week1Monday=new Date(jan4); week1Monday.setDate(jan4.getDate()-dow);
        const result=new Date(week1Monday); result.setDate(week1Monday.getDate()+(week-1)*7);
        return result;
    }

    // Clamps calY to whatever the current granularity's window semantics allow,
    private static readonly Y_WINDOW_YEARS_FALLBACK=12;
    private yWindowYears():number{
        const span=this.dataYearSpan();
        let cap=12;
        if(this.measuredRowCap!==null) cap=Math.min(cap,this.measuredRowCap*4); // 4 years per row for Y
        return span!==null?Math.min(span,cap):Math.min(Visual.Y_WINDOW_YEARS_FALLBACK,cap);
    }

    // Clamps calY to whatever the current granularity's window semantics allow,
    // given the data table's min/max dates. calY means, for every granularity,
    // the LAST (most recent) year of the window — this keeps the clamp logic
    // (and the "never beyond the data table" guarantee) identical for M/W/Q/S/Y.
    private clampCalY(y:number):number{
        const maxY=this.dataMaxDate?this.dataMaxDate.getFullYear():null;
        const minY=this.dataMinDate?this.dataMinDate.getFullYear():null;
        if(this.gran==="Y"||this.gran==="Q"||this.gran==="S"){
            const win=this.gran==="Y"?this.yWindowYears():this.gran==="Q"?this.qWindowYears():this.sWindowYears();
            if(maxY!==null&&y>maxY) y=maxY;
            if(minY!==null&&y-win+1<minY) y=minY+win-1;
        } else {
            if(maxY!==null&&y>maxY) y=maxY;
            if(minY!==null&&y<minY) y=minY;
        }
        return y;
    }

    // Prev/next: shifts a month (D), a year (M/W), or a whole Q/S/Y window.
    private navCal(d:number){
        if(this.gran==="D"){ this.nav(d); return; }
        let step=1;
        if(this.gran==="Y") step=this.yWindowYears();
        else if(this.gran==="Q") step=this.qWindowYears();
        else if(this.gran==="S") step=this.sWindowYears();
        this.calY=this.clampCalY(this.calY+d*step);
        this.syncSel(); this.renderCalendarBody();
    }

    // Dispatches to the day grid or a period grid (week/month/quarter/semester/year), depending on granularity.
    private renderCalendarBody(){
        if(!this.calDaysEl) return;
        if(this.gran==="D") this.renderDays();
        else this.renderPeriodGrid(this.gran as "W"|"M"|"Q"|"S"|"Y");
    }

    private renderPeriodGrid(pgran:"W"|"M"|"Q"|"S"|"Y"){
        if(!this.calDaysEl) return;
        this.calDaysEl.replaceChildren();
        const today=new Date(this.refDate); today.setHours(0,0,0,0);
        const rs=this.draftRangeS?dMs(this.draftRangeS):null;
        const re=this.draftRangeE?dMs(this.draftRangeE):null;
        const hm=this.picking&&this.hov?dMs(this.hov):null;
        const effS=(rs!==null&&hm!==null)?Math.min(rs,hm):rs;
        const effE=(rs!==null&&hm!==null)?Math.max(rs,hm):(hm!==null?hm:re);
        const yy=(y:number)=>String(y).slice(-2);

        const tt=this.t();
        let cells:{label:string;s:Date;e:Date}[];
        if(pgran==="W"){
            const totalWeeks=this.weeksInISOYear(this.calY);
            cells=Array.from({length:totalWeeks},(_,i)=>{
                const wk=i+1;
                const s=this.isoWeekStart(this.calY,wk);
                const e=new Date(s); e.setDate(e.getDate()+6);
                return {label:`${this.lang==="PT"?"S":"W"}${wk}`,s,e};
            });
        } else if(pgran==="M"){
            cells=tt.months.map((m,i)=>({label:m.slice(0,3),s:new Date(this.calY,i,1),e:new Date(this.calY,i+1,0)}));
        } else if(pgran==="Q"){
            const endY=this.calY, startY=endY-this.qWindowYears()+1;
            cells=[];
            for(let y=startY;y<=endY;y++) for(let q=0;q<4;q++)
                cells.push({label:`${this.lang==="PT"?"T":"Q"}${q+1} ${yy(y)}`,s:new Date(y,q*3,1),e:new Date(y,q*3+3,0)});
        } else if(pgran==="S"){
            const endY=this.calY, startY=endY-this.sWindowYears()+1;
            cells=[];
            for(let y=startY;y<=endY;y++) for(let sm=0;sm<2;sm++)
                cells.push({label:`S${sm+1} ${yy(y)}`,s:new Date(y,sm*6,1),e:new Date(y,sm*6+6,0)});
        } else {
            const years=this.yWindowYears(), startY=this.calY-years+1;
            cells=Array.from({length:years},(_,i)=>{const y=startY+i;return {label:String(y),s:new Date(y,0,1),e:new Date(y,11,31)};});
        }

        // Q/S/Y use a fixed column count but a variable number of rows (as many as
        // the data table's year span needs), so the grid-template-rows has to be
        // set here rather than in a fixed CSS rule.
        if(pgran==="Q") this.calDaysEl.style.gridTemplateRows=`repeat(${this.qWindowYears()},1fr)`;
        else if(pgran==="S") this.calDaysEl.style.gridTemplateRows=`repeat(${Math.ceil(this.sWindowYears()*2/6)},1fr)`;
        else if(pgran==="Y") this.calDaysEl.style.gridTemplateRows=`repeat(${Math.ceil(this.yWindowYears()/4)},1fr)`;
        else this.calDaysEl.style.gridTemplateRows="";

        cells.forEach(c=>{
            const cs=c.s.getTime(), ce=c.e.getTime();
            const cell=this.e("div","dp-period-cell");
            cell.textContent=c.label;
            // Hard limit: nothing beyond the loaded date table is selectable at all.
            const outOfData=(this.dataMaxDate&&c.s.getTime()>dMs(this.dataMaxDate))||(this.dataMinDate&&c.e.getTime()<dMs(this.dataMinDate));
            if(outOfData){
                cell.classList.add("disabled"); cell.setAttribute("tabindex","-1"); cell.setAttribute("aria-disabled","true");
                const outMsg=this.lang==="PT"?"Fora do intervalo de dados disponível":"Outside the available data range";
                cell.addEventListener("mouseover",(ev:MouseEvent)=>{
                    if(this.host.hostCapabilities.allowInteractions===false) return;
                    this.host.tooltipService.show({dataItems:[{displayName:c.label,value:outMsg}],identities:[],coordinates:[ev.clientX,ev.clientY],isTouchEvent:false});
                });
                cell.addEventListener("mousemove",(ev:MouseEvent)=>{
                    if(this.host.hostCapabilities.allowInteractions===false) return;
                    this.host.tooltipService.move({dataItems:[{displayName:c.label,value:outMsg}],identities:[],coordinates:[ev.clientX,ev.clientY],isTouchEvent:false});
                });
                cell.addEventListener("mouseleave",()=>{ this.host.tooltipService.hide({isTouchEvent:false,immediately:true}); });
                this.calDaysEl.append(cell); return;
            }
            // Soft cue: periods after ref_date are still fully selectable (budget/
            // forecast use cases), just visually muted — same idea as the day
            // grid's .future class, driven by ref_date rather than the data table.
            if(cs>dMs(today)) cell.classList.add("future");
            if(cs<=dMs(today)&&ce>=dMs(today)) cell.classList.add("today");
            if(effS!==null&&effE!==null){
                if(cs<=effS&&ce>=effS) cell.classList.add("rs");
                if(cs<=effE&&ce>=effE) cell.classList.add("re");
                if(cs>effS&&ce<effE) cell.classList.add("in-range");
            } else if(rs!==null&&cs<=rs&&ce>=rs){ cell.classList.add("rs","re"); }
            cell.addEventListener("click",(ev)=>{
                ev.stopPropagation();
                if(!this.picking){
                    this.draftRangeS=c.s; this.draftRangeE=null; this.picking=true; this.hov=null; this.draftActiveSC="manual";
                    this.pendingPeriodEnd=c.e;
                } else {
                    if(c.s.getTime()<this.draftRangeS!.getTime()){ this.draftRangeE=this.pendingPeriodEnd; this.draftRangeS=c.s; }
                    else { this.draftRangeE=c.e; }
                    this.picking=false; this.hov=null; this.draftActiveSC="manual"; this.pendingPeriodEnd=null;
                }
                this.renderCalendarBody(); this.syncInputs(); this.updateInfo(); this.buildShortcuts();
                this.maybeAutoApply();
            });
            cell.setAttribute("tabindex","0");
            cell.setAttribute("role","button");
            cell.setAttribute("aria-label",c.label);
            cell.addEventListener("keydown",(ev:KeyboardEvent)=>{
                if(ev.key==="Enter"||ev.key===" "){ ev.preventDefault(); cell.click(); }
            });
            this.calDaysEl.append(cell);
        });

        this.calDaysEl.onmouseover=(ev)=>{
            if(!this.picking||!this.draftRangeS) return;
            const tgt=ev.target as HTMLElement;
            const idx=Array.prototype.indexOf.call(this.calDaysEl.children,tgt);
            if(idx<0||!cells[idx]) return;
            const c=cells[idx];
            const preview=c.s.getTime()<this.draftRangeS.getTime()?c.s:c.e;
            if(this.hov&&dMs(this.hov)===dMs(preview)) return;
            this.hov=preview; this.renderCalendarBody();
        };
        this.calDaysEl.onmouseleave=()=>{ if(!this.picking) return; this.hov=null; this.renderCalendarBody(); };
    }

    private refreshCalendarUI(){
        this.syncSel(); this.buildShortcuts(); this.renderCalendarBody(); this.syncInputs(); this.updateInfo(); this.updateButtonsVisibility();
    }

    // ── SHORTCUTS ────────────────────────────────────────────────────────────
    private granBarEl: HTMLElement|null = null;
    /** Shared between inline-vertical and inline-horizontal (popup has its own, separate
     * implementation in dialog.ts, since that runs as an isolated bundle). `vertical=true`
     * stacks the controls top-to-bottom for the horizontal layout's side column, where there's
     * no room for a full-width row. */
    private buildAutoGranRow(vertical:boolean):HTMLElement|null{
        const go=this.fmtSettings?.granularityOptions;
        if(!(go?go.showAutoGranToggle.value:true)) return null;
        const t=this.t();
        const row=this.e("div", vertical?"dp-autogran-row dp-autogran-vertical":"dp-autogran-row");

        const toggleWrap=this.e("div","dp-autogran-toggle");
        const btnAuto=this.e("button","dp-autogran-btn") as HTMLButtonElement;
        const btnManual=this.e("button","dp-autogran-btn") as HTMLButtonElement;
        // Short labels everywhere now (not just the vertical/side-column variant) — the
        // long "Automatic"/"Manual" words rarely earned their width; full word still
        // shows on hover via title.
        btnAuto.textContent=t.autoLabelShort;
        btnManual.textContent=t.manualLabelShort;
        btnAuto.title=t.autoLabel; btnManual.title=t.manualLabel;
        const refreshBtns=()=>{
            btnAuto.classList.toggle("active",this.granAutoRuntime);
            btnManual.classList.toggle("active",!this.granAutoRuntime);
        };
        btnAuto.addEventListener("click",()=>{
            if(!this.granAutoRuntime){
                this.granAutoRuntime=true; this.granAutoTouchedByViewer=true; refreshBtns(); this.updateGranPreviewInline();
                if(this.applyImmediate) this.applyFilter();
            }
        });
        btnManual.addEventListener("click",()=>{
            if(this.granAutoRuntime){
                this.granAutoRuntime=false; this.granAutoTouchedByViewer=true;
                this.manualGranOverride=(this.granSelected??this.gran) as Gran; // always = whatever's selected at top at this exact moment
                this.manualGranSelectInline.value=this.manualGranOverride;
                refreshBtns(); this.updateGranPreviewInline();
                if(this.applyImmediate) this.applyFilter();
            }
        });
        toggleWrap.append(btnAuto,btnManual);

        const infoIcon=this.e("span","dp-autogran-info");
        infoIcon.textContent="ⓘ";
        infoIcon.title=t.autoTooltip;

        this.manualGranSelectInline=document.createElement("select");
        this.manualGranSelectInline.className="dp-autogran-select";
        this.granOptions.forEach(g=>{
            const o=document.createElement("option");
            o.value=g; o.textContent=t.granLabels[g as Gran]||g;
            this.manualGranSelectInline.append(o);
        });
        this.manualGranSelectInline.addEventListener("change",()=>{
            this.manualGranOverride=this.manualGranSelectInline.value as Gran;
            this.updateGranPreviewInline();
            if(this.applyImmediate) this.applyFilter();
        });

        this.effectiveGranLblInline=this.e("span","dp-autogran-effective");

        const infoAppliedRow=this.e("div","dp-autogran-info-row");
        infoAppliedRow.append(infoIcon,this.effectiveGranLblInline);
        row.append(toggleWrap,this.manualGranSelectInline,infoAppliedRow);
        this.autoGranRowInline=row;
        refreshBtns();
        this.manualGranSelectInline.value=this.manualGranOverride??((this.granSelected??this.gran) as Gran);
        // The "Applied: X" label only re-measures when updateGranPreviewInline() is
        // explicitly called (gran/mode change, toggle click, dropdown change) — none of
        // which fire on a plain resize (widget resize, or dragging a neighbouring zone
        // that shrinks this row). Without this, the label can go stale at its last-computed
        // width and then genuinely clip mid-word rather than switching to the single letter.
        this.autoGranResizeObserver?.disconnect();
        this.autoGranResizeObserver=new ResizeObserver(()=>this.updateGranPreviewInline());
        this.autoGranResizeObserver.observe(row);
        return row;
    }

    private updateGranPreviewInline(){
        if(!this.autoGranRowInline||!this.effectiveGranLblInline) return;
        const t=this.t();
        this.manualGranSelectInline.style.display=this.granAutoRuntime?"none":"";
        const literalGran=(this.granSelected??this.gran) as Gran;
        let effective:Gran;
        if(this.granAutoRuntime){
            const go=this.fmtSettings?.granularityOptions;
            if(go && this.draftRangeS && this.draftRangeE){
                const visible:Record<Gran,boolean>={D:go.granD.value,W:go.granW.value,M:go.granM.value,Q:go.granQ.value,S:go.granS.value,Y:go.granY.value};
                const threshold={W:go.granWThreshold.value,M:go.granMThreshold.value,Q:go.granQThreshold.value,S:go.granSThreshold.value,Y:go.granYThreshold.value};
                effective=resolveEffectiveGran(literalGran,this.draftRangeS,this.draftRangeE,visible,threshold);
            } else {
                effective=literalGran;
            }
        } else {
            effective=this.manualGranOverride??literalGran;
        }
        // Always the single letter now — the adaptive "full word, fall back to letter if
        // it doesn't fit" version kept losing the race against live resizes in practice,
        // and the letter is what's needed for space either way, so there's no reason to
        // ever show the full word here at all.
        this.effectiveGranLblInline.textContent=`${t.effectiveLabel}: ${effective}`;
    }

    private buildGranBar(vertical:boolean=false):HTMLElement|null{
        if(this.granMode!=="column"||this.granOptions.length<2) return null;
        const bar=this.e("div", vertical?"dp-gran-bar dp-gran-bar-vertical":"dp-gran-bar");
        this.granOptions.forEach(opt=>{
            const btn=this.e("button","dp-gran-btn") as HTMLButtonElement;
            if(opt===this.granSelected) btn.classList.add("active");
            const badge=this.e("span","dp-gran-badge"); badge.textContent=this.granLabel(opt as Gran);
            btn.append(badge);
            btn.addEventListener("click",()=>this.selectGran(opt));
            bar.append(btn);
        });
        this.granBarEl=bar;
        return bar;
    }
    private refreshGranBar(){
        if(!this.granBarEl) return;
        Array.from(this.granBarEl.children).forEach((el,i)=>{
            el.classList.toggle("active", this.granOptions[i]===this.granSelected);
        });
    }
    // The gran bar's badges are only ever built once (buildGranBar(), at UI construction
    // time), same as refreshGranBar() above — so editing a letter's custom text in the
    // "Granularidades Visíveis" card (or changing the report language) never touched the
    // already-built DOM and the old label just stuck around forever. Called on every
    // update(), unconditionally, since label text can change independent of granChanged.
    private refreshGranLabels(){
        if(!this.granBarEl) return;
        Array.from(this.granBarEl.children).forEach((el,i)=>{
            const opt=this.granOptions[i];
            if(!opt) return;
            const badge=el.querySelector(".dp-gran-badge");
            if(badge) badge.textContent=this.granLabel(opt as Gran);
        });
    }

    private buildShortcuts(){
        if(!this.shortcutsEl) return;
        this.shortcutsEl.replaceChildren();
        this.shortcutsEl.classList.remove("dp-empty-collapsed");
        if(this.scVisible["scShowAll"]===false){
            this.shortcutsEl.classList.add("dp-empty-collapsed");
            return;
        }
        const t=this.t(); let prev=false;
        let firstDivider=true;
        SHORTCUTS.forEach(s=>{
            // Layer 1: granularity rule (e.g. "today" hidden in monthly)
            if(!s.visibleFor.includes(this.gran)) return;
            // Layer 2: user visibility toggle (defaults to true if not set)
            if(this.scVisible[s.settingKey]===false) return;
            // Divider before the "week" group and before the "this*" group
            if(prev&&firstDivider&&(s.id==="thisWeek"||s.id==="thisMonth")){ this.shortcutsEl.append(this.e("div","dp-pop-div")); firstDivider=false; }
            const el=this.e("div","dp-pop-sc");
            if(s.id===this.draftActiveSC) el.classList.add("active");
            el.textContent=(t as any)[s.labelKey];
            el.setAttribute("tabindex","0");
            el.setAttribute("role","button");
            el.addEventListener("click",()=>this.doSC(s.id));
            el.addEventListener("keydown",(ev:KeyboardEvent)=>{
                if(ev.key==="Enter"||ev.key===" "){ ev.preventDefault(); this.doSC(s.id); }
            });
            this.shortcutsEl.append(el); prev=true;
        });
        // "Últimos N" — respect its visibility toggle too
        const dynVisible=this.scVisible["scDynamic"]!==false;
        if(!dynVisible){
            this.shortcutsEl.classList.toggle("dp-empty-collapsed", this.shortcutsEl.children.length===0);
            return;
        }
        // "Últimos N" now looks and sits like just one more line in the same list (see
        // dp-pop-dyn's shared .dp-pop-sc styling) — no divider before it either, so the
        // gap above it matches the gap between any other two shortcuts exactly.
        const dyn=this.e("div","dp-pop-sc dp-pop-dyn");
        if(this.draftActiveSC==="dynamic") dyn.classList.add("active");
        dyn.style.cursor="pointer";
        dyn.addEventListener("click",(ev)=>{if((ev.target as HTMLElement)!==this.dynInput) recalc();});
        const dl=this.e("span","dp-pop-dynlbl"); dl.textContent=t.lastN;
        const numBox=this.e("div","dp-pop-dynbox");
        this.dynInput=document.createElement("input");
        this.dynInput.className="dp-pop-dynin"; this.dynInput.type="number";
        this.dynInput.min="1"; this.dynInput.max="999"; this.dynInput.value=String(this.draftDynN);
        const recalc=()=>{
            const n=Math.max(1,+this.dynInput.value||1);
            this.draftDynN=n;
            const today=new Date(this.refDate); today.setHours(0,0,0,0);
            const r=calRange(today,n,this.gran);
            this.draftActiveSC="dynamic"; this.draftRangeS=r.s; this.draftRangeE=r.e; this.picking=false; this.hov=null;
            this.calY=r.e.getFullYear(); this.calM=r.e.getMonth();
            this.syncSel(); this.renderCalendarBody(); this.syncInputs(); this.updateInfo();
            this.shortcutsEl.querySelectorAll(".dp-pop-sc").forEach(el=>el.classList.remove("active"));
            dyn.classList.add("active");
            // Same rule as every other shortcut (doSC): in Immediate mode (inline only), a
            // shortcut pick is a complete intent — apply now instead of waiting for a calendar
            // cell click or explicit Apply that may never come.
            if(this.applyImmediate && this.currentMode!=="popup"){
                this.confirmDraft();
            }
        };
        this.dynUnit=this.e("span","dp-pop-dynunit"); this.dynUnit.textContent=this.gran;
        this.dynInput.addEventListener("input",recalc);
        this.dynInput.addEventListener("change",recalc);
        this.dynInput.addEventListener("click",(ev)=>ev.stopPropagation());
        this.dynInput.addEventListener("wheel",(ev)=>{
            ev.preventDefault();
            const cur=Math.max(1,+this.dynInput.value||1);
            this.dynInput.value=String(Math.max(1,cur+(ev.deltaY<0?1:-1)));
            recalc();
        },{passive:false});
        numBox.append(this.dynInput);
        dyn.append(dl,numBox,this.dynUnit); this.shortcutsEl.append(dyn);
    }

    private doSC(id:string){
        const today=new Date(this.refDate); today.setHours(0,0,0,0);
        const r=id==="dynamic"?calRange(today,this.draftDynN,this.gran):shortcutRange(id,today);
        if(!r) return;
        this.draftActiveSC=id; this.draftRangeS=r.s; this.draftRangeE=r.e; this.picking=false; this.hov=null;
        this.calY=r.e.getFullYear(); this.calM=r.e.getMonth();
        this.syncSel(); this.renderCalendarBody(); this.syncInputs(); this.updateInfo(); this.buildShortcuts();
        // Immediate mode (inline only): a shortcut is a complete intent → apply now.
        // The popup always confirms via its own Apply button regardless.
        if(this.applyImmediate && this.currentMode!=="popup"){
            this.confirmDraft();
        }
    }

    // ── CALENDAR ─────────────────────────────────────────────────────────────
    private nav(d:number){
        let newM=this.calM+d, newY=this.calY;
        if(newM>11){newM=0;newY++;} if(newM<0){newM=11;newY--;}
        if(this.dataMaxDate){
            const my=this.dataMaxDate.getFullYear(), mm=this.dataMaxDate.getMonth();
            if(newY>my||(newY===my&&newM>mm)) return;
        }
        if(this.dataMinDate){
            const my=this.dataMinDate.getFullYear(), mm=this.dataMinDate.getMonth();
            if(newY<my||(newY===my&&newM<mm)) return;
        }
        this.calM=newM; this.calY=newY;
        this.syncSel(); this.renderCalendarBody();
    }
    private syncSel(){
        if(this.mSel) this.mSel.value=String(this.calM);
        if(this.ySel) this.ySel.value=String(this.calY);
        if(this.yearRangeLbl){
            if(this.gran==="Y") this.yearRangeLbl.textContent=`${this.calY-this.yWindowYears()+1} – ${this.calY}`;
            else if(this.gran==="Q") this.yearRangeLbl.textContent=`${this.calY-this.qWindowYears()+1} – ${this.calY}`;
            else if(this.gran==="S") this.yearRangeLbl.textContent=`${this.calY-this.sWindowYears()+1} – ${this.calY}`;
        }
    }

    private renderDays(){
        if(!this.calDaysEl) return;
        this.calDaysEl.replaceChildren();
        const today=new Date(this.refDate); today.setHours(0,0,0,0);
        const first=new Date(this.calY,this.calM,1);
        let off=first.getDay()-1; if(off<0) off=6;
        const dim=new Date(this.calY,this.calM+1,0).getDate();
        const rs=this.draftRangeS?dMs(this.draftRangeS):null;
        const re=this.draftRangeE?dMs(this.draftRangeE):null;
        const hm=this.picking&&this.hov?dMs(this.hov):null;
        const effS=(rs!==null&&hm!==null)?Math.min(rs,hm):rs;
        const effE=(rs!==null&&hm!==null)?Math.max(rs,hm):(hm!==null?hm:re);
        const outOfData=(d:Date)=>!!((this.dataMaxDate&&d.getTime()>dMs(this.dataMaxDate))||(this.dataMinDate&&d.getTime()<dMs(this.dataMinDate)));

        for(let row=0;row<6;row++){
            const mondayOfRow=new Date(this.calY,this.calM,1+row*7-off);
            const wn=isoWeekNumber(mondayOfRow);
            const wnCell=this.e("div","dp-pop-wn"); wnCell.textContent=String(wn);
            this.calDaysEl.append(wnCell);
            for(let col=0;col<7;col++){
                const i=row*7+col;
                const cell=this.e("div","dp-pop-day");
                const dn=i-off+1;
                if(dn<1||dn>dim){cell.classList.add("empty");this.calDaysEl.append(cell);continue;}
                const cd=new Date(this.calY,this.calM,dn); const cms=cd.getTime();
                cell.textContent=String(dn); cell.dataset.ms=String(cms);
                if(same(cd,today)) cell.classList.add("today");
                if(cms>dMs(today)) cell.classList.add("future");
                if(outOfData(cd)) cell.classList.add("disabled");
                if(effS!==null&&effE!==null){
                    if(cms===effS) cell.classList.add("rs");
                    if(cms===effE) cell.classList.add("re");
                    if(cms>effS&&cms<effE) cell.classList.add("in-range");
                } else if(rs!==null&&cms===rs){cell.classList.add("rs","re");}
                if(!outOfData(cd)){
                    cell.addEventListener("click",(ev)=>{
                        ev.stopPropagation();
                        if(!this.picking){this.draftRangeS=cd;this.draftRangeE=null;this.picking=true;this.hov=null;this.draftActiveSC="manual";}
                        else{if(dMs(cd)<dMs(this.draftRangeS!)){this.draftRangeE=this.draftRangeS;this.draftRangeS=cd;}else{this.draftRangeE=cd;}this.picking=false;this.hov=null;this.draftActiveSC="manual";}
                        this.renderDays();this.syncInputs();this.updateInfo();this.buildShortcuts();
                        this.maybeAutoApply();
                    });
                    cell.setAttribute("tabindex","0");
                    cell.setAttribute("role","button");
                    cell.setAttribute("aria-label",String(dn));
                    cell.addEventListener("keydown",(ev:KeyboardEvent)=>{
                        if(ev.key==="Enter"||ev.key===" "){ ev.preventDefault(); cell.click(); }
                    });
                } else {
                    cell.setAttribute("tabindex","-1");
                    cell.setAttribute("aria-disabled","true");
                    const outMsg=this.lang==="PT"?"Fora do intervalo de dados disponível":"Outside the available data range";
                    cell.addEventListener("mouseover",(ev:MouseEvent)=>{
                        if(this.host.hostCapabilities.allowInteractions===false) return;
                        this.host.tooltipService.show({dataItems:[{displayName:String(dn),value:outMsg}],identities:[],coordinates:[ev.clientX,ev.clientY],isTouchEvent:false});
                    });
                    cell.addEventListener("mousemove",(ev:MouseEvent)=>{
                        if(this.host.hostCapabilities.allowInteractions===false) return;
                        this.host.tooltipService.move({dataItems:[{displayName:String(dn),value:outMsg}],identities:[],coordinates:[ev.clientX,ev.clientY],isTouchEvent:false});
                    });
                    cell.addEventListener("mouseleave",()=>{ this.host.tooltipService.hide({isTouchEvent:false,immediately:true}); });
                }
                this.calDaysEl.append(cell);
            }
        }
        this.calDaysEl.onmouseover=(ev)=>{
            if(!this.picking) return;
            const tg=ev.target as HTMLElement; if(!tg.dataset?.ms) return;
            const ms=+tg.dataset.ms;
            if(this.hov&&dMs(this.hov)===ms) return;
            this.hov=new Date(ms); this.renderDays();
        };
        this.calDaysEl.onmouseleave=()=>{if(!this.picking) return; this.hov=null; this.renderDays();};
    }

    // ── INPUTS ───────────────────────────────────────────────────────────────
    private syncInputs(){
        if(!this.inS||!this.inE) return;
        this.inS.value=this.draftRangeS?fmt(this.draftRangeS):"";
        this.inE.value=this.draftRangeE?fmt(this.draftRangeE):"";
        this.lastSyncedS=this.inS.value; this.lastSyncedE=this.inE.value;
        this.inS.classList.remove("err"); this.inE.classList.remove("err");
        this.updateStepIndicators();
    }
    private updateStepIndicators(){
        if(!this.inputWrapStart||!this.inputWrapEnd) return;
        this.inputWrapStart.classList.toggle("dp-step-current",!this.draftRangeS||(!this.picking&&!this.draftRangeE));
        this.inputWrapEnd.classList.toggle("dp-step-current",this.picking||(!!this.draftRangeS&&!this.draftRangeE));
        this.inputWrapStart.classList.toggle("dp-step-done",!!this.draftRangeS&&!this.inputWrapStart.classList.contains("dp-step-current"));
        this.inputWrapEnd.classList.toggle("dp-step-done",!!this.draftRangeE&&!this.inputWrapEnd.classList.contains("dp-step-current"));
    }
    private setEditingField(which:"start"|"end"){
        const d=which==="start"?this.draftRangeS:this.draftRangeE;
        if(d){this.calY=d.getFullYear();this.calM=d.getMonth();this.syncSel();this.renderCalendarBody();}
    }
    private flashInput(which:"start"|"end"){
        const el=which==="start"?this.inS:this.inE;
        el.classList.remove("dp-flash"); void el.offsetWidth; el.classList.add("dp-flash");
    }
    private confirmInput(which:"start"|"end"){
        const input=which==="start"?this.inS:this.inE;
        const parsed=parseDate(input.value);
        if(!parsed){if(input.value) input.classList.add("err"); return;}
        input.classList.remove("err");
        if(which==="start"){this.draftRangeS=parsed;if(this.draftRangeE&&dMs(this.draftRangeE)<dMs(parsed)) this.draftRangeE=null;}
        else{this.draftRangeE=parsed;if(this.draftRangeS&&dMs(this.draftRangeS)>dMs(parsed)) this.draftRangeS=null;}
        this.picking=false; this.hov=null; this.draftActiveSC="manual";
        this.calY=parsed.getFullYear(); this.calM=parsed.getMonth();
        this.syncSel(); this.renderCalendarBody(); this.updateInfo(); this.buildShortcuts();
        this.flashInput(which);
        if(which==="start"&&!this.draftRangeE) this.inE.value="";
        if(which==="end"&&!this.draftRangeS) this.inS.value="";
        this.maybeAutoApply();
        this.lastSyncedS=this.inS.value; this.lastSyncedE=this.inE.value;
    }

    private updateInfo(){
        if(!this.footerInfo) return;
        const t=this.t();
        this.footerInfo.replaceChildren();
        if(this.picking){
            const s=document.createElement("span"); s.textContent=`${fmt(this.draftRangeS!)} ${t.clickEnd}`;
            this.footerInfo.append(s);
            this.updateGranPreviewInline(); return;
        }
        if(!this.draftRangeS||!this.draftRangeE){ this.updateGranPreviewInline(); return; }
        const diff=Math.round((dMs(this.draftRangeE)-dMs(this.draftRangeS))/86400000)+1;
        if(this.currentMode==="inline-horizontal"){
            const daysSpan=document.createElement("span"); daysSpan.textContent=`${diff} ${t.days}`;
            this.footerInfo.append(daysSpan);
        } else {
            // Three separate pieces instead of one long string — .dp-pop-info is now
            // flex-wrap, so the browser can only ever break BETWEEN these (start date /
            // "→ end date" / day count), never mid-date. That's what was producing the
            // "01-10-" / "23" mid-number wrapping before: a single text node has no
            // logical break points of its own, so the browser just wrapped at whatever
            // character ran out of room.
            const startSpan=document.createElement("span"); startSpan.textContent=fmt(this.draftRangeS);
            const endSpan=document.createElement("span"); endSpan.textContent=`→ ${fmt(this.draftRangeE)}`;
            const daysSpan=document.createElement("span"); daysSpan.textContent=`(${diff} ${t.days})`;
            this.footerInfo.append(startSpan,endSpan,daysSpan);
        }
        this.updateGranPreviewInline();
    }

    // ── SUBMIT / APPLY ────────────────────────────────────────────────────────
    private submitFromInline(){this.confirmDraft();}
    private confirmDraft(){
        if(!this.draftRangeS) return;
        this.rangeS=this.draftRangeS; this.rangeE=this.draftRangeE||this.draftRangeS;
        this.activeSC=this.draftActiveSC; this.dynN=this.draftDynN;
        this.applyFilter(); this.updateClosedLabel();
    }
    private maybeAutoApply(){
        if(this.applyImmediate && this.currentMode!=="popup" && this.draftRangeS && this.draftRangeE) this.confirmDraft();
    }
    private cancelInlineDraft(){
        // Revert the draft to the currently-applied range without touching the filter.
        this.draftRangeS=this.rangeS; this.draftRangeE=this.rangeE;
        this.draftActiveSC=this.activeSC; this.draftDynN=this.dynN;
        this.picking=false; this.hov=null;
        const ref=this.draftRangeE||new Date(this.refDate);
        this.calY=ref.getFullYear(); this.calM=ref.getMonth();
        this.refreshCalendarUI();
    }
    private updateButtonsVisibility(){
        if(!this.footerBtnsRow) return; // popup: buttons are always shown, nothing to toggle
        this.footerBtnsRow.style.display=this.applyImmediate?"none":"";
    }
    // ── FILTER ────────────────────────────────────────────────────────────────
    // CONFIRMED BY TESTING (not assumption): a Power BI custom visual can only have
    // ONE self-filter that actually filters other visuals' data, and it is hardwired
    // to the exact object/property pair "general"/"filter" — already used by the date
    // range. Three different object/property combinations for a second filter
    // (generalGran/filter, general/filterGran, granFilter/filter) all persisted fine
    // as visual properties but never actually changed SELECTEDVALUE() in other
    // visuals. A Selection-API approach was also tried and didn't reach other
    // visuals either. The actual fix lives in applyFilter() below: DT_DATE_SLICER
    // carries one anchor-date column per granularity (Date_D/W/M/Q/S/Y) on the same
    // physical rows, so the one working filter is retargeted at Date_{gran} instead
    // of always Date_D — encoding both date range AND granularity in a single,
    // genuinely functional filter. Other measures detect the active granularity via
    // ISFILTERED(DT_DATE_SLICER[Date_X]), since only the directly-targeted column
    // reports as filtered even though all columns share the same restricted rows.

    // Called when the user clicks a granularity option in the selector (column mode only).
    // This ONLY changes which calendar shape is shown (day grid vs week/month/quarter/
    // semester/year grid) — it must never apply a filter by itself. Filters get sent when
    // the viewer actually picks something: a date/range, a shortcut, or (in Manual mode)
    // the override dropdown. Calling applyFilter() here used to re-run auto-downgrade
    // against whatever OLD range was still applied (picked for a different granularity
    // entirely), and the downgraded value would round-trip back and silently revert this
    // very click a moment later — removing the call removes the race, not just one
    // symptom of it.
    private selectGran(literal:string){
        if(literal===this.granSelected) return;
        this.granSelected=literal;
        const mapped=normalizeGran(literal);
        if(mapped) this.gran=mapped;
        this.granSelectedDiverged=true;
        // Same reset as a granChanged event: re-anchor to ref_date's year and rebuild
        // the calendar shape (day grid vs week/month/quarter/semester/year grid).
        const ref=new Date(this.refDate);
        this.calY=ref.getFullYear(); this.calM=ref.getMonth();
        if(this.calAreaEl) this.buildCalArea();
        this.buildShortcuts();
        this.refreshGranBar();
        this.updateGranPreviewInline();
    }

    private applyFilter(){
        if(!this.dateCat) return;
        const qn=this.dateCat.source.queryName||"";
        const dot=qn.indexOf(".");
        const tbl=dot>-1?qn.slice(0,dot):qn;
        const dateCol=dot>-1?qn.slice(dot+1):this.dateCat.source.displayName;
        // A granularity-only click (selectGran) can fire before the user has ever
        // picked a date range — rangeS/rangeE are still null at that point. Bailing
        // out here (as before) made applyFilter() a total no-op for that click: no
        // filter sent, no console.log, not even the debug panel, since all of that
        // sits below this line. Default to the full loaded data range instead, so
        // a bare granularity change still produces a real, functional filter.
        if(!this.rangeS){
            if(!this.dataMinDate||!this.dataMaxDate) return;
            this.rangeS=this.dataMinDate; this.rangeE=this.dataMaxDate;
        }
        const e=this.rangeE||this.rangeS;
        const s0=new Date(this.rangeS.getFullYear(),this.rangeS.getMonth(),this.rangeS.getDate(),0,0,0,0);
        const e0=new Date(e.getFullYear(),e.getMonth(),e.getDate(),23,59,59,999);

        const dateOnlyFilter:pbModels.IAdvancedFilter = {
            $schema:pbModels.AdvancedFilter.schemaUrl,
            target:{table:tbl,column:dateCol} as pbModels.IFilterColumnTarget,
            filterType:pbModels.FilterType.Advanced, logicalOperator:"And",
            conditions:[{operator:"GreaterThanOrEqual",value:s0 as any},{operator:"LessThanOrEqual",value:e0 as any}]
        };

        // applyJsonFilter's filter param accepts IFilter[], which Power BI combines
        // with AND, same as multiple cards in the Filters pane for one visual. This
        // sends two small, independent filters together: the date range (Advanced,
        // on the bound Date Column) plus a plain equality filter (Basic, "In", one
        // value) on the bound Granularity Column — which now comes from its own
        // separate dataViewMapping (re-testing whether that structure avoids the
        // report-composition error hit in an earlier attempt this project's
        // history — see KNOWN_LIMITATIONS.md). No cross-join risk either way: this
        // filter never needs correlated (date, gran) tuples, since granularity
        // doesn't vary within one selected date range.
        let filter: pbModels.IFilter | pbModels.IFilter[];
        if(this.granMode==="column" && this.granCat && this.granCat.source.queryName){
            const granQn=this.granCat.source.queryName||"";
            const granDot=granQn.indexOf(".");
            const granTbl=granDot>-1?granQn.slice(0,granDot):granQn;
            const granCol=granDot>-1?granQn.slice(granDot+1):this.granCat.source.displayName;
            const literalGran=(this.granSelected??this.gran) as Gran;
            const go=this.fmtSettings?.granularityOptions;
            let literal:Gran=literalGran;
            if(this.granAutoRuntime && go){
                const visible:Record<Gran,boolean>={D:go.granD.value,W:go.granW.value,M:go.granM.value,Q:go.granQ.value,S:go.granS.value,Y:go.granY.value};
                const threshold={W:go.granWThreshold.value,M:go.granMThreshold.value,Q:go.granQThreshold.value,S:go.granSThreshold.value,Y:go.granYThreshold.value};
                literal=resolveEffectiveGran(literalGran,s0,e0,visible,threshold);
            } else if(!this.granAutoRuntime && this.manualGranOverride){
                literal=this.manualGranOverride;
            }
            const granFilter:pbModels.IBasicFilter={
                $schema:pbModels.BasicFilter.schemaUrl,
                target:{table:granTbl,column:granCol} as pbModels.IFilterColumnTarget,
                filterType:pbModels.FilterType.Basic, operator:"In", values:[literal]
            };
            filter=[dateOnlyFilter, granFilter];
        } else {
            filter=dateOnlyFilter;
        }
        this.host.applyJsonFilter(filter,"general","filter",FilterAction.merge);
        this.granSelectedDiverged=false; // committed — normal gran-sync resumes on this fresh range

        // Persist the intent + the refDate used for this calculation.
        // Storing refUsed lets us distinguish a real day-change (refDate differs from
        // what's stored) from a mere page navigation (refDate matches) — so we only
        // recalculate when the day genuinely changed, never on every page switch.
        const refUsed = `${this.refDate.getFullYear()}-${this.refDate.getMonth()}-${this.refDate.getDate()}`;
        this.lastIntent={...this.lastIntent, activeSC:this.activeSC, dynN:this.dynN, gran:this.gran, refUsed};
        this.host.persistProperties({
            merge:[{ objectName:"general", selector:null, properties:{ state: JSON.stringify(this.lastIntent) } }]
        });
    }

    // ── PBI UPDATE ────────────────────────────────────────────────────────────
    public update(opts:VisualUpdateOptions):void{
        this.events.renderingStarted(opts);
        try{
            const dv=opts.dataViews?.[0];
            this.fmtSettings=this.fmtSvc.populateFormattingSettingsModel(VisualFormattingSettingsModel,dv);
            this.defaultType=(this.fmtSettings?.defaultPeriod?.defaultType?.value?.value as string)||"dynamic";
            this.applyImmediate=((this.fmtSettings?.displayMode?.applyMode?.value?.value as string)||"immediate")==="immediate";
            this.hoverExpandEnabled=this.fmtSettings?.displayMode?.hoverExpand.value??false;
            this.resizersLocked=this.fmtSettings?.displayMode?.lockResizers.value??false;
            const sc=this.fmtSettings?.shortcuts;
            if(sc){
                this.scVisible={
                    scShowAll:sc.scShowAll.value,
                    scToday:sc.scToday.value, scYesterday:sc.scYesterday.value, scThisWeek:sc.scThisWeek.value,
                    scLastWeek:sc.scLastWeek.value, scThisMonth:sc.scThisMonth.value, scLastMonth:sc.scLastMonth.value, scMtd:sc.scMtd.value,
                    scQtd:sc.scQtd.value, scYtd:sc.scYtd.value, scThisQuarter:sc.scThisQuarter.value, scLastQuarter:sc.scLastQuarter.value,
                    scThisSemester:sc.scThisSemester.value, scLastSemester:sc.scLastSemester.value, scThisYear:sc.scThisYear.value, scDynamic:sc.scDynamic.value
                };
            }
            // Which granularity buttons to show is a plain format-pane choice (like the
            // shortcut toggles above) — NOT derived from data. Deriving it from the data
            // was fragile: Power BI applies this visual's own self-filter to its own data
            // view too, so the granColumn's live values narrow to just the selected
            // literal the moment a granularity is picked, and any DAX-side workaround
            // risked destabilizing the wider report. Letting the report author simply
            // check which codes exist is simpler and can't break anything.
            const go=this.fmtSettings?.granularityOptions;
            if(!this.granAutoTouchedByViewer){
                this.granAutoRuntime = go?.autoGranularity.value ?? true;
            }
            const granVisible:Record<Gran,boolean> = go
                ? {D:go.granD.value,W:go.granW.value,M:go.granM.value,Q:go.granQ.value,S:go.granS.value,Y:go.granY.value}
                : {D:true,W:true,M:true,Q:true,S:true,Y:true};
            const rawMode=this.fmtSettings?.displayMode?.layoutMode?.value?.value as string|undefined;
            const newMode:"popup"|"inline-vertical"|"inline-horizontal"=
                (rawMode==="inline-vertical"||rawMode==="inline-horizontal")?rawMode:"popup";
            const modeChanged=newMode!==this.currentMode||!this.wrap.hasChildNodes();
            this.currentMode=newMode;
            if(!dv){ this.showLandingPage(); this.events.renderingFinished(opts); return; }
            if(this.landingShown){ this.landingShown=false; this.rebuildForMode(); }
            let granChanged=false;
            // Set when granChanged came from the auto-downgrade echo (picking a small range
            // resolves to a lower effective granularity) rather than an explicit top-bar click
            // — see the calY-anchoring branch below, which needs to tell these apart.
            let granChangedViaSync=false;
            this.granCat=null;
            // dateColumn and granColumn share a single dataViewMapping again — two
            // separate mappings crashed Power BI Desktop's own dataview resolution
            // engine (confirmed via a captured stack trace: TypeError inside
            // CompiledDataViewMappingsByRole.visitRole, a Power BI-side bug, not
            // something fixable from our capabilities.json). granColumn stays
            // genuinely optional within this one mapping — if left unbound, only
            // dateColumn's category comes back, no cross-join, no crash.
            if(dv.categorical?.categories){
                for(const cat of dv.categorical.categories){
                    if(cat.source.roles?.["dateColumn"]){
                        this.dateCat=cat;
                        // Extract the actual min/max dates present in the date table,
                        // to prevent selecting outside the available data range.
                        // PERFORMANCE: update() fires on nearly every interaction, but
                        // the underlying dataset itself changes rarely — so only re-scan
                        // when the row count actually changed, instead of on every call.
                        const vals=cat.values;
                        if(vals && vals.length && vals.length!==this.dataMinMaxScannedLen){
                            this.dataMinMaxScannedLen=vals.length;
                            let mn:number|null=null, mx:number|null=null;
                            for(const v of vals){
                                if(v==null) continue;
                                const t=(v instanceof Date?v:new Date(v as any)).getTime();
                                if(isNaN(t)) continue;
                                if(mn===null||t<mn) mn=t;
                                if(mx===null||t>mx) mx=t;
                            }
                            this.dataMinDate = mn!==null ? d0(new Date(mn)) : null;
                            this.dataMaxDate = mx!==null ? d0(new Date(mx)) : null;
                        }
                    }
                    // Only used to identify the column's table/name for building the
                    // gran filter target below — not to read/enumerate its values.
                    // Left null when unbound: the selector itself (granMode below)
                    // does NOT depend on this being set, only the real-filter-sending
                    // logic in applyFilter() does — that's the whole point of making
                    // this field optional without losing the UI feature.
                    if(cat.source.roles?.["granColumn"]) this.granCat=cat;
                }
            }
            // NOTE: an earlier "auto-heal" here cleared the filter whenever this
            // visual's own categorical read came back empty, on the theory that with
            // the old Tuple filter, empty-read could only mean a broken date+gran
            // combo. That's no longer true with the current date-range + gran-equality
            // AND filter (two independent, always-satisfiable conditions for any valid
            // in-range selection) — and the auto-heal was instead firing on ordinary
            // transient empty reads (query latency on a 20k+ row table), destroying a
            // perfectly valid filter and causing the granularity bar to flicker/vanish
            // until the next render. Removed rather than tuned, since the failure mode
            // it protected against no longer exists.
            if(dv.categorical?.values){
                for(const val of dv.categorical.values){
                    if(val.source.roles?.["langMeasure"]){
                        // A blank/null measure result (e.g. the measure evaluates to BLANK()
                        // under this page's filter context) must NOT silently fall back to a
                        // hardcoded "PT" — that was overriding the host-locale-based default
                        // (set in the constructor from host.locale) with Portuguese on any
                        // page/filter context where the measure happens to return nothing,
                        // which is exactly how the same visual/version ended up showing
                        // "Início/Fim" on one report page and "Start/End" on another: one
                        // page's filter context made the measure blank, the other didn't.
                        // When blank, leave this.lang exactly as it already was (host locale,
                        // or whatever a previous non-blank evaluation last set it to).
                        const rawVal=val.values[0];
                        if(rawVal!=null && String(rawVal).trim()!==""){
                            const raw=String(rawVal).trim().toUpperCase() as Lang;
                            if(["PT","EN"].includes(raw)) this.lang=raw;
                        }
                    }
                    if(val.source.roles?.["refDateMeasure"] && val.values[0]!=null){
                        const v=val.values[0];
                        let d:Date|null=null;
                        if(v instanceof Date){
                            // PBI delivers the Date already in the browser's local timezone.
                            d=new Date(v.getFullYear(), v.getMonth(), v.getDate());
                        } else if(typeof v==="number"){
                            const tmp=new Date(v);
                            if(!isNaN(tmp.getTime())) d=new Date(tmp.getFullYear(),tmp.getMonth(),tmp.getDate());
                        } else {
                            const str=String(v);
                            if(/Z$/.test(str) || /[+-]\d{2}:\d{2}$/.test(str)){
                                // String carries a timezone (e.g. "2026-05-29T23:00:00.000Z").
                                // PBI converted the model date (30-05 local midnight) to UTC.
                                // Parse it and read LOCAL components to recover the intended day.
                                const parsed=new Date(str);
                                if(!isNaN(parsed.getTime())) d=new Date(parsed.getFullYear(),parsed.getMonth(),parsed.getDate());
                            } else {
                                // No timezone marker — extract the literal calendar date.
                                const m=str.match(/(\d{4})-(\d{2})-(\d{2})/);
                                if(m){
                                    d=new Date(+m[1], +m[2]-1, +m[3]);
                                } else {
                                    const parsed=new Date(str);
                                    if(!isNaN(parsed.getTime())) d=new Date(parsed.getFullYear(),parsed.getMonth(),parsed.getDate());
                                }
                            }
                        }
                        if(d && !isNaN(d.getTime())){
                            this.refDate=d;
                        }
                    }
                }
            }
            // ── GRANULARITY OPTIONS ──────────────────────────────────────────
            // Purely a format-pane choice (granVisible, above) — never derived from data.
            this.granOptions = (["D","W","M","Q","S","Y"] as Gran[]).filter(g=>granVisible[g]);
            // The gran bar's buttons are only ever built once (buildGranBar(), at UI
            // construction time) — toggling a format-pane switch changes this.granOptions
            // without touching this.gran, so granChanged (below) never fires and the
            // rendered buttons silently went stale. Detect the option SET itself changing
            // and force the same full rebuild path modeChanged already uses.
            const granOptionsKey=this.granOptions.join(",");
            const granOptionsSetChanged=granOptionsKey!==this.lastGranOptionsKey;
            this.lastGranOptionsKey=granOptionsKey;
            // Same problem, same fix, for the Auto/Manual switch's own visibility: toggling it
            // doesn't touch this.gran or this.granOptions either, so nothing else here would
            // have caught it and the inline UI (built once, not on every update()) would have
            // silently kept showing/hiding the row based on stale state.
            const showAutoGranToggleNow = go?go.showAutoGranToggle.value:true;
            const showAutoGranToggleChanged = showAutoGranToggleNow!==this.lastShowAutoGranToggle;
            this.lastShowAutoGranToggle = showAutoGranToggleNow;
            // Same problem again: toggling "Mostrar apenas ao passar o rato" changes
            // this.hoverExpandEnabled (read further down) without touching this.gran or
            // this.granOptions either — the inline UI's hover wiring is only set up once,
            // at build time, so without this the toggle would silently do nothing until
            // some other change happened to force a rebuild.
            const hoverExpandNow = this.fmtSettings?.displayMode?.hoverExpand.value??false;
            const hoverExpandChanged = hoverExpandNow!==this.lastHoverExpand;
            this.lastHoverExpand = hoverExpandNow;
            const lockResizersNow = this.fmtSettings?.displayMode?.lockResizers.value??false;
            const lockResizersChanged = lockResizersNow!==this.lastLockResizers;
            this.lastLockResizers = lockResizersNow;
            // The granularity selector is a self-contained UI feature (it reshapes the
            // calendar itself — day grid vs week rows vs month/quarter/semester/year
            // tiles) and no longer depends on any bound data column. "column" mode is
            // just "the selector is available"; whether it ALSO writes a real filter to
            // a parameter table is a separate, optional setting (granularityFilter),
            // checked in applyFilter() — decoupled so the calendar-shape feature works
            // even for report authors who don't want/need the extra filter table.
            this.granMode = this.granOptions.length ? "column" : "fixed";
            if(this.granMode==="fixed" && this.gran!=="D"){ this.gran="D"; granChanged=true; }
            // Read the reference date for DISPLAY purposes only.
            // CRITICAL: we never call applyFilter() as a result of refDate — doing so
            // rewrites the page's filter and breaks Power BI's native sync binding.

            // ── PASSIVE SYNC READ ────────────────────────────────────────────
            // opts.jsonFilters carries the filter(s) PBI has synced to this page.
            // We READ it to update our display, but NEVER write it back here —
            // writing inside update() is what breaks the sync binding.
            // Since applyFilter() now sends TWO separate filters together (an
            // Advanced date-range filter and a Basic gran-equality filter, combined
            // by Power BI with AND), jsonFilters is an array containing BOTH — not
            // one combined shape at index 0 like the old Tuple-filter version.
            const syncedFilters:any[] = Array.isArray(opts.jsonFilters) ? opts.jsonFilters
                : (opts.jsonFilters ? [opts.jsonFilters] : []);
            const stateStr = dv.metadata?.objects?.["general"]?.["state"] as string|undefined;

            // Restore the intent (activeSC + dynN + sizes) from persisted state
            if(stateStr){
                try{
                    const intent = JSON.parse(stateStr) as {activeSC:string|null; dynN:number; sizes?:Record<string,number>};
                    this.activeSC = intent.activeSC;
                    this.dynN = intent.dynN || 12;
                    this.lastIntent = intent as Record<string,unknown>;
                    // Only ever seed paneSizes from disk ONCE — after that, this.paneSizes
                    // (kept current by every resize's onResize callback) is the source of
                    // truth; re-reading it from a since-stale stateStr on a later update()
                    // would silently undo a resize the user just made this session.
                    if(!this.paneSizesLoaded){
                        if(intent.sizes && typeof intent.sizes==="object") this.paneSizes={...intent.sizes};
                        this.paneSizesLoaded=true;
                    }
                }catch(_){}
            }

            // Extracting gran from the synced filter itself (rather than only from
            // general/state) is what makes granularity sync between pages: general/state
            // is a plain visual property that only ever gets written on the page the
            // user directly interacted with, so every OTHER synced page stayed stuck
            // showing its own stale local gran forever, even after the correct filter
            // had already arrived there.
            const readDateRange = (raw:any):{s:Date,e:Date}|null => {
                if(!raw) return null;
                try{
                    const f = typeof raw==="string" ? JSON.parse(raw) : raw;
                    if(f?.conditions?.length>=2){
                        const s=new Date(f.conditions[0].value);
                        const e=new Date(f.conditions[1].value);
                        if(!isNaN(s.getTime())&&!isNaN(e.getTime())) return {s,e};
                    }
                }catch(_){}
                return null;
            };
            const readGranEquality = (raw:any):string|null => {
                if(!raw) return null;
                try{
                    const f = typeof raw==="string" ? JSON.parse(raw) : raw;
                    // Basic filter: values is a flat array of primitives (not tuples).
                    if(Array.isArray(f?.values) && f.values.length && !Array.isArray(f.values[0])){
                        const v=f.values[0];
                        if(v!=null) return String(v);
                    }
                }catch(_){}
                return null;
            };

            const oldRangeS=this.rangeS, oldRangeE=this.rangeE;
            let synced:{s:Date,e:Date,gran:string|null}|null = null;
            for(const raw of syncedFilters){
                const range=readDateRange(raw);
                const gran=range?null:readGranEquality(raw);
                if(range){ synced = {s:range.s, e:range.e, gran: synced?.gran ?? null}; }
                else if(gran!==null){ synced = synced ? {...synced, gran} : {s:this.rangeS||new Date(), e:this.rangeE||new Date(), gran}; }
            }
            // Fallback to metadata.objects only if jsonFilters was empty entirely
            // (e.g. very first load before anything round-trips).
            if(!synced){
                const metaFilter=dv.metadata?.objects?.["general"]?.["filter"];
                const range=readDateRange(metaFilter);
                if(range) synced={s:range.s,e:range.e,gran:null};
            }
            if(synced){
                this.rangeS = synced.s;
                this.rangeE = synced.e;
                if(!this.activeSC) this.activeSC = "manual";
            }

            if(this.granMode==="column"){
                const stateStr2=dv.metadata?.objects?.["general"]?.["state"] as string|undefined;
                let stateGran:string|null=null;
                if(stateStr2){
                    try{ const intent=JSON.parse(stateStr2); if(typeof intent?.gran==="string") stateGran=intent.gran; }catch(_){}
                }
                // While Manual mode has an active override, the applied filter's own granularity
                // (synced.gran, read back from opts.jsonFilters for cross-page sync) is DELIBERATELY
                // different from this.gran/calendar shape — that's the entire point of Manual mode.
                // Using it to "sync" the shape back here would just fight every click on the top
                // selector. The persisted intent (stateGran, written from this.gran itself) is the
                // right source of truth for the shape in that case.
                //
                // granSelectedDiverged (set by selectGran(), cleared by applyFilter()) covers the
                // other case: a top-bar click that only changed the shape, with nothing new applied
                // yet. Skipping the whole adoption block while that's true means the still-stale
                // applied filter can't revert a browse-only click no matter how many update() cycles
                // pass before the viewer actually commits something — at which point applyFilter()
                // clears the flag and normal syncing (including the desired auto-downgrade-on-a-
                // too-small-range behaviour, which never sets this flag in the first place) resumes.
                const manualOverrideActive = !this.granAutoRuntime && !!this.manualGranOverride;
                const syncedGran = (!manualOverrideActive && !this.granSelectedDiverged && synced?.gran && this.granOptions.includes(synced.gran)) ? synced.gran : null;
                const stored = this.granSelectedDiverged ? null : (syncedGran || ((stateGran && this.granOptions.includes(stateGran)) ? stateGran : null));
                let literal = stored;
                // Only fall back to a default when we've never established a value yet
                // (very first load). A momentarily-missing readback later on just means
                // the filter we applied hasn't round-tripped into metadata yet — NOT
                // that the user's pick should be discarded.
                if(!literal && this.granSelected===null){
                    literal = this.granOptions.find(o=>normalizeGran(o)==="D") || this.granOptions[0];
                }
                if(literal && literal!==this.granSelected){
                    this.granSelected=literal;
                    const mapped=normalizeGran(literal);
                    if(mapped && mapped!==this.gran){ this.gran=mapped; granChanged=true; granChangedViaSync=(literal===syncedGran); }
                }
            } else {
                this.granSelected=null;
            }
            // CRITICAL: never call applyFilter() here just because granMode/granSelected
            // was resolved above. Doing so on a passive render (e.g. a fresh page's first
            // update, before rangeS/rangeE are even known) would write a filter with
            // wrong/default bounds *before* we get a chance to read the real synced
            // range — exactly the trap this rule always existed to avoid. applyFilter()
            // must only ever be called from actual user interaction (date pick or
            // granularity click), never from update().

            // A page's calendar draft can be "clean" (mirrors the last applied range) or
            // "dirty" (the user is mid-edit / has an unconfirmed selection). We only want
            // to pull in an externally-synced range (e.g. from another page with a
            // different layout mode) when the draft is clean — otherwise we'd blow away
            // whatever the user is doing right now.
            const sameOrNull=(a:Date|null,b:Date|null):boolean=>{
                if(a===null&&b===null) return true;
                if(!a||!b) return false;
                return same(a,b);
            };
            const draftWasClean = !this.picking && sameOrNull(this.draftRangeS,oldRangeS) && sameOrNull(this.draftRangeE,oldRangeE);
            const syncDraftToApplied=()=>{
                this.draftRangeS=this.rangeS; this.draftRangeE=this.rangeE;
                this.draftActiveSC=this.activeSC; this.draftDynN=this.dynN;
                this.refreshCalendarUI();
            };

            if(modeChanged || ((granOptionsSetChanged||showAutoGranToggleChanged||hoverExpandChanged||lockResizersChanged) && this.currentMode!=="popup")){
                this.rebuildForMode();
            } else {
                this.applyColors(this.wrap);
                if(this.calContainer) this.applyColors(this.calContainer);
                this.refreshGranLabels();
                // Granularity changed shape (e.g. D→M): rebuild the header+grid so it
                // switches between the day grid and the month/quarter/semester/year grid.
                const calAreaVisible=this.currentMode!=="popup";
                if(granChanged&&calAreaVisible&&this.calAreaEl){
                    // Re-anchor to ref_date's year on an explicit top-bar granularity click —
                    // but when the shape changed because auto-downgrade echoed back a lower
                    // effective granularity for the range the viewer just picked (e.g. picking
                    // S2 22 with too few points, landing on Q), anchor to THAT range instead:
                    // ref_date's year would show a Q window nowhere near the actual selection.
                    if(granChangedViaSync && this.rangeE){
                        this.calY=this.rangeE.getFullYear(); this.calM=this.rangeE.getMonth();
                    } else {
                        const ref=new Date(this.refDate);
                        this.calY=ref.getFullYear(); this.calM=ref.getMonth();
                    }
                    this.buildCalArea();
                }
                if(granChanged) this.refreshGranBar();
                if(this.currentMode==="popup"){
                    this.updateClosedLabel();
                } else {
                    if(this.dynUnit) this.dynUnit.textContent=this.gran;
                    if(draftWasClean) syncDraftToApplied();
                    else this.buildShortcuts();
                }
            }
            this.events.renderingFinished(opts);
        }catch(e){
            console.error("DatePicker:",e);
            this.events.renderingFailed(opts,String(e));
        }
    }

    private rebuildForMode(){
        if(this.currentMode!=="popup"){this.buildInlineMode();}
        else{this.buildClosedBar();this.applyColors(this.wrap);}
    }

    // Landing page: shown instead of a blank/broken-looking control before the
    // required "Date Column" field is bound. Plain text, no external resources.
    private landingShown=false;
    private showLandingPage(){
        if(this.landingShown && this.wrap?.isConnected) return;
        this.landingShown=true;
        this.wrap=this.e("div","qahs-dp-root qahs-dp-landing");
        const msg=this.e("div","qahs-dp-landing-msg");
        const t=this.t();
        msg.textContent=t.landingPage;
        this.wrap.append(msg);
        this.root.replaceChildren(this.wrap);
    }

    public getFormattingModel():powerbi.visuals.FormattingModel{
        // Conditional visibility: these settings only apply to specific layout modes, so
        // showing them regardless of the current mode would just be confusing — a "Popup
        // width" control sitting there while Inline Vertical is selected doesn't do
        // anything. Set right before building the model each time, since layoutMode can
        // change between calls.
        const dm=this.fmtSettings?.displayMode;
        if(dm){
            const mode=dm.layoutMode.value.value as string;
            dm.hoverExpand.visible=mode==="inline-vertical";
            const isPopup=mode==="popup";
            dm.popupWidth.visible=isPopup;
            dm.popupHeight.visible=isPopup;
            dm.popupHorizontalAnchor.visible=isPopup;
        }
        return this.fmtSvc.buildFormattingModel(this.fmtSettings);
    }

    public destroy():void{
        this.periodResizeObserver?.disconnect();
        this.periodResizeObserver=null;
        this.autoGranResizeObserver?.disconnect();
        this.autoGranResizeObserver=null;
    }
}
