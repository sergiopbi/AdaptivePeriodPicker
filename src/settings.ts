"use strict";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsCompositeCard = formattingSettings.CompositeCard;
import FormattingSettingsGroup = formattingSettings.Group;
import FormattingSettingsModel = formattingSettings.Model;
import FormattingSettingsSlice = formattingSettings.Slice;

// ── GLOBAL STYLE: only what is truly generic / shared structure — never a
// per-zone "look" choice:
// - Font family: one typeface for the whole widget (each zone below still
//   has its own font SIZE, since that genuinely varies by how much room a
//   zone has — but mixing typefaces zone-to-zone was never wanted).
// - Main background: the widget's own base surface, behind every zone —
//   only actually visible where a zone's own background (in "Zonas",
//   below) is itself semi-transparent or fully off, since by default
//   every zone fully covers whatever sits behind it. Think of it as the
//   bottom-most layer, not a shortcut for "recolor everything at once".
// - Divider lines between zones + drag-resizer handles: these sit BETWEEN
//   zones, so they don't belong to any single one.
// Every color that's actually about how one zone LOOKS — background,
// selection/accent, idle vs. selected text, values — now lives in that
// zone, in "Zonas", so changing it has an effect you can actually see and
// predict, instead of one shared knob touching all five zones at once.
class GlobalStyleCard extends FormattingSettingsCard {
    fontFamily = new formattingSettings.FontPicker({
        name: "fontFamily",
        displayName: "Tipo de letra",
        displayNameKey: "Prop_FontFamily",
        description: "Usado em todo o widget — granularidade, datas, atalhos, calendário e painel de controlo. O tamanho da letra continua configurável por zona (em \"Zonas\").",
        descriptionKey: "Prop_FontFamily_Desc",
        value: "Segoe UI"
    });
    backgroundColor = new formattingSettings.ColorPicker({
        name: "backgroundColor",
        displayName: "Fundo principal (camada de base)",
        displayNameKey: "Prop_BackgroundColor",
        description: "A camada mais ao fundo de tudo — só fica visível nas zonas (em \"Zonas\", abaixo) que estiverem total ou parcialmente transparentes. Por omissão as zonas cobrem tudo, por isso mudar esta cor sozinha pode não ter efeito visível nenhum: é normal, não é um erro — reduza a opacidade de uma zona para ver esta cor aparecer por trás dela.",
        descriptionKey: "Prop_BackgroundColor_Desc",
        value: { value: "#1e3055" }
    });
    backgroundOpacity = new formattingSettings.NumUpDown({
        name: "backgroundOpacity",
        displayName: "Transparência do fundo principal (%)",
        displayNameKey: "Prop_BackgroundOpacity",
        value: 0, options:{ minValue:{type:0,value:0}, maxValue:{type:1,value:100} }
    });
    hoverRevealOpacity = new formattingSettings.NumUpDown({
        name: "hoverRevealOpacity",
        displayName: "Transparência da área expansível (%)",
        displayNameKey: "Prop_HoverRevealOpacity",
        description: "Só se aplica com \"Mostrar apenas ao passar o rato\" ativo (Modo de Exibição). Controla a transparência do espaço em branco que fica enquanto os Atalhos/Calendário/Painel de controlo estão escondidos — cada uma dessas zonas mantém o seu próprio fundo (em \"Zonas\") quando aparece.",
        descriptionKey: "Prop_HoverRevealOpacity_Desc",
        value: 0, options:{ minValue:{type:0,value:0}, maxValue:{type:1,value:100} }
    });
    borderColor = new formattingSettings.ColorPicker({
        name: "borderColor",
        displayName: "Cor das linhas divisórias entre zonas",
        displayNameKey: "Prop_BorderColor",
        value: { value: "#2d4470" }
    });
    borderWidth = new formattingSettings.NumUpDown({
        name: "borderWidth",
        displayName: "Espessura das linhas divisórias (px)",
        displayNameKey: "Prop_BorderWidth",
        value: 1
    });
    resizerColor = new formattingSettings.ColorPicker({
        name: "resizerColor",
        displayName: "Cor dos separadores de arrasto",
        displayNameKey: "Prop_ResizerColor",
        value: { value: "#2d4470" }
    });
    resizerThickness = new formattingSettings.NumUpDown({
        name: "resizerThickness",
        displayName: "Espessura dos separadores de arrasto (px)",
        displayNameKey: "Prop_ResizerThickness",
        value: 1, options:{ minValue:{type:0,value:1}, maxValue:{type:1,value:4} }
    });

