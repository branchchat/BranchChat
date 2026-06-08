"""One-off: turn the cream-background tree logo into clean transparent assets.

Produces (in public/):
  brand-mark.png        black line-art, transparent bg  (for light surfaces)
  brand-mark-light.png  white line-art, transparent bg  (for dark surfaces)
  favicon.png           dark rounded tile with the white mark (browser tab)
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

SRC = Path("ChatGPT Image Jun 6, 2026, 02_17_07 AM.png")
PUB = Path("public")


def alpha_from_darkness(img: Image.Image) -> Image.Image:
    """Map a black-on-light line drawing to an alpha mask (dark = opaque)."""
    g = img.convert("L")
    px = g.load()
    w, h = g.size
    a = Image.new("L", (w, h), 0)
    ap = a.load()
    for y in range(h):
        for x in range(w):
            lum = px[x, y]
            if lum <= 105:
                ap[x, y] = 255
            elif lum >= 200:
                ap[x, y] = 0
            else:
                # smooth anti-aliased edge ramp
                ap[x, y] = int(round((200 - lum) / (200 - 105) * 255))
    return a


def tint(alpha: Image.Image, rgb: tuple[int, int, int]) -> Image.Image:
    out = Image.new("RGBA", alpha.size, (*rgb, 0))
    solid = Image.new("RGBA", alpha.size, (*rgb, 255))
    out.paste(solid, (0, 0), alpha)
    return out


def autocrop(img: Image.Image, pad_ratio: float = 0.06) -> Image.Image:
    bbox = img.getbbox()
    if not bbox:
        return img
    img = img.crop(bbox)
    w, h = img.size
    side = max(w, h)
    pad = int(side * pad_ratio)
    canvas = Image.new("RGBA", (side + 2 * pad, side + 2 * pad), (0, 0, 0, 0))
    canvas.paste(img, ((side - w) // 2 + pad, (side - h) // 2 + pad), img)
    return canvas


def rounded_tile(mark_light: Image.Image, size: int = 256) -> Image.Image:
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=int(size * 0.23), fill=255
    )
    bg = Image.new("RGBA", (size, size), (10, 10, 10, 255))
    tile.paste(bg, (0, 0), mask)
    inner = int(size * 0.62)
    m = mark_light.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    tile.paste(m, (off, off), m)
    return tile


def main() -> None:
    img = Image.open(SRC).convert("RGB")
    alpha = alpha_from_darkness(img)

    black = autocrop(tint(alpha, (10, 10, 10)))
    white = autocrop(tint(alpha, (250, 250, 250)))

    black.save(PUB / "brand-mark.png")
    white.save(PUB / "brand-mark-light.png")
    rounded_tile(white).save(PUB / "favicon.png")
    print("wrote brand-mark.png, brand-mark-light.png, favicon.png")


if __name__ == "__main__":
    main()
