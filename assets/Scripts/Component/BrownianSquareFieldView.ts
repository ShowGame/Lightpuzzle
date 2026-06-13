import {
    _decorator,
    Color,
    Component,
    Graphics,
    Node,
    UITransform,
} from 'cc';
import { clamp } from '../Utils/Utils';

const { ccclass } = _decorator;

//#region 参数（只改这里；勿用 @property，避免场景序列化旧值覆盖脚本）

/** 小正方形数量 n */
const SQUARE_COUNT = 25;

/** 边长基准 x（设计像素） */
const SIDE_BASE = 60;

/** 边长随机幅度 y：实际边长 ∈ [x - y, x + y] */
const SIDE_JITTER = 20;

/** 边长目标值随机游走（设计像素/秒），在 [x-y, x+y] 内缩放 */
const SIDE_SCALE_TARGET_WANDER = 10;

/** 边长向目标靠拢速度（越大缩放响应越快） */
const SIDE_SCALE_LERP = 4;

/** 边框厚度占边长比例 a（0.08 = 8%） */
const BORDER_THICKNESS_RATIO = 0;

/** 圆角半径占边长比例 b（0.12 = 12%） */
const CORNER_RADIUS_RATIO = 0.1;

/** 边框不透明度基准 d（0～255） */
const OPACITY_BASE = 60;

/** 不透明度随机幅度 c（0.2 = ±20% 相对 d） */
const OPACITY_JITTER_RATIO = 0.2;

/** 边框相对填充的 RGB 深度（0.55 = 边框更暗；1 则与填充同色） */
const STROKE_DARKEN_RATIO = 0.55;

/** 游走速度基准 v（设计像素/秒） */
const SPEED_BASE = 20;

/** 速度随机幅度 u：实际速度 ∈ [v - u, v + u] */
const SPEED_JITTER = 5;

/** 布朗运动：每秒速度方向最大抖动（弧度） */
const BROWNIAN_ANGLE_JITTER = 2.8;

/** 布朗运动：每秒速度标量随机游走强度 */
const BROWNIAN_SPEED_WANDER = 28;

/** 初始撒点：在网格单元内随机偏移幅度（0.7 = 单元 70% 范围内抖动） */
const SPAWN_CELL_JITTER = 0.7;

/** 运行时互斥强度（越大越均匀；0 关闭） */
const SEPARATION_STRENGTH = 1;

/** 互斥迭代次数（每帧，2～3 通常够用） */
const SEPARATION_ITERATIONS = 2;

/** 中心最小间距 = (两边长之和)/2 × 该系数（<1 允许轻贴，>1 留缝） */
const SEPARATION_GAP_RATIO = 1.4;

/** 子节点容器名 */
const PARTICLE_LAYER_NAME = 'BrownianSquareLayer';

//#endregion

interface IBrownianSquareParticle {
    node: Node;
    graphics: Graphics;
    side: number;
    /** 边长缩放目标（布朗游走，限制在 x±y） */
    sideTarget: number;
    opacity: number;
    borderRatio: number;
    cornerRatio: number;
    speed: number;
    angle: number;
}

/**
 * 挂载在任意带 UITransform 的节点上：按节点尺寸生成 n 个圆角小正方形（填充与边框同色），
 * 在范围内布朗运动游走。改参数请编辑本文件顶部常量区。
 */
@ccclass('BrownianSquareFieldView')
export class BrownianSquareFieldView extends Component {
    private _layerNode: Node | null = null;
    private _particles: IBrownianSquareParticle[] = [];
    private _boundsLeft = 0;
    private _boundsRight = 0;
    private _boundsBottom = 0;
    private _boundsTop = 0;
    private _lastFieldWidth = -1;
    private _lastFieldHeight = -1;

    protected onLoad(): void {
        this._ensureFieldTransform();
        this._rebuildField();
    }

    protected onEnable(): void {
        this._rebuildField();
    }

    protected onDisable(): void {
        this._clearParticles();
    }

    protected update(dt: number): void {
        if (this._particles.length === 0) {
            return;
        }
        if (this._syncBoundsIfResized()) {
            this._rebuildField();
            return;
        }
        this._stepBrownianMotion(dt);
    }

