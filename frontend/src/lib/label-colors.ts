/** WhatsApp label color palette (20 colors, indexed 0-19) */
export const WA_LABEL_COLORS = [
    '#00a884', '#53bdeb', '#009de2', '#ff9a00', '#d13b3b',
    '#a552a1', '#5bc5d1', '#fc7e7e', '#e8b830', '#e354c5',
    '#00d0b6', '#349ded', '#8c68e0', '#e56e56', '#a0d669',
    '#62c5e1', '#7e90e5', '#e89844', '#e873b0', '#6ccb78',
];

export function getLabelColor(colorIndex: number): string {
    return WA_LABEL_COLORS[colorIndex % WA_LABEL_COLORS.length];
}
