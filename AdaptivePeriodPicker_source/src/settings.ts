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
    panelColor = new formattingSettings.ColorPicker({
        name: "panelColor",
        displayName: "Fundo de caixas / inputs",
        displayNameKey: "Prop_PanelColor",
        value: { value: "#16243f" }
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

    name: string = "dataColors";
    displayName: string = "Cores";
    displayNameKey: string = "Card_DataColors";
    slices: FormattingSettingsSlice[] = [
        this.backgroundColor, this.panelColor, this.accentColor,
        this.titleColor, this.valueColor, this.accentTextColor
    ];
}

class BorderCard extends FormattingSettingsCard {
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

    name: string = "border";
    displayName: string = "Rebordo";
    displayNameKey: string = "Card_Border";
    slices: FormattingSettingsSlice[] = [this.borderColor, this.borderWidth];
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
        value: { value: "popup", displayName: "Pop-up" }
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

    name: string = "displayMode";
    displayName: string = "Modo de Exibição";
    displayNameKey: string = "Card_DisplayMode";
    slices: FormattingSettingsSlice[] = [this.layoutMode, this.applyMode];
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
    scToday       = new formattingSettings.ToggleSwitch({ name:"scToday",       displayName:"Hoje",            displayNameKey:"Prop_ScToday",       value:true });
    scYesterday   = new formattingSettings.ToggleSwitch({ name:"scYesterday",   displayName:"Ontem",           displayNameKey:"Prop_ScYesterday",   value:true });
    scThisWeek    = new formattingSettings.ToggleSwitch({ name:"scThisWeek",    displayName:"Esta Semana",     displayNameKey:"Prop_ScThisWeek",    value:true });
    scLastWeek    = new formattingSettings.ToggleSwitch({ name:"scLastWeek",    displayName:"Semana Passada",  displayNameKey:"Prop_ScLastWeek",    value:true });
    scThisMonth   = new formattingSettings.ToggleSwitch({ name:"scThisMonth",   displayName:"Este Mês",        displayNameKey:"Prop_ScThisMonth",   value:true });
    scMtd         = new formattingSettings.ToggleSwitch({ name:"scMtd",         displayName:"Mês até à data",  displayNameKey:"Prop_ScMtd",         value:false });
    scQtd         = new formattingSettings.ToggleSwitch({ name:"scQtd",         displayName:"Trimestre até à data", displayNameKey:"Prop_ScQtd",    value:false });
    scYtd         = new formattingSettings.ToggleSwitch({ name:"scYtd",         displayName:"Ano até à data",  displayNameKey:"Prop_ScYtd",         value:true });
    scThisQuarter = new formattingSettings.ToggleSwitch({ name:"scThisQuarter", displayName:"Este Trimestre",  displayNameKey:"Prop_ScThisQuarter", value:true });
    scThisSemester= new formattingSettings.ToggleSwitch({ name:"scThisSemester",displayName:"Este Semestre",   displayNameKey:"Prop_ScThisSemester",value:true });
    scThisYear    = new formattingSettings.ToggleSwitch({ name:"scThisYear",    displayName:"Este Ano",        displayNameKey:"Prop_ScThisYear",    value:true });
    scDynamic     = new formattingSettings.ToggleSwitch({ name:"scDynamic",     displayName:"Últimos N",       displayNameKey:"Prop_ScDynamic",     value:true });

    name: string = "shortcuts";
    displayName: string = "Atalhos Visíveis";
    displayNameKey: string = "Card_Shortcuts";
    slices: FormattingSettingsSlice[] = [
        this.scToday, this.scYesterday, this.scThisWeek, this.scLastWeek,
        this.scThisMonth, this.scMtd, this.scQtd, this.scYtd,
        this.scThisQuarter, this.scThisSemester, this.scThisYear, this.scDynamic
    ];
}

class GranularityOptionsCard extends FormattingSettingsCard {
    granD = new formattingSettings.ToggleSwitch({ name:"granD", displayName:"Diário (D)",     displayNameKey:"Prop_GranD", value:true });
    granW = new formattingSettings.ToggleSwitch({ name:"granW", displayName:"Semanal (W)",    displayNameKey:"Prop_GranW", value:true });
    granM = new formattingSettings.ToggleSwitch({ name:"granM", displayName:"Mensal (M)",     displayNameKey:"Prop_GranM", value:true });
    granQ = new formattingSettings.ToggleSwitch({ name:"granQ", displayName:"Trimestral (Q)", displayNameKey:"Prop_GranQ", value:true });
    granS = new formattingSettings.ToggleSwitch({ name:"granS", displayName:"Semestral (S)",  displayNameKey:"Prop_GranS", value:true });
    granY = new formattingSettings.ToggleSwitch({ name:"granY", displayName:"Anual (Y)",      displayNameKey:"Prop_GranY", value:true });

    name: string = "granularityOptions";
    displayName: string = "Granularidades Visíveis";
    displayNameKey: string = "Card_GranularityOptions";
    slices: FormattingSettingsSlice[] = [this.granD, this.granW, this.granM, this.granQ, this.granS, this.granY];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    displayMode = new DisplayModeCard();
    dataColors = new DataColorsCard();
    border = new BorderCard();
    defaultPeriod = new DefaultPeriodCard();
    shortcuts = new ShortcutsCard();
    granularityOptions = new GranularityOptionsCard();
    cards = [this.displayMode, this.dataColors, this.border, this.defaultPeriod, this.shortcuts, this.granularityOptions];
}
