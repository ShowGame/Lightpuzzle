import { Color, EventTouch, Graphics, Node, NodeEventType, UITransform } from 'cc';
import { targetDimFillColor } from './OpticalPuzzleColorUtil';

/** HUD 虚拟键设计尺寸（与场景 UITransform 一致） */
export const HUD_BUTTON_DESIGN_SIZE = 80;
/** 外框圆角（设计 px） */
export const HUD_KEY_CORNER_DESIGN = 15;
/** 外框线宽（设计 px） */
export const HUD_KEY_BORDER_DESIGN = 2;
/** 内部面型图标描边（设计 px，三角箭头等） */
export const HUD_ICON_BORDER_DESIGN = 3;
/** 内部线型图标白描边（设计 px，撤回/重置圆弧） */
export const HUD_LINE_ICON_BORDER_DESIGN = 2;
/** 内部线型图标体宽（设计 px） */
export const HUD_ICON_BODY_DESIGN = 5;

/** 与未点亮目标内面板一致 #161c26（浅黑底） */
const KEY_FILL = new Color(22, 28, 38, 255);
const KEY_BORDER = new Color(255, 255, 255, 255);

/** 按下时白光层（设计 px 线宽 → alpha，外框与图标共用） */
export const PRESSED_GLOW_LAYERS: ReadonlyArray<{ width: number; alpha: number }> = [
    { width: 9, alpha: 48 },
    { width: 6, alpha: 120 },
    { width: 3, alpha: 255 },
];

export function scaleHudDesign(size: number, design: number): number {
    return design * (size / HUD_BUTTON_DESIGN_SIZE);
}

/** 未点亮白灯中心浅白（与 TargetGlyph 灯体 fill 一致） */
export function unlitHudIconColor(): Color {
    const dim = targetDimFillColor(undefined);
    return new Color(
        Math.floor(dim.r * 0.76),
        Math.floor(dim.g * 0.76),
        Math.floor(dim.b * 0.76),
        255,
    );
}

export function pressedHudIconColor(): Color {
    return new Color(255, 255, 255, 255);
}

/** 线型图标外轮廓设计线宽（体 + 两侧描边） */
export function hudLineIconTotalDesign(): number {
    return HUD_ICON_BODY_DESIGN + HUD_LINE_ICON_BORDER_DESIGN * 2;
}

/** 线型实心笔划半宽（像素，用于外缘光晕路径外移） */
export function hudLineHalfStrokeWidth(size: number): number {
    return scaleHudDesign(size, hudLineIconTotalDesign()) * 0.5;
}

export function strokeGlowLayers(
    g: Graphics,
    size: number,
    layers: ReadonlyArray<{ width: number; alpha: number }>,
    tracePath: () => void,
    roundCaps = false,
): void {
    if (roundCaps) {
        g.lineJoin = Graphics.LineJoin.ROUND;
        g.lineCap = Graphics.LineCap.ROUND;
    }
    for (const layer of layers) {
        g.strokeColor = new Color(255, 255, 255, layer.alpha);
        g.lineWidth = Math.max(1, scaleHudDesign(size, layer.width));
        tracePath();
        g.stroke();
    }
}

/** 绘制键帽底 + 外框（与四向键一致） */
export function drawHudButtonChrome(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    height: number,
    pressed: boolean,
): void {
    const size = Math.min(width, height);
    const corner = scaleHudDesign(size, HUD_KEY_CORNER_DESIGN);
    const borderW = Math.max(1, scaleHudDesign(size, HUD_KEY_BORDER_DESIGN));

    g.fillColor = KEY_FILL;
    g.roundRect(left, bottom, width, height, corner);
    g.fill();

    if (pressed) {
        strokeGlowLayers(g, size, PRESSED_GLOW_LAYERS, () => {
            g.roundRect(left, bottom, width, height, corner);
        });
    } else {
        g.strokeColor = KEY_BORDER;
        g.lineWidth = borderW;
        g.roundRect(left, bottom, width, height, corner);
        g.stroke();
    }
}

