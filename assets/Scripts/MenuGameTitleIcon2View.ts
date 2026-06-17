import {
    _decorator,
    Component,
    Graphics,
    Node,
    ParticleSystem2D,
    Sprite,
    SpriteFrame,
    UITransform,
} from 'cc';
import {
    ensureBeamSparkSpritesLoaded,
    registerBeamSparkSpriteFrames,
} from './Games/OpticalPuzzle/Presentation/OpticalPuzzleBeamImpactView';
import {
    computeMenuTitleRightBeamLayout,
    configureMenuTitleBeamSparkParticle,
    drawMenuTitleWhiteSourceRightBeam,
} from './Games/OpticalPuzzle/Presentation/MenuGameTitleIcon2Glyph';

const { ccclass, property } = _decorator;

/** Menu/MainPanel/GameTitleIcon2：白色光源朝右，碰屏右缘 beam_spark */
@ccclass('MenuGameTitleIcon2View')
export class MenuGameTitleIcon2View extends Component {
    /** 光束右边界参考（默认向上找 Canvas） */
    @property({ type: Node, tooltip: '光束右边界参考节点，默认 Canvas' })
    beamBoundsNode: Node | null = null;

    /** 可选：拖入 beam_spark 贴图保活（微信包） */
    @property({ type: [SpriteFrame], tooltip: '可选，Sprites/OpticalFX/beam_spark_*' })
    sparkSpriteFrames: SpriteFrame[] = [];

    private _graphics: Graphics | null = null;
    private _sparkNode: Node | null = null;
    private _sparkPs: ParticleSystem2D | null = null;
    private _sparkReady = false;

    protected onLoad(): void {
        this._disableRasterPlaceholder();
        this._ensureGraphics();
        if (registerBeamSparkSpriteFrames(this.sparkSpriteFrames)) {
            this._sparkReady = true;
        }
        ensureBeamSparkSpritesLoaded(() => {
            if (!this.node?.isValid) {
                return;
            }
            this._sparkReady = true;
            this._ensureSparkEmitter();
            this._redraw();
        });
        this._redraw();
    }

    protected onEnable(): void {
        this._redraw();
    }

    private _disableRasterPlaceholder(): void {
        const splash = this.node.getChildByName('SpriteSplash');
        if (splash?.isValid) {
            splash.active = false;
        }
        const sprite = this.getComponent(Sprite);
        if (sprite) {
            sprite.enabled = false;
        }
    }

    private _ensureGraphics(): Graphics | null {
        if (!this._graphics?.isValid) {
            this._graphics = this.getComponent(Graphics) ?? this.addComponent(Graphics);
        }
        return this._graphics;
    }

    private _resolveBeamBoundsNode(): Node | null {
        if (this.beamBoundsNode?.isValid) {
            return this.beamBoundsNode;
        }
        let node: Node | null = this.node;
        while (node) {
            if (node.name === 'Canvas') {
                return node;
            }
            node = node.parent;
        }
        return null;
    }

    private _ensureSparkEmitter(): void {
        if (!this._sparkReady || this._sparkPs?.isValid) {
            return;
        }
        const node = new Node('BeamSpark');
        node.setParent(this.node);
        const ps = node.addComponent(ParticleSystem2D);
        configureMenuTitleBeamSparkParticle(ps);
        this._sparkNode = node;
        this._sparkPs = ps;
        this.scheduleOnce(() => {
            if (ps?.isValid) {
                ps.resetSystem();
            }
        }, 0);
    }

    private _syncSpark(layout: { endX: number; endY: number; hitsScreenEdge: boolean }): void {
        if (!this._sparkReady) {
            return;
        }
        this._ensureSparkEmitter();
        const sparkNode = this._sparkNode;
        const ps = this._sparkPs;
        if (!sparkNode?.isValid || !ps?.isValid) {
            return;
        }
        if (!layout.hitsScreenEdge) {
            sparkNode.active = false;
            ps.stopSystem();
            return;
        }
        sparkNode.active = true;
        sparkNode.setPosition(layout.endX, layout.endY, 0);
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
        const layout = computeMenuTitleRightBeamLayout(
            ut,
            left,
            bottom,
            w,
            h,
            this._resolveBeamBoundsNode(),
        );
        drawMenuTitleWhiteSourceRightBeam(g, left, bottom, w, h, layout);
        this._syncSpark(layout);
    }
}

/** 为 GameTitleIcon2 节点挂上光源图标绘制 */
export function ensureMenuGameTitleIcon2View(iconNode: Node | null): void {
    if (!iconNode?.isValid) {
        return;
    }
    if (!iconNode.getComponent(MenuGameTitleIcon2View)) {
        iconNode.addComponent(MenuGameTitleIcon2View);
    }
}
