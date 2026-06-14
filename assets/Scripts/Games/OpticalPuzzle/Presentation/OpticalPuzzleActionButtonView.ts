import {
    _decorator,
    Button,
    Component,
    Graphics,
    Node,
    UITransform,
} from 'cc';
import { UNDO_ICON_FILL_STAGES } from '../Application/OpticalPuzzleSession';
import {
    ActionButtonKind,
    computeVideoRewardBadgeLayout,
    drawActionButtonGlyph,
    ACTION_BUTTON_DESIGN_SIZE,
} from './OpticalPuzzleActionButtonGlyph';
import { HudButtonPressController } from './OpticalPuzzleHudButtonCommon';

const { ccclass, property } = _decorator;

/** 激励视频角标独立热区（Answer / Undo 右上角，略溢出 80×80 键帽） */
export const VIDEO_BADGE_HIT_NAME = 'VideoBadgeHit';
/** @deprecated 与 {@link VIDEO_BADGE_HIT_NAME} 相同，保留兼容 */
export const ANSWER_VIDEO_BADGE_HIT_NAME = VIDEO_BADGE_HIT_NAME;

/** 与 Undo/Reset 等 HUD 键一致：Button 缩放按压 */
const ACTION_BUTTON_ZOOM_SCALE = 0.95;

/** 撤回 / 重置虚拟键：键帽风格与四向键一致，内部符号不同 */
@ccclass('OpticalPuzzleActionButtonView')
export class OpticalPuzzleActionButtonView extends Component {
    /** 留空则按节点名 BtnUndo / BtnReset / BtnAnswer 推断 */
    @property
    kind: ActionButtonKind = ActionButtonKind.Undo;

    private _graphics: Graphics | null = null;
    private _pressed = false;
    private _undoFillStage = 0;
    /** 未解锁参考解时显示右上角激励视频角标 */
    private _showAnswerVideoBadge = true;
    private _pressCtrl: HudButtonPressController | null = null;
    private _badgeHitNode: Node | null = null;
    private _badgePressCtrl: HudButtonPressController | null = null;

    protected onLoad(): void {
        this.kind = this._resolveKind(this.kind, this.node.name);
        this._hidePlaceholderSplash();
        this._ensureTransform();
        this._ensurePressButton();
        this._pressCtrl = new HudButtonPressController(this.node, (pressed) => {
            this._pressed = pressed;
            this._redraw();
        });
        if (this._supportsVideoBadgeHit()) {
            this._ensureVideoBadgeHitNode();
        }
        this._redraw();
    }

    protected onEnable(): void {
        this._pressCtrl?.bind();
        this._badgePressCtrl?.bind();
        this._redraw();
    }

    protected onDisable(): void {
        this._pressCtrl?.unbind();
        this._badgePressCtrl?.unbind();
        this._pressed = false;
    }

    protected onDestroy(): void {
        this._pressCtrl?.unbind();
        this._badgePressCtrl?.unbind();
    }

    refresh(): void {
        this._redraw();
    }

    /** 键盘等非触摸输入：短暂显示按压发光 */
    flashPressed(durationSec = 0.1): void {
        if (this._pressCtrl?.touchActive) {
            return;
        }
        this._pressed = true;
        this._redraw();
        this.unschedule(this._releaseKeyboardFlash);
        this.scheduleOnce(this._releaseKeyboardFlash, durationSec);
    }

    private _releaseKeyboardFlash = (): void => {
        if (this._pressCtrl?.touchActive) {
            return;
        }
        this._pressed = false;
        this._redraw();
    };

    /** 撤回键横向填充阶段（0 满填，3 空） */
    setUndoFillStage(stage: number): void {
        if (this.kind !== ActionButtonKind.Undo) {
            return;
        }
        this._undoFillStage = stage;
        this._syncVideoBadgeHit();
        this._redraw();
    }

    /** 参考解未解锁时显示看视频角标 */
    setAnswerVideoBadgeVisible(visible: boolean): void {
        if (this.kind !== ActionButtonKind.Answer) {
            return;
        }
        if (this._showAnswerVideoBadge === visible) {
            return;
        }
        this._showAnswerVideoBadge = visible;
        this._syncVideoBadgeHit();
        this._redraw();
    }

    /** 角标独立 Button 节点（InputHud 绑定与主键相同逻辑） */
    getVideoBadgeHitButton(): Button | null {
        if (!this._supportsVideoBadgeHit()) {
            return null;
        }
        return this._badgeHitNode?.getComponent(Button) ?? null;
    }

    private _supportsVideoBadgeHit(): boolean {
        return this.kind === ActionButtonKind.Answer || this.kind === ActionButtonKind.Undo;
    }

    private _shouldShowVideoBadge(): boolean {
        if (this.kind === ActionButtonKind.Answer) {
            return this._showAnswerVideoBadge;
        }
        if (this.kind === ActionButtonKind.Undo) {
            return this._undoFillStage >= UNDO_ICON_FILL_STAGES;
        }
        return false;
    }