    /** 尺寸变更后手动重建 */
    rebuild(): void {
        this._rebuildField();
    }

    //#region 构建

    private _ensureFieldTransform(): UITransform | null {
        const ut = this.getComponent(UITransform) ?? this.addComponent(UITransform);
        return ut;
    }

    private _ensureLayerNode(): Node {
        let layer = this.node.getChildByName(PARTICLE_LAYER_NAME);
        if (!layer?.isValid) {
            layer = new Node(PARTICLE_LAYER_NAME);
            layer.setParent(this.node);
        }
        layer.setPosition(0, 0, 0);
        if (!layer.getComponent(UITransform)) {
            layer.addComponent(UITransform);
        }
        this._layerNode = layer;
        return layer;
    }

    private _syncBoundsIfResized(): boolean {
        const ut = this._ensureFieldTransform();
        if (!ut) {
            return false;
        }
        const w = ut.width;
        const h = ut.height;
        if (w === this._lastFieldWidth && h === this._lastFieldHeight) {
            return false;
        }
        return true;
    }

    private _updateBounds(): void {
        const ut = this._ensureFieldTransform();
        if (!ut) {
            return;
        }
        const w = ut.width;
        const h = ut.height;
        this._lastFieldWidth = w;
        this._lastFieldHeight = h;
        this._boundsLeft = -ut.anchorX * w;
        this._boundsRight = this._boundsLeft + w;
        this._boundsBottom = -ut.anchorY * h;
        this._boundsTop = this._boundsBottom + h;
    }

    private _rebuildField(): void {
        this._updateBounds();
        this._clearParticles();
        const layer = this._ensureLayerNode();
        const count = Math.max(0, Math.floor(SQUARE_COUNT));
        for (let i = 0; i < count; i++) {
            this._particles.push(this._createParticle(layer, i, count));
        }
        if (SEPARATION_STRENGTH > 0) {
            this._applySpatialSeparation(SEPARATION_ITERATIONS * 3);
        }
    }

    private _createParticle(layer: Node, index: number, total: number): IBrownianSquareParticle {
        const side = this._randomSide();
        const opacity = this._randomOpacity();
        const speed = this._randomSpeed();
        const angle = Math.random() * Math.PI * 2;
        const half = side * 0.5;
        const { x, y } = this._sampleGridSpawnPosition(index, total, half);

        const node = new Node(`BrownianSq_${index}`);
        node.setParent(layer);
        node.setPosition(x, y, 0);

        const ut = node.addComponent(UITransform);
        ut.setContentSize(side, side);
        ut.setAnchorPoint(0.5, 0.5);

        const graphics = node.addComponent(Graphics);
        const particle: IBrownianSquareParticle = {
            node,
            graphics,
            side,
            sideTarget: side,
            opacity,
            borderRatio: BORDER_THICKNESS_RATIO,
            cornerRatio: CORNER_RADIUS_RATIO,
            speed,
            angle,
        };
        this._drawSquareStroke(particle);
        return particle;
    }

    private _drawSquareStroke(p: IBrownianSquareParticle): void {
        const g = p.graphics;
        if (!g?.isValid) {
            return;
        }
        const side = p.side;
        const half = side * 0.5;
        const lineWidth = Math.max(1, side * p.borderRatio);
        const radius = clamp(side * p.cornerRatio, 0, half);

        g.clear();
        g.lineWidth = lineWidth;
        g.lineJoin = Graphics.LineJoin.ROUND;
        g.lineCap = Graphics.LineCap.ROUND;
        const alpha = clamp(Math.round(p.opacity), 0, 255);
        const strokeRgb = clamp(Math.round(255 * STROKE_DARKEN_RATIO), 0, 255);
        g.fillColor = new Color(255, 255, 255, alpha);
        g.strokeColor = new Color(strokeRgb, strokeRgb, strokeRgb, alpha);
        g.roundRect(-half, -half, side, side, radius);
        g.fill();
        g.stroke();
    }

    private _clearParticles(): void {
        for (const p of this._particles) {
            if (p.node?.isValid) {
                p.node.destroy();
            }
        }
        this._particles.length = 0;
    }

    //#endregion

