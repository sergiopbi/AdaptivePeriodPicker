"use strict";
import powerbi from "powerbi-visuals-api";
import * as pbModels from "powerbi-models";
import "./../style/visual.less";
import "./dialog";
import { DIALOG_ID, DialogInitialState, DialogResultState } from "./dialog";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { VisualFormattingSettingsModel } from "./settings";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions      = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual                  = powerbi.extensibility.visual.IVisual;
import IVisualHost              = powerbi.extensibility.visual.IVisualHost;
import IVisualEventService      = powerbi.extensibility.IVisualEventService;
import FilterAction             = powerbi.FilterAction;
import VisualDialogPositionType = powerbi.VisualDialogPositionType;

type Gran = "D"|"W"|"M"|"Q"|"S"|"Y";
type Lang = "PT"|"EN";



const GRAN_ALIASES: Record<Gran,string[]> = {
    D:["d","dia","dias","day","days","diário","diario","daily"],
    W:["w","semana","semanas","week","weeks","semanal","weekly"],
    M:["m","mes","mês","meses","month","months","mensal","monthly"],
    Q:["q","trimestre","trimestres","quarter","quarters","trimestral","quarterly"],
    S:["s","semestre","semestres","semester","semesters","semestral"],
    Y:["y","ano","anos","year","years","anual","annual","yearly"]
};
function normalizeGran(raw:string):Gran|null{
    const k=raw.trim().toLowerCase();
    for(const g of ["D","W","M","Q","S","Y"] as Gran[]) if(GRAN_ALIASES[g].includes(k)) return g;
    return null;
}

const GRAN_SING: Record<Lang,Record<Gran,string>> = {
    PT:{D:"Diário",W:"Semanal",M:"Mensal",Q:"Trimestral",S:"Semestral",Y:"Anual"},
    EN:{D:"Daily",W:"Weekly",M:"Monthly",Q:"Quarterly",S:"Semester",Y:"Annual"}
};

