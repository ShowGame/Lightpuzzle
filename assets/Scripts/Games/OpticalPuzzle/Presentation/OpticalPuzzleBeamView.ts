import {
    _decorator,
    Color,
    Component,
    Graphics,
    UITransform,
} from 'cc';
import type { OpticalBeamSnapshot } from '../Core/OpticalPuzzleCore';
import type { MixedLightColorKey } from '../Core/OpticalColorMix';

const { ccclass } = _decorator;

const CELL = 56;
const BEAM_LINE_WIDTH = 4;

function colorKeyToBeamColor(key: string): Color {
    const k = key as MixedLightColorKey;
    switch (k) {
        case 'red':
            return new Color(255, 72, 72, 230);
        case 'green':
            return new Color(72, 220, 110, 230);
        case 'blue':
            return new Color(72, 140, 255, 230);
        case 'yellow':
            return new Color(255, 220, 72, 230);
        case 'cyan':
            return new Color(72, 220, 230, 230);
        case 'purple':
            return new Color(180, 90, 255, 230);
        default:
            return new Color(255, 255, 255, 235);
    }
}

/** 光路占位：直线段；镜格内由 tracer 拆成 L 形两段（后续换美术素材） */
@ccclass('OpticalPuzzleBeamView')
export class OpticalPuzzleBeamView extends Component {
    private _graphics: Graphics | null = null;

    protected onLoad(): void {
        this._ensureGraphics();
        let ut = this.getComponent(UITransform);
        if (!ut) {
            ut = this.addComponent(UITransform);
            ut.setContentSize(700, 700);
        }
    }

    private _ensureGraphics(): Graphics | null {
        if (!this._graphics?.isValid) {
            this._graphics = this.getComponent(Graphics) ?? this.addComponent(Graphics);
        }
        return this._graphics;
    }

    render(snapshot: OpticalBeamSnapshot): void {
        const g = this._ensureGraphics();
        if (!g) {
            return;
        }
        g.clear();
        const ox = (-snapshot.width * CELL) / 2;
        const oy = (snapshot.height * CELL) / 2;

        for (const seg of snapshot.segments) {
            g.strokeColor = colorKeyToBeamColor(seg.colorKey);
            g.lineWidth = BEAM_LINE_WIDTH;
            g.moveTo(ox + seg.x0 * CELL, oy - seg.y0 * CELL);
            g.lineTo(ox + seg.x1 * CELL, oy - seg.y1 * CELL);
            g.stroke();
        }
    }
}
