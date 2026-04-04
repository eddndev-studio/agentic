const LABEL_COLORS = ['#00a884','#53bdeb','#009de2','#ff9a00','#d13b3b','#a552a1','#5bc5d1','#fc7e7e','#e8b830','#e354c5','#00d0b6','#349ded','#8c68e0','#e56e56','#a0d669','#62c5e1','#7e90e5','#e89844','#e873b0','#6ccb78'];

export function formatDate(dateStr: string): string {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString();
}

export function formatTimeout(ms: number): string {
    const minutes = ms / (60 * 1000);
    if (minutes >= 1440 && minutes % 1440 === 0) {
        const days = minutes / 1440;
        return `${days} ${days === 1 ? 'day' : 'days'}`;
    }
    if (minutes >= 60 && minutes % 60 === 0) {
        const hours = minutes / 60;
        return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    }
    return `${minutes} min`;
}

export function getLabelColor(colorIndex: number): string {
    return LABEL_COLORS[colorIndex % LABEL_COLORS.length];
}

export function getLabelName(botLabels: any[], labelId: string): string {
    const lbl = botLabels.find((l: any) => l.id === labelId);
    return lbl ? lbl.name : labelId;
}
