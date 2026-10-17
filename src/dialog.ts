"use strict";
import powerbi from "powerbi-visuals-api";
import "./../style/dialog.less";
import DialogConstructorOptions = powerbi.extensibility.visual.DialogConstructorOptions;
import IDialogHost              = powerbi.extensibility.visual.IDialogHost;
import { attachResizer } from "./resize";
import {
    Gran, Lang, normalizeGran, I18N, SHORTCUTS,
    dMs, same, fmt, resolveEffectiveGran, calRange, shortcutRange, parseDate, isoWeekNumber
} from "./shared";

export interface DialogInitialState {
    gran: Gran;
    lang: Lang;
    rangeStart: string|null;
    rangeEnd:   string|null;
    activeShortcut: string|null;
    dynamicN: number;
    refDate?: string;  // ISO string of reference date from the model
    scVisible?: Record<string,boolean>; // per-shortcut visibility, mirrors the format pane
    dataMinDate?: string|null; // ISO string of the date table's min date
    dataMaxDate?: string|null; // ISO string of the date table's max date
    granMode?: "column"|"fixed";
    granOptions?: string[]; // distinct literal values from the physical granularity column
    granSelected?: string|null; // literal currently selected (column mode only)
    showAutoGranToggle?: boolean;
    applyImmediate?: boolean;
    granAutoDefault?: boolean;
    granVisible?: Record<Gran,boolean>;
    granThresholds?: Record<Exclude<Gran,"D">,number>;
    lockResizers?: boolean;
    // Pre-resolved D/W/M/Q/S/Y button labels (override from "Texto da Granularidade" if
    // set, else the language-appropriate default) — resolved by visual.ts once, via
    // granLabelsResolved(), so this bundle doesn't need its own copy of that logic.
    granLabelsText?: Record<Gran,string>;
    colors?: {
        bg: string; bgOpacity: number; hoverRevealOpacity: number; fontFamily: string;
        // Generic fallback only now (anything outside all 5 zones, e.g. Apply/Cancel) —
        // each zone's own selected/unselected/value colors (below) take over inside it.
        accent: string; title: string; value: string; accentText: string;
        borderColor: string; borderWidth: number;
        resizerColor: string; resizerThickness: number;
        // 5 fully independent zones (background, corner radius, box size, font size,
        // AND now their own selected/selected-text/unselected/value colors) — see
        // visual.ts's applyColors() for the full rationale; mirrored here since the
        // pop-up dialog is a separate DOM/CSS instance that never shares the inline
        // visual's own styling. Three zones (gran/dates/shortcuts) also carry a second,
        // independent "box" background — see visual.ts/visual.less for why.
        zoneGranColor: string; zoneGranOpacity: number; zoneGranRadius: number; zoneGranBoxSize: number; zoneGranFontSize: number;
        zoneGranBoxColor: string; zoneGranBoxOpacity: number;
        zoneGranSelectedColor: string; zoneGranSelectedTextColor: string; zoneGranUnselectedColor: string; zoneGranValueColor: string;
        zoneDatesColor: string; zoneDatesOpacity: number; zoneDatesRadius: number; zoneDatesBoxSize: number; zoneDatesFontSize: number;
        zoneDatesBoxColor: string; zoneDatesBoxOpacity: number;
        zoneDatesSelectedColor: string; zoneDatesSelectedTextColor: string; zoneDatesUnselectedColor: string; zoneDatesValueColor: string;
        zoneShortcutsColor: string; zoneShortcutsOpacity: number; zoneShortcutsRadius: number; zoneShortcutsBoxSize: number; zoneShortcutsFontSize: number;
        zoneShortcutsBoxColor: string; zoneShortcutsBoxOpacity: number;
        zoneShortcutsSelectedColor: string; zoneShortcutsSelectedTextColor: string; zoneShortcutsUnselectedColor: string; zoneShortcutsValueColor: string;
        zoneCalColor: string; zoneCalOpacity: number; zoneCalRadius: number; zoneCalBoxSize: number; zoneCalFontSize: number;
        zoneCalSelectedColor: string; zoneCalSelectedTextColor: string; zoneCalUnselectedColor: string; zoneCalValueColor: string;
        zoneControlColor: string; zoneControlOpacity: number; zoneControlRadius: number; zoneControlBoxSize: number; zoneControlFontSize: number;
        zoneControlSelectedColor: string; zoneControlSelectedTextColor: string; zoneControlUnselectedColor: string; zoneControlValueColor: string;
    };
}
export interface DialogResultState {
    rangeStart: string;
    rangeEnd:   string;
    cancelled:  boolean;
    activeSC?:  string|null;
    dynN?:      number;
    granSelected?: string|null;
    granAuto?: boolean;
    manualGran?: string|null;
}

export const DIALOG_ID = "qahsDatePicker2Dialog";

export class DatePickerDialog {
    private host:   IDialogHost;
    private gran:   Gran = "M";
    private lang:   Lang = "PT";
    private refDate: Date = new Date();
    private rangeS: Date|null = null;
    private rangeE: Date|null = null;
    private picking = false;
    private hov:    Date|null = null;
    private calY    = new Date().getFullYear();
    private calM    = new Date().getMonth();
    private dynN    = 3;
    private activeSC: string|null = null;
    private scVisible: Record<string,boolean> = {};
    private dataMinDate: Date|null = null;
    private dataMaxDate: Date|null = null;
    private pendingPeriodEnd: Date|null = null;
    private granMode: "column"|"fixed" = "fixed";
    private granOptions: string[] = [];
    private granSelected: string|null = null;
    private showAutoGranToggle = true;
    private applyImmediate = false;
    private granAuto = true;
    private manualGranOverride: Gran|null = null;
    private granVisibleMap: Record<Gran,boolean> = {D:true,W:true,M:true,Q:true,S:true,Y:true};
    private granLabelsText: Record<Gran,string> = {D:"D",W:"W",M:"M",Q:"Q",S:"S",Y:"Y"};
    private granThresholdsMap: Record<Exclude<Gran,"D">,number> = {W:2,M:2,Q:2,S:2,Y:2};
    private autoGranRow!: HTMLElement;
    private manualGranSelect!: HTMLSelectElement;
    private effectiveGranLbl!: HTMLElement;

