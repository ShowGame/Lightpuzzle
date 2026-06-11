"""标题图：大津二值化 → 轮廓 path（含挖孔分组）→ TypeScript Graphics"""
from __future__ import annotations

import math
from pathlib import Path

import cv2
import mapbox_earcut as earcut
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC_CANDIDATES = [
    ROOT / "参考图" / "game_title_processed.png",
    ROOT / "assets" / "Sprites" / "UI" / "game_title.png",
]
OUT_TS = (
    ROOT / "assets" / "Scripts" / "Games" / "OpticalPuzzle" / "Presentation"
    / "GameTitlePathSegs.generated.ts"
)
OUT_SVG = ROOT / "参考图" / "game_title_vector_preview.svg"
OUT_OTSU = ROOT / "参考图" / "game_title_otsu.png"

TRACE_MAX_WIDTH = 1200
SIMPLIFY_EPS = 1.0
SIMPLIFY_EPS_SMALL = 0.45
SMALL_CONTOUR_PERIMETER = 220
MIN_CONTOUR_LEN = 4
MIN_CONTOUR_AREA = 10.0


def load_rgba(path: Path) -> np.ndarray:
    img = Image.open(path).convert("RGBA")
    if img.width > TRACE_MAX_WIDTH:
        nh = int(img.height * TRACE_MAX_WIDTH / img.width)
        img = img.resize((TRACE_MAX_WIDTH, nh), Image.Resampling.LANCZOS)
    return np.array(img, dtype=np.uint8)


def composite_on_black(rgba: np.ndarray) -> np.ndarray:
    """透明底图叠到黑底，便于大津法分离字与背景"""
    rgb = rgba[..., :3].astype(np.float32)
    alpha = rgba[..., 3:4].astype(np.float32) / 255.0
    return np.clip(rgb * alpha, 0, 255).astype(np.uint8)


def otsu_binarize(rgba: np.ndarray) -> tuple[np.ndarray, float]:
    """大津法二值化：返回前景=255 的 mask"""
    comp = composite_on_black(rgba)
    gray = cv2.cvtColor(comp, cv2.COLOR_RGB2GRAY)
    otsu_thr, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    if np.count_nonzero(binary) > binary.size * 0.5:
        binary = cv2.bitwise_not(binary)
    return binary, float(otsu_thr)


def signed_polygon_area(points: list[tuple[float, float]]) -> float:
    if len(points) < 3:
        return 0.0
    area2 = 0.0
    n = len(points)
    for i in range(n):
        x0, y0 = points[i]
        x1, y1 = points[(i + 1) % n]
        area2 += x0 * y1 - x1 * y0
    return area2 * 0.5


def polygon_area(points: list[tuple[float, float]]) -> float:
    return abs(signed_polygon_area(points))


def contour_perimeter(points: list[tuple[float, float]]) -> float:
    if len(points) < 2:
        return 0.0
    total = 0.0
    for i in range(len(points)):
        x0, y0 = points[i]
        x1, y1 = points[(i + 1) % len(points)]
        total += math.hypot(x1 - x0, y1 - y0)
    return total


def rdp(points: list[tuple[float, float]], eps: float) -> list[tuple[float, float]]:
    if len(points) < 3 or eps <= 0:
        return points

    def perp_dist(p, a, b):
        ax, ay = a
        bx, by = b
        px, py = p
        dx, dy = bx - ax, by - ay
        if dx == 0 and dy == 0:
            return math.hypot(px - ax, py - ay)
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        qx, qy = ax + t * dx, ay + t * dy
        return math.hypot(px - qx, py - qy)

    def rdp_rec(pts: list[tuple[float, float]]) -> list[tuple[float, float]]:
        if len(pts) < 3:
            return pts
        a, b = pts[0], pts[-1]
        idx, dmax = 0, -1.0
        for i in range(1, len(pts) - 1):
            d = perp_dist(pts[i], a, b)
            if d > dmax:
                idx, dmax = i, d
        if dmax > eps:
            left = rdp_rec(pts[: idx + 1])
            right = rdp_rec(pts[idx:])
            return left[:-1] + right
        return [a, b]

    closed = pts_close(points)
    simplified = rdp_rec(closed)
    if len(simplified) > 1 and simplified[0] == simplified[-1]:
        simplified = simplified[:-1]
    return simplified


