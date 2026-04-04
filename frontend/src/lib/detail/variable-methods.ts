import { ApiClient } from '../api';

export function getVarValue(ctx: any, name: string): string {
    const found = ctx.variablesList.find((v: any) => v.key === name);
    return found ? found.value : '';
}

export function setVarValue(ctx: any, name: string, value: string) {
    const found = ctx.variablesList.find((v: any) => v.key === name);
    if (found) {
        found.value = value;
    } else {
        const def = ctx.templateVarDefs.find((d: any) => d.name === name);
        const type = def && ['image','video','audio','document'].includes(def.type) ? def.type : 'text';
        ctx.variablesList.push({ key: name, value, type });
    }
}

export async function saveVariables(ctx: any) {
    ctx.savingVariables = true;
    ctx.variablesSaved = false;
    try {
        const vars: Record<string, any> = {};
        for (const v of ctx.variablesList) {
            if (v.key.trim()) {
                if (v.type && v.type !== 'text') {
                    vars[v.key.trim()] = { type: 'media', value: v.value, mediaType: v.type };
                } else {
                    vars[v.key.trim()] = v.value;
                }
            }
        }
        const updated = await ApiClient.put(`/bots/${ctx.botId}`, {
            botVariables: vars,
        });
        ctx.bot = updated;
        window.__toast.success("Variables guardadas");
    } catch (e: any) {
        window.__toast.error("Error al guardar variables: " + (e.message || "Unknown error"));
    } finally {
        ctx.savingVariables = false;
    }
}

export async function saveTemplate(ctx: any) {
    ctx.savingTemplate = true;
    try {
        const updated = await ApiClient.put(`/bots/${ctx.botId}`, {
            templateId: ctx.bot.templateId || null,
        });
        ctx.bot = updated;

        if (ctx.bot.templateId) {
            const tpl = await ApiClient.get(`/templates/${ctx.bot.templateId}`);
            ctx.templateVarDefs = Array.isArray(tpl.variables) ? tpl.variables : [];
        } else {
            ctx.templateVarDefs = [];
        }
        window.__toast.success("Plantilla asignada");
    } catch (e: any) {
        window.__toast.error("Error al asignar plantilla: " + (e.message || "Unknown error"));
    } finally {
        ctx.savingTemplate = false;
    }
}
