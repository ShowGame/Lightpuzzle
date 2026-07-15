import {
    _decorator,
    Button,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    UITransform,
    Vec3,
} from 'cc';
import { getOpticalLevelById } from '../Config/OpticalPuzzleLevels';
import {
    defaultDimStarStates,
    resolveStarSlotStates,
    type OpticalStarSlotStates,
} from '../Core/OpticalPuzzleStarRating';
import { DataManager } from '../../../Manager/DataManager';
import {
    applyLevelSelectItemLabelFontStyle,
    drawLevelSelectItemChrome,
    drawLevelSelectItemStars,
    drawLevelSelectLockIcon,
    LEVEL_SELECT_ITEM_DESIGN_SIZE,
    LEVEL_SELECT_ITEM_LABEL_FONT,
    LEVEL_SELECT_ITEM_LABEL_FONT_SCALE,
    LEVEL_SELECT_ITEM_LABEL_MARGIN,
    LEVEL_SELECT_ITEM_LABEL_NODE_SCALE,
    LEVEL_SELECT_ITEM_THUMB_PADDING,
    LevelSelectItemVisualState,
} from './OpticalPuzzleLevelSelectPanelGlyph';
import { drawLevelSelectLevelThumbnail } from './OpticalPuzzleLevelSelectLevelThumbnail';
import { HudButtonPressController } from './OpticalPuzzleHudButtonCommon';

const { ccclass } = _decorator;

const THUMB_CHILD_NAME = 'thumbnail';
const LABEL_CHILD_NAME = 'label';

/** 单个关卡项：键帽 + 居中缩略图 + 左上角关卡号 */
@ccclass('OpticalPuzzleLevelSelectItemView')
export class OpticalPuzzleLevelSelectItemView extends Component {
    private _graphics: Graphics | null = null;
    private _thumbGraphics: Graphics | null = null;
    private _label: Label | null = null;
    private _levelId = 0;
    private _visualState = LevelSelectItemVisualState.Normal;
    private _pressed = false;
    private _pressCtrl: HudButtonPressController | null = null;
    private _onSelect: ((levelId: number) => void) | null = null;

    protected onLoad(): void {
        this._ensureTransform();
        this._ensureThumbnail();
        this._ensureLabel();
        this._ensureButton();
        this._pressCtrl = new HudButtonPressController(this.node, (pressed) => {
            if (this._visualState === LevelSelectItemVisualState.Locked) {
                return;
            }
            this._pressed = pressed;
            this._redraw();
        }, true);
    }

    protected onEnable(): void {
        this._pressCtrl?.bind();
        this.node.on(Button.EventType.CLICK, this._onClick, this);
        if (this._label?.isValid) {
            applyLevelSelectItemLabelFontStyle(this._label);
        }
    }

    protected onDisable(): void {
        this._pressCtrl?.unbind();
        this.node.off(Button.EventType.CLICK, this._onClick, this);
        this._pressed = false;
    }

    protected onDestroy(): void {
        this._pressCtrl?.unbind();
        this.node.off(Button.EventType.CLICK, this._onClick, this);
    }

    /** 绑定关卡数据与点击回调（首次创建项） */
    setup(levelId: number, visualState: LevelSelectItemVisualState, onSelect: (levelId: number) => void): void {
        this._levelId = levelId;
        this._onSelect = onSelect;
        this._applyVisualState(visualState, true);
    }

    /** 更新解锁/当前关状态；状态未变时不重绘缩略图 */
    applyVisualState(visualState: LevelSelectItemVisualState): void {
        this._applyVisualState(visualState, false);
    }

    getLevelId(): number {
        return this._levelId;
    }

    private _applyVisualState(visualState: LevelSelectItemVisualState, forceRedraw: boolean): void {
        const stateChanged = this._visualState !== visualState;
        this._visualState = visualState;
        if (this._label?.isValid) {
            this._label.string = `${this._levelId}`;
            this._label.color = visualState === LevelSelectItemVisualState.Locked
                ? new Color(130, 138, 152, 255)
                : Color.WHITE;
        }
        const btn = this.getComponent(Button);
        if (btn) {
            btn.interactable = visualState !== LevelSelectItemVisualState.Locked;
        }
        if (!forceRedraw && !stateChanged) {
            return;
        }
        if (this._pressed) {
            this._pressed = false;
        }
        this._redraw();
    }

    /** 强制重绘缩略图（通关后刷新星级等，与解锁高亮无关） */
    refreshThumbnail(): void {
        this._redraw();
    }

    private _ensureTransform(): void {
        const ut = this.getComponent(UITransform) ?? this.addComponent(UITransform);
        ut.setContentSize(LEVEL_SELECT_ITEM_DESIGN_SIZE, LEVEL_SELECT_ITEM_DESIGN_SIZE);
        ut.setAnchorPoint(0.5, 0.5);
    }