    name: string = "globalStyle";
    displayName: string = "Estilo Global";
    displayNameKey: string = "Card_GlobalStyle";
    slices: FormattingSettingsSlice[] = [
        this.fontFamily,
        this.backgroundColor, this.backgroundOpacity, this.hoverRevealOpacity,
        this.borderColor, this.borderWidth,
        this.resizerColor, this.resizerThickness
    ];
}

// ── ZONES: one collapsible group per visually distinct area of the visual —
// the same pattern native Power BI visuals use for e.g. "X axis"/"Y axis"/
// "Data colors" — each zone fully self-contained (see pbi-custom-visuals
// skill §2: CompositeCard + Group binds every property to the CARD's name
// in capabilities.json, never the Group's, so this is ONE object holding
// every property below, flat, zoneXxx-prefixed to avoid collisions).
//
// Every zone has, at minimum: its own background + transparency ("Fundo da
// zona"), corner radius ("forma"), box size (like the Chiclet Slicer's tile
// size), font size, and its own full set of 4 colors — selected/destaque,
// text-on-selected, não-selecionado (idle/secondary) and valores (primary
// text) — previously these 4 lived once in Estilo Global and applied
// everywhere at once; now each zone has its own, so changing e.g. the
// Calendário's selection color never touches the Granularidade bar's.
//
// Three zones (Granularidade, Datas, Atalhos) ALSO get a second, independent
// "Fundo das caixas" — this is the fix for the reported bug: the zone's
// outer shape (the bar/panel behind everything) and the background of the
// individual clickable boxes inside it used to be the SAME color variable,
// so making the outer shape transparent (to show a custom page background
// through) also stripped the background off every unselected box, which was
// never wanted. Now they're independent — you can keep a background on each
// granularity letter while hiding the pill-shaped strip behind the whole
// row, or the reverse. The other two zones (Calendário, Painel de Controlo)
// don't have this split: their individual elements (day/period cells,
// buttons) already use selection/hover-state colors of their own, not the
// zone's background, so there's nothing to decouple.
function zoneGroup(
    key: string, groupDisplayName: string,
    defaults: { color:string, opacity:number, radius:number, fontSize:number, fontMin:number, fontMax:number, boxSize:number, boxSizeMin:number, boxSizeMax:number },
    box?: { color:string, opacity:number, label:string }
): { group: FormattingSettingsGroup, slices: { color:any, opacity:any, radius:any, fontSize:any, boxSize:any, selectedColor:any, selectedTextColor:any, unselectedColor:any, valueColor:any, boxColor?:any, boxOpacity?:any } } {
    const color = new formattingSettings.ColorPicker({
        name: `zone${key}Color`, displayName: "Fundo da zona", displayNameKey: `Prop_Zone${key}Color`,
        value: { value: defaults.color }
    });
    const opacity = new formattingSettings.NumUpDown({
        name: `zone${key}Opacity`, displayName: "Transparência da zona (%)", displayNameKey: `Prop_Zone${key}Opacity`,
        value: defaults.opacity, options:{ minValue:{type:0,value:0}, maxValue:{type:1,value:100} }
    });
    const radius = new formattingSettings.NumUpDown({
        name: `zone${key}Radius`, displayName: "Arredondamento dos cantos (px)", displayNameKey: `Prop_Zone${key}Radius`,
        value: defaults.radius, options:{ minValue:{type:0,value:0}, maxValue:{type:1,value:24} }
    });
    const boxSize = new formattingSettings.NumUpDown({
        name: `zone${key}BoxSize`, displayName: "Tamanho da caixa (px)", displayNameKey: `Prop_Zone${key}BoxSize`,
        value: defaults.boxSize, options:{ minValue:{type:0,value:defaults.boxSizeMin}, maxValue:{type:1,value:defaults.boxSizeMax} }
    });
    const fontSize = new formattingSettings.NumUpDown({
        name: `zone${key}FontSize`, displayName: "Tamanho da letra (pt)", displayNameKey: `Prop_Zone${key}FontSize`,
        value: defaults.fontSize, options:{ minValue:{type:0,value:defaults.fontMin}, maxValue:{type:1,value:defaults.fontMax} }
    });
    const selectedColor = new formattingSettings.ColorPicker({
        name: `zone${key}SelectedColor`, displayName: "Cor selecionada / destaque", displayNameKey: `Prop_Zone${key}SelectedColor`,
        description: "A cor do elemento ativo/selecionado nesta zona (botão de granularidade ativo, dia selecionado, atalho ativo, botão Aplicar, etc.).",
        descriptionKey: `Prop_Zone${key}SelectedColor_Desc`,
        value: { value: "#2d6bc4" }
    });
    const selectedTextColor = new formattingSettings.ColorPicker({
        name: `zone${key}SelectedTextColor`, displayName: "Texto sobre a cor selecionada", displayNameKey: `Prop_Zone${key}SelectedTextColor`,
        value: { value: "#ffffff" }
    });
    const unselectedColor = new formattingSettings.ColorPicker({
        name: `zone${key}UnselectedColor`, displayName: "Cor não selecionada / texto secundário", displayNameKey: `Prop_Zone${key}UnselectedColor`,
        description: "A cor de tudo o que NÃO está selecionado nesta zona — texto, ícones, setas e contornos em repouso.",
        descriptionKey: `Prop_Zone${key}UnselectedColor_Desc`,
        value: { value: "#9ab0cc" }
    });
    const valueColor = new formattingSettings.ColorPicker({
        name: `zone${key}ValueColor`, displayName: "Cor de valores / texto principal", displayNameKey: `Prop_Zone${key}ValueColor`,
        value: { value: "#ffffff" }
    });
    const slices: FormattingSettingsSlice[] = [color, opacity, radius, boxSize, fontSize, selectedColor, selectedTextColor, unselectedColor, valueColor];
    const result: { group: FormattingSettingsGroup, slices: { color:any, opacity:any, radius:any, fontSize:any, boxSize:any, selectedColor:any, selectedTextColor:any, unselectedColor:any, valueColor:any, boxColor?:any, boxOpacity?:any } } =
        { group: undefined as any, slices: { color, opacity, radius, fontSize, boxSize, selectedColor, selectedTextColor, unselectedColor, valueColor } };
    if (box) {
        const boxColor = new formattingSettings.ColorPicker({
            name: `zone${key}BoxColor`, displayName: "Fundo das caixas", displayNameKey: `Prop_Zone${key}BoxColor`,
            description: box.label, descriptionKey: `Prop_Zone${key}BoxColor_Desc`,
            value: { value: box.color }
        });
        const boxOpacity = new formattingSettings.NumUpDown({
            name: `zone${key}BoxOpacity`, displayName: "Transparência das caixas (%)", displayNameKey: `Prop_Zone${key}BoxOpacity`,
            value: box.opacity, options:{ minValue:{type:0,value:0}, maxValue:{type:1,value:100} }
        });
        slices.push(boxColor, boxOpacity);
        result.slices.boxColor = boxColor;
        result.slices.boxOpacity = boxOpacity;
    }
    result.group = new FormattingSettingsGroup({
        name: `zone${key}`, displayName: groupDisplayName, displayNameKey: `Group_Zone${key}`,
        collapsible: true, slices
    });
    return result;
}

