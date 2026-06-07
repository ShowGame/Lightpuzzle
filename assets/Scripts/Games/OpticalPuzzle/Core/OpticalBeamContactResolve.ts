import type { OpticalBeamBlockContact, OpticalBeamSegment } from './OpticalBeamTypes';
import { coerceBeamColorKey, mixLightColors } from './OpticalColorMix';
import { resolveBeamColorKey } from './OpticalLightColor';
import { Direction, normalizeDirection } from './OpticalPuzzleTypes';

const ENDPOINT_EPS = 2e-3;

function oppositeDirection(dir: Direction): Direction {
    return ((dir + 2) % 4) as Direction;
}

/** 光段 x0→x1 的传播方向（与光追 DIR 一致） */
function segmentPropagationDir(seg: OpticalBeamSegment): Direction {
    const dx = seg.x1 - seg.x0;
    const dy = seg.y1 - seg.y0;
    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0 ? Direction.Right : Direction.Left;
    }
    return dy <= 0 ? Direction.Up : Direction.Down;
}

function pointsNear(ax: number, ay: number, bx: number, by: number): boolean {
    return Math.abs(ax - bx) <= ENDPOINT_EPS && Math.abs(ay - by) <= ENDPOINT_EPS;
}

/**
 * 合并后光段端点顺序可能反转（y0>y1 等），按端点与传播方向匹配接触点。
 * @returns 严格方向匹配 > 端点重合兜底 > null
 */
function matchSegmentAtContact(
    contact: OpticalBeamBlockContact,
    seg: OpticalBeamSegment,
    dir: Direction,
): 'strict' | 'endpoint' | null {
    const atEnd = pointsNear(seg.x1, seg.y1, contact.x, contact.y);
    const atStart = pointsNear(seg.x0, seg.y0, contact.x, contact.y);
    if (!atEnd && !atStart) {
        return null;
    }
    const segDir = segmentPropagationDir(seg);
    const beamDirAtEnd = atEnd ? segDir : oppositeDirection(segDir);
    if (beamDirAtEnd === dir) {
        return 'strict';
    }
    return 'endpoint';
}

/**
 * 阻挡接触色键：以合并后光路段为准（与 BeamView 一致）。
 * blockContact.colorKey 在重叠混色后可能仍为旧值（如 white）。
 */
export function resolveBlockContactColorFromSegments(
    contact: OpticalBeamBlockContact,
    segments: readonly OpticalBeamSegment[],
): string {
    const dir = normalizeDirection(contact.dir, Direction.Right);
    let endpointFallback: string | null = null;

    for (let i = segments.length - 1; i >= 0; i--) {
        const seg = segments[i];
        const match = matchSegmentAtContact(contact, seg, dir);
        if (match === 'strict') {
            return resolveBeamColorKey(seg.colorKey);
        }
        if (match === 'endpoint' && endpointFallback === null) {
            endpointFallback = resolveBeamColorKey(seg.colorKey);
        }
    }

    if (endpointFallback !== null) {
        return endpointFallback;
    }

    // 同位置多光段叠色兜底（十字/共线混色后 contact 仍可能落后）
    const atContact: string[] = [];
    for (const seg of segments) {
        if (
            pointsNear(seg.x1, seg.y1, contact.x, contact.y)
            || pointsNear(seg.x0, seg.y0, contact.x, contact.y)
        ) {
            atContact.push(resolveBeamColorKey(seg.colorKey));
        }
    }
    if (atContact.length > 0) {
        return mixLightColors(atContact);
    }

    return coerceBeamColorKey(contact.colorKey);
}

/** 合并光路后，将 blockContacts 色键与对应光段终点对齐 */
export function alignBlockContactsWithSegments(
    contacts: readonly OpticalBeamBlockContact[],
    segments: readonly OpticalBeamSegment[],
): OpticalBeamBlockContact[] {
    return contacts.map((contact) => ({
        ...contact,
        colorKey: resolveBlockContactColorFromSegments(contact, segments),
    }));
}
