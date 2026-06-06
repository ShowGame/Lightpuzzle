import { _decorator, Component, Graphics, Label, Node, UITransform } from 'cc';
import { getOpticalLevelById } from '../Config/OpticalPuzzleLevels';
import type { OpticalSnapshotNotify } from '../Application/OpticalPuzzleSession';
import { isPerfectClear } from '../Core/OpticalPuzzleStarRating';
import { EVENT_ENUM } from '../../../Utils/Enum';
import { OPTICAL_PUZZLE } from '../../../Utils/Event';
import { drawWinPanelTitleGlyph } from './OpticalPuzzleWinPanelTitleGlyph';
import { resolveWinPanelWindsNode } from './OpticalPuzzleWinPanelWindsView';

const { ccclass } = _decorator;

/** 通关标题文案（winds/title/label） */
const WIN_TITLE_TEXT_SUCCESS = '成 功 点 亮';
const WIN_TITLE_TEXT_PERFECT = '完 美 点 亮';

/** winPanel/winds/title：通关标题横条（SVG 上半部造型）+ 标题文案 */
@ccclass('OpticalPuzzleWinPanelTitleView')
export class OpticalPuzzleWinPanelTitleView extends Component {
    private _graphics: Graphics | null = null;
    private _label: Label | null = null;

    protected onLoad(): void {
        this._hidePlaceholderSplash();
        this._label = this.node.getChildByName('label')?.getComponent(Label) ?? null;
        OPTICAL_PUZZLE.on(EVENT_ENUM.OPTICAL_SNAPSHOT_CHANGED, this._onSnapshotChanged, this);
        this._setTitleText(WIN_TITLE_TEXT_SUCCESS);
        this._redraw();
    }

    protected onEnable(): void {
        this._redraw();
    }

    protected onDestroy(): void {
        OPTICAL_PUZZLE.off(EVENT_ENUM.OPTICAL_SNAPSHOT_CHANGED, this._onSnapshotChanged, this);
    }

    refresh(): void {
        this._redraw();
    }

    private _hidePlaceholderSplash(): void {
        const splash = this.node.getChildByName('SpriteSplash');
        if (splash?.isValid) {
            splash.active = false;
        }
    }

    private _onSnapshotChanged(payload: OpticalSnapshotNotify): void {
        const reason = payload?.notifyReason;
        if (reason === 'load' || reason === 'reset') {
            this._setTitleText(WIN_TITLE_TEXT_SUCCESS);
            return;
        }
        if (reason !== 'complete') {
            return;
        }
        const levelId = payload.snapshot?.levelId ?? 0;
        const level = getOpticalLevelById(levelId);
        const thresholds = level?.starThresholds;
        if (!thresholds) {
            this._setTitleText(WIN_TITLE_TEXT_SUCCESS);
            return;
        }
        const text = isPerfectClear(payload.moveCount, thresholds)
            ? WIN_TITLE_TEXT_PERFECT
            : WIN_TITLE_TEXT_SUCCESS;
        this._setTitleText(text);
    }

    private _setTitleText(text: string): void {
        if (!this._label?.isValid) {
            return;
        }
        this._label.string = text;
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
        drawWinPanelTitleGlyph(g, left, bottom, w, h);
    }
}

/** 自 GameRoot 子树解析 layerOverlay/winPanel/winds/title */
export function resolveWinPanelTitleNode(root: Node | null): Node | null {
    return resolveWinPanelWindsNode(root)?.getChildByName('title') ?? null;
}

/** 为 winds/title 挂上标题横条绘制 */
export function ensureWinPanelTitleView(root: Node | null): void {
    const title = resolveWinPanelTitleNode(root);
    if (!title?.isValid) {
        return;
    }
    if (!title.getComponent(OpticalPuzzleWinPanelTitleView)) {
        title.addComponent(OpticalPuzzleWinPanelTitleView);
    }
}
