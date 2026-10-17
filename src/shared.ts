"use strict";
// Logic shared between visual.ts (inline modes) and dialog.ts (the native popup dialog).
// These two files end up in the SAME final webpack bundle (dialog.ts is only ever reached
// via `import "./dialog"` from visual.ts, never as a separate network chunk), so pulling
// shared pieces in here isn't just tidiness — it's one copy in the shipped .pbiviz instead
// of two, and it closes off an entire class of bug: a fix or a new shortcut added to one
// file's copy and forgotten in the other's (exactly what happened with lastMonth/
// lastQuarter/lastSemester earlier — added to visual.ts's SHORTCUTS array and I18N, but
// dialog.ts's separate copies were never touched, so the popup silently lacked them).

export type Gran = "D"|"W"|"M"|"Q"|"S"|"Y";
export type Lang = "PT"|"EN";

export const GRAN_ALIASES: Record<Gran,string[]> = {
    D:["d","dia","dias","day","days","diário","diario","daily"],
    W:["w","semana","semanas","week","weeks","semanal","weekly"],
    M:["m","mes","mês","meses","month","months","mensal","monthly"],
    Q:["q","trimestre","trimestres","quarter","quarters","trimestral","quarterly"],
    S:["s","semestre","semestres","semester","semesters","semestral"],
    Y:["y","ano","anos","year","years","anual","annual","yearly"]
};
export function normalizeGran(raw:string):Gran|null{
    const k=raw.trim().toLowerCase();
    for(const g of ["D","W","M","Q","S","Y"] as Gran[]) if(GRAN_ALIASES[g].includes(k)) return g;
    return null;
}

// Singular display form (e.g. "Monthly") — only used by visual.ts's closed popup bar, but
// lives here anyway since it's the same kind of per-Gran label table as GRAN_SING's cousins.
export const GRAN_SING: Record<Lang,Record<Gran,string>> = {
    PT:{D:"Diário",W:"Semanal",M:"Mensal",Q:"Trimestral",S:"Semestral",Y:"Anual"},
    EN:{D:"Daily",W:"Weekly",M:"Monthly",Q:"Quarterly",S:"Semester",Y:"Annual"}
};

// Short letter/abbreviation shown on the granularity bar's own buttons (D/W/M/Q/S/Y).
// These were literally the hardcoded English Gran codes before — visible to a PT report
// even though every other piece of text in the visual translates. PT needs 2-letter
// "SM" for Semestral since "S" is already taken by Semanal — a real collision, not a
// typo. The "Texto da Granularidade" formatting card can override any of these with
// free text per letter; this table is only the fallback when that's left blank.
export const GRAN_LETTER: Record<Lang,Record<Gran,string>> = {
    PT:{D:"D",W:"S",M:"M",Q:"T",S:"SM",Y:"A"},
    EN:{D:"D",W:"W",M:"M",Q:"Q",S:"S",Y:"Y"}
};

export interface I18nStrings {
    today:string; yesterday:string; thisWeek:string; lastWeek:string; thisMonth:string; lastMonth:string;
    thisQuarter:string; lastQuarter:string; thisSemester:string; lastSemester:string; thisYear:string;
    mtd:string; qtd:string; ytd:string;
    lastN:string; granLabels:Record<Gran,string>;
    apply:string; cancel:string; start:string; end:string;
    clickEnd:string; days:string; months:string[]; wdays:string[]; wdaysShort:string[];
    // Only used by visual.ts (closed popup bar / landing page) — dialog.ts's calendar UI
    // never shows them, but keeping one shared shape means one shared object either way.
    title:string; nsel:string; clear:string; landingPage:string;
    autoLabel:string; manualLabel:string; autoLabelShort:string; manualLabelShort:string;
    effectiveLabel:string; autoTooltip:string;
}

