"""
Génère les icônes PWA d'Atlas (charte indigo #6C5CE7).
Lance : python make_icons.py
Design : globe stylisé (méridiens) + un baiser rouge planté dessus — « kiss the world ».
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw

HERE = Path(__file__).parent
BG_TOP = (27, 26, 46)      # #1B1A2E
BG_BOT = (10, 9, 20)
ACCENT = (108, 92, 231)    # #6C5CE7
LIP = (255, 46, 99)        # rouge baiser
LIP_DARK = (181, 22, 66)
WHITE = (255, 255, 255)


def _vgrad(size, top, bot):
    img = Image.new("RGB", (size, size), top)
    for y in range(size):
        t = y / max(1, size - 1)
        r = int(top[0] + (bot[0] - top[0]) * t)
        g = int(top[1] + (bot[1] - top[1]) * t)
        b = int(top[2] + (bot[2] - top[2]) * t)
        img.paste((r, g, b), (0, y, size, y + 1))
    return img


def _draw_globe(img, cx, cy, r):
    d = ImageDraw.Draw(img, "RGBA")
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ACCENT)
    g = int(r * 1.12)
    d.ellipse([cx - g, cy - g, cx + g, cy + g], outline=(108, 92, 231, 110), width=max(2, r // 26))
    lw = max(1, r // 32)
    line = (255, 255, 255, 55)
    for fy in (-0.55, 0.0, 0.55):           # parallèles
        oy = int(cy + fy * r)
        ry = max(1, int(r * 0.16 * (1 - abs(fy) ** 1.3)))
        d.ellipse([cx - r, oy - ry, cx + r, oy + ry], outline=line, width=lw)
    for fx in (0.45, 0.82):                 # méridiens
        rx = int(r * fx)
        d.ellipse([cx - rx, cy - r, cx + rx, cy + r], outline=line, width=lw)
    d.line([cx, cy - r, cx, cy + r], fill=(255, 255, 255, 65), width=lw)


def _kiss_layer(size, cx, cy, w):
    """Baiser (lèvres) centré en (cx, cy), largeur w, sur un calque RGBA tourné."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    half = 0.5 * w
    peakH, botH = 0.30 * w, 0.40 * w
    N = 72
    us = [(-1 + 2 * i / (N - 1)) for i in range(N)]

    def env(u):  # 0 aux coins, 1 au centre
        return max(0.0, 1 - u * u)

    def htop(u):  # deux pics (arc de Cupidon) : creux au centre, hauts à ±0.5
        return env(u) * (0.65 - 0.35 * math.cos(2 * math.pi * u)) / 0.75

    def yt(u):  # bord supérieur de la lèvre du haut
        return cy - peakH * htop(u)

    def ym(u):  # ligne de bouche (lèvres se rejoignent), pointes aux coins
        return cy + 0.05 * w * env(u)

    def yb(u):  # bord inférieur de la lèvre du bas
        return ym(u) + botH * math.sqrt(env(u))

    top = [(cx + u * half, yt(u)) for u in us] + [(cx + u * half, ym(u)) for u in reversed(us)]
    bot = [(cx + u * half, ym(u)) for u in us] + [(cx + u * half, yb(u)) for u in reversed(us)]
    d.polygon(bot, fill=LIP)
    d.polygon(top, fill=LIP)
    # ligne de bouche
    d.line([(cx + u * half, ym(u)) for u in us], fill=LIP_DARK, width=max(2, int(w * 0.03)))
    # reflet sur la lèvre inférieure (gauche)
    sheen = [(cx + u * half, ym(u) + 0.10 * w) for u in us if -0.55 < u < 0.05]
    if len(sheen) > 1:
        d.line(sheen, fill=(255, 255, 255, 110), width=max(2, int(w * 0.022)))
    return layer.rotate(-10, resample=Image.BICUBIC, center=(cx, cy))


def make_icon(size: int, out: Path) -> None:
    img = _vgrad(size, BG_TOP, BG_BOT)
    cx = cy = size // 2
    _draw_globe(img, cx, cy, int(size * 0.32))
    kiss = _kiss_layer(size, cx, int(cy + size * 0.02), int(size * 0.46))
    img.paste(kiss, (0, 0), kiss)
    img.convert("RGB").save(out, "PNG")
    print(f"  OK {out.name} ({size}px)")


if __name__ == "__main__":
    for s, name in [(180, "apple-touch-icon.png"), (192, "icon-192.png"), (512, "icon-512.png")]:
        make_icon(s, HERE / name)
    print("Done.")
