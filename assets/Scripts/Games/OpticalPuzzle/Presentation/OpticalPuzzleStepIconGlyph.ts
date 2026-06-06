import { Color, Graphics } from 'cc';

/** 图标占 StepIcon 节点短边比例（非按钮，铺满 UITransform） */
const ICON_SIZE_RATIO = 1;
/** 掌垫+四趾豆外接半宽（iconR=10，由 STEP_ICON_PAD_SEGS 控制点估算） */
const STEP_ICON_PATH_UNIT = 7.67;

const STEP_ICON_WHITE = new Color(255, 255, 255, 255);

type PathSeg =
    | { t: 'M'; x: number; y: number }
    | { t: 'L'; x: number; y: number }
    | { t: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { t: 'Z' };

/** 掌垫 + 四趾豆（不含 SVG 最外层整圈轮廓） */
const STEP_ICON_PAD_SEGS: ReadonlyArray<PathSeg> = [
    { t: 'M', x: 2.892, y: 7.365 },
    { t: 'C', x1: 3.707, y1: 7.365, x2: 4.368, y2: 6.483, x: 4.368, y: 5.395 },
    { t: 'C', x1: 4.368, y1: 4.308, x2: 3.707, y2: 3.426, x: 2.892, y: 3.426 },
    { t: 'C', x1: 2.077, y1: 3.426, x2: 1.416, y2: 4.308, x: 1.416, y: 5.395 },
    { t: 'C', x1: 1.416, y1: 6.483, x2: 2.077, y2: 7.364, x: 2.892, y: 7.364 },
    { t: 'Z' },
    { t: 'M', x: -2.144, y: 7.365 },
    { t: 'C', x1: -1.329, y1: 7.365, x2: -0.669, y2: 6.483, x: -0.669, y: 5.395 },
    { t: 'C', x1: -0.669, y1: 4.308, x2: -1.329, y2: 3.426, x: -2.144, y: 3.426 },
    { t: 'C', x1: -2.959, y1: 3.426, x2: -3.62, y2: 4.308, x: -3.62, y: 5.395 },
    { t: 'C', x1: -3.62, y1: 6.483, x2: -2.959, y2: 7.364, x: -2.144, y: 7.364 },
    { t: 'Z' },
    { t: 'M', x: -5.73, y: 0.225 },
    { t: 'C', x1: -6.545, y1: 0.225, x2: -7.206, y2: 1.106, x: -7.206, y: 2.194 },
    { t: 'C', x1: -7.206, y1: 3.282, x2: -6.545, y2: 4.163, x: -5.73, y: 4.163 },
    { t: 'C', x1: -4.915, y1: 4.163, x2: -4.254, y2: 3.282, x: -4.254, y: 2.194 },
    { t: 'C', x1: -4.254, y1: 1.106, x2: -4.915, y2: 0.225, x: -5.73, y: 0.225 },
    { t: 'Z' },
    { t: 'M', x: 4.302, y: -6.224 },
    { t: 'C', x1: 3.524, y1: -6.696, x2: 2.483, y2: -6.539, x: 1.511, y: -5.912 },
    { t: 'C', x1: 0.905, y1: -5.647, x2: -0.1, y2: -5.377, x: -1.139, y: -5.838 },
    { t: 'C', x1: -1.331, y1: -5.969, x2: -1.525, y2: -6.082, x: -1.719, y: -6.176 },
    { t: 'C', x1: -2.548, y1: -6.573, x2: -3.387, y2: -6.62, x: -4.041, y: -6.224 },
    { t: 'C', x1: -5.353, y1: -5.428, x2: -5.426, y2: -3.15, x: -4.204, y: -1.135 },
    { t: 'C', x1: -3.883, y1: -0.606, x2: -3.505, y2: -0.148, x: -3.098, y: 0.226 },
    { t: 'L', x: -3.094, y: 0.229 },
    { t: 'L', x: -3.093, y: 0.231 },
    { t: 'L', x: -3.092, y: 0.232 },
    { t: 'L', x: -3.091, y: 0.233 },
    { t: 'C', x1: -2.481, y1: 0.791, x2: -1.806, y2: 1.16, x: -1.163, y: 1.294 },
    { t: 'C', x1: -0.354, y1: 1.542, x2: 0.652, y2: 1.627, x: 1.746, y: 1.208 },
    { t: 'C', x1: 2.726, y1: 0.892, x2: 3.741, y2: 0.058, x: 4.465, y: -1.135 },
    { t: 'C', x1: 5.687, y1: -3.15, x2: 5.614, y2: -5.428, x: 4.302, y: -6.224 },
    { t: 'Z' },
    { t: 'M', x: 6.194, y: 0.226 },
    { t: 'C', x1: 5.379, y1: 0.226, x2: 4.718, y2: 1.107, x: 4.718, y: 2.195 },
    { t: 'C', x1: 4.718, y1: 3.283, x2: 5.379, y2: 4.164, x: 6.194, y: 4.164 },
    { t: 'C', x1: 7.009, y1: 4.164, x2: 7.67, y2: 3.283, x: 7.67, y: 2.195 },
    { t: 'C', x1: 7.67, y1: 1.107, x2: 7.009, y2: 0.226, x: 6.194, y: 0.226 },
    { t: 'Z' },
];

function traceStepIconSegs(
    g: Graphics,
    segs: ReadonlyArray<PathSeg>,
    cx: number,
    cy: number,
    scale: number,
): void {
    for (const seg of segs) {
        switch (seg.t) {
            case 'M':
                g.moveTo(cx + seg.x * scale, cy + seg.y * scale);
                break;
            case 'L':
                g.lineTo(cx + seg.x * scale, cy + seg.y * scale);
                break;
            case 'C':
                g.bezierCurveTo(
                    cx + seg.x1 * scale,
                    cy + seg.y1 * scale,
                    cx + seg.x2 * scale,
                    cy + seg.y2 * scale,
                    cx + seg.x * scale,
                    cy + seg.y * scale,
                );
                break;
            case 'Z':
                g.close();
                break;
            default:
                break;
        }
    }
}

/**
 * 绘制步数爪印：非按钮；掌垫与四趾豆全部纯白填充。
 * 缩放按节点 UITransform 短边适配（非 TopBar 按钮的 0.58 内缩）。
 */
export function drawStepIconGlyph(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    height: number,
): void {
    const size = Math.min(width, height);
    const cx = left + width * 0.5;
    const cy = bottom + height * 0.5;
    const iconHalf = (size * ICON_SIZE_RATIO) * 0.5;
    const scale = iconHalf / STEP_ICON_PATH_UNIT;

    g.fillColor = STEP_ICON_WHITE;
    traceStepIconSegs(g, STEP_ICON_PAD_SEGS, cx, cy, scale);
    g.fill();
}