class ZonesCard extends FormattingSettingsCompositeCard {
    gran = zoneGroup("Gran", "Granularidade",
        { color:"#16243f", opacity:0,   radius:5, fontSize:7, fontMin:6, fontMax:16, boxSize:5, boxSizeMin:0, boxSizeMax:20 },
        { color:"#16243f", opacity:100, label:"Fundo de cada letra (D/S/M/T/SM/A), independente do fundo da zona acima — por omissão invisível, tal como sempre foi." }
    );
    dates = zoneGroup("Dates", "Datas Início/Fim",
        { color:"#16243f", opacity:100, radius:5, fontSize:9, fontMin:6, fontMax:16, boxSize:3, boxSizeMin:0, boxSizeMax:20 },
        { color:"#16243f", opacity:40, label:"Fundo de cada caixa de data (Início / Fim), independente do fundo da zona acima." }
    );
    shortcuts = zoneGroup("Shortcuts", "Atalhos",
        { color:"#16243f", opacity:65, radius:4, fontSize:9, fontMin:6, fontMax:16, boxSize:8, boxSizeMin:0, boxSizeMax:20 },
        { color:"#16243f", opacity:65, label:"Fundo da caixa numérica do atalho \"Últimos N\", independente do fundo da zona acima." }
    );
    cal = zoneGroup("Cal", "Seleção de Períodos (Calendário)",
        { color:"#16243f", opacity:100, radius:6, fontSize:9, fontMin:6, fontMax:16, boxSize:24, boxSizeMin:16, boxSizeMax:48 }
    );
    control = zoneGroup("Control", "Painel de Controlo",
        { color:"#16243f", opacity:0, radius:5, fontSize:9, fontMin:6, fontMax:16, boxSize:5, boxSizeMin:0, boxSizeMax:20 }
    );