    //#region 空间平衡

    /** 按网格分区生成初始位置，避免纯随机留下大面积空白 */
    private _sampleGridSpawnPosition(index: number, total: number, half: number): { x: number; y: number } {
        const minX = this._boundsLeft + half;
        const maxX = this._boundsRight - half;
        const minY = this._boundsBottom + half;
        const maxY = this._boundsTop - half;
        const spanX = maxX - minX;
        const spanY = maxY - minY;
        const centerX = (minX + maxX) * 0.5;
        const centerY = (minY + maxY) * 0.5;
        if (spanX <= 0 || spanY <= 0 || total <= 0) {
            return { x: centerX, y: centerY };
        }

        const aspect = spanX / Math.max(spanY, 1);
        const cols = Math.max(1, Math.ceil(Math.sqrt(total * aspect)));
        const rows = Math.max(1, Math.ceil(total / cols));
        const col = index % cols;
        const row = Math.floor(index / cols);
        const cellW = spanX / cols;
        const cellH = spanY / rows;
        const jitter = clamp(SPAWN_CELL_JITTER, 0, 1);
        const x = clamp(
            minX + (col + 0.5) * cellW + (Math.random() - 0.5) * cellW * jitter,
            minX,
            maxX,
        );
        const y = clamp(
            minY + (row + 0.5) * cellH + (Math.random() - 0.5) * cellH * jitter,
            minY,
            maxY,
        );
        return { x, y };
    }

    /** 运行时轻量互斥：过近则推开，减轻聚堆与大块空白 */
    private _applySpatialSeparation(iterations: number): void {
        if (SEPARATION_STRENGTH <= 0 || this._particles.length < 2) {
            return;
        }
        const strength = clamp(SEPARATION_STRENGTH, 0, 1);
        const gapRatio = Math.max(0.1, SEPARATION_GAP_RATIO);

        for (let pass = 0; pass < iterations; pass++) {
            for (let i = 0; i < this._particles.length; i++) {
                const a = this._particles[i];
                if (!a.node?.isValid) {
                    continue;
                }
                const posA = a.node.position;
                let ax = posA.x;
                let ay = posA.y;

                for (let j = i + 1; j < this._particles.length; j++) {
                    const b = this._particles[j];
                    if (!b.node?.isValid) {
                        continue;
                    }
                    const posB = b.node.position;
                    let bx = posB.x;
                    let by = posB.y;

                    const dx = bx - ax;
                    const dy = by - ay;
                    const distSq = dx * dx + dy * dy;
                    const minDist = (a.side + b.side) * 0.5 * gapRatio;
                    if (minDist <= 0) {
                        continue;
                    }

                    if (distSq >= minDist * minDist) {
                        continue;
                    }

                    let dist = Math.sqrt(distSq);
                    if (dist < 1e-4) {
                        const angle = Math.random() * Math.PI * 2;
                        const push = minDist * 0.5 * strength;
                        ax -= Math.cos(angle) * push;
                        ay -= Math.sin(angle) * push;
                        bx += Math.cos(angle) * push;
                        by += Math.sin(angle) * push;
                    } else {
                        const overlap = (minDist - dist) * 0.5 * strength;
                        const nx = dx / dist;
                        const ny = dy / dist;
                        ax -= nx * overlap;
                        ay -= ny * overlap;
                        bx += nx * overlap;
                        by += ny * overlap;
                    }

                    const aHalf = a.side * 0.5;
                    const bHalf = b.side * 0.5;
                    ax = clamp(ax, this._boundsLeft + aHalf, this._boundsRight - aHalf);
                    ay = clamp(ay, this._boundsBottom + aHalf, this._boundsTop - aHalf);
                    bx = clamp(bx, this._boundsLeft + bHalf, this._boundsRight - bHalf);
                    by = clamp(by, this._boundsBottom + bHalf, this._boundsTop - bHalf);

                    a.node.setPosition(ax, ay, 0);
                    b.node.setPosition(bx, by, 0);
                }
            }
        }
    }

    private _clampParticleToBounds(p: IBrownianSquareParticle, x: number, y: number): { x: number; y: number } {
        const half = p.side * 0.5;
        return {
            x: clamp(x, this._boundsLeft + half, this._boundsRight - half),
            y: clamp(y, this._boundsBottom + half, this._boundsTop - half),
        };
    }

