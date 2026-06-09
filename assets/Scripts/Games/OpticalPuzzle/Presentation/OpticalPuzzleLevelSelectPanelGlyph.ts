import { Color, Graphics, Label } from 'cc';
import {
    HUD_DIR_BUTTON_SCENE_SIZE,
    HUD_KEY_FILL,
    PRESSED_GLOW_LAYERS,
    pressedHudIconColor,
    scaleHudDesign,
    strokeGlowLayers,
    unlitHudIconColor,
} from './OpticalPuzzleHudButtonCommon';
import { drawWinPanelWindsChrome } from './OpticalPuzzleWinPanelWindsView';
import { OpticalStarVisualState, type OpticalStarSlotStates } from '../Core/OpticalPuzzleStarRating';
import { drawWinPanelStarGlyph, WIN_STAR_BORDER_PX } from './OpticalPuzzleWinPanelStarGlyph';
import { WIN_STAR_DESIGN_SIZE } from './OpticalPuzzleWinPanelStarsView';

/** 选关面板内容区圆角（设计 px） */
export const LEVEL_SELECT_PANEL_CORNER_PX = 20;
/** 标题条圆角（设计 px） */
export const LEVEL_SELECT_TITLE_CORNER_PX = 15;
/** 标题条白描边（设计 px） */
export const LEVEL_SELECT_TITLE_BORDER_PX = 5;
/** 关卡项设计边长（4 列网格 cell 尺寸） */
export const LEVEL_SELECT_ITEM_DESIGN_SIZE = 110;
/** 关卡项外框白描边（固定 px，不随格尺寸缩放） */
export const LEVEL_SELECT_ITEM_BORDER_PX = 5;
/** 选关项底部单颗星边长（设计 px） */
export const LEVEL_SELECT_ITEM_STAR_SIZE = 18;
/** 底部三颗星间距（设计 px） */
export const LEVEL_SELECT_ITEM_STAR_GAP = 4;
/** 星形底边距关卡项底边（设计 px，贴下边缘白框） */
export const LEVEL_SELECT_ITEM_STAR_BOTTOM_INSET = 4;
/** 未点亮星描边相对点亮星加粗倍数 */
const LEVEL_SELECT_ITEM_STAR_DIM_BORDER_MUL = 1.85;
/** 关卡号 Label 字号（与 ITEM_DESIGN_SIZE 对齐） */
export const LEVEL_SELECT_ITEM_LABEL_FONT = 30;
/** 关卡号清晰渲染：字号 ×10 后节点 scale 0.1 还原视觉大小 */
export const LEVEL_SELECT_ITEM_LABEL_FONT_SCALE = 10;
export const LEVEL_SELECT_ITEM_LABEL_NODE_SCALE = 0.1;
/** 关卡号 Font Style 字体族（useSystemFont 时生效） */
export const LEVEL_SELECT_ITEM_LABEL_FONT_FAMILY = 'Arial';
/** 关卡号距项左上角边距（设计 px） */
export const LEVEL_SELECT_ITEM_LABEL_MARGIN = 5;
/** 缩略图区内边距（设计 px） */
export const LEVEL_SELECT_ITEM_THUMB_PADDING = 6;
/** 缩略图内关卡沙盘缩放（相对内容区，略小于 1 留出边距） */
export const LEVEL_SELECT_ITEM_THUMB_BOARD_SCALE = 0.9;
/** 滚动区顶部渐隐蒙层宽度（设计 px，略小于 scrollpanel 宽，避免盖住左右白框） */
export const LEVEL_SELECT_SCROLL_TOP_FADE_WIDTH = 645;
/** 滚动区顶部渐隐蒙层高度（设计 px，与面板底色 HUD_KEY_FILL 衔接） */
export const LEVEL_SELECT_SCROLL_TOP_FADE_HEIGHT = 40;
/** 滚动区底部渐隐蒙层宽度（设计 px，与顶部一致，避免盖住左右白框） */
export const LEVEL_SELECT_SCROLL_BOTTOM_FADE_WIDTH = 645;
/** 滚动区底部渐隐蒙层高度（设计 px） */
export const LEVEL_SELECT_SCROLL_BOTTOM_FADE_HEIGHT = 40;
/** 关闭键设计边长 */
export const LEVEL_SELECT_CLOSE_DESIGN_SIZE = 80;
/** 关闭键圆形外框白描边（设计 px） */
export const LEVEL_SELECT_CLOSE_BORDER_PX = 5;
/** 关闭键 X 外轮廓 / 内芯 / 半臂长（设计 px，80×80 基准） */
export const LEVEL_SELECT_CLOSE_X_OUTLINE_PX = 3;
export const LEVEL_SELECT_CLOSE_X_BODY_PX = 6;
export const LEVEL_SELECT_CLOSE_X_HALF_PX = 14;