    name: string = "zonesCard";
    displayName: string = "Zonas — Cores, Forma, Tamanho e Texto";
    displayNameKey: string = "Card_ZonesCard";
    groups: FormattingSettingsGroup[] = [this.gran.group, this.dates.group, this.shortcuts.group, this.cal.group, this.control.group];
}

class DisplayModeCard extends FormattingSettingsCard {
    layoutMode = new formattingSettings.ItemDropdown({
        name: "layoutMode",
        displayName: "Modo de exibição",
        displayNameKey: "Prop_LayoutMode",
        description: "Pop-up: abre um diálogo nativo do Power BI ao clicar (pode mostrar aviso 'não mostrar novamente'). Inline Vertical: calendário sempre visível, layout em coluna. Inline Horizontal: calendário sempre visível, layout em linha — pensado para barras largas e baixas no topo da página.",
        descriptionKey: "Prop_LayoutMode_Desc",
        items: [
            { value: "popup", displayName: "Pop-up" },
            { value: "inline-vertical", displayName: "Inline Vertical" },
            { value: "inline-horizontal", displayName: "Inline Horizontal" }
        ],
        value: { value: "inline-horizontal", displayName: "Inline Horizontal" }
    });

    applyMode = new formattingSettings.ItemDropdown({
        name: "applyMode",
        displayName: "Modo de aplicação",
        displayNameKey: "Prop_ApplyMode",
        description: "Imediato: clicar num atalho (ou no 2.º clique de uma seleção manual) aplica o filtro logo, sem botões. Confirmar: mostra os botões Aplicar/Cancelar e o filtro só é aplicado ao confirmar.",
        descriptionKey: "Prop_ApplyMode_Desc",
        items: [
            { value: "immediate", displayName: "Imediato" },
            { value: "confirm", displayName: "Confirmar" }
        ],
        value: { value: "immediate", displayName: "Imediato" }
    });