const I18N: Record<Lang,{
    today:string; yesterday:string; thisWeek:string; lastWeek:string; thisMonth:string;
    thisQuarter:string; thisSemester:string; thisYear:string;
    mtd:string; qtd:string; ytd:string;
    lastN:string; granLabels:Record<Gran,string>;
    apply:string; cancel:string; start:string; end:string;
    clickEnd:string; days:string; months:string[]; wdays:string[];
    title:string; nsel:string; clear:string; landingPage:string;
}> = {
    PT:{
        today:"Hoje",yesterday:"Ontem",thisWeek:"Esta Semana",lastWeek:"Semana Passada",
        thisMonth:"Este Mês",thisQuarter:"Este Trimestre",thisSemester:"Este Semestre",thisYear:"Este Ano",
        mtd:"Mês até à data",qtd:"Trim. até à data",ytd:"Ano até à data",
        lastN:"Últimos",granLabels:{D:"Dias",W:"Semanas",M:"Meses",Q:"Trimestres",S:"Semestres",Y:"Anos"},
        apply:"Aplicar",cancel:"Cancelar",start:"Início",end:"Fim",
        clickEnd:"→ clica para definir o fim",days:"dias",clear:"Limpar",
        months:["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"],
        wdays:["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"],
        title:"Seletor de Período", nsel:"Clica para selecionar período",
        landingPage:"Adicione um campo de data ao \"Date Column\" para começar."
    },
    EN:{
        today:"Today",yesterday:"Yesterday",thisWeek:"This Week",lastWeek:"Last Week",
        thisMonth:"This Month",thisQuarter:"This Quarter",thisSemester:"This Semester",thisYear:"This Year",
        mtd:"Month to Date",qtd:"Quarter to Date",ytd:"Year to Date",
        lastN:"Last",granLabels:{D:"Days",W:"Weeks",M:"Months",Q:"Quarters",S:"Semesters",Y:"Years"},
        apply:"Apply",cancel:"Cancel",start:"Start",end:"End",
        clickEnd:"→ click to set end date",days:"days",clear:"Clear",
        months:["January","February","March","April","May","June","July","August","September","October","November","December"],
        wdays:["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
        title:"Period Selector", nsel:"Click to select period",
        landingPage:"Add a date field to \"Date Column\" to get started."
    }
};

const SHORTCUTS:{id:string;labelKey:string;visibleFor:Gran[];settingKey:string}[]=[
    {id:"today",       labelKey:"today",        visibleFor:["D"],                settingKey:"scToday"},
    {id:"yesterday",   labelKey:"yesterday",    visibleFor:["D"],                settingKey:"scYesterday"},
    {id:"thisWeek",    labelKey:"thisWeek",     visibleFor:["D","W"],            settingKey:"scThisWeek"},
    {id:"lastWeek",    labelKey:"lastWeek",     visibleFor:["D","W"],            settingKey:"scLastWeek"},
    {id:"thisMonth",   labelKey:"thisMonth",    visibleFor:["D","M"],            settingKey:"scThisMonth"},
    {id:"mtd",         labelKey:"mtd",          visibleFor:["D","M"],            settingKey:"scMtd"},
    {id:"qtd",         labelKey:"qtd",          visibleFor:["D","M","Q"],        settingKey:"scQtd"},
    {id:"ytd",         labelKey:"ytd",          visibleFor:["D","M","Q","S","Y"],settingKey:"scYtd"},
    {id:"thisQuarter", labelKey:"thisQuarter",  visibleFor:["D","M","Q"],        settingKey:"scThisQuarter"},
    {id:"thisSemester",labelKey:"thisSemester", visibleFor:["D","M","Q","S"],    settingKey:"scThisSemester"},
    {id:"thisYear",    labelKey:"thisYear",     visibleFor:["D","M","Q","S","Y"],settingKey:"scThisYear"},
];

const d0=(d:Date)=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
const dMs=(d:Date)=>d0(d).getTime();
const same=(a:Date,b:Date)=>dMs(a)===dMs(b);
const fmt=(d:Date)=>`${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getFullYear()).slice(-2)}`;

function startOfWeekMon(d:Date){const r=new Date(d);const dw=r.getDay();r.setDate(r.getDate()+(dw===0?-6:1-dw));r.setHours(0,0,0,0);return r;}

function calRange(today:Date,n:number,g:Gran):{s:Date,e:Date}{
    switch(g){
        case "D":return{s:d0(new Date(today.getTime()-n*86400000)),e:d0(today)};
        case "W":{const sw=startOfWeekMon(today);const s=new Date(sw);s.setDate(s.getDate()-(n-1)*7);const e=new Date(sw);e.setDate(e.getDate()+6);return{s,e};}
        case "M":{const s=new Date(today.getFullYear(),today.getMonth()-n+1,1);const e=new Date(today.getFullYear(),today.getMonth()+1,0);return{s,e};}
        case "Q":{const cq=Math.floor(today.getMonth()/3);const s=new Date(today.getFullYear(),cq*3-(n-1)*3,1);const e=new Date(today.getFullYear(),cq*3+3,0);return{s,e};}
        case "S":{const cs=today.getMonth()<6?0:1;const s=new Date(today.getFullYear(),cs*6-(n-1)*6,1);const e=new Date(today.getFullYear(),cs*6+6,0);return{s,e};}
        case "Y":{return{s:new Date(today.getFullYear()-n+1,0,1),e:new Date(today.getFullYear(),11,31)};}
    }
}
function shortcutRange(id:string,today:Date):{s:Date,e:Date}|null{
    switch(id){
        case "today":return{s:d0(today),e:d0(today)};
        case "yesterday":{const y=new Date(today);y.setDate(y.getDate()-1);return{s:d0(y),e:d0(y)};}
        case "thisWeek":{const sw=startOfWeekMon(today);const ew=new Date(sw);ew.setDate(ew.getDate()+6);return{s:sw,e:ew};}
        case "lastWeek":{const sw=startOfWeekMon(today);const ls=new Date(sw);ls.setDate(ls.getDate()-7);const le=new Date(ls);le.setDate(le.getDate()+6);return{s:ls,e:le};}
        case "thisMonth":return{s:new Date(today.getFullYear(),today.getMonth(),1),e:new Date(today.getFullYear(),today.getMonth()+1,0)};
        case "thisQuarter":{const q=Math.floor(today.getMonth()/3);return{s:new Date(today.getFullYear(),q*3,1),e:new Date(today.getFullYear(),q*3+3,0)};}
        case "thisSemester":{const sm=today.getMonth()<6?0:6;return{s:new Date(today.getFullYear(),sm,1),e:new Date(today.getFullYear(),sm+6,0)};}
        case "thisYear":return{s:new Date(today.getFullYear(),0,1),e:new Date(today.getFullYear(),11,31)};
        // To-date variants: from period start UP TO the reference date (today)
        case "mtd":return{s:new Date(today.getFullYear(),today.getMonth(),1),e:d0(today)};
        case "qtd":{const q=Math.floor(today.getMonth()/3);return{s:new Date(today.getFullYear(),q*3,1),e:d0(today)};}
        case "ytd":return{s:new Date(today.getFullYear(),0,1),e:d0(today)};
        default:return null;
    }
}

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
    private defaultN = 12; // configurable default number of periods for the refresh button
    private defaultType = "dynamic"; // what the refresh button applies
    private applyImmediate = true; // true = apply on click, false = require Apply button
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

    // DOM
    private wrap!:        HTMLElement;
    private closedEl!:    HTMLElement;
    private closedGran!:  HTMLElement;
    private closedRange!: HTMLElement;

    // Inline calendar DOM refs (populated by buildCalendarUI / buildHorizontalUI)
    private calContainer: HTMLElement|null = null;
    private shortcutsEl!: HTMLElement;
    private calAreaEl!:   HTMLElement; // wraps nav header + grid; rebuilt whole when granularity changes shape
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
            target.style.setProperty("--dp-panel",       bg);
            target.style.setProperty("--dp-accent",      sel);
            target.style.setProperty("--dp-title",       fg);
            target.style.setProperty("--dp-value",       fg);
            target.style.setProperty("--dp-accent-text", bg);
            target.style.setProperty("--dp-border",       fg);
            target.style.setProperty("--dp-border-width", "1px");
            return;
        }
        const c=this.fmtSettings?.dataColors;
        const b=this.fmtSettings?.border;
        if(!c) return;
        target.style.setProperty("--dp-bg",          c.backgroundColor.value.value);
        target.style.setProperty("--dp-panel",       c.panelColor.value.value);
        target.style.setProperty("--dp-accent",      c.accentColor.value.value);
        target.style.setProperty("--dp-title",       c.titleColor.value.value);
        target.style.setProperty("--dp-value",       c.valueColor.value.value);
        target.style.setProperty("--dp-accent-text", c.accentTextColor.value.value);
        if(b){
            target.style.setProperty("--dp-border",       b.borderColor.value.value);
            target.style.setProperty("--dp-border-width", `${b.borderWidth.value}px`);
        }
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
        const closedTooltip=()=>{
            if(this.rangeS&&this.rangeE){
                const days=Math.round((this.rangeE.getTime()-this.rangeS.getTime())/86400000)+1;
                const rangeTxt = same(this.rangeS,this.rangeE) ? fmt(this.rangeS) : `${fmt(this.rangeS)} – ${fmt(this.rangeE)}`;
                const daysLbl = this.lang==="PT" ? "dias" : "days";
                return [{displayName:GRAN_SING[this.lang][this.gran], value:`${rangeTxt} (${days} ${daysLbl})`}];
            }
            return [{displayName:this.lang==="PT"?"Período":"Period", value:this.t().nsel}];
        };
        this.closedEl.addEventListener("mouseover",(ev:MouseEvent)=>{
            if(this.host.hostCapabilities.allowInteractions===false) return;
            this.host.tooltipService.show({dataItems:closedTooltip(),identities:[],coordinates:[ev.clientX,ev.clientY],isTouchEvent:false});
        });
        this.closedEl.addEventListener("mousemove",(ev:MouseEvent)=>{
            if(this.host.hostCapabilities.allowInteractions===false) return;
            this.host.tooltipService.move({dataItems:closedTooltip(),identities:[],coordinates:[ev.clientX,ev.clientY],isTouchEvent:false});
        });
        this.closedEl.addEventListener("mouseleave",()=>{ this.host.tooltipService.hide({isTouchEvent:false,immediately:true}); });
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
        const c=this.fmtSettings?.dataColors;
        const b=this.fmtSettings?.border;
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
            colors:{
                bg:c?.backgroundColor.value.value||"#1e3055",
                panel:c?.panelColor.value.value||"#16243f",
                accent:c?.accentColor.value.value||"#2d6bc4",
                title:c?.titleColor.value.value||"#9ab0cc",
                value:c?.valueColor.value.value||"#ffffff",
                accentText:c?.accentTextColor.value.value||"#ffffff",
                borderColor:b?.borderColor.value.value||"#2d4470",
                borderWidth:b?.borderWidth.value??1
            }
        };
        // Position the dialog directly below the visual instead of centering it on
        // screen — available since API v4.0 (we're on 5.3.0). "top" can't be negative
        // (would place it above the visual), so we measure the visual's own rendered
        // height and use that as the vertical offset.
        const visualRect = this.root.getBoundingClientRect();
        this.host.openModalDialog(DIALOG_ID,{
            title:"", size:{width:580,height:500}, actionButtons:[],
            position:{ type: VisualDialogPositionType.RelativeToVisual, left:0, top:Math.round(visualRect.height) }
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
        colSide.append(ws,we,this.footerInfo,btnRow);
        this.footerBtnsRow=btnRow;

        const granBar=this.buildGranBar();
        const rowWrap=this.e("div","dp-horiz-row");
        rowWrap.append(this.shortcutsEl,colCal,colSide);
        if(granBar) root.append(granBar);
        root.append(rowWrap);
    }

    // ── SHARED CALENDAR UI ───────────────────────────────────────────────────
    private buildCalendarUI(root:HTMLElement){
        root.className="dp-inline-root";
        const granBar=this.buildGranBar();
        if(granBar) root.append(granBar);
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
        this.calAreaEl=this.e("div","dp-cal-area");
        cal.append(di,this.calAreaEl);
        this.buildCalArea();
        body.append(this.shortcutsEl,cal);
        const footer=this.e("div","dp-pop-footer");
        this.footerInfo=this.e("span","dp-pop-info");
        const footerBtns=this.e("div","dp-pop-footer-btns");
        const btnCancel=this.e("button","dp-pop-btn cancel") as HTMLButtonElement; btnCancel.textContent=this.t().cancel; btnCancel.addEventListener("click",()=>this.cancelInlineDraft());
        const btnApply=this.e("button","dp-pop-btn apply") as HTMLButtonElement; btnApply.textContent=this.t().apply; btnApply.addEventListener("click",()=>this.submitFromInline());
        footerBtns.append(btnCancel,btnApply);
        footer.append(this.footerInfo,footerBtns);
        root.append(body,footer);
        this.footerBtnsRow=footerBtns;
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
    private qWindowYears():number{
        const span=this.dataYearSpan();
        const cap=Math.min(Visual.Q_MAX_ROWS,Math.floor(Visual.MAX_PERIOD_CELLS/4));
        return span!==null?Math.min(span,cap):Math.min(Visual.Q_WINDOW_YEARS_FALLBACK,cap);
    }
    private static readonly S_MAX_ROWS=6; // 6 columns × 6 rows = 36 cells max
    private sWindowYears():number{
        const span=this.dataYearSpan();
        const cap=Math.min(Visual.S_MAX_ROWS*3,Math.floor(Visual.MAX_PERIOD_CELLS/2)); // 3 years per row at 6 cols
        return span!==null?Math.min(span,cap):Math.min(Visual.S_WINDOW_YEARS_FALLBACK,cap);
    }

    private buildCalArea(){
        if(!this.calAreaEl) return;
        this.calAreaEl.replaceChildren();
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
        return span!==null?Math.min(span,12):Visual.Y_WINDOW_YEARS_FALLBACK;
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
            const cellRangeTxt = same(c.s,c.e) ? fmt(c.s) : `${fmt(c.s)} – ${fmt(c.e)}`;
            cell.addEventListener("mouseover",(ev:MouseEvent)=>{
                if(this.host.hostCapabilities.allowInteractions===false) return;
                this.host.tooltipService.show({dataItems:[{displayName:c.label,value:cellRangeTxt}],identities:[],coordinates:[ev.clientX,ev.clientY],isTouchEvent:false});
            });
            cell.addEventListener("mousemove",(ev:MouseEvent)=>{
                if(this.host.hostCapabilities.allowInteractions===false) return;
                this.host.tooltipService.move({dataItems:[{displayName:c.label,value:cellRangeTxt}],identities:[],coordinates:[ev.clientX,ev.clientY],isTouchEvent:false});
            });
            cell.addEventListener("mouseleave",()=>{ this.host.tooltipService.hide({isTouchEvent:false,immediately:true}); });
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
    private buildGranBar():HTMLElement|null{
        if(this.granMode!=="column"||this.granOptions.length<2) return null;
        const bar=this.e("div","dp-gran-bar");
        this.granOptions.forEach(opt=>{
            const btn=this.e("button","dp-gran-btn") as HTMLButtonElement;
            if(opt===this.granSelected) btn.classList.add("active");
            btn.textContent=opt;
            btn.addEventListener("click",()=>this.selectGran(opt));
            btn.addEventListener("mouseover",(ev:MouseEvent)=>{
                if(this.host.hostCapabilities.allowInteractions===false) return;
                this.host.tooltipService.show({dataItems:[{displayName:opt,value:GRAN_SING[this.lang][opt]}],identities:[],coordinates:[ev.clientX,ev.clientY],isTouchEvent:false});
            });
            btn.addEventListener("mousemove",(ev:MouseEvent)=>{
                if(this.host.hostCapabilities.allowInteractions===false) return;
                this.host.tooltipService.move({dataItems:[{displayName:opt,value:GRAN_SING[this.lang][opt]}],identities:[],coordinates:[ev.clientX,ev.clientY],isTouchEvent:false});
            });
            btn.addEventListener("mouseleave",()=>{ this.host.tooltipService.hide({isTouchEvent:false,immediately:true}); });
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

    private buildShortcuts(){
        if(!this.shortcutsEl) return;
        this.shortcutsEl.replaceChildren();
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
        if(!dynVisible){ return; }
        if(prev) this.shortcutsEl.append(this.e("div","dp-pop-div"));
        const dyn=this.e("div","dp-pop-dyn");
        if(this.draftActiveSC==="dynamic") dyn.classList.add("active");
        const dl=this.e("div","dp-pop-dynlbl"); dl.textContent=t.lastN;
        dl.style.cursor="pointer";
        dl.addEventListener("click",()=>recalc());
        const row=this.e("div","dp-pop-dynrow");
        row.style.cursor="pointer";
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
        };
        // Clicking the unit label also activates
        this.dynUnit=this.e("span","dp-pop-dynunit"); this.dynUnit.textContent=t.granLabels[this.gran];
        this.dynUnit.style.cursor="pointer";
        this.dynUnit.addEventListener("click",()=>recalc());
        row.addEventListener("click",(ev)=>{if((ev.target as HTMLElement)!==this.dynInput) recalc();});
        this.dynInput.addEventListener("input",recalc);
        this.dynInput.addEventListener("change",recalc);
        this.dynInput.addEventListener("wheel",(ev)=>{
            ev.preventDefault();
            const cur=Math.max(1,+this.dynInput.value||1);
            this.dynInput.value=String(Math.max(1,cur+(ev.deltaY<0?1:-1)));
            recalc();
        },{passive:false});
        numBox.append(this.dynInput);
        row.append(numBox,this.dynUnit); dyn.append(dl,row); this.shortcutsEl.append(dyn);
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

    private isoWeekNumber(d:Date):number{
        const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
        const dayNum=(t.getUTCDay()+6)%7; t.setUTCDate(t.getUTCDate()-dayNum+3);
        const firstThursday=new Date(Date.UTC(t.getUTCFullYear(),0,4));
        const firstDayNum=(firstThursday.getUTCDay()+6)%7;
        firstThursday.setUTCDate(firstThursday.getUTCDate()-firstDayNum+3);
        return 1+Math.round((t.getTime()-firstThursday.getTime())/(7*86400000));
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
            const wn=this.isoWeekNumber(mondayOfRow);
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
                    const dayLabel = this.lang==="PT" ? "Data" : "Date";
                    cell.addEventListener("mouseover",(ev:MouseEvent)=>{
                        if(this.host.hostCapabilities.allowInteractions===false) return;
                        this.host.tooltipService.show({dataItems:[{displayName:dayLabel,value:fmt(cd)}],identities:[],coordinates:[ev.clientX,ev.clientY],isTouchEvent:false});
                    });
                    cell.addEventListener("mousemove",(ev:MouseEvent)=>{
                        if(this.host.hostCapabilities.allowInteractions===false) return;
                        this.host.tooltipService.move({dataItems:[{displayName:dayLabel,value:fmt(cd)}],identities:[],coordinates:[ev.clientX,ev.clientY],isTouchEvent:false});
                    });
                    cell.addEventListener("mouseleave",()=>{ this.host.tooltipService.hide({isTouchEvent:false,immediately:true}); });
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
        const raw=input.value;
        const m=raw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
        if(!m){if(raw) input.classList.add("err"); return;}
        const y=+m[3]<100?2000+ +m[3]:+m[3]; const parsed=new Date(y,+m[2]-1,+m[1]);
        if(isNaN(parsed.getTime())){input.classList.add("err"); return;}
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
        if(this.picking){this.footerInfo.textContent=`${fmt(this.draftRangeS!)} ${t.clickEnd}`;return;}
        if(!this.draftRangeS||!this.draftRangeE){this.footerInfo.textContent="";return;}
        const diff=Math.round((dMs(this.draftRangeE)-dMs(this.draftRangeS))/86400000)+1;
        if(this.currentMode==="inline-horizontal"){
            this.footerInfo.textContent=`${diff} ${t.days}`;
        } else {
            this.footerInfo.textContent=`${fmt(this.draftRangeS)} → ${fmt(this.draftRangeE)} (${diff} ${t.days})`;
        }
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
    private selectGran(literal:string){
        if(literal===this.granSelected) return;
        this.granSelected=literal;
        const mapped=normalizeGran(literal);
        if(mapped) this.gran=mapped;
        this.applyFilter();
        // Same reset as a granChanged event: re-anchor to ref_date's year and rebuild
        // the calendar shape (day grid vs week/month/quarter/semester/year grid).
        const ref=new Date(this.refDate);
        this.calY=ref.getFullYear(); this.calM=ref.getMonth();
        if(this.calAreaEl) this.buildCalArea();
        this.buildShortcuts();
        this.refreshGranBar();
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
            const literal=this.granSelected??this.gran;
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

        // Persist the intent + the refDate used for this calculation.
        // Storing refUsed lets us distinguish a real day-change (refDate differs from
        // what's stored) from a mere page navigation (refDate matches) — so we only
        // recalculate when the day genuinely changed, never on every page switch.
        const refUsed = `${this.refDate.getFullYear()}-${this.refDate.getMonth()}-${this.refDate.getDate()}`;
        const intent = JSON.stringify({activeSC:this.activeSC, dynN:this.dynN, gran:this.gran, refUsed});
        this.host.persistProperties({
            merge:[{ objectName:"general", selector:null, properties:{ state: intent } }]
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
            const sc=this.fmtSettings?.shortcuts;
            if(sc){
                this.scVisible={
                    scToday:sc.scToday.value, scYesterday:sc.scYesterday.value, scThisWeek:sc.scThisWeek.value,
                    scLastWeek:sc.scLastWeek.value, scThisMonth:sc.scThisMonth.value, scMtd:sc.scMtd.value,
                    scQtd:sc.scQtd.value, scYtd:sc.scYtd.value, scThisQuarter:sc.scThisQuarter.value,
                    scThisSemester:sc.scThisSemester.value, scThisYear:sc.scThisYear.value, scDynamic:sc.scDynamic.value
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
                        const raw=String(val.values[0]||"PT").trim().toUpperCase() as Lang;
                        if(["PT","EN"].includes(raw)) this.lang=raw;
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

            // Restore the intent (activeSC + dynN) from persisted state
            if(stateStr){
                try{
                    const intent = JSON.parse(stateStr) as {activeSC:string|null; dynN:number};
                    this.activeSC = intent.activeSC;
                    this.dynN = intent.dynN || 12;
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
                const syncedGran = (synced?.gran && this.granOptions.includes(synced.gran)) ? synced.gran : null;
                const stored = syncedGran || ((stateGran && this.granOptions.includes(stateGran)) ? stateGran : null);
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
                    if(mapped && mapped!==this.gran){ this.gran=mapped; granChanged=true; }
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

            if(modeChanged || (granOptionsSetChanged && this.currentMode!=="popup")){
                this.rebuildForMode();
            } else {
                this.applyColors(this.wrap);
                if(this.calContainer) this.applyColors(this.calContainer);
                // Granularity changed shape (e.g. D→M): rebuild the header+grid so it
                // switches between the day grid and the month/quarter/semester/year grid.
                const calAreaVisible=this.currentMode!=="popup";
                if(granChanged&&calAreaVisible&&this.calAreaEl){
                    // Always re-anchor to ref_date's year on a granularity switch —
                    // never to whatever the current selection happens to be, even if
                    // that selection sits near the end of the data table.
                    const ref=new Date(this.refDate);
                    this.calY=ref.getFullYear(); this.calM=ref.getMonth();
                    this.buildCalArea();
                }
                if(granChanged) this.refreshGranBar();
                if(this.currentMode==="popup"){
                    this.updateClosedLabel();
                } else {
                    if(this.dynUnit) this.dynUnit.textContent=this.t().granLabels[this.gran];
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
        return this.fmtSvc.buildFormattingModel(this.fmtSettings);
    }
}
