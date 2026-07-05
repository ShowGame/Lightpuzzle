import {
    _decorator,
    assetManager,
    Color,
    Component,
    ImageAsset,
    Node,
    ParticleSystem2D,
    Rect,
    resources,
    Size,
    SpriteFrame,
    Texture2D,
    UITransform,
    Vec2,
    sys,
} from 'cc';
import type { OpticalBeamBlockContact } from '../Core/OpticalBeamTypes';
import { resolveBlockContactColorFromSegments } from '../Core/OpticalBeamContactResolve';
import { coerceBeamColorKey } from '../Core/OpticalColorMix';
import type { OpticalBeamSnapshot } from '../Core/OpticalPuzzleCore';
import { resolveBeamColorKey } from '../Core/OpticalLightColor';
import { Direction, normalizeDirection } from '../Core/OpticalPuzzleTypes';
import { BEAM_SPARK_RESOURCE_PATHS, BEAM_SPARK_SPRITE_UUIDS } from './OpticalPuzzleBeamSparkSpriteUuids';
import { beamColorFromKey } from './OpticalPuzzleColorUtil';
import { OPTICAL_CELL_SIZE, opticalBoardLayout, opticalGridPointToLocal, syncOpticalPlayBoardLayers } from './OpticalPuzzleLayout';

const { ccclass, property } = _decorator;

const CELL = OPTICAL_CELL_SIZE;
const MAX_IMPACT_EMITTERS = 48;
const CONTACT_BACK_OFFSET = 0.06;

const GRID_DX: ReadonlyArray<number> = [1, 0, -1, 0];
const GRID_DY: ReadonlyArray<number> = [0, -1, 0, 1];

let _whiteDotSprite: SpriteFrame | null = null;
const _sparkSpriteCache = new Map<string, SpriteFrame>();
let _sparkSpritesLoading = false;
let _sparkSpritesReady = false;
const _sparkLoadWaiters: Array<() => void> = [];

function normalizeImpactColorKey(raw: unknown): string {
    return coerceBeamColorKey(raw);
}

function parseSparkColorKeyFromSpriteFrame(sf: SpriteFrame): string | null {
    const candidates = [sf.name, sf.texture?.name];
    for (const raw of candidates) {
        if (!raw) {
            continue;
        }
        const match = /beam_spark_(\w+)/i.exec(String(raw));
        if (match?.[1]) {
            return resolveBeamColorKey(match[1]);
        }
    }
    return null;
}

function registerSparkSpriteFrames(frames: ReadonlyArray<SpriteFrame | null | undefined>): boolean {
    let added = false;
    for (const sf of frames) {
        if (!sf?.isValid) {
            continue;
        }
        const colorKey = parseSparkColorKeyFromSpriteFrame(sf);
        if (!colorKey) {
            continue;
        }
        _sparkSpriteCache.set(colorKey, sf);
        added = true;
    }
    return added;
}

function isValidSpriteFrame(asset: unknown): asset is SpriteFrame {
    return !!asset && typeof asset === 'object' && (asset as SpriteFrame).isValid === true;
}

function tryGetSparkSpriteByUuid(uuid: string): SpriteFrame | null {
    const cached = assetManager.assets.get(uuid);
    if (isValidSpriteFrame(cached)) {
        return cached;
    }
    const mainBundle = assetManager.bundles.get('main');
    const fromMain = mainBundle?.get(uuid) ?? null;
    return isValidSpriteFrame(fromMain) ? fromMain : null;
}

function loadSparkSpriteAsync(colorKey: string, onDone: () => void): void {
    const resourcePath = BEAM_SPARK_RESOURCE_PATHS[colorKey];
    if (resourcePath) {
        resources.load(resourcePath, (_err, asset) => {
            if (isValidSpriteFrame(asset)) {
                _sparkSpriteCache.set(colorKey, asset);
                onDone();
                return;
            }
            loadSparkSpriteByUuidAsync(colorKey, onDone);
        });
        return;
    }
    loadSparkSpriteByUuidAsync(colorKey, onDone);
}