    hoverExpand = new formattingSettings.ToggleSwitch({
        name: "hoverExpand",
        displayName: "Mostrar apenas ao passar o rato",
        displayNameKey: "Prop_HoverExpand",
        description: "Só se aplica no modo Inline Vertical. Por defeito mostra só a granularidade e as datas de Início/Fim — os atalhos, a grelha do calendário e o rodapé só aparecem enquanto o rato estiver por cima do visual. O tamanho do próprio visual no relatório não muda; isto só mostra/esconde conteúdo dentro do espaço que já lá está.",
        descriptionKey: "Prop_HoverExpand_Desc",
        value: false
    });

    lockResizers = new formattingSettings.ToggleSwitch({
        name: "lockResizers",
        displayName: "Bloquear tamanhos (separadores de arrasto)",
        displayNameKey: "Prop_LockResizers",
        description: "Ajuste os separadores de arrasto (atalhos, calendário, Início/Fim, etc.) enquanto esta opção está desativada; depois de ficar satisfeito com os tamanhos, ative-a para os fixar nesse estado — os separadores deixam de responder a arrastar ou duplo clique, tanto para si como para quem vir o relatório publicado. Exceção: o separador do painel de atalhos mantém-se sempre livre, mesmo com isto ativo.",
        descriptionKey: "Prop_LockResizers_Desc",
        value: false
    });

    popupWidth = new formattingSettings.NumUpDown({
        name: "popupWidth",
        displayName: "Largura do pop-up (px)",
        displayNameKey: "Prop_PopupWidth",
        description: "Só se aplica no modo Pop-up. O mínimo absoluto permitido pelo Power BI é 240px, mas por baixo de ~380px a barra de atalhos e a grelha do calendário deste diálogo começam a não caber e pode voltar a aparecer scroll horizontal.",
        descriptionKey: "Prop_PopupWidth_Desc",
        value: 480,
        options: {
            minValue: { type: 0, value: 240 },
            maxValue: { type: 1, value: 700 }
        }
    });

    popupHeight = new formattingSettings.NumUpDown({
        name: "popupHeight",
        displayName: "Altura do pop-up (px)",
        displayNameKey: "Prop_PopupHeight",
        value: 440,
        options: {
            minValue: { type: 0, value: 210 },
            maxValue: { type: 1, value: 600 }
        }
    });

    popupHorizontalAnchor = new formattingSettings.ItemDropdown({
        name: "popupHorizontalAnchor",
        displayName: "Lado de abertura do pop-up",
        displayNameKey: "Prop_PopupHorizontalAnchor",
        description: "O Power BI não permite a este visual detetar sozinho onde está colocado na página, por isso é preciso indicar manualmente: \"Direita\" estica o pop-up para a direita a partir do visual (bom se o visual estiver perto da margem esquerda); \"Esquerda\" estica-o para a esquerda a partir do visual (bom se estiver perto da margem direita).",
        descriptionKey: "Prop_PopupHorizontalAnchor_Desc",
        items: [
            { value: "right", displayName: "Direita (a partir do visual)" },
            { value: "left", displayName: "Esquerda (a partir do visual)" }
        ],
        value: { value: "right", displayName: "Direita (a partir do visual)" }
    });

    name: string = "displayMode";
    displayName: string = "Modo de Exibição";
    displayNameKey: string = "Card_DisplayMode";
    slices: FormattingSettingsSlice[] = [this.layoutMode, this.applyMode, this.hoverExpand, this.lockResizers, this.popupWidth, this.popupHeight, this.popupHorizontalAnchor];
}