    private shortcutsEl!: HTMLElement;
    private calAreaEl!:   HTMLElement;
    private calDaysEl!:   HTMLElement;
    // Root element of the "Datas Início/Fim" zone — mirrors visual.ts's datesWrapEl,
    // used to scope that zone's own selected/unselected/value colors to just this
    // subtree (plain CSS custom-property scoping, see the constructor's setZone below).
    private datesWrapEl: HTMLElement|null = null;
    private mSel!:        HTMLSelectElement;
    private ySel!:        HTMLSelectElement;
    private yearRangeLbl: HTMLElement|null = null;
    private inS!:         HTMLInputElement;
    private inE!:         HTMLInputElement;
    private lastSyncedS = "";
    private lastSyncedE = "";
    private inputWrapStart!: HTMLElement;
    private inputWrapEnd!:   HTMLElement;
    private footerInfo!:  HTMLElement;
    private dynInput!:    HTMLInputElement;
    private dynUnit!:     HTMLElement;

    // Same drag-to-resize handles as the inline modes. Popup-only quirk: each open is a
    // fresh dialog instance, so a chosen size only lasts for that one open — it does not
    // round-trip through the visual (openModalDialog's initial/result state doesn't carry it).
    private paneSizes: Record<string, number> = {};
    private resizersLocked = false;
    private weekdayResizeObserver: ResizeObserver|null = null;
    private autoGranResizeObserver: ResizeObserver|null = null;
    private addResizer(axis:"row"|"col", target:HTMLElement, sign:1|-1, key:string, min:number, max?:number, defaultPx?:number, revealScale?:number, revealPx?:number, alwaysFree?:boolean):HTMLElement{
        return attachResizer({
            axis, target, sign, min, max, defaultPx, revealScale, revealPx,
            locked: alwaysFree ? false : this.resizersLocked,
            initialPx: this.paneSizes[key],
            onResize:(px)=>{ if(px<0) delete this.paneSizes[key]; else this.paneSizes[key]=px; }
        });
    }

