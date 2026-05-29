import { Color } from 'cc';
import { normalizeLightColorKey } from '../Core/OpticalLightColor';

/** 光源方块填充色 */
export function sourceFillColor(colorKey?: string): Color {
    switch (normalizeLightColorKey(colorKey)) {
        case 'red':
            return new Color(255, 90, 90, 255);
        case 'green':
            return new Color(90, 220, 120, 255);
        case 'blue':
            return new Color(90, 150, 255, 255);
        default:
            return new Color(240, 242, 248, 255);
    }
}

/** 目标未点亮：浅色弱化版，与地板对比可见，点亮后会更亮更饱和 */
export function targetDimFillColor(colorKey?: string): Color {
    switch (normalizeLightColorKey(colorKey)) {
        case 'red':
            return new Color(200, 158, 158, 255);
        case 'green':
            return new Color(158, 198, 168, 255);
        case 'blue':
            return new Color(158, 178, 210, 255);
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
                fill: new Color(255, 110, 110, 50),
            };
        case 'green':
            return {
                stroke: new Color(100, 230, 130, 255),
                fill: new Color(100, 230, 130, 50),
            };
        case 'blue':
            return {
                stroke: new Color(100, 160, 255, 255),
                fill: new Color(100, 160, 255, 50),
            };
        default:
            return {
                stroke: new Color(200, 206, 220, 255),
                fill: new Color(200, 206, 220, 60),
            };
    }
}

/** 目标已点亮（与期望色一致） */
export function targetLitFillColor(colorKey?: string): Color {
    switch (normalizeLightColorKey(colorKey)) {
        case 'red':
            return new Color(255, 100, 100, 255);
        case 'green':
            return new Color(100, 235, 140, 255);
        case 'blue':
            return new Color(100, 165, 255, 255);
        default:
            return new Color(250, 252, 255, 255);
    }
}