function loadSparkSpriteByUuidAsync(colorKey: string, onDone: () => void): void {
    const uuid = BEAM_SPARK_SPRITE_UUIDS[colorKey];
    if (!uuid) {
        onDone();
        return;
    }
    assetManager.loadAny({ uuid }, (_err, asset) => {
        if (isValidSpriteFrame(asset)) {
            _sparkSpriteCache.set(colorKey, asset);
        }
        onDone();
    });
}

function ensureSparkSpriteFramesLoaded(onReady?: () => void): void {
    if (_sparkSpritesReady) {
        onReady?.();
        return;
    }
    if (onReady) {
        _sparkLoadWaiters.push(onReady);
    }
    if (_sparkSpritesLoading) {
        return;
    }
    _sparkSpritesLoading = true;
    const colorKeys = Object.keys(BEAM_SPARK_SPRITE_UUIDS);
    let pending = 0;
    for (const colorKey of colorKeys) {
        if (_sparkSpriteCache.has(colorKey)) {
            continue;
        }
        const uuid = BEAM_SPARK_SPRITE_UUIDS[colorKey];
        const sync = tryGetSparkSpriteByUuid(uuid);
        if (sync) {
            _sparkSpriteCache.set(colorKey, sync);
            continue;
        }
        pending += 1;
        loadSparkSpriteAsync(colorKey, () => {
            pending -= 1;
            if (pending <= 0) {
                _finishSparkSpriteLoad();
            }
        });
    }
    if (pending === 0) {
        _finishSparkSpriteLoad();
    }
}

function _finishSparkSpriteLoad(): void {
    _sparkSpritesReady = true;
    _sparkSpritesLoading = false;
    const waiters = _sparkLoadWaiters.splice(0, _sparkLoadWaiters.length);
    for (const cb of waiters) {
        cb();
    }
}

function getRuntimeWhiteDotSpriteFrame(): SpriteFrame {
    if (_whiteDotSprite?.isValid) {
        return _whiteDotSprite;
    }
    const imageAsset = new ImageAsset();
    imageAsset.reset({
        _data: new Uint8Array([255, 255, 255, 255]),
        width: 1,
        height: 1,
        format: Texture2D.PixelFormat.RGBA8888,
        _compressed: false,
    });
    const texture = new Texture2D();
    texture.image = imageAsset;
    const spriteFrame = new SpriteFrame();
    spriteFrame.texture = texture;
    spriteFrame.rect = new Rect(0, 0, 1, 1);
    spriteFrame.originalSize = new Size(1, 1);
    _whiteDotSprite = spriteFrame;
    return spriteFrame;
}

function getSparkSpriteFrame(colorKey: unknown): SpriteFrame | null {
    const key = normalizeImpactColorKey(colorKey);
    const cached = _sparkSpriteCache.get(key);
    return cached?.isValid ? cached : null;
}

function getParticleSpriteFrame(colorKey: unknown): SpriteFrame {
    return getSparkSpriteFrame(colorKey) ?? getRuntimeWhiteDotSpriteFrame();
}

function hasBakedSparkSprite(colorKey: unknown): boolean {
    return !!getSparkSpriteFrame(colorKey);
}

function contactPoolKey(contact: OpticalBeamBlockContact, colorKey: string): string {
    return `${Math.round(contact.x * 2000)},${Math.round(contact.y * 2000)},${contact.dir},${colorKey}`;
}

function isWeChatMiniGame(): boolean {
    return sys.platform === sys.Platform.WECHAT_GAME;
}

function beamScreenAngle(dir: Direction): number {
    const dx = GRID_DX[dir] ?? 0;
    const dy = -(GRID_DY[dir] ?? 0);
    return (Math.atan2(dy, dx) * 180) / Math.PI;
}

