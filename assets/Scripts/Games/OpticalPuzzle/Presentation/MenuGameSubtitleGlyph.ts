import { Color, Graphics } from 'cc';
import {
    GAME_SUBTITLE_FILL_TRI_FLAT,
    GAME_SUBTITLE_NORM_H,
    GAME_SUBTITLE_NORM_W,
    GAME_SUBTITLE_OUTLINE_PATHS,
} from './GameSubtitlePathSegs.generated';

/** 副标题外轮廓线宽（设计 px，不随节点缩放） */
export const GAME_SUBTITLE_STROKE_PX = 1;

const SUBTITLE_FILL = new Color(255, 255, 255, 255);
const SUBTITLE_STROKE = new Color(255, 255, 255, 255);

/** 外轮廓 + 内孔边缘发光（整体收窄，减轻叠光发糊） */
const SUBTITLE_GLOW_LAYERS: ReadonlyArray<{ width: number; alpha: number }> = [
    { width: 8, alpha: 20 },
    { width: 5, alpha: 40 },
    { width: 3, alpha: 60 },
];

function traceOutlinePath(
    g: Graphics,
    segs: ReadonlyArray<Readonly<{ x: number; y: number }>>,
    cx: number,
    cy: number,
    scale: number,
): void {
    for (let i = 0; i < segs.length; i++) {
        const p = segs[i];
        const x = cx + p.x * scale;
        const y = cy + p.y * scale;
        if (i === 0) {
            g.moveTo(x, y);
        } else {
            g.lineTo(x, y);
        }
    }
    g.close();
}

function strokePaths(
    g: Graphics,
    paths: ReadonlyArray<ReadonlyArray<Readonly<{ x: number; y: number }>>>,
    cx: number,
    cy: number,
    drawScale: number,
    lineWidth: number,
    color: Color,
    roundJoin: boolean,
): void {
    g.strokeColor = color;
    g.lineWidth = lineWidth;
    g.lineJoin = roundJoin ? Graphics.LineJoin.ROUND : Graphics.LineJoin.MITER;
    g.lineCap = roundJoin ? Graphics.LineCap.ROUND : Graphics.LineCap.BUTT;
    if (!roundJoin) {
        g.miterLimit = 4;
    }
    for (const path of paths) {
        if (path.length < 2) {
            continue;
        }
        traceOutlinePath(g, path, cx, cy, drawScale);
        g.stroke();
    }
}

function strokeSubtitleGlow(g: Graphics, cx: number, cy: number, drawScale: number): void {
    for (const layer of SUBTITLE_GLOW_LAYERS) {
        strokePaths(
            g,
            GAME_SUBTITLE_OUTLINE_PATHS,
            cx,
            cy,
            drawScale,
            layer.width,
            new Color(255, 255, 255, layer.alpha),
            true,
        );
    }
}

function fillTriangulatedSubtitle(
    g: Graphics,
    cx: number,
    cy: number,
    drawScale: number,
): void {
    const flat = GAME_SUBTITLE_FILL_TRI_FLAT;
    g.fillColor = SUBTITLE_FILL;
    for (let i = 0; i < flat.length; i += 6) {
        g.moveTo(cx + flat[i] * drawScale, cy + flat[i + 1] * drawScale);
        g.lineTo(cx + flat[i + 2] * drawScale, cy + flat[i + 3] * drawScale);
        g.lineTo(cx + flat[i + 4] * drawScale, cy + flat[i + 5] * drawScale);
        g.close();
        g.fill();
    }
}

/** 纯白填充 + 外轮廓/内孔发光 + 1px 描边 */
export function drawGameSubtitleOutline(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    height: number,
): void {
    const cx = left + width * 0.5;
    const cy = bottom + height * 0.5;
    const drawScale = Math.min(width / GAME_SUBTITLE_NORM_W, height / GAME_SUBTITLE_NORM_H);

    strokeSubtitleGlow(g, cx, cy, drawScale);
    fillTriangulatedSubtitle(g, cx, cy, drawScale);
    strokePaths(
        g,
        GAME_SUBTITLE_OUTLINE_PATHS,
        cx,
        cy,
        drawScale,
        GAME_SUBTITLE_STROKE_PX,
        SUBTITLE_STROKE,
        true,
    );
}
