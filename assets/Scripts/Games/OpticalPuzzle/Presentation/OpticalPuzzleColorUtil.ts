import { Color } from 'cc';
import type { MixedLightColorKey } from '../Core/OpticalColorMix';
import { normalizeLightColorKey, resolveBeamColorKey } from '../Core/OpticalLightColor';

/** 与 BeamView 光路描边一致的本色（Presentation 统一入口） */
export function beamColorFromKey(colorKey?: string): Color {
    const k = resolveBeamColorKey(colorKey) as MixedLightColorKey;
    switch (k) {
        case 'red':
            return new Color(255, 72, 72, 230);
        case 'green':
            return new Color(72, 220, 110, 230);
        case 'blue':
            return new Color(72, 140, 255, 230);
        case 'yellow':
            return new Color(255, 220, 72, 230);
        case 'cyan':
            return new Color(72, 220, 230, 230);
        case 'purple':
            return new Color(180, 90, 255, 230);
        default:
            return new Color(255, 255, 255, 235);
    }
}

/** 光源方块填充色（含 S 层 3 的 Y/C/P） */
export function sourceFillColor(colorKey?: string): Color {
    const beam = beamColorFromKey(colorKey);
    return new Color(beam.r, beam.g, beam.b, 255);
}

/** 激光发射器绘制色（与光路同色阶） */
export function sourceEmitterColors(colorKey?: string): {
    beam: Color;
    glow: Color;
    core: Color;
    accent: Color;
    chassis: Color;
    chassisEdge: Color;
} {
    const beam = beamColorFromKey(colorKey);
    return {
        beam,
        glow: new Color(beam.r, beam.g, beam.b, 90),
        core: new Color(255, 255, 255, Math.min(255, beam.a + 15)),
        accent: new Color(
            Math.floor(beam.r * 0.72),
            Math.floor(beam.g * 0.72),
            Math.floor(beam.b * 0.72),
            255,
        ),
        chassis: new Color(
            Math.floor(beam.r * 0.12 + 16),
            Math.floor(beam.g * 0.12 + 20),
            Math.floor(beam.b * 0.12 + 28),
            255,
        ),
        chassisEdge: new Color(
            Math.floor(beam.r * 0.35 + 36),
            Math.floor(beam.g * 0.35 + 44),
            Math.floor(beam.b * 0.35 + 56),
            255,
        ),
    };
}

/** 光接收靶绘制色（未点亮 / 已点亮） */
export function targetReceptorColors(
    colorKey?: string,
    lit: boolean = false,
): {
    beam: Color;
    glow: Color;
    base: Color;
    panel: Color;
    outerRing: Color;
    midRing: Color;
    dish: Color;
    dishEdge: Color;
    tick: Color;
    bracket: Color;
    sensorDim: Color;
    sensorEdge: Color;
    ledOn: Color;
    ledOff: Color;
} {
    const beam = beamColorFromKey(colorKey);
    const accent = new Color(
        Math.floor(beam.r * 0.72),
        Math.floor(beam.g * 0.72),
        Math.floor(beam.b * 0.72),
        255,
    );
    const chassis = new Color(
        Math.floor(beam.r * 0.1 + 14),
        Math.floor(beam.g * 0.1 + 18),
        Math.floor(beam.b * 0.1 + 26),
        255,
    );
    const chassisEdge = new Color(
        Math.floor(beam.r * 0.32 + 34),
        Math.floor(beam.g * 0.32 + 42),
        Math.floor(beam.b * 0.32 + 54),
        255,
    );
    if (lit) {
        return {
            beam,
            glow: new Color(beam.r, beam.g, beam.b, 100),
            base: chassis,
            panel: new Color(
                Math.floor(beam.r * 0.16 + 20),
                Math.floor(beam.g * 0.16 + 24),
                Math.floor(beam.b * 0.16 + 32),
                255,
            ),
            outerRing: new Color(beam.r, beam.g, beam.b, 220),
            midRing: accent,
            dish: new Color(
                Math.floor(beam.r * 0.22 + 18),
                Math.floor(beam.g * 0.22 + 22),
                Math.floor(beam.b * 0.22 + 30),
                255,
            ),
            dishEdge: chassisEdge,
            tick: new Color(255, 255, 255, 180),
            bracket: new Color(beam.r, beam.g, beam.b, 200),
            sensorDim: new Color(0, 0, 0, 0),
            sensorEdge: new Color(0, 0, 0, 0),
            ledOn: sourceFillColor(colorKey),
            ledOff: new Color(0, 0, 0, 0),
        };
    }
    const dim = targetDimFillColor(colorKey);
    return {
        beam,
        glow: new Color(beam.r, beam.g, beam.b, 40),
        base: chassis,
        panel: new Color(
            Math.floor(dim.r * 0.35 + 28),
            Math.floor(dim.g * 0.35 + 32),
            Math.floor(dim.b * 0.35 + 38),
            255,
        ),
        outerRing: new Color(
            Math.floor(dim.r * 0.85),
            Math.floor(dim.g * 0.85),
            Math.floor(dim.b * 0.85),
            200,
        ),
        midRing: new Color(
            Math.floor(dim.r * 0.65),
            Math.floor(dim.g * 0.65),
            Math.floor(dim.b * 0.65),
            180,
        ),
        dish: new Color(
            Math.floor(dim.r * 0.45 + 24),
            Math.floor(dim.g * 0.45 + 28),
            Math.floor(dim.b * 0.45 + 34),
            255,
        ),
        dishEdge: chassisEdge,
        tick: new Color(
            Math.floor(dim.r * 0.55),
            Math.floor(dim.g * 0.55),
            Math.floor(dim.b * 0.55),
            140,
        ),
        bracket: new Color(
            Math.floor(dim.r * 0.7),
            Math.floor(dim.g * 0.7),
            Math.floor(dim.b * 0.7),
            160,
        ),
        sensorDim: new Color(
            Math.floor(dim.r * 0.55),
            Math.floor(dim.g * 0.55),
            Math.floor(dim.b * 0.55),
            200,
        ),
        sensorEdge: accent,
        ledOn: new Color(0, 0, 0, 0),
        ledOff: new Color(
            Math.floor(dim.r * 0.4 + 40),
            Math.floor(dim.g * 0.4 + 44),
            Math.floor(dim.b * 0.4 + 50),
            120,
        ),
    };
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
                fill: new Color(255, 110, 110, 120),
            };
        case 'green':
            return {
                stroke: new Color(100, 230, 130, 255),
                fill: new Color(100, 230, 130, 120),
            };
        case 'blue':
            return {
                stroke: new Color(100, 160, 255, 255),
                fill: new Color(100, 160, 255, 120),
            };
        default:
            return {
                stroke: new Color(200, 206, 220, 255),
                fill: new Color(200, 206, 220, 120),
            };
    }
}

/** 通道元件格底：同色系更深、高透明，光路可透出 */
export function pieceBaseFillColor(colorKey?: string): Color {
    const { stroke } = pieceChannelColors(colorKey);
    return new Color(
        Math.floor(stroke.r * 0.68 + 50),
        Math.floor(stroke.g * 0.68 + 50),
        Math.floor(stroke.b * 0.68 + 50),
        60,
    );
}

/** 主角格底：橘红色纯色 */
export function playerBaseFillColor(): Color {
    return new Color(255, 92, 58, 255);
}

/** 主角格底外框：2px 黑边 */
export function playerBaseBorderColor(): Color {
    return new Color(0, 0, 0, 255);
}

/** 主角眼镜片：深橘色纯色 */
export function playerEyeFillColor(): Color {
    return new Color(178, 58, 18, 255);
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
