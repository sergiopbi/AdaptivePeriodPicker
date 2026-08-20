"use strict";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsModel = formattingSettings.Model;
import FormattingSettingsSlice = formattingSettings.Slice;

class DataColorsCard extends FormattingSettingsCard {
    backgroundColor = new formattingSettings.ColorPicker({
        name: "backgroundColor",
        displayName: "Fundo principal",
        displayNameKey: "Prop_BackgroundColor",
        value: { value: "#1e3055" }
    });
    backgroundOpacity = new formattingSettings.NumUpDown({
        name: "backgroundOpacity",
        displayName: "Transparência do fundo principal (%)",
        displayNameKey: "Prop_BackgroundOpacity",
        value: 0, options:{ minValue:{type:0,value:0}, maxValue:{type:1,value:100} }
    });
    panelColor = new formattingSettings.ColorPicker({
        name: "panelColor",
        displayName: "Fundo de caixas / inputs",
        displayNameKey: "Prop_PanelColor",
        value: { value: "#16243f" }
    });
    panelOpacity = new formattingSettings.NumUpDown({
        name: "panelOpacity",
        displayName: "Transparência do fundo de caixas (%)",
        displayNameKey: "Prop_PanelOpacity",
        value: 0, options:{ minValue:{type:0,value:0}, maxValue:{type:1,value:100} }
    });
    hoverRevealOpacity = new formattingSettings.NumUpDown({
        name: "hoverRevealOpacity",
        displayName: "Transparência da área expansível (%)",
        displayNameKey: "Prop_HoverRevealOpacity",
        description: "Só se aplica com \"Mostrar apenas ao passar o rato\" ativo (Modo de Exibição). Controla a transparência do fundo da zona que só aparece ao passar o rato — independente da transparência do fundo principal.",
        descriptionKey: "Prop_HoverRevealOpacity_Desc",
        value: 0, options:{ minValue:{type:0,value:0}, maxValue:{type:1,value:100} }
    });
    accentColor = new formattingSettings.ColorPicker({
        name: "accentColor",
        displayName: "Cor de destaque (seleção / botão aplicar)",
        displayNameKey: "Prop_AccentColor",
        value: { value: "#2d6bc4" }
    });
    titleColor = new formattingSettings.ColorPicker({
        name: "titleColor",
        displayName: "Cor de títulos / setas / texto secundário",
        displayNameKey: "Prop_TitleColor",
        value: { value: "#9ab0cc" }
    });
    valueColor = new formattingSettings.ColorPicker({
        name: "valueColor",
        displayName: "Cor de valores / texto principal",
        displayNameKey: "Prop_ValueColor",
        value: { value: "#ffffff" }
    });
    accentTextColor = new formattingSettings.ColorPicker({
        name: "accentTextColor",
        displayName: "Texto sobre a cor de destaque",
        displayNameKey: "Prop_AccentTextColor",
        value: { value: "#ffffff" }
    });
    fontFamilyGran = new formattingSettings.FontPicker({
        name: "fontFamilyGran",
        displayName: "Tipo de letra — Granularidade",
        displayNameKey: "Prop_FontFamilyGran",
        value: "Segoe UI"
    });
    fontSizeGran = new formattingSettings.NumUpDown({
        name: "fontSizeGran",
        displayName: "Tamanho — Granularidade (pt)",
        displayNameKey: "Prop_FontSizeGran",
        value: 7, options:{ minValue:{type:0,value:6}, maxValue:{type:1,value:16} }
    });
    fontFamilyShortcuts = new formattingSettings.FontPicker({
        name: "fontFamilyShortcuts",
        displayName: "Tipo de letra — Atalhos",
        displayNameKey: "Prop_FontFamilyShortcuts",
        value: "Segoe UI"
    });
    fontSizeShortcuts = new formattingSettings.NumUpDown({
        name: "fontSizeShortcuts",
        displayName: "Tamanho — Atalhos (pt)",
        displayNameKey: "Prop_FontSizeShortcuts",
        value: 9, options:{ minValue:{type:0,value:6}, maxValue:{type:1,value:16} }
    });
    fontFamilyContent = new formattingSettings.FontPicker({
        name: "fontFamilyContent",
        displayName: "Tipo de letra — Calendário",
        displayNameKey: "Prop_FontFamilyContent",
        value: "Segoe UI"
    });
    fontSizeContent = new formattingSettings.NumUpDown({
        name: "fontSizeContent",
        displayName: "Tamanho — Calendário (pt)",
        displayNameKey: "Prop_FontSizeContent",
        value: 9, options:{ minValue:{type:0,value:6}, maxValue:{type:1,value:16} }
    });
    fontFamilySide = new formattingSettings.FontPicker({
        name: "fontFamilySide",
        displayName: "Tipo de letra — Painel de Controlo",
        displayNameKey: "Prop_FontFamilySide",
        value: "Segoe UI"
    });
    fontSizeSide = new formattingSettings.NumUpDown({
        name: "fontSizeSide",
        displayName: "Tamanho — Painel de Controlo (pt)",
        displayNameKey: "Prop_FontSizeSide",
        value: 9, options:{ minValue:{type:0,value:6}, maxValue:{type:1,value:16} }
    });
    borderColor = new formattingSettings.ColorPicker({
        name: "borderColor",
        displayName: "Cor do rebordo",
        displayNameKey: "Prop_BorderColor",
        value: { value: "#2d4470" }
    });
    borderWidth = new formattingSettings.NumUpDown({
        name: "borderWidth",
        displayName: "Espessura do rebordo (px)",
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

    name: string = "dataColors";
    displayName: string = "Cores e Texto";
    displayNameKey: string = "Card_DataColors";
    slices: FormattingSettingsSlice[] = [
        this.backgroundColor, this.backgroundOpacity, this.panelColor, this.panelOpacity, this.hoverRevealOpacity, this.accentColor,
        this.titleColor, this.valueColor, this.accentTextColor,
        this.fontFamilyGran, this.fontSizeGran,
        this.fontFamilyShortcuts, this.fontSizeShortcuts,
        this.fontFamilyContent, this.fontSizeContent,
        this.fontFamilySide, this.fontSizeSide,
        this.borderColor, this.borderWidth,
        this.resizerColor, this.resizerThickness
    ];
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

    granD = new formattingSettings.ToggleSwitch({ name:"granD", displayName:"Diário (D)",     displayNameKey:"Prop_GranD", value:true });

    granW = new formattingSettings.ToggleSwitch({ name:"granW", displayName:"Semanal (W)",    displayNameKey:"Prop_GranW", value:true });
    granWThreshold = new formattingSettings.NumUpDown({
        name:"granWThreshold", displayName:"W — mínimo de semanas", displayNameKey:"Prop_GranWThreshold",
        value:2, options:{ minValue:{type:0,value:1}, maxValue:{type:1,value:52} }
    });

    granM = new formattingSettings.ToggleSwitch({ name:"granM", displayName:"Mensal (M)",     displayNameKey:"Prop_GranM", value:true });
    granMThreshold = new formattingSettings.NumUpDown({
        name:"granMThreshold", displayName:"M — mínimo de meses", displayNameKey:"Prop_GranMThreshold",
        value:2, options:{ minValue:{type:0,value:1}, maxValue:{type:1,value:24} }
    });

    granQ = new formattingSettings.ToggleSwitch({ name:"granQ", displayName:"Trimestral (Q)", displayNameKey:"Prop_GranQ", value:true });
    granQThreshold = new formattingSettings.NumUpDown({
        name:"granQThreshold", displayName:"Q — mínimo de trimestres", displayNameKey:"Prop_GranQThreshold",
        value:2, options:{ minValue:{type:0,value:1}, maxValue:{type:1,value:16} }
    });

    granS = new formattingSettings.ToggleSwitch({ name:"granS", displayName:"Semestral (S)",  displayNameKey:"Prop_GranS", value:true });
    granSThreshold = new formattingSettings.NumUpDown({
        name:"granSThreshold", displayName:"S — mínimo de semestres", displayNameKey:"Prop_GranSThreshold",
        value:2, options:{ minValue:{type:0,value:1}, maxValue:{type:1,value:12} }
    });

    granY = new formattingSettings.ToggleSwitch({ name:"granY", displayName:"Anual (Y)",      displayNameKey:"Prop_GranY", value:true });
    granYThreshold = new formattingSettings.NumUpDown({
        name:"granYThreshold", displayName:"Y — mínimo de anos", displayNameKey:"Prop_GranYThreshold",
        value:2, options:{ minValue:{type:0,value:1}, maxValue:{type:1,value:10} }
    });

    name: string = "granularityOptions";
    displayName: string = "Granularidades Visíveis";
    displayNameKey: string = "Card_GranularityOptions";
    slices: FormattingSettingsSlice[] = [
        this.autoGranularity,
        this.showAutoGranToggle,
        this.granD,
        this.granW, this.granWThreshold,
        this.granM, this.granMThreshold,
        this.granQ, this.granQThreshold,
        this.granS, this.granSThreshold,
        this.granY, this.granYThreshold
    ];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    displayMode = new DisplayModeCard();
    dataColors = new DataColorsCard();
    defaultPeriod = new DefaultPeriodCard();
    shortcuts = new ShortcutsCard();
    granularityOptions = new GranularityOptionsCard();
    cards = [this.displayMode, this.dataColors, this.defaultPeriod, this.shortcuts, this.granularityOptions];
}