/** 关卡项视觉状态 */
export enum LevelSelectItemVisualState {
    Locked = 1,
    Normal = 2,
    Current = 3,
}

/** 锁定关键帽底色（整格圆角，不再叠缩略图矩形蒙层） */
export const LEVEL_SELECT_LOCKED_KEY_FILL = new Color(52, 56, 66, 255);
const CURRENT_GLOW = new Color(255, 220, 80, 255);
/** strokeGlowLayers 用 plain RGB（勿传 Color 实例） */
const CURRENT_GLOW_RGB = { r: 255, g: 220, b: 80 } as const;
const WHITE_GLOW_RGB = { r: 255, g: 255, b: 255 } as const;
/** 当前关未按下：两层、光晕略小 */
const CURRENT_IDLE_GLOW_LAYERS: ReadonlyArray<{ width: number; alpha: number }> = [
    { width: 6, alpha: 48 },
    { width: 3, alpha: 140 },
];
/** 当前关按下：原三层光晕样式（与 HUD PRESSED 同结构） */
const CURRENT_GLOW_LAYERS: ReadonlyArray<{ width: number; alpha: number }> = [
    { width: 10, alpha: 48 },
    { width: 6, alpha: 120 },
    { width: 3, alpha: 255 },
];

/** 全屏半透明遮罩 */
export function drawLevelSelectBackdrop(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    height: number,
): void {
    g.fillColor = new Color(0, 0, 0, 140);
    g.rect(left, bottom, width, height);
    g.fill();
}

/** 选关主面板底（与 winPanel/winds 同风格） */
export function drawLevelSelectPanelChrome(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    height: number,
): void {
    drawWinPanelWindsChrome(g, left, bottom, width, height);
}

/** 滚动区顶部渐隐：自上而下由面板底色过渡到透明（关卡滚出时软消失） */
export function drawLevelSelectScrollTopFade(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    fadeHeight: number,
    solid: Color = HUD_KEY_FILL,
): void {
    const steps = 18;
    const sliceH = fadeHeight / steps;
    for (let i = 0; i < steps; i++) {
        const tMid = (i + 0.5) / steps;
        const alpha = Math.round(solid.a * tMid);
        g.fillColor = new Color(solid.r, solid.g, solid.b, alpha);
        g.rect(left, bottom + i * sliceH, width, sliceH + 0.5);
        g.fill();
    }
}

/** 滚动区底部渐隐：自下而上由面板底色过渡到透明（关卡滚出时软消失） */
export function drawLevelSelectScrollBottomFade(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    fadeHeight: number,
    solid: Color = HUD_KEY_FILL,
): void {
    const steps = 18;
    const sliceH = fadeHeight / steps;
    for (let i = 0; i < steps; i++) {
        const tMid = (i + 0.5) / steps;
        const alpha = Math.round(solid.a * (1 - tMid));
        g.fillColor = new Color(solid.r, solid.g, solid.b, alpha);
        g.rect(left, bottom + i * sliceH, width, sliceH + 0.5);
        g.fill();
    }
}

const TITLE_BORDER_COLOR = new Color(255, 255, 255, 255);
const CLOSE_BORDER_COLOR = new Color(255, 255, 255, 255);

function traceCloseX(g: Graphics, cx: number, cy: number, half: number): void {
    g.moveTo(cx - half, cy - half);
    g.lineTo(cx + half, cy + half);
    g.moveTo(cx + half, cy - half);
    g.lineTo(cx - half, cy + half);
}

/** 关闭键 80×80，按下光晕按 100×100 四向键线宽缩放（+25%） */
const CLOSE_PRESSED_GLOW_SCALE_SIZE = HUD_DIR_BUTTON_SCENE_SIZE;