    private _ensureVideoBadgeHitNode(): void {
        let hit = this.node.getChildByName(VIDEO_BADGE_HIT_NAME);
        if (!hit) {
            hit = new Node(VIDEO_BADGE_HIT_NAME);
            hit.setParent(this.node);
            hit.addComponent(UITransform);
            hit.addComponent(Button);
            this._badgeHitNode = hit;
            this._badgePressCtrl = new HudButtonPressController(
                hit,
                (pressed) => {
                    this._pressed = pressed;
                    this._redraw();
                },
                true,
            );
        } else {
            this._badgeHitNode = hit;
            if (!this._badgePressCtrl) {
                this._badgePressCtrl = new HudButtonPressController(
                    hit,
                    (pressed) => {
                        this._pressed = pressed;
                        this._redraw();
                    },
                    true,
                );
            }
        }
        const badgeBtn = this._badgeHitNode.getComponent(Button);
        if (badgeBtn) {
            this._configureVideoBadgeHitButton(badgeBtn);
        }
        this._syncVideoBadgeHit();
    }

    /** 角标热区：缩放作用于整颗操作键（与主 Button 一致 0.95） */
    private _configureVideoBadgeHitButton(btn: Button): void {
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = ACTION_BUTTON_ZOOM_SCALE;
        btn.target = this.node;
        btn.interactable = true;
    }

    private _syncVideoBadgeHit(): void {
        if (!this._supportsVideoBadgeHit() || !this._badgeHitNode?.isValid) {
            return;
        }
        this._badgeHitNode.active = this._shouldShowVideoBadge();
        if (!this._shouldShowVideoBadge()) {
            return;
        }
        const ut = this.getComponent(UITransform);
        const hitUt = this._badgeHitNode.getComponent(UITransform);
        if (!ut || !hitUt) {
            return;
        }
        const w = ut.width;
        const h = ut.height;
        const left = -ut.anchorX * w;
        const bottom = -ut.anchorY * h;
        const layout = computeVideoRewardBadgeLayout(left, bottom, w, h);
        hitUt.setContentSize(layout.diameter, layout.diameter);
        hitUt.setAnchorPoint(0.5, 0.5);
        this._badgeHitNode.setPosition(layout.centerX, layout.centerY, 0);
        this._badgeHitNode.setSiblingIndex(this.node.children.length - 1);
        const badgeBtn = this._badgeHitNode.getComponent(Button);
        if (badgeBtn) {
            this._configureVideoBadgeHitButton(badgeBtn);
        }
    }

    private _ensureTransform(): void {
        let ut = this.getComponent(UITransform);
        if (!ut) {
            ut = this.addComponent(UITransform);
            ut.setContentSize(ACTION_BUTTON_DESIGN_SIZE, ACTION_BUTTON_DESIGN_SIZE);
        }
    }

    /** 触摸缩放 0.95（与 InputHud / 四向键 Button 一致） */
    private _ensurePressButton(): void {
        let btn = this.getComponent(Button);
        if (!btn) {
            btn = this.addComponent(Button);
        }
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = ACTION_BUTTON_ZOOM_SCALE;
    }

    private _ensureGraphics(): Graphics | null {
        if (!this._graphics?.isValid) {
            this._graphics = this.getComponent(Graphics) ?? this.addComponent(Graphics);
        }
        return this._graphics;
    }

    private _redraw(): void {
        const g = this._ensureGraphics();
        const ut = this.getComponent(UITransform);
        if (!g || !ut) {
            return;
        }
        g.clear();
        const w = ut.width;
        const h = ut.height;
        const left = -ut.anchorX * w;
        const bottom = -ut.anchorY * h;
        drawActionButtonGlyph(
            g,
            left,
            bottom,
            w,
            h,
            this.kind,
            this._pressed,
            this.kind === ActionButtonKind.Undo ? this._undoFillStage : 0,
            this.kind === ActionButtonKind.Answer && this._showAnswerVideoBadge,
        );
        if (this._supportsVideoBadgeHit()) {
            this._syncVideoBadgeHit();
        }
    }

    private _resolveKind(fallback: ActionButtonKind, nodeName: string): ActionButtonKind {
        const key = nodeName.toLowerCase();
        if (key.includes('reset')) {
            return ActionButtonKind.Reset;
        }
        if (key.includes('answer')) {
            return ActionButtonKind.Answer;
        }
        if (key.includes('undo')) {
            return ActionButtonKind.Undo;
        }
        return fallback;
    }

    /** 占位 SpriteSplash 会盖住根节点 Graphics 矢量图标 */
    private _hidePlaceholderSplash(): void {
        const splash = this.node.getChildByName('SpriteSplash');
        if (splash?.isValid) {
            splash.active = false;
        }
    }
}

/** 为单个 HUD 键节点挂上键帽绘制（与 BtnReset 等一致） */
export function ensureActionButtonView(buttonNode: Node | null): void {
    if (!buttonNode?.isValid) {
        return;
    }
    if (!buttonNode.getComponent(OpticalPuzzleActionButtonView)) {
        buttonNode.addComponent(OpticalPuzzleActionButtonView);
    }
}

/** 为 ActionPad 下 BtnUndo / BtnReset / BtnAnswer 等批量挂上绘制 */
export function ensureActionButtonViews(actionPad: Node | null): void {
    if (!actionPad?.isValid) {
        return;
    }
    for (const child of actionPad.children) {
        ensureActionButtonView(child);
    }
}