function beamImpactEmissionAngle(dir: Direction): number {
    return beamScreenAngle(dir) + 180;
}

/** 设计分辨率下（scale=1）的阻挡火花参数；ParticleSystem2D 不随父节点 scale 缩放 */
const IMPACT_PARTICLE_BASE = {
    startSize: 3,
    startSizeVar: 1,
    endSize: 1,
    endSizeVar: 0.5,
    speed: 50,
    speedVar: 20,
    radialAccel: 20,
    radialAccelVar: 5,
    tangentialAccelVar: 12,
} as const;

function contactPosVar(dir: Direction, visualScale = 1): Vec2 {
    const s = Math.max(0.01, visualScale);
    switch (dir) {
        case Direction.Right:
        case Direction.Left:
            return new Vec2(2 * s, 10 * s);
        case Direction.Up:
        case Direction.Down:
            return new Vec2(10 * s, 2 * s);
        default:
            return new Vec2(6 * s, 6 * s);
    }
}

function applyImpactVisualScale(ps: ParticleSystem2D, dir: Direction, visualScale: number): void {
    const s = Math.max(0.01, visualScale);
    ps.startSize = IMPACT_PARTICLE_BASE.startSize * s;
    ps.startSizeVar = IMPACT_PARTICLE_BASE.startSizeVar * s;
    ps.endSize = IMPACT_PARTICLE_BASE.endSize * s;
    ps.endSizeVar = IMPACT_PARTICLE_BASE.endSizeVar * s;
    ps.speed = IMPACT_PARTICLE_BASE.speed * s;
    ps.speedVar = IMPACT_PARTICLE_BASE.speedVar * s;
    ps.radialAccel = IMPACT_PARTICLE_BASE.radialAccel * s;
    ps.radialAccelVar = IMPACT_PARTICLE_BASE.radialAccelVar * s;
    ps.tangentialAccelVar = IMPACT_PARTICLE_BASE.tangentialAccelVar * s;
    ps.posVar = contactPosVar(dir, s);
}

function contactScreenPosition(
    contact: OpticalBeamBlockContact,
    layout: ReturnType<typeof opticalBoardLayout>,
): { px: number; py: number } {
    const dir = normalizeDirection(contact.dir, Direction.Right);
    const gx = contact.x - GRID_DX[dir] * CONTACT_BACK_OFFSET;
    const gy = contact.y - GRID_DY[dir] * CONTACT_BACK_OFFSET;
    const p = opticalGridPointToLocal(gx, gy, layout);
    return { px: p.x, py: p.y };
}

function applyBeamColorToParticle(ps: ParticleSystem2D, colorKey: unknown): void {
    const resolvedKey = normalizeImpactColorKey(colorKey);
    const beam = beamColorFromKey(resolvedKey);
    const baked = hasBakedSparkSprite(colorKey);
    ps.spriteFrame = getParticleSpriteFrame(colorKey);

    if (isWeChatMiniGame()) {
        ps.startColor = new Color(beam.r, beam.g, beam.b, Math.min(220, beam.a));
        ps.endColor = new Color(beam.r, beam.g, beam.b, 0);
        ps.color = new Color(beam.r, beam.g, beam.b, 255);
    } else if (baked) {
        ps.startColor = new Color(255, 255, 255, 220);
        ps.endColor = new Color(255, 255, 255, 0);
        ps.color = new Color(255, 255, 255, 255);
    } else {
        ps.startColor = new Color(beam.r, beam.g, beam.b, Math.min(220, beam.a));
        ps.endColor = new Color(beam.r, beam.g, beam.b, 0);
        ps.color = new Color(255, 255, 255, 255);
    }
    ps.startColorVar = new Color(0, 0, 0, 0);
    ps.endColorVar = new Color(0, 0, 0, 0);
}

