"use strict";
import powerbi from "powerbi-visuals-api";
import "./../style/dialog.less";
import DialogConstructorOptions = powerbi.extensibility.visual.DialogConstructorOptions;
import IDialogHost              = powerbi.extensibility.visual.IDialogHost;

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

const I18N_SC: Record<Lang,{
    today:string; yesterday:string; thisWeek:string; lastWeek:string; thisMonth:string;
    mtd:string; qtd:string; ytd:string;
    thisQuarter:string; thisSemester:string; thisYear:string;
    lastN:string; granLabels:Record<Gran,string>;
    apply:string; cancel:string; start:string; end:string;
    clickEnd:string; days:string; months:string[]; wdays:string[];
}> = {
    PT:{
        today:"Hoje",yesterday:"Ontem",thisWeek:"Esta Semana",lastWeek:"Semana Passada",
        thisMonth:"Este Mês",mtd:"Mês até à Data",qtd:"Trimestre até à Data",ytd:"Ano até à Data",
        thisQuarter:"Este Trimestre",thisSemester:"Este Semestre",thisYear:"Este Ano",
        lastN:"Últimos",granLabels:{D:"Dias",W:"Semanas",M:"Meses",Q:"Trimestres",S:"Semestres",Y:"Anos"},
        apply:"Aplicar",cancel:"Cancelar",start:"Início",end:"Fim",
        clickEnd:"→ clica para definir o fim",days:"dias",
        months:["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"],
        wdays:["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"]
    },
    EN:{
        today:"Today",yesterday:"Yesterday",thisWeek:"This Week",lastWeek:"Last Week",
        thisMonth:"This Month",mtd:"Month to Date",qtd:"Quarter to Date",ytd:"Year to Date",
        thisQuarter:"This Quarter",thisSemester:"This Semester",thisYear:"This Year",
        lastN:"Last",granLabels:{D:"Days",W:"Weeks",M:"Months",Q:"Quarters",S:"Semesters",Y:"Years"},
        apply:"Apply",cancel:"Cancel",start:"Start",end:"End",
        clickEnd:"→ click to set end date",days:"days",
        months:["January","February","March","April","May","June","July","August","September","October","November","December"],
        wdays:["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
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
function parseDate(s:string):Date|null{const m=s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);if(!m)return null;const y=+m[3]<100?2000+ +m[3]:+m[3];const r=new Date(y,+m[2]-1,+m[1]);return isNaN(r.getTime())?null:r;}
function startOfWeekMon(d:Date){const r=new Date(d);const dw=r.getDay();r.setDate(r.getDate()+(dw===0?-6:1-dw));r.setHours(0,0,0,0);return r;}
function isoWeekNumber(d:Date):number{
    const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
    const dayNum=(t.getUTCDay()+6)%7;
    t.setUTCDate(t.getUTCDate()-dayNum+3);
    const firstThursday=new Date(Date.UTC(t.getUTCFullYear(),0,4));
    const firstDayNum=(firstThursday.getUTCDay()+6)%7;
    firstThursday.setUTCDate(firstThursday.getUTCDate()-firstDayNum+3);
    return 1+Math.round((t.getTime()-firstThursday.getTime())/(7*86400000));
}

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
        case "lastWeek":{const sw=startOfWeekMon(today);sw.setDate(sw.getDate()-7);const ew=new Date(sw);ew.setDate(ew.getDate()+6);return{s:sw,e:ew};}
        case "thisMonth":return{s:new Date(today.getFullYear(),today.getMonth(),1),e:new Date(today.getFullYear(),today.getMonth()+1,0)};
        case "thisQuarter":{const q=Math.floor(today.getMonth()/3);return{s:new Date(today.getFullYear(),q*3,1),e:new Date(today.getFullYear(),q*3+3,0)};}
        case "thisSemester":{const sm=today.getMonth()<6?0:6;return{s:new Date(today.getFullYear(),sm,1),e:new Date(today.getFullYear(),sm+6,0)};}
        case "thisYear":return{s:new Date(today.getFullYear(),0,1),e:new Date(today.getFullYear(),11,31)};
        case "mtd":return{s:new Date(today.getFullYear(),today.getMonth(),1),e:d0(today)};
        case "qtd":{const q=Math.floor(today.getMonth()/3);return{s:new Date(today.getFullYear(),q*3,1),e:d0(today)};}
        case "ytd":return{s:new Date(today.getFullYear(),0,1),e:d0(today)};
        default:return null;
    }
}

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
    colors?: {
        bg: string; panel: string; accent: string;
        title: string; value: string; accentText: string;
        borderColor: string; borderWidth: number;
    };
}
export interface DialogResultState {
    rangeStart: string;
    rangeEnd:   string;
    cancelled:  boolean;
    activeSC?:  string|null;
    dynN?:      number;
    granSelected?: string|null;
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

