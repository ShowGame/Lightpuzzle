import { Color, Graphics } from 'cc';
import { unlitHudIconColor } from './OpticalPuzzleHudButtonCommon';

/** 标题横条描边（设计 px，不随节点缩放） */
export const WIN_TITLE_BORDER_PX = 4;
const WIN_TITLE_BORDER = new Color(255, 255, 255, 255);

/** SVG viewBox 1024；仅取上半部横条（中条 + 左右缎带，忽略绿圆与勾） */
const WIN_TITLE_VIEW_MIN_X = 94.208;
const WIN_TITLE_VIEW_MAX_X = 896;
const WIN_TITLE_VIEW_MIN_Y = 1.536;
const WIN_TITLE_VIEW_MAX_Y = 218.624;
const WIN_TITLE_VIEW_W = WIN_TITLE_VIEW_MAX_X - WIN_TITLE_VIEW_MIN_X;
const WIN_TITLE_VIEW_H = WIN_TITLE_VIEW_MAX_Y - WIN_TITLE_VIEW_MIN_Y;
const WIN_TITLE_VIEW_CX = (WIN_TITLE_VIEW_MIN_X + WIN_TITLE_VIEW_MAX_X) * 0.5;
const WIN_TITLE_VIEW_CY = (WIN_TITLE_VIEW_MIN_Y + WIN_TITLE_VIEW_MAX_Y) * 0.5;

type PathSeg =
    | { t: 'M'; x: number; y: number }
    | { t: 'L'; x: number; y: number }
    | { t: 'Z' };

/** 中条：M216.064 1.536h552.96v205.312h-552.96V1.536z */
const WIN_TITLE_CENTER_SEGS: ReadonlyArray<PathSeg> = [
    { t: 'M', x: 216.064, y: 1.536 },
    { t: 'L', x: 769.024, y: 1.536 },
    { t: 'L', x: 769.024, y: 206.848 },
    { t: 'L', x: 216.064, y: 206.848 },
    { t: 'Z' },
];

/** 左缎带：M94.208 218.624h190.464V13.312H94.208l52.736 102.4-52.736 102.912z */
const WIN_TITLE_LEFT_SEGS: ReadonlyArray<PathSeg> = [
    { t: 'M', x: 94.208, y: 218.624 },
    { t: 'L', x: 284.672, y: 218.624 },
    { t: 'L', x: 284.672, y: 13.312 },
    { t: 'L', x: 94.208, y: 13.312 },
    { t: 'L', x: 146.944, y: 115.712 },
    { t: 'Z' },
];

/** 右缎带：M896 218.624h-198.656V13.312H896l-55.296 102.4L896 218.624z */
const WIN_TITLE_RIGHT_SEGS: ReadonlyArray<PathSeg> = [
    { t: 'M', x: 896, y: 218.624 },
    { t: 'L', x: 697.344, y: 218.624 },
    { t: 'L', x: 697.344, y: 13.312 },
    { t: 'L', x: 896, y: 13.312 },
    { t: 'L', x: 840.704, y: 115.712 },
    { t: 'Z' },
];

const WIN_TITLE_PARTS: ReadonlyArray<ReadonlyArray<PathSeg>> = [
    WIN_TITLE_CENTER_SEGS,
    WIN_TITLE_LEFT_SEGS,
    WIN_TITLE_RIGHT_SEGS,
];

/** 三块并集的外轮廓（顺时针）；描边仅用此路径，避免交叠内线 */
const WIN_TITLE_OUTLINE_SEGS: ReadonlyArray<PathSeg> = [
    { t: 'M', x: 94.208, y: 218.624 },
    { t: 'L', x: 146.944, y: 115.712 },
    { t: 'L', x: 94.208, y: 13.312 },
    { t: 'L', x: 216.064, y: 13.312 },
    { t: 'L', x: 216.064, y: 1.536 },
    { t: 'L', x: 769.024, y: 1.536 },
    { t: 'L', x: 769.024, y: 13.312 },
    { t: 'L', x: 896, y: 13.312 },
    { t: 'L', x: 840.704, y: 115.712 },
    { t: 'L', x: 896, y: 218.624 },
    { t: 'L', x: 697.344, y: 218.624 },
    { t: 'L', x: 697.344, y: 206.848 },
    { t: 'L', x: 284.672, y: 206.848 },
    { t: 'L', x: 284.672, y: 218.624 },
    { t: 'L', x: 94.208, y: 218.624 },
    { t: 'Z' },
];

function mapTitleSvgPoint(svgX: number, svgY: number, cx: number, cy: number, scale: number): { x: number; y: number } {
    return {
        x: cx + (svgX - WIN_TITLE_VIEW_CX) * scale,
        y: cy - (svgY - WIN_TITLE_VIEW_CY) * scale,
    };
}

function traceTitleSegs(
    g: Graphics,
    segs: ReadonlyArray<PathSeg>,
    cx: number,
    cy: number,
    scale: number,
): void {
    for (const seg of segs) {
        switch (seg.t) {
            case 'M': {
                const p = mapTitleSvgPoint(seg.x, seg.y, cx, cy, scale);
                g.moveTo(p.x, p.y);
                break;
            }
            case 'L': {
                const p = mapTitleSvgPoint(seg.x, seg.y, cx, cy, scale);
                g.lineTo(p.x, p.y);
                break;
            }
            case 'Z':
                g.close();
                break;
            default:
                break;
        }
    }
}

function traceTitleBanner(g: Graphics, cx: number, cy: number, scale: number): void {
    for (const part of WIN_TITLE_PARTS) {
        traceTitleSegs(g, part, cx, cy, scale);
    }
}

/** 绘制 winds/title 通关标题横条：与四向键 icon 未按填充色一致 + 3px 纯白描边 */
export function drawWinPanelTitleGlyph(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    height: number,
): void {
    const cx = left + width * 0.5;
    const cy = bottom + height * 0.5;
    const scale = Math.min(width / WIN_TITLE_VIEW_W, height / WIN_TITLE_VIEW_H);

    g.fillColor = unlitHudIconColor();
    traceTitleBanner(g, cx, cy, scale);
    g.fill();

    g.strokeColor = WIN_TITLE_BORDER;
    g.lineWidth = WIN_TITLE_BORDER_PX;
    g.lineJoin = Graphics.LineJoin.ROUND;
    g.lineCap = Graphics.LineCap.ROUND;
    traceTitleSegs(g, WIN_TITLE_OUTLINE_SEGS, cx, cy, scale);
    g.stroke();
}
