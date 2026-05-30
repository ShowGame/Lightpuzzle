import { Color } from 'cc';
import { normalizeLightColorKey, resolveBeamColorKey } from '../Core/OpticalLightColor';

/** 光源方块填充色（含 S 层 3 的 Y/C/P） */
export function sourceFillColor(colorKey?: string): Color {
    switch (resolveBeamColorKey(colorKey)) {
        case 'red':
            return new Color(255, 90, 90, 255);
        case 'green':
            return new Color(90, 220, 120, 255);
        case 'blue':
            return new Color(90, 150, 255, 255);
        case 'yellow':
            return new Color(255, 210, 70, 255);
        case 'cyan':
            return new Color(70, 210, 220, 255);
        case 'purple':
            return new Color(170, 90, 255, 255);
        default:
            return new Color(240, 242, 248, 255);
    }
}

/** 目标未点亮：浅色弱化版，与地板对比可见，点亮后会更亮更饱和 */
export function targetDimFillColor(colorKey?: string): Color {
    switch (resolveBeamColorKey(colorKey)) {
        case 'red':
            return new Color(200, 158, 158, 255);
        case 'green':
            return new Color(158, 198, 168, 255);
        case 'blue':
            return new Color(158, 178, 210, 255);
        case 'yellow':
            return new Color(210, 198, 148, 255);
        case 'cyan':
            return new Color(148, 198, 205, 255);
        case 'purple':
            return new Color(188, 168, 210, 255);
        default:
            return new Color(198, 202, 214, 255);
    }
}

/** 通道元件臂/描边色（层 3 `W` 为中性灰，RGB 为对应染色） */
export function pieceChannelColors(colorKey?: string): { stroke: Color; fill: Color } {
    switch (normalizeLightColorKey(colorKey)) {
        case 'red':
            return {
                stroke: new Color(255, 110, 110, 255),
                fill: new Color(255, 110, 110, 165),
            };
        case 'green':
            return {
                stroke: new Color(100, 230, 130, 255),
                fill: new Color(100, 230, 130, 165),
            };
        case 'blue':
            return {
                stroke: new Color(100, 160, 255, 255),
                fill: new Color(100, 160, 255, 165),
            };
        default:
            return {
                stroke: new Color(200, 206, 220, 255),
                fill: new Color(200, 206, 220, 150),
            };
    }
}

/** 目标已点亮（与期望色一致，含 Y/C/P） */
export function targetLitFillColor(colorKey?: string): Color {
    switch (resolveBeamColorKey(colorKey)) {
        case 'red':
            return new Color(255, 100, 100, 255);
        case 'green':
            return new Color(100, 235, 140, 255);
        case 'blue':
            return new Color(100, 165, 255, 255);
        case 'yellow':
            return new Color(255, 220, 72, 255);
        case 'cyan':
            return new Color(72, 220, 230, 255);
        case 'purple':
            return new Color(180, 90, 255, 255);
        default:
            return new Color(250, 252, 255, 255);
    }
}