/** 按下时：PRESSED_GLOW_LAYERS 在 xBody 上逐层加粗（光晕画在实芯之上，线宽 +25%） */
function strokeCloseXStackedGlow(
    g: Graphics,
    size: number,
    traceX: () => void,
    bodyDesignWidth: number,
): void {
    const baseW = Math.max(1, scaleHudDesign(size, bodyDesignWidth));
    g.lineJoin = Graphics.LineJoin.ROUND;
    g.lineCap = Graphics.LineCap.ROUND;
    for (const layer of PRESSED_GLOW_LAYERS) {
        g.strokeColor = new Color(255, 255, 255, layer.alpha);
        g.lineWidth =
            baseW + Math.max(1, scaleHudDesign(CLOSE_PRESSED_GLOW_SCALE_SIZE, layer.width));
        traceX();
        g.stroke();
    }
}

/** 标题条：窗口同色底 + 圆角白描边（5px） */
export function drawLevelSelectTitleBar(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    height: number,
): void {
    g.fillColor = HUD_KEY_FILL;
    g.roundRect(left, bottom, width, height, LEVEL_SELECT_TITLE_CORNER_PX);
    g.fill();

    g.strokeColor = TITLE_BORDER_COLOR;
    g.lineWidth = LEVEL_SELECT_TITLE_BORDER_PX;
    g.roundRect(left, bottom, width, height, LEVEL_SELECT_TITLE_CORNER_PX);
    g.stroke();
}

/** 关闭键：圆形外框 + 加粗 X（外轮廓 5px） */
export function drawLevelSelectCloseGlyph(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    height: number,
    pressed: boolean,
): void {
    const size = Math.min(width, height);
    const cx = left + width * 0.5;
    const cy = bottom + height * 0.5;
    const radius = size * 0.5 - LEVEL_SELECT_CLOSE_BORDER_PX * 0.5;

    const traceCircle = (): void => {
        g.circle(cx, cy, radius);
    };

    g.fillColor = HUD_KEY_FILL;
    traceCircle();
    g.fill();

    g.lineJoin = Graphics.LineJoin.ROUND;
    g.lineCap = Graphics.LineCap.ROUND;

    if (pressed) {
        strokeGlowLayers(g, CLOSE_PRESSED_GLOW_SCALE_SIZE, PRESSED_GLOW_LAYERS, traceCircle, false);
    } else {
        g.strokeColor = CLOSE_BORDER_COLOR;
        g.lineWidth = LEVEL_SELECT_CLOSE_BORDER_PX;
        traceCircle();
        g.stroke();
    }

    const xHalf = scaleHudDesign(size, LEVEL_SELECT_CLOSE_X_HALF_PX);
    const xBody = LEVEL_SELECT_CLOSE_X_BODY_PX;
    const xOutline = LEVEL_SELECT_CLOSE_X_OUTLINE_PX;
    const xTotal = xBody + xOutline * 2;
    const traceX = (): void => traceCloseX(g, cx, cy, xHalf);

    if (pressed) {
        g.strokeColor = pressedHudIconColor();
        g.lineWidth = xBody;
        traceX();
        g.stroke();
        strokeCloseXStackedGlow(g, size, traceX, xBody);
        return;
    }

    g.strokeColor = CLOSE_BORDER_COLOR;
    g.lineWidth = xTotal;
    traceX();
    g.stroke();
    g.strokeColor = unlitHudIconColor();
    g.lineWidth = xBody;
    traceX();
    g.stroke();
}