    //#endregion

    //#region 布朗运动

    private _stepBrownianMotion(dt: number): void {
        const safeDt = clamp(dt, 0, 0.05);
        for (const p of this._particles) {
            if (!p.node?.isValid) {
                continue;
            }

            this._stepSideScale(p, safeDt);

            p.angle += (Math.random() - 0.5) * 2 * BROWNIAN_ANGLE_JITTER * safeDt;
            p.speed = clamp(
                p.speed + (Math.random() - 0.5) * 2 * BROWNIAN_SPEED_WANDER * safeDt,
                this._speedMin(),
                this._speedMax(),
            );

            let vx = Math.cos(p.angle) * p.speed;
            let vy = Math.sin(p.angle) * p.speed;

            const pos = p.node.position;
            let x = pos.x + vx * safeDt;
            let y = pos.y + vy * safeDt;

            const half = p.side * 0.5;
            const minX = this._boundsLeft + half;
            const maxX = this._boundsRight - half;
            const minY = this._boundsBottom + half;
            const maxY = this._boundsTop - half;

            if (x < minX) {
                x = minX;
                vx = Math.abs(vx);
            } else if (x > maxX) {
                x = maxX;
                vx = -Math.abs(vx);
            }
            if (y < minY) {
                y = minY;
                vy = Math.abs(vy);
            } else if (y > maxY) {
                y = maxY;
                vy = -Math.abs(vy);
            }

            p.angle = Math.atan2(vy, vx);
            const clamped = this._clampParticleToBounds(p, x, y);
            p.node.setPosition(clamped.x, clamped.y, 0);
        }

        this._applySpatialSeparation(SEPARATION_ITERATIONS);
    }

    //#endregion

    //#region 随机参数

    private _sideMin(): number {
        return Math.max(4, SIDE_BASE - Math.max(0, SIDE_JITTER));
    }

    private _sideMax(): number {
        return SIDE_BASE + Math.max(0, SIDE_JITTER);
    }

    private _randomSide(): number {
        const min = this._sideMin();
        const max = this._sideMax();
        return min + Math.random() * (max - min);
    }

    /** 边长在 x±y 范围内随机缩放，并同步重绘与边界 */
    private _stepSideScale(p: IBrownianSquareParticle, dt: number): void {
        const minSide = this._sideMin();
        const maxSide = this._sideMax();

        p.sideTarget += (Math.random() - 0.5) * 2 * SIDE_SCALE_TARGET_WANDER * dt;
        p.sideTarget = clamp(p.sideTarget, minSide, maxSide);

        const prevSide = p.side;
        const lerpT = clamp(SIDE_SCALE_LERP * dt, 0, 1);
        p.side = prevSide + (p.sideTarget - prevSide) * lerpT;

        if (Math.abs(p.side - prevSide) < 0.2) {
            return;
        }

        const ut = p.node.getComponent(UITransform);
        if (ut) {
            ut.setContentSize(p.side, p.side);
        }
        this._drawSquareStroke(p);

        const pos = p.node.position;
        const clamped = this._clampParticleToBounds(p, pos.x, pos.y);
        if (clamped.x !== pos.x || clamped.y !== pos.y) {
            p.node.setPosition(clamped.x, clamped.y, 0);
        }
    }

    private _randomOpacity(): number {
        const ratio = Math.max(0, OPACITY_JITTER_RATIO);
        const factor = 1 + (Math.random() * 2 - 1) * ratio;
        return clamp(OPACITY_BASE * factor, 0, 255);
    }

    private _randomSpeed(): number {
        const jitter = Math.max(0, SPEED_JITTER);
        return clamp(SPEED_BASE + (Math.random() * 2 - 1) * jitter, 0, this._speedMax());
    }

    private _speedMin(): number {
        return Math.max(0, SPEED_BASE - Math.max(0, SPEED_JITTER));
    }

    private _speedMax(): number {
        return Math.max(this._speedMin(), SPEED_BASE + Math.max(0, SPEED_JITTER));
    }

    //#endregion
}