    constructor(options: DialogConstructorOptions, initialState: object) {
        this.host = options.host;
        const state = initialState as DialogInitialState;
        this.gran = state.gran || "M";
        this.lang = state.lang || "PT";
        this.dynN = state.dynamicN || 3;
        this.activeSC = state.activeShortcut || null;
        if(state.scVisible) this.scVisible=state.scVisible;
        if(state.dataMinDate){ const d=new Date(state.dataMinDate); if(!isNaN(d.getTime())) this.dataMinDate=d; }
        if(state.dataMaxDate){ const d=new Date(state.dataMaxDate); if(!isNaN(d.getTime())) this.dataMaxDate=d; }
        this.granMode=state.granMode||"fixed";
        this.granOptions=state.granOptions||[];
        this.granSelected=state.granSelected||null;
        this.showAutoGranToggle=state.showAutoGranToggle??true;
        this.applyImmediate=state.applyImmediate??false;
        this.granAuto=state.granAutoDefault??true;
        if(state.granVisible) this.granVisibleMap=state.granVisible;
        if(state.granLabelsText) this.granLabelsText=state.granLabelsText;
        if(state.granThresholds) this.granThresholdsMap=state.granThresholds;
        this.resizersLocked=state.lockResizers??false;
        if (state.refDate) { const d=new Date(state.refDate); if(!isNaN(d.getTime())) this.refDate=d; }
        if (state.rangeStart) { const d=new Date(state.rangeStart); if(!isNaN(d.getTime())) this.rangeS=d; }
        if (state.rangeEnd)   { const d=new Date(state.rangeEnd);   if(!isNaN(d.getTime())) this.rangeE=d; }
        if (this.rangeE) { this.calY=this.rangeE.getFullYear(); this.calM=this.rangeE.getMonth(); }
        else { this.calY=this.refDate.getFullYear(); this.calM=this.refDate.getMonth(); }
        this.build(options.element);
        if (state.colors) {
            const s = options.element.style;
            const col = state.colors;
            s.setProperty("--dp-bg",           `color-mix(in srgb, ${col.bg} ${100-Math.max(0,Math.min(100,col.bgOpacity??0))}%, transparent)`);
            s.setProperty("--dp-hover-reveal-bg", `color-mix(in srgb, ${col.bg} ${100-Math.max(0,Math.min(100,col.hoverRevealOpacity??0))}%, transparent)`);
            s.setProperty("--dp-font-family",  col.fontFamily||"Segoe UI");
            // Generic fallback for anything outside all 5 zone elements (e.g. the
            // Apply/Cancel buttons) — each zone below overrides these on its own root
            // element, which wins via normal CSS cascade (more specific element wins).
            s.setProperty("--dp-accent",       col.accent);
            s.setProperty("--dp-title",        col.title);
            s.setProperty("--dp-value",        col.value);
            s.setProperty("--dp-accent-text",  col.accentText);
            s.setProperty("--dp-border",       col.borderColor);
            s.setProperty("--dp-border-width", `${col.borderWidth}px`);
            s.setProperty("--dp-resizer-color",     col.resizerColor);
            s.setProperty("--dp-resizer-thickness", `${col.resizerThickness||1}px`);
            // 5 fully independent zones — background, corner radius, box size, font size,
            // and now their own selected/selected-text/unselected/value colors, each. The
            // 4 colors are set on the zone's OWN root element (zoneEl), not on the dialog
            // root, so they only cascade to that zone's own descendants — every selector
            // in dialog.less already just reads var(--dp-accent) etc. unchanged, no
            // renaming needed (same scoping trick as visual.ts's applyColors/setZone).
            // pt→px: 1pt = 4/3px, the standard CSS conversion factor. Three zones
            // (gran/dates/shortcuts) also carry a second, independent "box" background —
            // see visual.ts/visual.less for why.
            const zOp=(v:number|undefined,def:number)=>100-Math.max(0,Math.min(100,v??def));
            const setZone=(key:string, color:string, opacity:number|undefined, defOpacity:number, radius:number|undefined, defRadius:number, boxSize:number|undefined, defBoxSize:number, fontSize:number|undefined, defFontSize:number, zoneColors:{selected:string,selectedText:string,unselected:string,value:string}, zoneEl?:HTMLElement|null, box?:{color:string,opacity:number|undefined,defOpacity:number})=>{
                s.setProperty(`--dp-zone-${key}-bg`,      `color-mix(in srgb, ${color||"#16243f"} ${zOp(opacity,defOpacity)}%, transparent)`);
                s.setProperty(`--dp-zone-${key}-radius`,  `${radius??defRadius}px`);
                s.setProperty(`--dp-zone-${key}-boxsize`, `${boxSize??defBoxSize}px`);
                s.setProperty(`--dp-font-size-${key}`,    `${(fontSize||defFontSize)*4/3}px`);
                if(box) s.setProperty(`--dp-zone-${key}-box-bg`, `color-mix(in srgb, ${box.color||"#16243f"} ${zOp(box.opacity,box.defOpacity)}%, transparent)`);
                if(zoneEl){
                    zoneEl.style.setProperty("--dp-accent",      zoneColors.selected||"#2d6bc4");
                    zoneEl.style.setProperty("--dp-accent-text", zoneColors.selectedText||"#ffffff");
                    zoneEl.style.setProperty("--dp-title",       zoneColors.unselected||"#9ab0cc");
                    zoneEl.style.setProperty("--dp-value",       zoneColors.value||"#ffffff");
                }
            };
            setZone("gran",      col.zoneGranColor,      col.zoneGranOpacity,      0,   col.zoneGranRadius,      5, col.zoneGranBoxSize,      5,  col.zoneGranFontSize,      7,
                {selected:col.zoneGranSelectedColor, selectedText:col.zoneGranSelectedTextColor, unselected:col.zoneGranUnselectedColor, value:col.zoneGranValueColor}, this.granBarEl,
                {color:col.zoneGranBoxColor,      opacity:col.zoneGranBoxOpacity,      defOpacity:100});
            setZone("dates",     col.zoneDatesColor,     col.zoneDatesOpacity,     100, col.zoneDatesRadius,     5, col.zoneDatesBoxSize,     3,  col.zoneDatesFontSize,     9,
                {selected:col.zoneDatesSelectedColor, selectedText:col.zoneDatesSelectedTextColor, unselected:col.zoneDatesUnselectedColor, value:col.zoneDatesValueColor}, this.datesWrapEl,
                {color:col.zoneDatesBoxColor,     opacity:col.zoneDatesBoxOpacity,     defOpacity:40});
            setZone("shortcuts", col.zoneShortcutsColor, col.zoneShortcutsOpacity, 65,  col.zoneShortcutsRadius, 4, col.zoneShortcutsBoxSize, 8,  col.zoneShortcutsFontSize, 9,
                {selected:col.zoneShortcutsSelectedColor, selectedText:col.zoneShortcutsSelectedTextColor, unselected:col.zoneShortcutsUnselectedColor, value:col.zoneShortcutsValueColor}, this.shortcutsEl,
                {color:col.zoneShortcutsBoxColor, opacity:col.zoneShortcutsBoxOpacity, defOpacity:65});
            setZone("cal",       col.zoneCalColor,       col.zoneCalOpacity,       100, col.zoneCalRadius,       6, col.zoneCalBoxSize,       24, col.zoneCalFontSize,       9,
                {selected:col.zoneCalSelectedColor, selectedText:col.zoneCalSelectedTextColor, unselected:col.zoneCalUnselectedColor, value:col.zoneCalValueColor}, this.calAreaEl);
            setZone("control",   col.zoneControlColor,   col.zoneControlOpacity,   0,   col.zoneControlRadius,   5, col.zoneControlBoxSize,   5,  col.zoneControlFontSize,   9,
                {selected:col.zoneControlSelectedColor, selectedText:col.zoneControlSelectedTextColor, unselected:col.zoneControlUnselectedColor, value:col.zoneControlValueColor}, this.autoGranRow);
        }
    }

    private t(){return I18N[this.lang];}
    private e(tag:string,cls?:string):HTMLElement{const el=document.createElement(tag);if(cls)el.className=cls;return el;}