class DefaultPeriodCard extends FormattingSettingsCard {
    defaultType = new formattingSettings.ItemDropdown({
        name: "defaultType",
        displayName: "Período predefinido",
        displayNameKey: "Prop_DefaultType",
        description: "Define o período aplicado pelo botão de atualização (⟳). 'Últimos N' usa o número abaixo, sensível à granularidade.",
        descriptionKey: "Prop_DefaultType_Desc",
        items: [
            { value: "today",        displayName: "Hoje" },
            { value: "yesterday",    displayName: "Ontem" },
            { value: "thisWeek",     displayName: "Esta Semana" },
            { value: "lastWeek",     displayName: "Semana Passada" },
            { value: "thisMonth",    displayName: "Este Mês" },
            { value: "mtd",          displayName: "Mês até à data (MTD)" },
            { value: "qtd",          displayName: "Trimestre até à data (QTD)" },
            { value: "ytd",          displayName: "Ano até à data (YTD)" },
            { value: "thisQuarter",  displayName: "Este Trimestre" },
            { value: "thisSemester", displayName: "Este Semestre" },
            { value: "thisYear",     displayName: "Este Ano" },
            { value: "dynamic",      displayName: "Últimos N (por granularidade)" }
        ],
        value: { value: "dynamic", displayName: "Últimos N (por granularidade)" }
    });

    name: string = "defaultPeriod";
    displayName: string = "Período Predefinido";
    displayNameKey: string = "Card_DefaultPeriod";
    slices: FormattingSettingsSlice[] = [this.defaultType];
}

class ShortcutsCard extends FormattingSettingsCard {
    scShowAll     = new formattingSettings.ToggleSwitch({ name:"scShowAll",     displayName:"Mostrar atalhos", displayNameKey:"Prop_ScShowAll",     value:true });
    scToday       = new formattingSettings.ToggleSwitch({ name:"scToday",       displayName:"Hoje",            displayNameKey:"Prop_ScToday",       value:true });
    scYesterday   = new formattingSettings.ToggleSwitch({ name:"scYesterday",   displayName:"Ontem",           displayNameKey:"Prop_ScYesterday",   value:true });
    scThisWeek    = new formattingSettings.ToggleSwitch({ name:"scThisWeek",    displayName:"Esta Semana",     displayNameKey:"Prop_ScThisWeek",    value:true });
    scLastWeek    = new formattingSettings.ToggleSwitch({ name:"scLastWeek",    displayName:"Semana Passada",  displayNameKey:"Prop_ScLastWeek",    value:true });
    scThisMonth   = new formattingSettings.ToggleSwitch({ name:"scThisMonth",   displayName:"Este Mês",        displayNameKey:"Prop_ScThisMonth",   value:true });
    scLastMonth   = new formattingSettings.ToggleSwitch({ name:"scLastMonth",   displayName:"Mês Passado",     displayNameKey:"Prop_ScLastMonth",   value:true });
    scMtd         = new formattingSettings.ToggleSwitch({ name:"scMtd",         displayName:"Mês até à data",  displayNameKey:"Prop_ScMtd",         value:false });
    scQtd         = new formattingSettings.ToggleSwitch({ name:"scQtd",         displayName:"Trimestre até à data", displayNameKey:"Prop_ScQtd",    value:false });
    scYtd         = new formattingSettings.ToggleSwitch({ name:"scYtd",         displayName:"Ano até à data",  displayNameKey:"Prop_ScYtd",         value:true });
    scThisQuarter = new formattingSettings.ToggleSwitch({ name:"scThisQuarter", displayName:"Este Trimestre",  displayNameKey:"Prop_ScThisQuarter", value:true });
    scLastQuarter = new formattingSettings.ToggleSwitch({ name:"scLastQuarter", displayName:"Trimestre Passado", displayNameKey:"Prop_ScLastQuarter", value:true });
    scThisSemester= new formattingSettings.ToggleSwitch({ name:"scThisSemester",displayName:"Este Semestre",   displayNameKey:"Prop_ScThisSemester",value:true });
    scLastSemester= new formattingSettings.ToggleSwitch({ name:"scLastSemester",displayName:"Semestre Passado",displayNameKey:"Prop_ScLastSemester",value:true });
    scThisYear    = new formattingSettings.ToggleSwitch({ name:"scThisYear",    displayName:"Este Ano",        displayNameKey:"Prop_ScThisYear",    value:true });
    scDynamic     = new formattingSettings.ToggleSwitch({ name:"scDynamic",     displayName:"Últimos N",       displayNameKey:"Prop_ScDynamic",     value:true });

