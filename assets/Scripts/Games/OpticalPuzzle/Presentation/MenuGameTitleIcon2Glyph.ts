import { Graphics, Node, ParticleSystem2D, UITransform, Vec2, Vec3 } from 'cc';
import { Direction } from '../Core/OpticalPuzzleTypes';
import { configureBeamSparkParticle } from './OpticalPuzzleBeamImpactView';
import { strokeBeamSegmentGradient } from './OpticalPuzzleBeamGradient';
import { beamColorFromKey } from './OpticalPuzzleColorUtil';
import { drawSourceEmitter, sourceMuzzleScreenPoint } from './OpticalPuzzleSourceGlyph';

/** 菜单标题区白色光源向右发射的光束最大长度（设计 px） */
export const MENU_TITLE_SOURCE_BEAM_LENGTH_PX = 1000;

/** 光束右端相对屏幕边界内缩（设计 px） */
const MENU_TITLE_BEAM_EDGE_INSET_PX = 4;

/** Menu 屏右缘火花：比局内阻挡点更大 */
export function configureMenuTitleBeamSparkParticle(ps: ParticleSystem2D): void {
    configureBeamSparkParticle(ps, Direction.Right, 'white');
    ps.startSize = 4;
    ps.startSizeVar = 2;
    ps.endSize = 2;
    ps.endSizeVar = 1;
    ps.emissionRate = 85;
    ps.totalParticles = 120;
    ps.posVar = new Vec2(2, 10);
    ps.speed = 65;
    ps.speedVar = 15;
}

export interface MenuTitleRightBeamLayout {
    readonly muzzleX: number;
    readonly muzzleY: number;
    readonly endX: number;
    readonly endY: number;
    /** 是否在最大长度前碰到右边界（用于显示火花） */
    readonly hitsScreenEdge: boolean;
}

/** 在 icon 节点本地坐标系下计算向右光束终点（碰 Canvas 右缘则截断） */
export function computeMenuTitleRightBeamLayout(
    iconUt: UITransform,
    left: number,
    bottom: number,
    width: number,
    height: number,
    boundsNode: Node | null,
    maxLength = MENU_TITLE_SOURCE_BEAM_LENGTH_PX,
): MenuTitleRightBeamLayout {
    const size = Math.min(width, height);
    const cellLeft = left + (width - size) * 0.5;
    const cellBottom = bottom + (height - size) * 0.5;
    const muzzle = sourceMuzzleScreenPoint(cellLeft, cellBottom, size, Direction.Right);

    const maxEndX = muzzle.x + maxLength;
    let endX = maxEndX;
    let hitsScreenEdge = false;

    const boundsUt = boundsNode?.isValid ? boundsNode.getComponent(UITransform) : null;
    if (boundsUt) {
        const muzzleWorld = new Vec3();
        iconUt.convertToWorldSpaceAR(new Vec3(muzzle.x, muzzle.y, 0), muzzleWorld);

        const muzzleInBounds = new Vec3();
        boundsUt.convertToNodeSpaceAR(muzzleWorld, muzzleInBounds);

        const rightLocalX =
            boundsUt.width * (1 - boundsUt.anchorX) - MENU_TITLE_BEAM_EDGE_INSET_PX;
        const rightInBounds = new Vec3(rightLocalX, muzzleInBounds.y, 0);

        const rightWorld = new Vec3();
        boundsUt.convertToWorldSpaceAR(rightInBounds, rightWorld);

        const rightInIcon = new Vec3();
        iconUt.convertToNodeSpaceAR(rightWorld, rightInIcon);

        if (rightInIcon.x > muzzle.x) {
            endX = Math.min(maxEndX, rightInIcon.x);
            hitsScreenEdge = endX < maxEndX;
        }
    }

    return {
        muzzleX: muzzle.x,
        muzzleY: muzzle.y,
        endX,
        endY: muzzle.y,
        hitsScreenEdge,
    };
}

/** 白色光源发射器朝右 + 光束（终点由 layout 截断至屏幕边缘） */
export function drawMenuTitleWhiteSourceRightBeam(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    height: number,
    layout: MenuTitleRightBeamLayout,
): void {
    const size = Math.min(width, height);
    const cellLeft = left + (width - size) * 0.5;
    const cellBottom = bottom + (height - size) * 0.5;
    const direction = Direction.Right;
    const beamColor = beamColorFromKey('white');

    strokeBeamSegmentGradient(
        g,
        layout.muzzleX,
        layout.muzzleY,
        layout.endX,
        layout.endY,
        beamColor,
    );
    drawSourceEmitter(g, cellLeft, cellBottom, size, 'white', direction);
}