    private _ensureThumbnail(): void {
        let thumbNode = this.node.getChildByName(THUMB_CHILD_NAME);
        if (!thumbNode) {
            thumbNode = new Node(THUMB_CHILD_NAME);
            thumbNode.setParent(this.node);
        }
        thumbNode.setPosition(0, 0, 0);
        const ut = thumbNode.getComponent(UITransform) ?? thumbNode.addComponent(UITransform);
        ut.setAnchorPoint(0.5, 0.5);
        ut.setContentSize(LEVEL_SELECT_ITEM_DESIGN_SIZE, LEVEL_SELECT_ITEM_DESIGN_SIZE);
        this._thumbGraphics = thumbNode.getComponent(Graphics) ?? thumbNode.addComponent(Graphics);
    }

    private _ensureLabel(): void {
        let labelNode = this.node.getChildByName(LABEL_CHILD_NAME);
        if (!labelNode) {
            labelNode = new Node(LABEL_CHILD_NAME);
            labelNode.setParent(this.node);
        }
        labelNode.setScale(
            new Vec3(LEVEL_SELECT_ITEM_LABEL_NODE_SCALE, LEVEL_SELECT_ITEM_LABEL_NODE_SCALE, 1),
        );

        this._label = labelNode.getComponent(Label) ?? labelNode.addComponent(Label);
        const displayFont = LEVEL_SELECT_ITEM_LABEL_FONT * LEVEL_SELECT_ITEM_LABEL_FONT_SCALE;
        this._label.fontSize = displayFont;
        this._label.lineHeight = displayFont + 4;
        this._label.color = Color.WHITE;
        this._label.horizontalAlign = Label.HorizontalAlign.LEFT;
        this._label.verticalAlign = Label.VerticalAlign.TOP;
        this._label.overflow = Label.Overflow.NONE;
        applyLevelSelectItemLabelFontStyle(this._label);

        const lut = labelNode.getComponent(UITransform) ?? labelNode.addComponent(UITransform);
        lut.setAnchorPoint(0, 1);
        const labelBox = displayFont * 2;
        lut.setContentSize(labelBox, labelBox);
        this._layoutLabel(labelNode);
    }

    /** 关卡号贴左上角（相对键帽内缘） */
    private _layoutLabel(labelNode: Node): void {
        const ut = this.getComponent(UITransform);
        if (!ut) {
            return;
        }
        const w = ut.width;
        const h = ut.height;
        const m = LEVEL_SELECT_ITEM_LABEL_MARGIN;
        labelNode.setPosition(-w * 0.5 + m, h * 0.5 - m, 0);
    }

    private _ensureButton(): void {
        let btn = this.getComponent(Button);
        if (!btn) {
            btn = this.addComponent(Button);
            btn.transition = Button.Transition.SCALE;
        }
        btn.zoomScale = 0.95;
    }

    private _ensureGraphics(): Graphics | null {
        if (!this._graphics?.isValid) {
            this._graphics = this.getComponent(Graphics) ?? this.addComponent(Graphics);
        }
        return this._graphics;
    }

    private _onClick(): void {
        if (this._visualState === LevelSelectItemVisualState.Locked || this._levelId <= 0) {
            return;
        }
        this._onSelect?.(this._levelId);
    }

    private _redraw(): void {
        const ut = this.getComponent(UITransform);
        if (!ut) {
            return;
        }
        const w = ut.width;
        const h = ut.height;
        const left = -ut.anchorX * w;
        const bottom = -ut.anchorY * h;
        const locked = this._visualState === LevelSelectItemVisualState.Locked;

        const g = this._ensureGraphics();
        if (g) {
            g.clear();
            drawLevelSelectItemChrome(g, left, bottom, w, h, this._visualState, this._pressed);
        }

        const level = getOpticalLevelById(this._levelId);
        const thumbG = this._thumbGraphics;
        if (thumbG?.isValid && level) {
            thumbG.clear();
            const pad = LEVEL_SELECT_ITEM_THUMB_PADDING;
            drawLevelSelectLevelThumbnail(
                thumbG,
                level,
                left + pad,
                bottom + pad,
                w - pad * 2,
                h - pad * 2,
                locked,
            );
            if (locked) {
                drawLevelSelectLockIcon(thumbG, 0, 0, w);
            } else {
                drawLevelSelectItemStars(
                    thumbG,
                    left,
                    bottom,
                    w,
                    this._resolveStarSlotStates(level),
                );
            }
        }

        const labelNode = this.node.getChildByName(LABEL_CHILD_NAME);
        if (labelNode?.isValid) {
            this._layoutLabel(labelNode);
        }
    }

    /** 未通关全暗；已通关按 bestSteps 与关卡阈值（同通关页 resolveStarSlotStates） */
    private _resolveStarSlotStates(level: NonNullable<ReturnType<typeof getOpticalLevelById>>): OpticalStarSlotStates {
        if (!level.starThresholds) {
            return defaultDimStarStates();
        }
        const bestSteps = DataManager.instance.getOpticalLevelBestSteps(this._levelId);
        if (bestSteps == null) {
            return defaultDimStarStates();
        }
        return resolveStarSlotStates(bestSteps, level.starThresholds);
    }
}

/** 创建关卡项节点 */
export function createLevelSelectItemNode(name: string): Node {
    const node = new Node(name);
    node.addComponent(OpticalPuzzleLevelSelectItemView);
    return node;
}
