"""PNG 大津法（Otsu）二值化 → 纯黑白。用法：python tools/otsu-binarize.py <输入.png> [输出.png]"""
from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def _fix_polarity(gray: np.ndarray, binary: np.ndarray, threshold: float) -> np.ndarray:
    border = np.concatenate([gray[0, :], gray[-1, :], gray[:, 0], gray[:, -1]])
    if float(np.mean(border)) > threshold:
        return cv2.bitwise_not(binary)
    return binary


def fill_enclosed_holes(binary: np.ndarray) -> np.ndarray:
    """白字黑底：外轮廓内封住的黑色镂空填为纯白。"""
    h, w = binary.shape
    flood = binary.copy()
    mask = np.zeros((h + 2, w + 2), np.uint8)
    for sx, sy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if flood[sy, sx] == 0:
            cv2.floodFill(flood, mask, (sx, sy), 64)
    flood[flood == 0] = 255
    flood[flood == 64] = 0
    return flood


def otsu_binarize(
    src: Path,
    dst: Path,
    *,
    blur_sigma: float = 0,
    smooth_open: int = 0,
    smooth_close: int = 0,
    edge_soft_sigma: float = 0,
    fill_solid: bool = False,
) -> tuple[int, tuple[int, int]]:
    """大津法二值化；blur_sigma>0 时先高斯模糊再阈值，边缘更圆滑。"""
    gray = np.array(Image.open(src).convert("L"))
    work = gray
    if blur_sigma > 0:
        work = cv2.GaussianBlur(work, (0, 0), blur_sigma)

    threshold, binary = cv2.threshold(work, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    binary = _fix_polarity(work, binary, threshold)

    if fill_solid:
        # 先闭运算封住镂空外圈断口，再填内孔
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
        binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, k, iterations=1)
        binary = fill_enclosed_holes(binary)

    if smooth_close >= 3:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (smooth_close, smooth_close))
        binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, k, iterations=1)

    if smooth_open >= 3:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (smooth_open, smooth_open))
        binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, k, iterations=1)

    if edge_soft_sigma > 0:
        soft = cv2.GaussianBlur(binary.astype(np.float32), (0, 0), edge_soft_sigma)
        binary = np.where(soft >= 127.5, 255, 0).astype(np.uint8)

    dst.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(binary, mode="L").save(dst, optimize=True)
    return int(threshold), binary.shape[1::-1]


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="PNG 大津法二值化")
    parser.add_argument("src", nargs="?", help="输入 PNG")
    parser.add_argument("dst", nargs="?", help="输出 PNG")
    parser.add_argument("--smooth", action="store_true", help="边缘圆滑（先模糊再大津 + 形态学）")
    parser.add_argument("--solid", action="store_true", help="镂空填实（外轮廓内全部涂白）")
    parser.add_argument("--blur", type=float, default=3.0, help="大津前高斯 sigma")
    parser.add_argument("--open", type=int, default=0, help="椭圆开运算核，0 关闭")
    parser.add_argument("--close", type=int, default=5, help="椭圆闭运算核，圆滑外轮廓")
    parser.add_argument("--soft", type=float, default=1.6, help="二值后轻模糊再阈值")
    args = parser.parse_args()

    if not args.src:
        raise SystemExit("用法: python tools/otsu-binarize.py <输入.png> [输出.png] [--smooth]")

    src = Path(args.src)
    if not src.is_file():
        raise SystemExit(f"文件不存在: {src}")

    if args.dst:
        dst = Path(args.dst)
    else:
        suffix = "_otsu_smooth.png" if args.smooth else "_otsu_bw.png"
        dst = src.with_name(f"{src.stem}{suffix}")

    kwargs = {}
    if args.smooth or args.solid:
        kwargs = {
            "blur_sigma": args.blur,
            "smooth_open": args.open,
            "smooth_close": args.close,
            "edge_soft_sigma": args.soft,
            "fill_solid": args.solid,
        }

    thresh, size = otsu_binarize(src, dst, **kwargs)
    print(f"源图: {src}")
    print(f"Otsu 阈值: {thresh}")
    if args.smooth or args.solid:
        print(
            f"参数: blur={args.blur} close={args.close} open={args.open} "
            f"soft={args.soft} solid={args.solid}",
        )
    print(f"输出: {dst}  {size[0]}x{size[1]}")


if __name__ == "__main__":
    main()