export const I18N: Record<Lang,I18nStrings> = {
    PT:{
        today:"Hoje",yesterday:"Ontem",thisWeek:"Esta Semana",lastWeek:"Semana Passada",
        thisMonth:"Este Mês",lastMonth:"Mês Passado",thisQuarter:"Este Trimestre",lastQuarter:"Trimestre Passado",
        thisSemester:"Este Semestre",lastSemester:"Semestre Passado",thisYear:"Este Ano",
        mtd:"Mês até à data",qtd:"Trim. até à data",ytd:"Ano até à data",
        lastN:"Últimos",granLabels:{D:"Dias",W:"Semanas",M:"Meses",Q:"Trimestres",S:"Semestres",Y:"Anos"},
        apply:"Aplicar",cancel:"Cancelar",start:"Início",end:"Fim",
        clickEnd:"→ clica para definir o fim",days:"dias",clear:"Limpar",
        months:["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"],
        wdays:["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"],
        wdaysShort:["S","T","Q","Q","S","S","D"],
        title:"Seletor de Período", nsel:"Clica para selecionar período",
        landingPage:"Adicione um campo de data ao \"Date Column\" para começar.",
        autoLabel:"Automático",manualLabel:"Manual",autoLabelShort:"Auto",manualLabelShort:"Man.",effectiveLabel:"Aplicado",
        autoTooltip:"Automático: se o período escolhido tiver poucos pontos nesta granularidade, desce sozinho para a seguinte. Manual: escolhe livremente a granularidade a aplicar, independente do que está selecionado acima."
    },
    EN:{
        today:"Today",yesterday:"Yesterday",thisWeek:"This Week",lastWeek:"Last Week",
        thisMonth:"This Month",lastMonth:"Last Month",thisQuarter:"This Quarter",lastQuarter:"Last Quarter",
        thisSemester:"This Semester",lastSemester:"Last Semester",thisYear:"This Year",
        mtd:"Month to Date",qtd:"Quarter to Date",ytd:"Year to Date",
        lastN:"Last",granLabels:{D:"Days",W:"Weeks",M:"Months",Q:"Quarters",S:"Semesters",Y:"Years"},
        apply:"Apply",cancel:"Cancel",start:"Start",end:"End",
        clickEnd:"→ click to set end date",days:"days",clear:"Clear",
        months:["January","February","March","April","May","June","July","August","September","October","November","December"],
        wdays:["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
        wdaysShort:["M","T","W","T","F","S","S"],
        title:"Period Selector", nsel:"Click to select period",
        landingPage:"Add a date field to \"Date Column\" to get started.",
        autoLabel:"Automatic",manualLabel:"Manual",autoLabelShort:"Auto",manualLabelShort:"Man.",effectiveLabel:"Applied",
        autoTooltip:"Automatic: if the chosen period has too few points at this granularity, it steps down on its own to the next one. Manual: freely pick the granularity to apply, independent of what's selected above."
    }
};

export interface ShortcutDef { id:string; labelKey:string; visibleFor:Gran[]; settingKey:string; }

export const SHORTCUTS:ShortcutDef[]=[
    {id:"today",       labelKey:"today",        visibleFor:["D"],                settingKey:"scToday"},
    {id:"yesterday",   labelKey:"yesterday",    visibleFor:["D"],                settingKey:"scYesterday"},
    {id:"thisWeek",    labelKey:"thisWeek",     visibleFor:["D","W"],            settingKey:"scThisWeek"},
    {id:"lastWeek",    labelKey:"lastWeek",     visibleFor:["D","W"],            settingKey:"scLastWeek"},
    {id:"thisMonth",   labelKey:"thisMonth",    visibleFor:["D","M"],            settingKey:"scThisMonth"},
    {id:"lastMonth",   labelKey:"lastMonth",    visibleFor:["D","M"],            settingKey:"scLastMonth"},
    {id:"mtd",         labelKey:"mtd",          visibleFor:["D","M"],            settingKey:"scMtd"},
    {id:"qtd",         labelKey:"qtd",          visibleFor:["D","M","Q"],        settingKey:"scQtd"},
    {id:"ytd",         labelKey:"ytd",          visibleFor:["D","M","Q","S","Y"],settingKey:"scYtd"},
    {id:"thisQuarter", labelKey:"thisQuarter",  visibleFor:["D","M","Q"],        settingKey:"scThisQuarter"},
    {id:"lastQuarter", labelKey:"lastQuarter",  visibleFor:["D","M","Q"],        settingKey:"scLastQuarter"},
    {id:"thisSemester",labelKey:"thisSemester", visibleFor:["D","M","Q","S"],    settingKey:"scThisSemester"},
    {id:"lastSemester",labelKey:"lastSemester", visibleFor:["D","M","Q","S"],    settingKey:"scLastSemester"},
    {id:"thisYear",    labelKey:"thisYear",     visibleFor:["D","M","Q","S","Y"],settingKey:"scThisYear"},
];

export const d0=(d:Date):Date=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
export const dMs=(d:Date):number=>d0(d).getTime();
export const same=(a:Date,b:Date):boolean=>dMs(a)===dMs(b);
export const fmt=(d:Date):string=>`${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getFullYear()).slice(-2)}`;

export function startOfWeekMon(d:Date):Date{
    const r=new Date(d);const dw=r.getDay();r.setDate(r.getDate()+(dw===0?-6:1-dw));r.setHours(0,0,0,0);return r;
}

// How many "blocks" of a given granularity a [s,e] range touches - pure date arithmetic,
// works before anything is rendered. Y/S/Q/M count calendar-aligned blocks (a range picked
// AS that granularity always starts/ends exactly on its own boundaries, so this is exact,
// not an estimate). W counts Monday-aligned week-starts spanned, consistent with the same
// startOfWeekMon() the week grid itself already uses. D is a plain day count.
export function granPointCount(g:Gran, s:Date, e:Date):number{
    switch(g){
        case "Y": return e.getFullYear()-s.getFullYear()+1;
        case "S": {
            const a=s.getFullYear()*2+(s.getMonth()<6?0:1), b=e.getFullYear()*2+(e.getMonth()<6?0:1);
            return b-a+1;
        }
        case "Q": {
            const a=s.getFullYear()*4+Math.floor(s.getMonth()/3), b=e.getFullYear()*4+Math.floor(e.getMonth()/3);
            return b-a+1;
        }
        case "M": return (e.getFullYear()-s.getFullYear())*12+(e.getMonth()-s.getMonth())+1;
        case "W": return Math.round((startOfWeekMon(e).getTime()-startOfWeekMon(s).getTime())/(7*86400000))+1;
        case "D": return Math.round((d0(e).getTime()-d0(s).getTime())/86400000)+1;
    }
}

// Main calendar-aligned chain: a level picked here always starts/ends on its own boundary,
// so downgrading only ever moves to the next level down THIS chain - never sideways to W,
// which has its own separate, unaligned selection philosophy (see resolveEffectiveGran).
export const GRAN_CHAIN:Gran[]=["Y","S","Q","M","D"];

/** The literal granularity the user clicked (this.gran/this.granSelected) always drives what
 * the calendar itself shows - this function never changes that. It only decides what value
 * gets sent to the bound Granularity Column / cross-filter, when "Granularidade automática"
 * is on: walk down from the clicked level (or from D, for W) until landing on a level that is
 * both visible and has enough points for its own configured threshold - or run out of visible
 * levels and settle on the last one still standing, since there may be nothing lower at all
 * (e.g. a report author who only left "M" visible). */
export function resolveEffectiveGran(
    literal:Gran, s:Date, e:Date,
    visible:Record<Gran,boolean>, threshold:Record<Exclude<Gran,"D">,number>
):Gran{
    if(literal==="W"){
        if(visible.W && granPointCount("W",s,e)>=threshold.W) return "W";
        return visible.D ? "D" : "W"; // nowhere lower visible - stay put
    }
    let idx=GRAN_CHAIN.indexOf(literal);
    if(idx<0) return literal; // "W" already handled above; this shouldn't otherwise happen
    for(; idx<GRAN_CHAIN.length; idx++){
        const g=GRAN_CHAIN[idx];
        if(!visible[g]) continue; // skip levels the report author turned off entirely
        if(g==="D") return "D"; // floor of this chain - no threshold, visible is enough
        if(granPointCount(g,s,e)>=threshold[g]) return g;
        // else: visible but too few points at this level - keep walking down
    }
    // Ran off the end of the chain without a level that both is visible AND clears its
    // threshold (e.g. only "M" is visible and the range is a single month) - the last
    // visible level encountered is the best available answer; re-scan for it.
    for(let j=GRAN_CHAIN.length-1;j>=GRAN_CHAIN.indexOf(literal);j--){
        if(visible[GRAN_CHAIN[j]]) return GRAN_CHAIN[j];
    }
    return literal; // nothing visible at or below the clicked level - stay put
}

export function calRange(today:Date,n:number,g:Gran):{s:Date,e:Date}{
    switch(g){
        case "D":return{s:d0(new Date(today.getTime()-n*86400000)),e:d0(today)};
        case "W":{const sw=startOfWeekMon(today);const s=new Date(sw);s.setDate(s.getDate()-(n-1)*7);const e=new Date(sw);e.setDate(e.getDate()+6);return{s,e};}
        case "M":{const s=new Date(today.getFullYear(),today.getMonth()-n+1,1);const e=new Date(today.getFullYear(),today.getMonth()+1,0);return{s,e};}
        case "Q":{const cq=Math.floor(today.getMonth()/3);const s=new Date(today.getFullYear(),cq*3-(n-1)*3,1);const e=new Date(today.getFullYear(),cq*3+3,0);return{s,e};}
        case "S":{const cs=today.getMonth()<6?0:1;const s=new Date(today.getFullYear(),cs*6-(n-1)*6,1);const e=new Date(today.getFullYear(),cs*6+6,0);return{s,e};}
        case "Y":{return{s:new Date(today.getFullYear()-n+1,0,1),e:new Date(today.getFullYear(),11,31)};}
    }
}

export function shortcutRange(id:string,today:Date):{s:Date,e:Date}|null{
    switch(id){
        case "today":return{s:d0(today),e:d0(today)};
        case "yesterday":{const y=new Date(today);y.setDate(y.getDate()-1);return{s:d0(y),e:d0(y)};}
        case "thisWeek":{const sw=startOfWeekMon(today);const ew=new Date(sw);ew.setDate(ew.getDate()+6);return{s:sw,e:ew};}
        case "lastWeek":{const sw=startOfWeekMon(today);const ls=new Date(sw);ls.setDate(ls.getDate()-7);const le=new Date(ls);le.setDate(le.getDate()+6);return{s:ls,e:le};}
        case "thisMonth":return{s:new Date(today.getFullYear(),today.getMonth(),1),e:new Date(today.getFullYear(),today.getMonth()+1,0)};
        case "lastMonth":return{s:new Date(today.getFullYear(),today.getMonth()-1,1),e:new Date(today.getFullYear(),today.getMonth(),0)};
        case "thisQuarter":{const q=Math.floor(today.getMonth()/3);return{s:new Date(today.getFullYear(),q*3,1),e:new Date(today.getFullYear(),q*3+3,0)};}
        case "lastQuarter":{const q=Math.floor(today.getMonth()/3);return{s:new Date(today.getFullYear(),(q-1)*3,1),e:new Date(today.getFullYear(),q*3,0)};}
        case "thisSemester":{const sm=today.getMonth()<6?0:6;return{s:new Date(today.getFullYear(),sm,1),e:new Date(today.getFullYear(),sm+6,0)};}
        case "lastSemester":{const sm=today.getMonth()<6?0:6;return{s:new Date(today.getFullYear(),sm-6,1),e:new Date(today.getFullYear(),sm,0)};}
        case "thisYear":return{s:new Date(today.getFullYear(),0,1),e:new Date(today.getFullYear(),11,31)};
        // To-date variants: from period start UP TO the reference date (today)
        case "mtd":return{s:new Date(today.getFullYear(),today.getMonth(),1),e:d0(today)};
        case "qtd":{const q=Math.floor(today.getMonth()/3);return{s:new Date(today.getFullYear(),q*3,1),e:d0(today)};}
        case "ytd":return{s:new Date(today.getFullYear(),0,1),e:d0(today)};
        default:return null;
    }
}

// dd-mm-yy(yy) text-input parsing, shared by both the inline date fields and the popup's.
export function parseDate(s:string):Date|null{
    const m=s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
    if(!m) return null;
    const y=+m[3]<100?2000+ +m[3]:+m[3];
    const r=new Date(y,+m[2]-1,+m[1]);
    return isNaN(r.getTime())?null:r;
}

// ISO-8601 week number (1-53), ISO weeks start Monday and week 1 contains the year's first Thursday.
export function isoWeekNumber(d:Date):number{
    const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
    const dayNum=(t.getUTCDay()+6)%7; t.setUTCDate(t.getUTCDate()-dayNum+3);
    const firstThursday=new Date(Date.UTC(t.getUTCFullYear(),0,4));
    const firstDayNum=(firstThursday.getUTCDay()+6)%7;
    firstThursday.setUTCDate(firstThursday.getUTCDate()-firstDayNum+3);
    return 1+Math.round((t.getTime()-firstThursday.getTime())/(7*86400000));
}