function configureImpactParticle(
    ps: ParticleSystem2D,
    dir: Direction,
    colorKey: string,
    visualScale = 1,
): void {
    ps.custom = true;
    ps.playOnLoad = false;
    ps.autoRemoveOnFinish = false;
    ps.duration = -1;
    ps.life = 0.3;
    ps.lifeVar = 0.1;
    ps.emissionRate = 60;
    ps.totalParticles = 100;
    ps.angle = beamImpactEmissionAngle(dir);
    ps.angleVar = 100;
    ps.tangentialAccel = 0;
    ps.gravity = new Vec2(0, 0);
    ps.startSpin = 0;
    ps.startSpinVar = 90;
    ps.endSpin = 0;
    ps.endSpinVar = 0;
    ps.emitterMode = ParticleSystem2D.EmitterMode.GRAVITY;
    ps.positionType = ParticleSystem2D.PositionType.FREE;
    applyImpactVisualScale(ps, dir, visualScale);
    applyBeamColorToParticle(ps, colorKey);
}

function applyImpactDirection(ps: ParticleSystem2D, dir: Direction, visualScale = 1): void {
    ps.angle = beamImpactEmissionAngle(dir);
    ps.angleVar = 85;
    applyImpactVisualScale(ps, dir, visualScale);
}

interface ImpactEmitterEntry {
    node: Node;
    ps: ParticleSystem2D;
    colorKey: string;
    dir: Direction;
}

function isParticleAlive(ps: ParticleSystem2D | null | undefined): ps is ParticleSystem2D {
    return !!ps?.isValid && ps.enabledInHierarchy;
}

function disposeImpactEmitter(entry: ImpactEmitterEntry): void {
    if (entry.node?.isValid) {
        entry.node.removeFromParent();
        entry.node.destroy();
    }
}

/** 光线阻挡点粒子：主包贴图（Sprites/OpticalFX） */
@ccclass('OpticalPuzzleBeamImpactView')
export class OpticalPuzzleBeamImpactView extends Component {
    /** 可选：拖入 Sprites/OpticalFX 下 beam_spark_*，编辑器预览与构建保活 */
    @property({ type: [SpriteFrame], tooltip: '可选，七色 beam_spark SpriteFrame' })
    sparkSpriteFrames: SpriteFrame[] = [];

    private _emitters = new Map<string, ImpactEmitterEntry>();
    private _lastSnapshot: OpticalBeamSnapshot | null = null;
    /** 与棋盘 scaleRoot 缩放一致，补偿 ParticleSystem2D 不继承父节点 scale */
    private _visualScale = 1;

    protected onLoad(): void {
        let ut = this.getComponent(UITransform);
        if (!ut) {
            ut = this.addComponent(UITransform);
            ut.setContentSize(700, 700);
        }
        if (registerSparkSpriteFrames(this.sparkSpriteFrames)) {
            _sparkSpritesReady = true;
            _sparkSpritesLoading = false;
        }
        ensureSparkSpriteFramesLoaded(() => {
            if (!this.isValid || !this._lastSnapshot) {
                return;
            }
            this._clearEmitters();
            this.render(this._lastSnapshot);
        });
    }

    protected onDestroy(): void {
        this._clearEmitters();
    }

    /** 同步棋盘缩放（由 OpticalPuzzleRoot._applyPlayLayerLayout 调用） */
    setVisualScale(scale: number): void {
        const next = Math.max(0.01, scale);
        if (Math.abs(this._visualScale - next) < 1e-4) {
            return;
        }
        this._visualScale = next;
        for (const entry of this._emitters.values()) {
            if (!isParticleAlive(entry.ps)) {
                continue;
            }
            applyImpactDirection(entry.ps, entry.dir, next);
            applyBeamColorToParticle(entry.ps, entry.colorKey);
            entry.ps.resetSystem();
        }
    }