    private build(root: HTMLElement){
        root.replaceChildren();
        root.className="dp-dlg";

        const granBar=this.buildGranBar();
        if(granBar){
            root.append(granBar);
            root.append(this.addResizer("row",granBar,1,"pGranBar",10,110));
        }

        const body=this.e("div","dp-dlg-body");
        this.shortcutsEl=this.e("div","dp-dlg-shortcuts");
        const cal=this.e("div","dp-dlg-cal");

        const di=this.e("div","dp-dlg-inputs");
        const ws=this.e("div","dp-dlg-iw"); const ls=this.e("label"); ls.textContent=this.t().start;
        this.inS=document.createElement("input"); this.inS.type="text"; this.inS.placeholder="dd-mm-aa";
        this.inS.addEventListener("keydown",(ev)=>{ if(ev.key==="Enter"){ ev.preventDefault(); this.confirmInput("start"); this.inS.blur(); } });
        this.inS.addEventListener("blur",()=>{ if(this.inS.value !== this.lastSyncedS) this.confirmInput("start"); });
        this.inS.addEventListener("focus",()=>this.setEditingField("start"));
        ws.append(ls, this.inS);
        this.inputWrapStart = ws;

        const we=this.e("div","dp-dlg-iw"); const le=this.e("label"); le.textContent=this.t().end;
        this.inE=document.createElement("input"); this.inE.type="text"; this.inE.placeholder="dd-mm-aa";
        this.inE.addEventListener("keydown",(ev)=>{ if(ev.key==="Enter"){ ev.preventDefault(); this.confirmInput("end"); this.inE.blur(); } });
        this.inE.addEventListener("blur",()=>{ if(this.inE.value !== this.lastSyncedE) this.confirmInput("end"); });
        this.inE.addEventListener("focus",()=>this.setEditingField("end"));
        we.append(le, this.inE);
        this.inputWrapEnd = we;

        di.append(ws,we);
        this.datesWrapEl=di;
        // Start/End is now a full-width strip of its own — a root-level sibling of `body`,
        // not nested inside the calendar column — see visual.ts's identical change for why.
        root.append(di, this.addResizer("row",di,1,"pDateInputs",0,80,46,undefined,46));

        this.calAreaEl=this.e("div","dp-dlg-cal-area");
        cal.append(this.calAreaEl);
        body.append(this.shortcutsEl, this.addResizer("col",this.shortcutsEl,1,"pShortcuts",0,320,undefined,0.85,undefined,true), cal);

        if(this.showAutoGranToggle){
            const t=this.t();
            this.autoGranRow=this.e("div","dp-dlg-autogran-row");

            const toggleWrap=this.e("div","dp-dlg-autogran-toggle");
            const btnAuto=this.e("button","dp-dlg-autogran-btn") as HTMLButtonElement;
            const btnManual=this.e("button","dp-dlg-autogran-btn") as HTMLButtonElement;
            btnAuto.textContent=t.autoLabelShort;
            btnManual.textContent=t.manualLabelShort;
            btnAuto.title=t.autoLabel; btnManual.title=t.manualLabel;
            const refreshToggleBtns=()=>{
                btnAuto.classList.toggle("active",this.granAuto);
                btnManual.classList.toggle("active",!this.granAuto);
            };
            btnAuto.addEventListener("click",()=>{ if(!this.granAuto){ this.granAuto=true; refreshToggleBtns(); this.updateGranPreview(); } });
            btnManual.addEventListener("click",()=>{
                if(this.granAuto){
                    this.granAuto=false;
                    this.manualGranOverride=this.gran; // always = whatever's selected at top at this exact moment
                    this.manualGranSelect.value=this.gran;
                    refreshToggleBtns(); this.updateGranPreview();
                }
            });
            toggleWrap.append(btnAuto,btnManual);

            const infoIcon=this.e("span","dp-dlg-autogran-info");
            infoIcon.textContent="ⓘ";
            infoIcon.title=t.autoTooltip;

            this.manualGranSelect=document.createElement("select");
            this.manualGranSelect.className="dp-dlg-autogran-select";
            (["Y","S","Q","M","W","D"] as Gran[]).filter(g=>this.granVisibleMap[g]).forEach(g=>{
                const o=document.createElement("option");
                o.value=g; o.textContent=t.granLabels[g];
                this.manualGranSelect.append(o);
            });
            this.manualGranSelect.addEventListener("change",()=>{
                this.manualGranOverride=this.manualGranSelect.value as Gran;
                this.updateGranPreview();
                // A native dialog can only ever communicate a change back to the visual by
                // closing (setResult + close) — there's no "apply and stay open" API available
                // here. So in Immediate mode, changing the dropdown submits right away instead
                // of silently updating a value nothing will read until some other action (like
                // re-picking a date) happens to close the dialog too.
                if(this.applyImmediate) this.submit(true);
            });

            this.effectiveGranLbl=this.e("span","dp-dlg-autogran-effective");

            this.autoGranRow.append(toggleWrap,infoIcon,this.manualGranSelect,this.effectiveGranLbl);
            refreshToggleBtns();
            this.manualGranSelect.value=this.manualGranOverride??this.gran;
            this.updateGranPreview();
            // Same reasoning as visual.ts's autoGranResizeObserver: updateGranPreview() only
            // re-measures on explicit state changes (toggle click, dropdown change), not on
            // a plain resize (dragging a neighbouring zone shrinks this row too).
            this.autoGranResizeObserver?.disconnect();
            this.autoGranResizeObserver=new ResizeObserver(()=>this.updateGranPreview());
            this.autoGranResizeObserver.observe(this.autoGranRow);
        }

        const footer=this.e("div","dp-dlg-footer");
        this.footerInfo=this.e("span","dp-dlg-info");
        const footerBtns=this.e("div","dp-dlg-footer-btns");
        const btnCancel=this.e("button","dp-dlg-btn cancel") as HTMLButtonElement;
        const btnApply=this.e("button","dp-dlg-btn apply") as HTMLButtonElement;
        btnCancel.textContent=this.t().cancel;
        btnApply.textContent=this.t().apply;
        btnCancel.addEventListener("click",()=>this.submit(false));
        btnApply.addEventListener("click",()=>this.submit(true));
        footerBtns.append(btnCancel,btnApply);
        footer.append(this.footerInfo,footerBtns);

        root.append(body);
        if(this.showAutoGranToggle){
            root.append(this.addResizer("row",this.autoGranRow,-1,"pAutoRow",0,140));
            root.append(this.autoGranRow);
        }
        root.append(this.addResizer("row",footer,-1,"pFooter",18,200));
        root.append(footer);

        this.buildCalArea(); this.buildShortcuts(); this.syncInputs(); this.updateInfo();
    }