    name: string = "shortcuts";
    displayName: string = "Atalhos Visíveis";
    displayNameKey: string = "Card_Shortcuts";
    topLevelSlice = this.scShowAll;
    slices: FormattingSettingsSlice[] = [
        this.scToday, this.scYesterday, this.scThisWeek, this.scLastWeek,
        this.scThisMonth, this.scLastMonth, this.scMtd, this.scQtd, this.scYtd,
        this.scThisQuarter, this.scLastQuarter, this.scThisSemester, this.scLastSemester, this.scThisYear, this.scDynamic
    ];
}

class GranularityOptionsCard extends FormattingSettingsCard {
    autoGranularity = new formattingSettings.ToggleSwitch({
        name:"autoGranularity", displayName:"Granularidade automática",
        displayNameKey:"Prop_AutoGranularity",
        description:"Ligado: a granularidade escolhida acima é só uma sugestão — se o intervalo selecionado tiver poucos pontos nesse nível (ou esse nível estiver desligado), desce automaticamente para o próximo nível disponível. A grelha mostrada nunca muda sozinha; só o filtro efetivo enviado aos outros visuais é que pode ser diferente do nível clicado. Desligado: força sempre o nível escolhido, sem downgrade nenhum. Este é o valor inicial — se o interruptor abaixo estiver visível, o utilizador pode mudar isto durante a sessão.",
        descriptionKey:"Prop_AutoGranularity_Desc",
        value:true
    });

    showAutoGranToggle = new formattingSettings.ToggleSwitch({
        name:"showAutoGranToggle", displayName:"Mostrar interruptor Automático/Manual ao utilizador",
        displayNameKey:"Prop_ShowAutoGranToggle",
        description:"Mostra, dentro do próprio seletor, um interruptor que permite a quem vê o relatório trocar entre granularidade automática e manual (com escolha livre, dentro das granularidades visíveis). A escolha não fica gravada — reinicia sempre no valor de \"Granularidade automática\" acima ao reabrir o relatório.",
        descriptionKey:"Prop_ShowAutoGranToggle_Desc",
        value:false
    });

    // Per-letter custom text, right next to each granularity's own visibility — used to
    // live in a separate "Texto da Granularidade" card, which just meant jumping between
    // two places to configure one level. Leave blank for the automatic PT/EN label
    // (translated per the report's language); type anything to override it.
    granD = new formattingSettings.ToggleSwitch({ name:"granD", displayName:"Diário (D)",     displayNameKey:"Prop_GranD", value:true });
    granLabelD = new formattingSettings.TextInput({
        name: "granLabelD", displayName: "D — texto do botão", displayNameKey: "Prop_GranLabelD",
        placeholder: "Automático (D)", value: ""
    });

    granW = new formattingSettings.ToggleSwitch({ name:"granW", displayName:"Semanal (W)",    displayNameKey:"Prop_GranW", value:true });
    granWThreshold = new formattingSettings.NumUpDown({
        name:"granWThreshold", displayName:"W — mínimo de semanas", displayNameKey:"Prop_GranWThreshold",
        value:2, options:{ minValue:{type:0,value:1}, maxValue:{type:1,value:52} }
    });
    granLabelW = new formattingSettings.TextInput({
        name: "granLabelW", displayName: "W — texto do botão", displayNameKey: "Prop_GranLabelW",
        placeholder: "Automático (S / W)", value: ""
    });

