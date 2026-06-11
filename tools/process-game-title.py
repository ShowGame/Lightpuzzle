"""黑底标题图 → 透明 PNG（Menu 游戏标题用）"""
from __future__ import annotations

import glob
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC_GLOB = str(ROOT / "参考图" / "【裁切】*.png")
OUT_PATH = ROOT / "参考图" / "game_title_processed.png"
MAX_EXPORT_WIDTH = 1200

# 纯黑/近黑背景抠除（保留渐变笔画里的深色）
BG_LUMA_MAX = 28
BG_CHROMA_MAX = 18


def luma(r: int, g: int, b: int) -> float:
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def chroma(r: int, g: int, b: int) -> int:
    return max(r, g, b) - min(r, g, b)


def is_background(r: int, g: int, b: int, a: int) -> bool:
    if a == 0:
        return True
    return luma(r, g, b) <= BG_LUMA_MAX and chroma(r, g, b) <= BG_CHROMA_MAX


def remove_black_background(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_background(r, g, b, a):
                px[x, y] = (0, 0, 0, 0)
    return rgba


def trim_transparent(img: Image.Image, pad: int = 8) -> Image.Image:
    bbox = img.getbbox()
    if not bbox:
        return img
    left, top, right, bottom = bbox
    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(img.width, right + pad)
    bottom = min(img.height, bottom + pad)
    return img.crop((left, top, right, bottom))


def main() -> None:
    matches = glob.glob(SRC_GLOB)
    if not matches:
        raise SystemExit(f"未找到源图: {SRC_GLOB}")
    src = Path(matches[0])
    img = Image.open(src)
    print(f"源图: {src.name}  {img.size}")

    out = trim_transparent(remove_black_background(img))
    if out.width > MAX_EXPORT_WIDTH:
        nh = int(out.height * MAX_EXPORT_WIDTH / out.width)
        out = out.resize((MAX_EXPORT_WIDTH, nh), Image.Resampling.LANCZOS)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT_PATH, optimize=True)
    print(f"输出: {OUT_PATH}  {out.size}")


if __name__ == "__main__":
    main()
