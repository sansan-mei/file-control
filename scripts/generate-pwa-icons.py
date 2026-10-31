"""FC lettermark in the same circular, high-contrast family as the 2FA app.

Regenerate with Python 3 + Pillow. Glyphs are original vector outlines, not
system fonts, so every asset is reproducible. No runtime dependency is added.
The full-bleed square is opaque; launchers apply their own corner masks.
"""
from math import cos, sin, radians
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BACKGROUND = '#f8faf9'
INK = '#202a2b'
SCALE = 4


def glyphs():
    # Bold geometric F and an open C, deliberately large in the ring's center.
    f = [(143, 174), (243, 174), (243, 205), (176, 205),
         (176, 242), (230, 242), (230, 273), (176, 273),
         (176, 338), (143, 338)]
    angles = list(range(48, 313, 2))
    c = [(309 + 65 * cos(radians(a)), 256 + 82 * sin(radians(a))) for a in angles]
    c += [(309 + 32 * cos(radians(a)), 256 + 51 * sin(radians(a))) for a in reversed(angles)]
    return [f, c]


def artwork():
    image = Image.new('RGB', (512 * SCALE, 512 * SCALE), BACKGROUND)
    draw = ImageDraw.Draw(image)
    # Outer radius 196px is inside the 204.8px Android maskable safe circle.
    draw.ellipse((60 * SCALE, 60 * SCALE, 452 * SCALE, 452 * SCALE),
                 outline=INK, width=18 * SCALE)
    for points in glyphs():
        draw.polygon([(round(x * SCALE), round(y * SCALE)) for x, y in points], fill=INK)
    return image


def vector():
    polygons = '\n'.join('<polygon points="' + ' '.join(f'{x:.3f},{y:.3f}' for x, y in points) + '"/>' for points in glyphs())
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="FC" data-monogram="FC">
<title>File Control — FC</title>
<rect width="512" height="512" fill="{BACKGROUND}"/>
<circle cx="256" cy="256" r="187" fill="none" stroke="{INK}" stroke-width="18"/>
<g fill="{INK}">{polygons}</g>
</svg>
'''


def main():
    output = ROOT / 'public' / 'icons'
    output.mkdir(parents=True, exist_ok=True)
    master = artwork()
    (output / 'app-icon.svg').write_text(vector(), encoding='utf-8')
    for name, size in [('icon-192.png', 192), ('icon-512.png', 512),
                       ('maskable-512.png', 512), ('apple-touch-icon.png', 180)]:
        master.resize((size, size), Image.Resampling.LANCZOS).save(output / name)
    master.resize((256, 256), Image.Resampling.LANCZOS).save(
        ROOT / 'public' / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])


if __name__ == '__main__':
    main()