def pts_close(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if not points:
        return points
    if points[0] == points[-1]:
        return points
    return points + [points[0]]


def ensure_hole_winding(
    outer: list[tuple[float, float]],
    hole: list[tuple[float, float]],
) -> list[tuple[float, float]]:
    """外环与孔洞异向缠绕，供 earcut / 非零规则挖孔"""
    if signed_polygon_area(outer) * signed_polygon_area(hole) > 0:
        return list(reversed(hole))
    return hole


def extract_contours_with_groups(
    mask: np.ndarray,
) -> tuple[list[list[tuple[float, float]]], list[list[int]]]:
    raw_contours, hierarchy = cv2.findContours(mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_NONE)
    contours: list[list[tuple[float, float]]] = []
    old_to_new: dict[int, int | None] = {}

    for i, c in enumerate(raw_contours):
        if len(c) < MIN_CONTOUR_LEN:
            old_to_new[i] = None
            continue
        pts = [(float(p[0][0]), float(p[0][1])) for p in c]
        if polygon_area(pts) < MIN_CONTOUR_AREA:
            old_to_new[i] = None
            continue
        old_to_new[i] = len(contours)
        contours.append(simplify_contour(pts))

    fill_groups: list[list[int]] = []

    def dfs_collect(old_idx: int, bucket: list[int]) -> None:
        new_idx = old_to_new.get(old_idx)
        if new_idx is None:
            return
        bucket.append(new_idx)
        child = hierarchy[0][old_idx][2]
        while child != -1:
            dfs_collect(child, bucket)
            child = hierarchy[0][child][0]

    for i in range(len(raw_contours)):
        if old_to_new.get(i) is None:
            continue
        if hierarchy[0][i][3] != -1:
            continue
        group: list[int] = []
        dfs_collect(i, group)
        fill_groups.append(group)

    # 校正每个 fill 组内孔洞与外环的缠绕方向
    for group in fill_groups:
        if len(group) < 2:
            continue
        outer_pts = contours[group[0]]
        for hi in range(1, len(group)):
            contours[group[hi]] = ensure_hole_winding(outer_pts, contours[group[hi]])

    return contours, fill_groups


def simplify_contour(pts: list[tuple[float, float]]) -> list[tuple[float, float]]:
    peri = contour_perimeter(pts)
    eps = SIMPLIFY_EPS_SMALL if peri < SMALL_CONTOUR_PERIMETER else SIMPLIFY_EPS
    simp = rdp(pts, eps)
    if len(simp) >= 3:
        return simp
    return pts


def normalize_contours(
    contours: list[list[tuple[float, float]]],
) -> list[list[tuple[float, float]]]:
    all_pts = [p for c in contours for p in c]
    xs = [p[0] for p in all_pts]
    ys = [p[1] for p in all_pts]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    cx = (min_x + max_x) * 0.5
    cy = (min_y + max_y) * 0.5
    h = max(max_y - min_y, 1e-6)
    out: list[list[tuple[float, float]]] = []
    for c in contours:
        out.append([((x - cx) / h, -(y - cy) / h) for x, y in c])
    return out


def triangulate_fill_groups(
    contours: list[list[tuple[float, float]]],
    fill_groups: list[list[int]],
) -> list[float]:
    """带孔多边形 earcut 三角化；孔洞区域不出现在三角网中"""
    flat_out: list[float] = []
    for group in fill_groups:
        coords: list[list[float]] = []
        ring_ends: list[int] = []
        for idx in group:
            ring = contours[idx]
            if len(ring) < 3:
                continue
            for x, y in ring:
                coords.append([x, y])
            ring_ends.append(len(coords))
        if len(coords) < 3 or not ring_ends:
            continue
        tri = earcut.triangulate_float64(
            np.array(coords, dtype=np.float64),
            np.array(ring_ends, dtype=np.uint32),
        )
        for i in range(0, len(tri), 3):
            for vi in (tri[i], tri[i + 1], tri[i + 2]):
                flat_out.extend((coords[vi][0], coords[vi][1]))
    return flat_out


def emit_path_block(contour: list[tuple[float, float]], indent: str) -> list[str]:
    lines = [f"{indent}["]
    for x, y in contour:
        lines.append(f"{indent}    {{ x: {x:.6f}, y: {y:.6f} }},")
    lines.append(f"{indent}],")
    return lines


def emit_ts(
    contours: list[list[tuple[float, float]]],
    fill_tri_flat: list[float],
) -> None:
    lines = [
        "// AUTO-GENERATED by tools/gen-game-title-paths.py — do not edit by hand",
        "",
        "export interface GameTitlePathSeg {",
        "    readonly x: number;",
        "    readonly y: number;",
        "}",
        "",
        "/** 全部轮廓（1px 描边；含孔洞边缘） */",
        "export const GAME_TITLE_OUTLINE_PATHS: ReadonlyArray<",
        "    ReadonlyArray<Readonly<GameTitlePathSeg>>",
        "> = [",
    ]
    for contour in contours:
        lines.extend(emit_path_block(contour, "    "))
    lines.extend([
        "];",
        "",
        "/**",
        " * 挖孔三角化填充（归一化坐标；每 6 个数一个三角形 x0,y0,x1,y1,x2,y2）。",
        " * 孔洞区域不在三角网内，运行时只 fill 三角形。",
        " */",
        "export const GAME_TITLE_FILL_TRI_FLAT: readonly number[] = [",
    ])
    for i in range(0, len(fill_tri_flat), 6):
        chunk = fill_tri_flat[i : i + 6]
        parts = ", ".join(f"{v:.6f}" for v in chunk)
        lines.append(f"    {parts},")
    lines.append("];")
    lines.append("")
    OUT_TS.parent.mkdir(parents=True, exist_ok=True)
    OUT_TS.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def emit_svg(contours: list[list[tuple[float, float]]], fill_groups: list[list[int]], scale: float = 400.0) -> None:
    paths: list[str] = []
    for group in fill_groups:
        d_parts: list[str] = []
        for idx in group:
            c = contours[idx]
            if len(c) < 2:
                continue
            for i, (x, y) in enumerate(c):
                px, py = x * scale, -y * scale
                d_parts.append(("M" if i == 0 else "L") + f"{px:.2f},{py:.2f}")
            d_parts.append("Z")
        if d_parts:
            paths.append(
                '  <path d="' + " ".join(d_parts) + '" fill="#3a4250" fill-rule="evenodd" '
                'stroke="white" stroke-width="1.5"/>'
            )
    svg = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-scale * 0.55:.0f} {-scale * 0.55:.0f} '
        f'{scale * 1.1:.0f} {scale * 1.1:.0f}">\n'
        f'  <rect x="{-scale * 0.55:.0f}" y="{-scale * 0.55:.0f}" width="{scale * 1.1:.0f} '
        f'height="{scale * 1.1:.0f}" fill="#111"/>\n'
        + "\n".join(paths)
        + "\n</svg>\n"
    )
    OUT_SVG.parent.mkdir(parents=True, exist_ok=True)
    OUT_SVG.write_text(svg, encoding="utf-8", newline="\n")