/** 线型图标：未按浅白体 + 白描边；按下全白 + 内外缘光晕（各缘半内半外扩散） */
export function drawHudLineIcon(
    g: Graphics,
    size: number,
    pressed: boolean,
    tracePath: () => void,
    traceEdgeGlowPaths?: ReadonlyArray<() => void>,
): void {
    const bodyW = Math.max(1, scaleHudDesign(size, HUD_ICON_BODY_DESIGN));
    const borderW = Math.max(1, scaleHudDesign(size, HUD_LINE_ICON_BORDER_DESIGN));
    const totalW = bodyW + borderW * 2;
    g.lineJoin = Graphics.LineJoin.ROUND;
    g.lineCap = Graphics.LineCap.ROUND;

    if (pressed) {
        g.strokeColor = pressedHudIconColor();
        g.lineWidth = totalW;
        tracePath();
        g.stroke();
        if (traceEdgeGlowPaths) {
            for (const traceGlow of traceEdgeGlowPaths) {
                strokeGlowLayers(g, size, PRESSED_GLOW_LAYERS, traceGlow, true);
            }
        }
        return;
    }

    g.strokeColor = KEY_BORDER;
    g.lineWidth = totalW;
    tracePath();
    g.stroke();
    g.strokeColor = unlitHudIconColor();
    g.lineWidth = bodyW;
    tracePath();
    g.stroke();
}

/** 面型图标：未按浅白填充 + 白描边；按下全白 + 光晕 */
export function drawHudShapeIcon(
    g: Graphics,
    size: number,
    pressed: boolean,
    tracePath: () => void,
): void {
    const borderW = Math.max(1, scaleHudDesign(size, HUD_ICON_BORDER_DESIGN));
    const fill = pressed ? pressedHudIconColor() : unlitHudIconColor();

    g.fillColor = fill;
    tracePath();
    g.fill();

    if (pressed) {
        strokeGlowLayers(g, size, PRESSED_GLOW_LAYERS, tracePath, true);
        return;
    }

    g.strokeColor = KEY_BORDER;
    g.lineWidth = borderW;
    g.lineJoin = Graphics.LineJoin.ROUND;
    g.lineCap = Graphics.LineCap.ROUND;
    tracePath();
    g.stroke();
}

/** 触摸按下态：移出按钮区域时与 Button 缩放同步取消发光 */
export class HudButtonPressController {
    private _pressed = false;
    private _touchActive = false;

    constructor(
        private readonly _node: Node,
        private readonly _onChange: (pressed: boolean) => void,
    ) {}

    bind(): void {
        this._unbindListeners();
        this._node.on(NodeEventType.TOUCH_START, this._onPressStart, this);
        this._node.on(NodeEventType.TOUCH_MOVE, this._onTouchMove, this);
        this._node.on(NodeEventType.TOUCH_END, this._onPressEnd, this);
        this._node.on(NodeEventType.TOUCH_CANCEL, this._onPressEnd, this);
    }

    unbind(): void {
        this._unbindListeners();
        this._touchActive = false;
        this._setPressed(false);
    }

    private _unbindListeners(): void {
        this._node.off(NodeEventType.TOUCH_START, this._onPressStart, this);
        this._node.off(NodeEventType.TOUCH_MOVE, this._onTouchMove, this);
        this._node.off(NodeEventType.TOUCH_END, this._onPressEnd, this);
        this._node.off(NodeEventType.TOUCH_CANCEL, this._onPressEnd, this);
    }

    private _onPressStart(): void {
        this._touchActive = true;
        this._setPressed(true);
    }

    private _onTouchMove(event: EventTouch): void {
        if (!this._touchActive) {
            return;
        }
        this._setPressed(this._isTouchInside(event));
    }

    private _onPressEnd(): void {
        this._touchActive = false;
        this._setPressed(false);
    }

    private _isTouchInside(event: EventTouch): boolean {
        const ut = this._node.getComponent(UITransform);
        if (!ut) {
            return false;
        }
        return ut.getBoundingBoxToWorld().contains(event.getUILocation());
    }

    private _setPressed(pressed: boolean): void {
        if (this._pressed === pressed) {
            return;
        }
        this._pressed = pressed;
        this._onChange(pressed);
    }
}