    granM = new formattingSettings.ToggleSwitch({ name:"granM", displayName:"Mensal (M)",     displayNameKey:"Prop_GranM", value:true });
    granMThreshold = new formattingSettings.NumUpDown({
        name:"granMThreshold", displayName:"M — mínimo de meses", displayNameKey:"Prop_GranMThreshold",
        value:2, options:{ minValue:{type:0,value:1}, maxValue:{type:1,value:24} }
    });
    granLabelM = new formattingSettings.TextInput({
        name: "granLabelM", displayName: "M — texto do botão", displayNameKey: "Prop_GranLabelM",
        placeholder: "Automático (M)", value: ""
    });

    granQ = new formattingSettings.ToggleSwitch({ name:"granQ", displayName:"Trimestral (Q)", displayNameKey:"Prop_GranQ", value:true });
    granQThreshold = new formattingSettings.NumUpDown({
        name:"granQThreshold", displayName:"Q — mínimo de trimestres", displayNameKey:"Prop_GranQThreshold",
        value:2, options:{ minValue:{type:0,value:1}, maxValue:{type:1,value:16} }
    });
    granLabelQ = new formattingSettings.TextInput({
        name: "granLabelQ", displayName: "Q — texto do botão", displayNameKey: "Prop_GranLabelQ",
        placeholder: "Automático (T / Q)", value: ""
    });

    granS = new formattingSettings.ToggleSwitch({ name:"granS", displayName:"Semestral (S)",  displayNameKey:"Prop_GranS", value:true });
    granSThreshold = new formattingSettings.NumUpDown({
        name:"granSThreshold", displayName:"S — mínimo de semestres", displayNameKey:"Prop_GranSThreshold",
        value:2, options:{ minValue:{type:0,value:1}, maxValue:{type:1,value:12} }
    });
    granLabelS = new formattingSettings.TextInput({
        name: "granLabelS", displayName: "S — texto do botão", displayNameKey: "Prop_GranLabelS",
        placeholder: "Automático (SM / S)", value: ""
    });

    granY = new formattingSettings.ToggleSwitch({ name:"granY", displayName:"Anual (Y)",      displayNameKey:"Prop_GranY", value:true });
    granYThreshold = new formattingSettings.NumUpDown({
        name:"granYThreshold", displayName:"Y — mínimo de anos", displayNameKey:"Prop_GranYThreshold",
        value:2, options:{ minValue:{type:0,value:1}, maxValue:{type:1,value:10} }
    });
    granLabelY = new formattingSettings.TextInput({
        name: "granLabelY", displayName: "Y — texto do botão", displayNameKey: "Prop_GranLabelY",
        placeholder: "Automático (A / Y)", value: ""
    });

    name: string = "granularityOptions";
    displayName: string = "Granularidades Visíveis";
    displayNameKey: string = "Card_GranularityOptions";
    description = "Cada granularidade: se está visível, o mínimo de pontos para a granularidade automática a escolher, e o texto mostrado no respetivo botão (em branco = automático, traduzido conforme o idioma do relatório).";
    descriptionKey = "Card_GranularityOptions_Desc";
    slices: FormattingSettingsSlice[] = [
        this.autoGranularity,
        this.showAutoGranToggle,
        this.granD, this.granLabelD,
        this.granW, this.granWThreshold, this.granLabelW,
        this.granM, this.granMThreshold, this.granLabelM,
        this.granQ, this.granQThreshold, this.granLabelQ,
        this.granS, this.granSThreshold, this.granLabelS,
        this.granY, this.granYThreshold, this.granLabelY
    ];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    displayMode = new DisplayModeCard();
    globalStyle = new GlobalStyleCard();
    zonesCard = new ZonesCard();
    defaultPeriod = new DefaultPeriodCard();
    shortcuts = new ShortcutsCard();
    granularityOptions = new GranularityOptionsCard();
    cards = [this.displayMode, this.globalStyle, this.zonesCard, this.defaultPeriod, this.shortcuts, this.granularityOptions];
}