/** 关卡项键帽：锁定 / 可选 / 当前进行中（黄框 + 黄光晕） */
export function drawLevelSelectItemChrome(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    height: number,
    state: LevelSelectItemVisualState,
    pressed: boolean,
): void {
    const size = Math.min(width, height);
    const corner = scaleHudDesign(size, 15);

    if (state === LevelSelectItemVisualState.Locked) {
        g.fillColor = LEVEL_SELECT_LOCKED_KEY_FILL;
    } else {
        g.fillColor = HUD_KEY_FILL;
    }
    g.roundRect(left, bottom, width, height, corner);
    g.fill();

    const traceFrame = (): void => {
        g.roundRect(left, bottom, width, height, corner);
    };

    // 未按下：当前关两层小光晕
    if (state === LevelSelectItemVisualState.Current && !pressed) {
        strokeGlowLayers(g, size, CURRENT_IDLE_GLOW_LAYERS, traceFrame, false, CURRENT_GLOW_RGB);
    }

    // 按下：当前关原三层光晕；其余可选关白色 HUD 光晕
    if (pressed && state !== LevelSelectItemVisualState.Locked) {
        if (state === LevelSelectItemVisualState.Current) {
            strokeGlowLayers(g, size, CURRENT_GLOW_LAYERS, traceFrame, false, CURRENT_GLOW_RGB);
        } else {
            strokeGlowLayers(g, size, PRESSED_GLOW_LAYERS, traceFrame, false, WHITE_GLOW_RGB);
        }
    }

    // 可选关按下时仅光晕、不描边（与 drawHudButtonChrome 一致）；当前关/锁定/未按可选关仍描边
    const drawBorder = state === LevelSelectItemVisualState.Locked
        || state === LevelSelectItemVisualState.Current
        || !pressed;
    if (drawBorder) {
        const borderW = LEVEL_SELECT_ITEM_BORDER_PX;
        g.strokeColor = state === LevelSelectItemVisualState.Locked
            ? new Color(160, 168, 180, 160)
            : state === LevelSelectItemVisualState.Current
                ? CURRENT_GLOW
                : new Color(255, 255, 255, 255);
        g.lineWidth = borderW;
        traceFrame();
        g.stroke();
    }
}

/** 锁定态小挂锁（画在项中央偏上，给关卡号留空） */
export function drawLevelSelectLockIcon(
    g: Graphics,
    cx: number,
    cy: number,
    size: number,
): void {
    const bodyW = scaleHudDesign(size, 24);
    const bodyH = scaleHudDesign(size, 17);
    const shackleR = scaleHudDesign(size, 9);
    const lineW = Math.max(2.5, scaleHudDesign(size, 3.5));

    g.lineWidth = lineW;
    g.lineJoin = Graphics.LineJoin.ROUND;
    g.lineCap = Graphics.LineCap.ROUND;
    g.strokeColor = unlitHudIconColor();

    const bodyBottom = cy - scaleHudDesign(size, 4);
    const bodyTop = bodyBottom + bodyH;
    g.rect(cx - bodyW * 0.5, bodyBottom, bodyW, bodyH);
    g.stroke();

    g.arc(cx, bodyTop, shackleR, Math.PI, 0, false);
    g.stroke();
}

/** 关卡项底边三颗星（左→右对应 1～3 星；复用通关页 glyph） */
export function drawLevelSelectItemStars(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    states: OpticalStarSlotStates,
): void {
    const starSize = LEVEL_SELECT_ITEM_STAR_SIZE;
    const gap = LEVEL_SELECT_ITEM_STAR_GAP;
    const totalW = starSize * 3 + gap * 2;
    const rowLeft = left + (width - totalW) * 0.5;
    const starBottom = bottom + LEVEL_SELECT_ITEM_STAR_BOTTOM_INSET;
    const baseBorderPx = Math.max(
        1,
        (starSize / WIN_STAR_DESIGN_SIZE) * WIN_STAR_BORDER_PX,
    );
    const dimBorderPx = Math.max(2, baseBorderPx * LEVEL_SELECT_ITEM_STAR_DIM_BORDER_MUL);

    for (let i = 0; i < 3; i++) {
        const borderPx = states[i] === OpticalStarVisualState.Dim ? dimBorderPx : baseBorderPx;
        drawWinPanelStarGlyph(
            g,
            rowLeft + i * (starSize + gap),
            starBottom,
            starSize,
            starSize,
            states[i],
            0,
            borderPx,
        );
    }
}

/** 3.7+ Label 内部 TextStyle（引擎未公开导出，Font Style 粗体走 isBold） */
interface ILevelSelectLabelTextStyle {
    isBold: boolean;
}

/** 应用关卡号 Label Font Style 粗体（系统字 + textStyle.isBold，禁用 CHAR 缓存） */
export function applyLevelSelectItemLabelFontStyle(label: Label): void {
    label.useSystemFont = true;
    label.fontFamily = LEVEL_SELECT_ITEM_LABEL_FONT_FAMILY;
    label.cacheMode = Label.CacheMode.NONE;
    label.isBold = true;
    const textStyle = (label as Label & { textStyle?: ILevelSelectLabelTextStyle }).textStyle;
    if (textStyle) {
        textStyle.isBold = true;
    }
    label.updateRenderData(true);
}
