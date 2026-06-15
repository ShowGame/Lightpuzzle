"""标题/副标题图：黑白 PNG 直接阈值 → 轮廓 path → TypeScript Graphics"""
from __future__ import annotations

import math
import sys
from dataclasses import dataclass
from pathlib import Path

import cv2
import mapbox_earcut as earcut
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PRESENTATION = ROOT / "assets" / "Scripts" / "Games" / "OpticalPuzzle" / "Presentation"

@dataclass(frozen=True)
class GenProfile:
    name: str
    src_candidates: tuple[Path, ...]
    out_ts: Path
    out_svg: Path
    out_mask: Path
    export_prefix: str
    interface_name: str
    include_outline: bool


PROFILES: dict[str, GenProfile] = {
    "title": GenProfile(
        name="title",
        src_candidates=(
            ROOT / "参考图" / "光学迷宫.png",
            ROOT / "参考图" / "game_title_processed.png",
            ROOT / "assets" / "Sprites" / "UI" / "game_title.png",
        ),
        out_ts=PRESENTATION / "GameTitlePathSegs.generated.ts",
        out_svg=ROOT / "参考图" / "game_title_vector_preview.svg",
        out_mask=ROOT / "参考图" / "game_title_mask.png",
        export_prefix="GAME_TITLE",
        interface_name="GameTitlePathSeg",
        include_outline=True,
    ),
    "subtitle": GenProfile(
        name="subtitle",
        src_candidates=(ROOT / "参考图" / "小咪的.png",),
        out_ts=PRESENTATION / "GameSubtitlePathSegs.generated.ts",
        out_svg=ROOT / "参考图" / "game_subtitle_vector_preview.svg",
        out_mask=ROOT / "参考图" / "game_subtitle_mask.png",
        export_prefix="GAME_SUBTITLE",
        interface_name="GameSubtitlePathSeg",
        include_outline=True,
    ),
}

OUT_TS = PROFILES["title"].out_ts
OUT_SVG = PROFILES["title"].out_svg
OUT_MASK = PROFILES["title"].out_mask

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
        # 源图已是黑白，nearest 避免缩放产生灰边
        img = img.resize((TRACE_MAX_WIDTH, nh), Image.Resampling.NEAREST)
    return np.array(img, dtype=np.uint8)


def binary_mask_from_rgba(rgba: np.ndarray) -> np.ndarray:
    """已是黑白 PNG：亮像素且非透明为前景=255，不做大津法"""
    rgb = rgba[..., :3].astype(np.float32)
    alpha = rgba[..., 3]
    luma = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    foreground = (luma > 127) & (alpha > 127)
    return (foreground.astype(np.uint8) * 255)


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


def norm_bounds(contours: list[list[tuple[float, float]]]) -> tuple[float, float, float, float]:
    all_pts = [p for c in contours for p in c]
    xs = [p[0] for p in all_pts]
    ys = [p[1] for p in all_pts]
    return min(xs), max(xs), min(ys), max(ys)


def emit_ts(
    contours: list[list[tuple[float, float]]],
    fill_tri_flat: list[float],
    bounds: tuple[float, float, float, float],
    profile: GenProfile,
) -> None:
    min_x, max_x, min_y, max_y = bounds
    norm_w = max_x - min_x
    norm_h = max_y - min_y
    prefix = profile.export_prefix
    iface = profile.interface_name
    lines = [
        f"// AUTO-GENERATED by tools/gen-game-title-paths.py ({profile.name}) — do not edit by hand",
        "",
        f"export interface {iface} {{",
        "    readonly x: number;",
        "    readonly y: number;",
        "}",
        "",
        "/** 归一化 path 包围盒宽高（按字高归一化；运行时 fit 进 UITransform） */",
        f"export const {prefix}_NORM_W = {norm_w:.6f};",
        f"export const {prefix}_NORM_H = {norm_h:.6f};",
        "",
    ]
    if profile.include_outline:
        lines.extend([
            "/** 全部轮廓（1px 描边；含孔洞边缘） */",
            f"export const {prefix}_OUTLINE_PATHS: ReadonlyArray<",
            f"    ReadonlyArray<Readonly<{iface}>>",
            "> = [",
        ])
        for contour in contours:
            lines.extend(emit_path_block(contour, "    "))
        lines.extend(["];", ""])
    lines.extend([
        "/**",
        " * 挖孔三角化填充（归一化坐标；每 6 个数一个三角形 x0,y0,x1,y1,x2,y2）。",
        " * 孔洞区域不在三角网内，运行时只 fill 三角形。",
        " */",
        f"export const {prefix}_FILL_TRI_FLAT: readonly number[] = [",
    ])
    for i in range(0, len(fill_tri_flat), 6):
        chunk = fill_tri_flat[i : i + 6]
        parts = ", ".join(f"{v:.6f}" for v in chunk)
        lines.append(f"    {parts},")
    lines.append("];")
    lines.append("")
    profile.out_ts.parent.mkdir(parents=True, exist_ok=True)
    profile.out_ts.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def emit_svg(
    contours: list[list[tuple[float, float]]],
    fill_groups: list[list[int]],
    out_svg: Path,
    scale: float = 400.0,
) -> None:
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
    out_svg.parent.mkdir(parents=True, exist_ok=True)
    out_svg.write_text(svg, encoding="utf-8", newline="\n")


def resolve_src(candidates: tuple[Path, ...]) -> Path:
    for p in candidates:
        if p.is_file():
            return p
    missing = ", ".join(str(p) for p in candidates)
    raise SystemExit(f"缺少源图: {missing}")


def run_profile(profile: GenProfile) -> None:
    src = resolve_src(profile.src_candidates)
    rgba = load_rgba(src)
    binary = binary_mask_from_rgba(rgba)
    profile.out_mask.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(binary).save(profile.out_mask)
    print(f"[{profile.name}] src={src.name} trace={binary.shape[1]}x{binary.shape[0]} mode=direct_bw")

    contours, fill_groups = extract_contours_with_groups(binary)
    norm = normalize_contours(contours)
    bounds = norm_bounds(norm)
    fill_tri_flat = triangulate_fill_groups(norm, fill_groups)
    emit_ts(norm, fill_tri_flat, bounds, profile)
    emit_svg(norm, fill_groups, profile.out_svg)
    hole_groups = sum(1 for g in fill_groups if len(g) > 1)
    tri_count = len(fill_tri_flat) // 6
    pt_count = sum(len(c) for c in norm)
    ts_kb = profile.out_ts.stat().st_size / 1024
    print(
        f"[{profile.name}] contours={len(norm)} fill_groups={len(fill_groups)} "
        f"with_holes={hole_groups} fill_tris={tri_count} points={pt_count} ts={ts_kb:.1f}KB"
    )
    print(f"[{profile.name}] mask={profile.out_mask} svg={profile.out_svg}")


def main() -> None:
    key = sys.argv[1] if len(sys.argv) > 1 else "title"
    if key not in PROFILES:
        names = ", ".join(PROFILES)
        raise SystemExit(f"未知 profile: {key}（可用: {names}）")
    run_profile(PROFILES[key])


if __name__ == "__main__":
    main()
