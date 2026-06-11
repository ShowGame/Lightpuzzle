import { Color, Graphics } from 'cc';
import {
    GAME_TITLE_FILL_TRI_FLAT,
    GAME_TITLE_OUTLINE_PATHS,
} from './GameTitlePathSegs.generated';

/** 标题外轮廓线宽（设计 px，不随节点缩放） */
export const GAME_TITLE_STROKE_PX = 1;

const TITLE_FILL = new Color(255, 255, 255, 255);
const TITLE_STROKE = new Color(255, 255, 255, 255);

/** 外轮廓 + 内孔边缘发光 */
const TITLE_GLOW_LAYERS: ReadonlyArray<{ width: number; alpha: number }> = [
    { width: 12, alpha: 36 },
    { width: 8, alpha: 72 },
    { width: 4, alpha: 108 },
];

function traceOutlinePath(
    g: Graphics,
    segs: ReadonlyArray<Readonly<{ x: number; y: number }>>,
    cx: number,
    cy: number,
    height: number,
): void {
    for (let i = 0; i < segs.length; i++) {
        const p = segs[i];
        const x = cx + p.x * height;
        const y = cy + p.y * height;
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
    drawH: number,
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
        traceOutlinePath(g, path, cx, cy, drawH);
        g.stroke();
    }
}

function strokeTitleGlow(g: Graphics, cx: number, cy: number, drawH: number): void {
    for (const layer of TITLE_GLOW_LAYERS) {
        strokePaths(
            g,
            GAME_TITLE_OUTLINE_PATHS,
            cx,
            cy,
            drawH,
            layer.width,
            new Color(255, 255, 255, layer.alpha),
            false,
        );
    }
}

function fillTriangulatedTitle(
    g: Graphics,
    cx: number,
    cy: number,
    drawH: number,
): void {
    const flat = GAME_TITLE_FILL_TRI_FLAT;
    g.fillColor = TITLE_FILL;
    for (let i = 0; i < flat.length; i += 6) {
        g.moveTo(cx + flat[i] * drawH, cy + flat[i + 1] * drawH);
        g.lineTo(cx + flat[i + 2] * drawH, cy + flat[i + 3] * drawH);
        g.lineTo(cx + flat[i + 4] * drawH, cy + flat[i + 5] * drawH);
        g.close();
        g.fill();
    }
}

/** 纯白填充 + 外轮廓/内孔发光 + 1px 描边 */
export function drawGameTitleOutline(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    height: number,
): void {
    const cx = left + width * 0.5;
    const cy = bottom + height * 0.5;
    const drawH = height;

    strokeTitleGlow(g, cx, cy, drawH);
    fillTriangulatedTitle(g, cx, cy, drawH);
    strokePaths(
        g,
        GAME_TITLE_OUTLINE_PATHS,
        cx,
        cy,
        drawH,
        GAME_TITLE_STROKE_PX,
        TITLE_STROKE,
        true,
    );
}