def resolve_src() -> Path:
    for p in SRC_CANDIDATES:
        if p.is_file():
            return p
    raise SystemExit("缺少标题 PNG，请先运行 tools/process-game-title.py")


def main() -> None:
    src = resolve_src()
    rgba = load_rgba(src)
    binary, otsu_thr = otsu_binarize(rgba)
    OUT_OTSU.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(binary).save(OUT_OTSU)
    print(f"src={src.name} trace={binary.shape[1]}x{binary.shape[0]} otsu={otsu_thr:.1f}")

    contours, fill_groups = extract_contours_with_groups(binary)
    norm = normalize_contours(contours)
    fill_tri_flat = triangulate_fill_groups(norm, fill_groups)
    emit_ts(norm, fill_tri_flat)
    emit_svg(norm, fill_groups)
    hole_groups = sum(1 for g in fill_groups if len(g) > 1)
    tri_count = len(fill_tri_flat) // 6
    pt_count = sum(len(c) for c in norm)
    ts_kb = OUT_TS.stat().st_size / 1024
    print(
        f"contours={len(norm)} fill_groups={len(fill_groups)} with_holes={hole_groups} "
        f"fill_tris={tri_count} points={pt_count} ts={ts_kb:.1f}KB"
    )
    print(f"otsu_png={OUT_OTSU} svg={OUT_SVG}")


if __name__ == "__main__":
    main()