    private shortcutsEl!: HTMLElement;
    private calAreaEl!:   HTMLElement;
    private calDaysEl!:   HTMLElement;
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
        if (state.refDate) { const d=new Date(state.refDate); if(!isNaN(d.getTime())) this.refDate=d; }
        if (state.rangeStart) { const d=new Date(state.rangeStart); if(!isNaN(d.getTime())) this.rangeS=d; }
        if (state.rangeEnd)   { const d=new Date(state.rangeEnd);   if(!isNaN(d.getTime())) this.rangeE=d; }
        if (this.rangeE) { this.calY=this.rangeE.getFullYear(); this.calM=this.rangeE.getMonth(); }
        else { this.calY=this.refDate.getFullYear(); this.calM=this.refDate.getMonth(); }
        this.build(options.element);
        if (state.colors) {
            const s = options.element.style;
            s.setProperty("--dp-bg",           state.colors.bg);
            s.setProperty("--dp-panel",        state.colors.panel);
            s.setProperty("--dp-accent",       state.colors.accent);
            s.setProperty("--dp-title",        state.colors.title);
            s.setProperty("--dp-value",        state.colors.value);
            s.setProperty("--dp-accent-text",  state.colors.accentText);
            s.setProperty("--dp-border",       state.colors.borderColor);
            s.setProperty("--dp-border-width", `${state.colors.borderWidth}px`);
        }
    }

    private t(){return I18N_SC[this.lang];}
    private e(tag:string,cls?:string):HTMLElement{const el=document.createElement(tag);if(cls)el.className=cls;return el;}

    private build(root: HTMLElement){
        root.replaceChildren();
        root.className="dp-dlg";

        const granBar=this.buildGranBar();
        if(granBar) root.append(granBar);

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

        this.calAreaEl=this.e("div","dp-dlg-cal-area");
        cal.append(di,this.calAreaEl);
        body.append(this.shortcutsEl,cal);

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

        root.append(body,footer);

        this.buildCalArea(); this.buildShortcuts(); this.syncInputs(); this.updateInfo();
    }

    private granBarEl: HTMLElement|null = null;
    private buildGranBar():HTMLElement|null{
        if(this.granMode!=="column"||this.granOptions.length<2) return null;
        const bar=this.e("div","dp-gran-bar");
        this.granOptions.forEach(opt=>{
            const btn=this.e("button","dp-gran-btn") as HTMLButtonElement;
            if(opt===this.granSelected) btn.classList.add("active");
            btn.textContent=opt;
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
    }

    private buildShortcuts(){
        this.shortcutsEl.replaceChildren();
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
        if(!dynVisible) return;
        if(prev)this.shortcutsEl.append(this.e("div","dp-dlg-div"));
        const dyn=this.e("div","dp-dlg-dyn");
        if(this.activeSC==="dynamic")dyn.classList.add("active");
        const dl=this.e("div","dp-dlg-dynlbl"); dl.textContent=t.lastN;
        const row=this.e("div","dp-dlg-dynrow");
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
        // Make label, unit and the row itself clickable (activates the dynamic shortcut)
        dl.style.cursor="pointer"; dl.addEventListener("click",()=>recalc());
        this.dynUnit=this.e("span","dp-dlg-dynunit"); this.dynUnit.textContent=t.granLabels[this.gran];
        this.dynUnit.style.cursor="pointer"; this.dynUnit.addEventListener("click",()=>recalc());
        row.style.cursor="pointer";
        row.addEventListener("click",(ev)=>{ if((ev.target as HTMLElement)!==this.dynInput) recalc(); });
        this.dynInput.addEventListener("input",recalc);
        this.dynInput.addEventListener("change",recalc);
        this.dynInput.addEventListener("wheel",(ev)=>{
            ev.preventDefault();
            const cur=Math.max(1,+this.dynInput.value||1);
            this.dynInput.value=String(Math.max(1, cur + (ev.deltaY<0?1:-1)));
            recalc();
        }, {passive:false});
        numBox.append(this.dynInput);
        row.append(numBox,this.dynUnit);
        dyn.append(dl,row); this.shortcutsEl.append(dyn);
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
        this.syncSel();
        this.renderCalendarBody();
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

    private updateInfo(){
        const t=this.t();
        if(this.picking){
            this.footerInfo.textContent=`${fmt(this.rangeS!)} ${t.clickEnd}`;
        }else if(this.rangeS&&this.rangeE){
            const diff=Math.round((dMs(this.rangeE)-dMs(this.rangeS))/86400000)+1;
            this.footerInfo.textContent=`${fmt(this.rangeS)} → ${fmt(this.rangeE)} (${diff} ${t.days})`;
        }else{
            this.footerInfo.textContent="";
        }
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
                granSelected: this.granMode==="column" ? this.granSelected : undefined
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