    private granBarEl: HTMLElement|null = null;
    private buildGranBar():HTMLElement|null{
        if(this.granMode!=="column"||this.granOptions.length<2) return null;
        const bar=this.e("div","dp-gran-bar");
        this.granOptions.forEach(opt=>{
            const btn=this.e("button","dp-gran-btn") as HTMLButtonElement;
            if(opt===this.granSelected) btn.classList.add("active");
            btn.textContent=this.granLabelsText[opt as Gran]??opt;
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

    // Picking a granularity inside the dialog only updates the local draft (calendar
    // shape switches immediately); the actual filter is applied by visual.ts once the
    // user hits Apply, via the granSelected field on the result state.
    private selectGran(literal:string){
        if(literal===this.granSelected) return;
        this.granSelected=literal;
        const mapped=normalizeGran(literal);
        if(mapped) this.gran=mapped;
        const ref=new Date(this.refDate);
        this.calY=ref.getFullYear(); this.calM=ref.getMonth();
        this.buildCalArea();
        this.buildShortcuts();
        this.refreshGranBar();
        this.updateGranPreview();
    }

    private buildShortcuts(){
        this.shortcutsEl.replaceChildren();
        this.shortcutsEl.classList.remove("dp-empty-collapsed");
        if(this.scVisible["scShowAll"]===false){
            this.shortcutsEl.classList.add("dp-empty-collapsed");
            return;
        }
        const t=this.t();
        let prev=false;
        let firstDivider=true;
        SHORTCUTS.forEach(s=>{
            if(!s.visibleFor.includes(this.gran))return;
            if(this.scVisible[s.settingKey]===false) return;
            if(prev&&firstDivider&&(s.id==="thisWeek"||s.id==="thisMonth")){this.shortcutsEl.append(this.e("div","dp-dlg-div"));firstDivider=false;}
            const el=this.e("div","dp-dlg-sc");
            if(s.id===this.activeSC)el.classList.add("active");
            el.textContent=(t as any)[s.labelKey];
            el.setAttribute("tabindex","0");
            el.setAttribute("role","button");
            el.addEventListener("click",()=>this.doSC(s.id));
            el.addEventListener("keydown",(ev:KeyboardEvent)=>{
                if(ev.key==="Enter"||ev.key===" "){ ev.preventDefault(); this.doSC(s.id); }
            });
            this.shortcutsEl.append(el); prev=true;
        });
        const dynVisible=this.scVisible["scDynamic"]!==false;
        if(!dynVisible){
            this.shortcutsEl.classList.toggle("dp-empty-collapsed", this.shortcutsEl.children.length===0);
            return;
        }
        const dyn=this.e("div","dp-dlg-sc dp-dlg-dyn");
        if(this.activeSC==="dynamic")dyn.classList.add("active");
        dyn.style.cursor="pointer";
        dyn.addEventListener("click",(ev)=>{if((ev.target as HTMLElement)!==this.dynInput) recalc();});
        const dl=this.e("span","dp-dlg-dynlbl"); dl.textContent=t.lastN;
        const numBox=this.e("div","dp-dlg-dynbox");
        this.dynInput=document.createElement("input");
        this.dynInput.className="dp-dlg-dynin"; this.dynInput.type="number";
        this.dynInput.min="1"; this.dynInput.max="999"; this.dynInput.value=String(this.dynN);
        const recalc=()=>{
            const n=Math.max(1,+this.dynInput.value||1);
            this.dynN=n;
            const today=new Date(this.refDate); today.setHours(0,0,0,0);
            const r=calRange(today,n,this.gran);
            this.activeSC="dynamic";
            this.rangeS=r.s; this.rangeE=r.e; this.picking=false; this.hov=null;
            this.calY=r.e.getFullYear(); this.calM=r.e.getMonth();
            this.syncSel(); this.renderCalendarBody(); this.syncInputs(); this.updateInfo();
            this.shortcutsEl.querySelectorAll(".dp-dlg-sc").forEach(el=>el.classList.remove("active"));
            dyn.classList.add("active");
        };
        this.dynUnit=this.e("span","dp-dlg-dynunit"); this.dynUnit.textContent=this.gran;
        this.dynInput.addEventListener("input",recalc);
        this.dynInput.addEventListener("change",recalc);
        this.dynInput.addEventListener("click",(ev)=>ev.stopPropagation());
        this.dynInput.addEventListener("wheel",(ev)=>{
            ev.preventDefault();
            const cur=Math.max(1,+this.dynInput.value||1);
            this.dynInput.value=String(Math.max(1, cur + (ev.deltaY<0?1:-1)));
            recalc();
        }, {passive:false});
        numBox.append(this.dynInput);
        dyn.append(dl,numBox,this.dynUnit); this.shortcutsEl.append(dyn);
    }

    private doSC(id:string){
        const today=new Date(this.refDate); today.setHours(0,0,0,0);
        const r=id==="dynamic"?calRange(today,this.dynN,this.gran):shortcutRange(id,today);
        if(!r)return;
        this.activeSC=id; this.setRange(r.s,r.e); this.buildShortcuts();
    }

    private setRange(s:Date,e:Date){
        this.rangeS=s;this.rangeE=e;this.picking=false;this.hov=null;
        this.calY=e.getFullYear();this.calM=e.getMonth();
        this.syncSel();this.renderCalendarBody();this.syncInputs();this.updateInfo();
    }

    // ── ADAPTIVE CALENDAR AREA (v2.0, mirrors visual.ts) ────────────────────────
    private static readonly Q_WINDOW_YEARS_FALLBACK=5;
    private static readonly S_WINDOW_YEARS_FALLBACK=10;
    private static readonly Y_WINDOW_YEARS_FALLBACK=12;
    private static readonly MAX_PERIOD_CELLS=54;
    private static readonly Q_MAX_ROWS=6;
    private static readonly S_MAX_ROWS=6;

    private dataYearSpan():number|null{
        if(!this.dataMinDate||!this.dataMaxDate) return null;
        return this.dataMaxDate.getFullYear()-this.dataMinDate.getFullYear()+1;
    }
    private qWindowYears():number{
        const span=this.dataYearSpan();
        const cap=Math.min(DatePickerDialog.Q_MAX_ROWS,Math.floor(DatePickerDialog.MAX_PERIOD_CELLS/4));
        return span!==null?Math.min(span,cap):Math.min(DatePickerDialog.Q_WINDOW_YEARS_FALLBACK,cap);
    }
    private sWindowYears():number{
        const span=this.dataYearSpan();
        const cap=Math.min(DatePickerDialog.S_MAX_ROWS*3,Math.floor(DatePickerDialog.MAX_PERIOD_CELLS/2));
        return span!==null?Math.min(span,cap):Math.min(DatePickerDialog.S_WINDOW_YEARS_FALLBACK,cap);
    }
    private yWindowYears():number{
        const span=this.dataYearSpan();
        return span!==null?Math.min(span,12):DatePickerDialog.Y_WINDOW_YEARS_FALLBACK;
    }
    private yearSelectBounds():{minY:number;maxY:number}{
        const cy=new Date().getFullYear();
        const minY=this.dataMinDate?this.dataMinDate.getFullYear():2018;
        const maxY=this.dataMaxDate?this.dataMaxDate.getFullYear():cy+2;
        return {minY,maxY};
    }
    private weeksInISOYear(year:number):number{
        const p=(y:number)=>(y+Math.floor(y/4)-Math.floor(y/100)+Math.floor(y/400))%7;
        return (p(year)===4||p(year-1)===3)?53:52;
    }
    private isoWeekStart(year:number,week:number):Date{
        const jan4=new Date(year,0,4);
        const dow=(jan4.getDay()+6)%7;
        const week1Monday=new Date(jan4); week1Monday.setDate(jan4.getDate()-dow);
        const result=new Date(week1Monday); result.setDate(week1Monday.getDate()+(week-1)*7);
        return result;
    }
    // calY means, for every granularity, the LAST (most recent) year of the window.
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

    private buildCalArea(){
        this.calAreaEl.replaceChildren();
        // Same reasoning as visual.ts's buildCalArea: lets the header (.dp-dlg-yrlabel /
        // .dp-dlg-my select) track whichever adaptive font-size reduction the grid cells
        // use for this granularity.
        this.calAreaEl.className="dp-dlg-cal-area dp-dlg-cal-area-"+this.gran.toLowerCase();
        this.weekdayResizeObserver?.disconnect();
        this.weekdayResizeObserver=null;
        const isDayGrid=this.gran==="D";
        const isSingleYear=this.gran==="M"||this.gran==="W";
        this.calY=this.clampCalY(this.calY);
        const ch=this.e("div","dp-dlg-calh");
        const bp=this.e("button","dp-dlg-nav") as HTMLButtonElement; bp.textContent="‹"; bp.addEventListener("click",()=>this.navCal(-1));
        const bn=this.e("button","dp-dlg-nav") as HTMLButtonElement; bn.textContent="›"; bn.addEventListener("click",()=>this.navCal(1));
        const my=this.e("div","dp-dlg-my");
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
            const lbl=this.e("span","dp-dlg-yrlabel");
            this.yearRangeLbl=lbl; my.append(lbl);
        }
        ch.append(bp,my,bn);

        const grid=this.e("div","dp-dlg-grid");
        if(isDayGrid){
            const wdRow=this.e("div","dp-dlg-wds");
            const wnH=this.e("div","dp-dlg-wd dp-dlg-wn-header"); wnH.textContent=this.lang==="PT"?"Sem":"Wk"; wdRow.append(wnH);
            this.t().wdays.forEach(w=>{const d=this.e("div","dp-dlg-wd");d.textContent=w;wdRow.append(d);});
            this.calDaysEl=this.e("div","dp-dlg-days");
            grid.append(wdRow,this.calDaysEl);
        } else {
            // Mirrors the day-grid structure exactly (single element, flex:1, display:grid,
            // direct child of .dp-dlg-grid) instead of the previous wrapper+innergrid
            // split — that split's CSS cascade proved unreliable in production (confirmed
            // via a canary style: the CSS loaded and applied, but computed height stayed
            // content-sized instead of stretching, for reasons not found after extensive
            // analysis). Reusing the exact pattern that's proven to work for D removes the
            // guesswork entirely.
            this.calDaysEl=this.e("div",`dp-dlg-period-grid dp-dlg-period-grid-${this.gran.toLowerCase()}`);
            grid.append(this.calDaysEl);
        }
        this.calAreaEl.append(ch,grid);
        if(isDayGrid){
            this.fitWeekdayHeaderToWidth(grid);
            this.weekdayResizeObserver=new ResizeObserver(()=>this.fitWeekdayHeaderToWidth(grid));
            this.weekdayResizeObserver.observe(grid);
        }
        this.syncSel();
        this.renderCalendarBody();
    }
    // Re-checked on every resize (dragging a neighbouring zone changes this grid's width
    // too), not just once at build time — see visual.ts's identical method for why.
    private static readonly MIN_PX_PER_WEEKDAY_COL=29;
    private fitWeekdayHeaderToWidth(gridEl:HTMLElement):void{
        if(this.gran!=="D") return;
        const t=this.t();
        const cells=gridEl.querySelectorAll<HTMLElement>(".dp-dlg-wd:not(.dp-dlg-wn-header)");
        if(cells.length===0) return;
        const useShort=gridEl.clientWidth>0 && gridEl.clientWidth<DatePickerDialog.MIN_PX_PER_WEEKDAY_COL*7.65;
        cells.forEach((c,i)=>{ c.textContent=(useShort?t.wdaysShort[i]:t.wdays[i])??t.wdays[i]; });
    }

    private navCal(d:number){
        if(this.gran==="D"){ this.nav(d); return; }
        let step=1;
        if(this.gran==="Y") step=this.yWindowYears();
        else if(this.gran==="Q") step=this.qWindowYears();
        else if(this.gran==="S") step=this.sWindowYears();
        this.calY=this.clampCalY(this.calY+d*step);
        this.syncSel(); this.renderCalendarBody();
    }

    private renderCalendarBody(){
        if(!this.calDaysEl) return;
        if(this.gran==="D") this.renderDays();
        else this.renderPeriodGrid(this.gran as "W"|"M"|"Q"|"S"|"Y");
    }

    private renderPeriodGrid(pgran:"W"|"M"|"Q"|"S"|"Y"){
        this.calDaysEl.replaceChildren();
        const today=new Date(this.refDate); today.setHours(0,0,0,0);
        const rs=this.rangeS?dMs(this.rangeS):null;
        const re=this.rangeE?dMs(this.rangeE):null;
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

        if(pgran==="Q") this.calDaysEl.style.gridTemplateRows=`repeat(${this.qWindowYears()},1fr)`;
        else if(pgran==="S") this.calDaysEl.style.gridTemplateRows=`repeat(${Math.ceil(this.sWindowYears()*2/6)},1fr)`;
        else if(pgran==="Y") this.calDaysEl.style.gridTemplateRows=`repeat(${Math.ceil(this.yWindowYears()/4)},1fr)`;
        else this.calDaysEl.style.gridTemplateRows="";

        cells.forEach(c=>{
            const cs=c.s.getTime(), ce=c.e.getTime();
            const cell=this.e("div","dp-dlg-period-cell");
            cell.textContent=c.label;
            const outOfData=(this.dataMaxDate&&c.s.getTime()>dMs(this.dataMaxDate))||(this.dataMinDate&&c.e.getTime()<dMs(this.dataMinDate));
            if(outOfData){ cell.classList.add("disabled"); cell.setAttribute("tabindex","-1"); cell.setAttribute("aria-disabled","true"); this.calDaysEl.append(cell); return; }
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
                    this.rangeS=c.s; this.rangeE=null; this.picking=true; this.hov=null; this.activeSC="manual";
                    this.pendingPeriodEnd=c.e;
                } else {
                    if(c.s.getTime()<this.rangeS!.getTime()){ this.rangeE=this.pendingPeriodEnd; this.rangeS=c.s; }
                    else { this.rangeE=c.e; }
                    this.picking=false; this.hov=null; this.activeSC="manual"; this.pendingPeriodEnd=null;
                }
                this.renderCalendarBody(); this.syncInputs(); this.updateInfo(); this.buildShortcuts();
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
            if(!this.picking||!this.rangeS) return;
            const tgt=ev.target as HTMLElement;
            const idx=Array.prototype.indexOf.call(this.calDaysEl.children,tgt);
            if(idx<0||!cells[idx]) return;
            const c=cells[idx];
            const preview=c.s.getTime()<this.rangeS.getTime()?c.s:c.e;
            if(this.hov&&dMs(this.hov)===dMs(preview)) return;
            this.hov=preview; this.renderCalendarBody();
        };
        this.calDaysEl.onmouseleave=()=>{ if(!this.picking) return; this.hov=null; this.renderCalendarBody(); };
    }

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
        this.calDaysEl.replaceChildren();
        const today=new Date(this.refDate); today.setHours(0,0,0,0);
        const first=new Date(this.calY,this.calM,1);
        let off=first.getDay()-1;if(off<0)off=6;
        const dim=new Date(this.calY,this.calM+1,0).getDate();
        const rs=this.rangeS?dMs(this.rangeS):null;
        const re=this.rangeE?dMs(this.rangeE):null;
        const hm=this.picking&&this.hov?dMs(this.hov):null;
        const effS=(rs!==null&&hm!==null)?Math.min(rs,hm):rs;
        const effE=(rs!==null&&hm!==null)?Math.max(rs,hm):(hm!==null?hm:re);
        const outOfData=(d:Date)=>!!((this.dataMaxDate&&d.getTime()>dMs(this.dataMaxDate))||(this.dataMinDate&&d.getTime()<dMs(this.dataMinDate)));

        for(let row=0; row<6; row++){
            const firstCellOffset = row*7 - off;
            const mondayOfRow = new Date(this.calY, this.calM, 1 + firstCellOffset);
            const wn = isoWeekNumber(mondayOfRow);
            const wnCell = this.e("div","dp-dlg-wn");
            wnCell.textContent = String(wn);
            this.calDaysEl.append(wnCell);

            for(let col=0; col<7; col++){
                const i = row*7 + col;
                const cell=this.e("div","dp-dlg-day");
                const dn=i-off+1;
                if(dn<1||dn>dim){cell.classList.add("empty");this.calDaysEl.append(cell);continue;}
                const cd=new Date(this.calY,this.calM,dn);
                const cms=cd.getTime();
                cell.textContent=String(dn);
                cell.dataset.ms=String(cms);
                if(same(cd,today))cell.classList.add("today");
                if(cms>dMs(today))cell.classList.add("future");
                if(outOfData(cd)) cell.classList.add("disabled");
                if(effS!==null&&effE!==null){
                    if(cms===effS)cell.classList.add("rs");
                    if(cms===effE)cell.classList.add("re");
                    if(cms>effS&&cms<effE)cell.classList.add("in-range");
                }else if(rs!==null&&cms===rs){cell.classList.add("rs","re");}

                if(!outOfData(cd)){
                    cell.addEventListener("click",()=>{
                        if(!this.picking){
                            this.rangeS=cd;this.rangeE=null;this.picking=true;this.hov=null;this.activeSC=null;
                        }else{
                            if(dMs(cd)<dMs(this.rangeS!)){this.rangeE=this.rangeS;this.rangeS=cd;}
                            else{this.rangeE=cd;}
                            this.picking=false;this.hov=null;this.activeSC=null;
                        }
                        this.renderDays();this.syncInputs();this.updateInfo();this.buildShortcuts();
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
                }
                this.calDaysEl.append(cell);
            }
        }

        this.calDaysEl.onmouseover=(ev)=>{
            if(!this.picking)return;
            const t=ev.target as HTMLElement;
            if(!t.dataset||!t.dataset.ms)return;
            const ms=+t.dataset.ms;
            if(this.hov&&dMs(this.hov)===ms)return;
            this.hov=new Date(ms);this.renderDays();
        };
        this.calDaysEl.onmouseleave=()=>{if(!this.picking)return;this.hov=null;this.renderDays();};
    }

    private syncInputs(){
        this.inS.value=this.rangeS?fmt(this.rangeS):"";
        this.inE.value=this.rangeE?fmt(this.rangeE):"";
        this.lastSyncedS = this.inS.value;
        this.lastSyncedE = this.inE.value;
        this.inS.classList.remove("err");this.inE.classList.remove("err");
        this.updateStepIndicators();
    }

    private updateStepIndicators(){
        if(!this.inputWrapStart || !this.inputWrapEnd) return;
        this.inputWrapStart.classList.toggle("dp-step-current", !this.rangeS || (!this.picking && !this.rangeE));
        this.inputWrapEnd.classList.toggle("dp-step-current", this.picking || (!!this.rangeS && !this.rangeE));
        this.inputWrapStart.classList.toggle("dp-step-done", !!this.rangeS && !this.inputWrapStart.classList.contains("dp-step-current"));
        this.inputWrapEnd.classList.toggle("dp-step-done", !!this.rangeE && !this.inputWrapEnd.classList.contains("dp-step-current"));
    }

    private setEditingField(which: "start"|"end"){
        const d = which==="start" ? this.rangeS : this.rangeE;
        if(d){ this.calY=d.getFullYear(); this.calM=d.getMonth(); this.syncSel(); this.renderCalendarBody(); }
    }

    private flashInput(which: "start"|"end"){
        const el = which==="start" ? this.inS : this.inE;
        el.classList.remove("dp-flash"); void el.offsetWidth;
        el.classList.add("dp-flash");
    }

    private confirmInput(which: "start"|"end"){
        const input = which==="start" ? this.inS : this.inE;
        const parsed = parseDate(input.value);
        if(!parsed){
            if(input.value) input.classList.add("err");
            return;
        }
        input.classList.remove("err");

        if(which==="start"){
            this.rangeS = parsed;
            if(this.rangeE && dMs(this.rangeE) < dMs(parsed)) this.rangeE = null;
        } else {
            this.rangeE = parsed;
            if(this.rangeS && dMs(this.rangeS) > dMs(parsed)) this.rangeS = null;
        }

        this.picking=false; this.hov=null; this.activeSC="manual";
        this.calY=parsed.getFullYear(); this.calM=parsed.getMonth();
        this.syncSel();this.renderCalendarBody();this.updateInfo();this.buildShortcuts();
        this.flashInput(which);
        this.updateStepIndicators();
        if(which==="start" && !this.rangeE) this.inE.value="";
        if(which==="end" && !this.rangeS) this.inS.value="";
        this.lastSyncedS = this.inS.value;
        this.lastSyncedE = this.inE.value;
    }

    private updateGranPreview(){
        if(!this.showAutoGranToggle || !this.effectiveGranLbl) return;
        const t=this.t();
        this.manualGranSelect.style.display=this.granAuto?"none":"";
        let effective:Gran;
        if(this.granAuto){
            effective=(this.rangeS&&this.rangeE)
                ? resolveEffectiveGran(this.gran,this.rangeS,this.rangeE,this.granVisibleMap,this.granThresholdsMap)
                : this.gran;
        } else {
            effective=this.manualGranOverride??this.gran;
        }
        // Always the single letter — see visual.ts's identical simplification.
        this.effectiveGranLbl.textContent=`${t.effectiveLabel}: ${effective}`;
    }

    private updateInfo(){
        const t=this.t();
        this.footerInfo.replaceChildren();
        if(this.picking){
            const s=document.createElement("span"); s.textContent=`${fmt(this.rangeS!)} ${t.clickEnd}`;
            this.footerInfo.append(s);
        }else if(this.rangeS&&this.rangeE){
            // Same reasoning as visual.ts's identical fix: separate spans so a too-narrow
            // dialog can only ever wrap BETWEEN start/end/day-count, never mid-date.
            const diff=Math.round((dMs(this.rangeE)-dMs(this.rangeS))/86400000)+1;
            const startSpan=document.createElement("span"); startSpan.textContent=fmt(this.rangeS);
            const endSpan=document.createElement("span"); endSpan.textContent=`→ ${fmt(this.rangeE)}`;
            const daysSpan=document.createElement("span"); daysSpan.textContent=`(${diff} ${t.days})`;
            this.footerInfo.append(startSpan,endSpan,daysSpan);
        }
        this.updateGranPreview();
    }

    private submit(apply: boolean): void {
        if(apply && this.rangeS){
            const e=this.rangeE||this.rangeS;
            const result:DialogResultState={
                rangeStart: this.rangeS.toISOString(),
                rangeEnd:   e.toISOString(),
                cancelled:  false,
                activeSC:   this.activeSC,
                dynN:       this.dynN,
                granSelected: this.granMode==="column" ? this.granSelected : undefined,
                granAuto:   this.showAutoGranToggle ? this.granAuto : undefined,
                manualGran: this.showAutoGranToggle && !this.granAuto ? (this.manualGranOverride??this.gran) : undefined
            };
            this.host.setResult(result);
            this.host.close(1 as any);
        } else {
            this.host.setResult({cancelled:true,rangeStart:"",rangeEnd:""} as DialogResultState);
            this.host.close(2 as any);
        }
    }
}

(globalThis as any).dialogRegistry = (globalThis as any).dialogRegistry || {};
(globalThis as any).dialogRegistry[DIALOG_ID] = DatePickerDialog;
