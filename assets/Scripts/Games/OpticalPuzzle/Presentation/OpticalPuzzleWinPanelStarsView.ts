import { _decorator, Component, Graphics, Node, UITransform } from 'cc';
import { getOpticalLevelById } from '../Config/OpticalPuzzleLevels';
import {
    defaultDimStarStates,
    type OpticalStarSlotStates,
    resolveStarSlotStates,
} from '../Core/OpticalPuzzleStarRating';
import type { OpticalSnapshotNotify } from '../Application/OpticalPuzzleSession';
import { EVENT_ENUM } from '../../../Utils/Enum';
import { OPTICAL_PUZZLE } from '../../../Utils/Event';
import {
    drawWinPanelStarGlyph,
    WIN_STAR_SIDE_ROTATION_DEG,
} from './OpticalPuzzleWinPanelStarGlyph';
import { resolveWinPanelWindsNode } from './OpticalPuzzleWinPanelWindsView';

const { ccclass } = _decorator;

/** 单颗星设计边长 */
export const WIN_STAR_DESIGN_SIZE = 80;

@ccclass('OpticalPuzzleWinPanelStarsView')
export class OpticalPuzzleWinPanelStarsView extends Component {
    private _graphics: Graphics | null = null;
    private _slotStates: OpticalStarSlotStates = defaultDimStarStates();

    protected onLoad(): void {
        this._hidePlaceholderSplash();
        OPTICAL_PUZZLE.on(EVENT_ENUM.OPTICAL_SNAPSHOT_CHANGED, this._onSnapshotChanged, this);
        this._redraw();
    }

    protected onEnable(): void {
        this._redraw();
    }

    protected onDestroy(): void {
        OPTICAL_PUZZLE.off(EVENT_ENUM.OPTICAL_SNAPSHOT_CHANGED, this._onSnapshotChanged, this);
    }

    /** 直接设置三颗星状态（调试用） */
    setSlotStates(states: OpticalStarSlotStates): void {
        this._slotStates = states;
        this._redraw();
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
            this._slotStates = defaultDimStarStates();
            this._redraw();
            return;
        }
        if (reason !== 'complete') {
            return;
        }
        const levelId = payload.snapshot?.levelId ?? 0;
        const level = getOpticalLevelById(levelId);
        if (!level?.starThresholds) {
            this._slotStates = defaultDimStarStates();
            this._redraw();
            return;
        }
        this._slotStates = resolveStarSlotStates(payload.moveCount, level.starThresholds);
        this._redraw();
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
        const half = WIN_STAR_DESIGN_SIZE * 0.5;

        const slots: ReadonlyArray<{ cx: number; cy: number; rotationDeg: number }> = [
            { cx: left + half, cy: bottom + h * 0.5, rotationDeg: WIN_STAR_SIDE_ROTATION_DEG },
            { cx: left + w * 0.5, cy: bottom + h - half, rotationDeg: 0 },
            { cx: left + w - half, cy: bottom + h * 0.5, rotationDeg: -WIN_STAR_SIDE_ROTATION_DEG },
        ];

        for (let i = 0; i < slots.length; i++) {
            const { cx, cy, rotationDeg } = slots[i];
            drawWinPanelStarGlyph(
                g,
                cx - half,
                cy - half,
                WIN_STAR_DESIGN_SIZE,
                WIN_STAR_DESIGN_SIZE,
                this._slotStates[i],
                rotationDeg,
            );
        }
    }
}

export function resolveWinPanelStarsNode(root: Node | null): Node | null {
    return resolveWinPanelWindsNode(root)?.getChildByName('stars') ?? null;
}

export function ensureWinPanelStarsView(root: Node | null): void {
    const stars = resolveWinPanelStarsNode(root);
    if (!stars?.isValid) {
        return;
    }
    if (!stars.getComponent(OpticalPuzzleWinPanelStarsView)) {
        stars.addComponent(OpticalPuzzleWinPanelStarsView);
    }
}