    /** 由 OpticalPuzzleRoot.beamSparkKeepAlive 注入，保证微信构建包含贴图 */
    applyExternalSparkSpriteFrames(frames: ReadonlyArray<SpriteFrame>): void {
        if (!registerSparkSpriteFrames(frames)) {
            return;
        }
        _sparkSpritesReady = true;
        _sparkSpritesLoading = false;
        if (this._lastSnapshot) {
            this._clearEmitters();
            this.render(this._lastSnapshot);
        }
    }

    render(snapshot: OpticalBeamSnapshot): void {
        this._lastSnapshot = snapshot;
        if (!_sparkSpritesReady) {
            ensureSparkSpriteFramesLoaded(() => {
                if (this.isValid) {
                    this.render(snapshot);
                }
            });
            return;
        }

        const layout = opticalBoardLayout(snapshot.width, snapshot.height, CELL);
        syncOpticalPlayBoardLayers(this.node.parent, layout);
        const contacts = snapshot.blockContacts ?? [];
        const segments = snapshot.segments ?? [];
        const capped = contacts.length > MAX_IMPACT_EMITTERS
            ? contacts.slice(0, MAX_IMPACT_EMITTERS)
            : contacts;

        const desired = new Map<string, { px: number; py: number; colorKey: string; dir: Direction }>();
        for (const contact of capped) {
            const dir = normalizeDirection(contact.dir, Direction.Right);
            const colorKey = resolveBlockContactColorFromSegments(contact, segments);
            const key = contactPoolKey(contact, colorKey);
            const { px, py } = contactScreenPosition(contact, layout);
            desired.set(key, { px, py, colorKey, dir });
        }

        for (const [key, entry] of this._emitters) {
            if (!desired.has(key)) {
                disposeImpactEmitter(entry);
                this._emitters.delete(key);
            }
        }

        for (const [key, target] of desired) {
            let entry = this._emitters.get(key);
            if (entry && (!entry.node?.isValid || !entry.ps?.isValid)) {
                this._emitters.delete(key);
                entry = undefined;
            }
            if (!entry) {
                entry = this._createEmitter(target.colorKey, target.dir);
                this._emitters.set(key, entry);
            } else if (entry.colorKey !== target.colorKey) {
                disposeImpactEmitter(entry);
                entry = this._createEmitter(target.colorKey, target.dir);
                this._emitters.set(key, entry);
            }
            if (!entry.node?.isValid) {
                continue;
            }
            entry.node.setPosition(target.px, target.py, 0);
            if (isParticleAlive(entry.ps) && entry.dir !== target.dir) {
                applyImpactDirection(entry.ps, target.dir, this._visualScale);
                entry.dir = target.dir;
            }
        }
    }

    private _createEmitter(colorKey: string, dir: Direction): ImpactEmitterEntry {
        const node = new Node('BeamImpact');
        const ps = node.addComponent(ParticleSystem2D);
        configureImpactParticle(ps, dir, colorKey, this._visualScale);
        node.parent = this.node;
        this.scheduleOnce(() => {
            if (!this.isValid || !ps.isValid) {
                return;
            }
            if (isParticleAlive(ps)) {
                ps.resetSystem();
            }
        }, 0);
        return { node, ps, colorKey, dir };
    }

    private _clearEmitters(): void {
        for (const entry of this._emitters.values()) {
            disposeImpactEmitter(entry);
        }
        this._emitters.clear();
    }
}

/** 菜单等场景复用 beam_spark 粒子配置 */
export function ensureBeamSparkSpritesLoaded(onReady?: () => void): void {
    ensureSparkSpriteFramesLoaded(onReady);
}

export function registerBeamSparkSpriteFrames(
    frames: ReadonlyArray<SpriteFrame | null | undefined>,
): boolean {
    return registerSparkSpriteFrames(frames);
}

export function configureBeamSparkParticle(
    ps: ParticleSystem2D,
    dir: Direction,
    colorKey: string,
    visualScale = 1,
): void {
    configureImpactParticle(ps, dir, colorKey, visualScale);
}
