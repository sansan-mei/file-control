"""Original layered-folder app mark. Regenerate with Python 3 + Pillow.

The square is intentionally opaque and unrounded: launchers provide their own
mask. All meaningful artwork fits inside Android's central 80%-diameter circle.
Pillow is a development-only dependency, never an application requirement.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BACKGROUND = '#f8faf9'
INK = '#202a2b'
BLUE = '#7598e2'
SCALE = 4


def artwork():
    image = Image.new('RGB', (512 * SCALE, 512 * SCALE), BACKGROUND)
    draw = ImageDraw.Draw(image)

    def rounded(bounds, radius, color):
        draw.rounded_rectangle(tuple(round(v * SCALE) for v in bounds),
                               radius=round(radius * SCALE), fill=color)

    # A strong folder silhouette, with two sheets peeking over its front edge.
    rounded((111, 160, 251, 245), 23, INK)
    rounded((111, 191, 401, 362), 27, INK)
    rounded((225, 173, 361, 293), 16, BLUE)
    rounded((204, 198, 339, 302), 14, '#e8eef9')
    rounded((111, 227, 401, 363), 27, INK)
    # The short, rounded label reads clearly even at home-screen icon sizes.
    rounded((144, 258, 227, 268), 5, BACKGROUND)
    return image


def main():
    output = ROOT / 'public' / 'icons'
    output.mkdir(parents=True, exist_ok=True)
    master = artwork()
    for name, size in [('icon-192.png', 192), ('icon-512.png', 512),
                       ('maskable-512.png', 512), ('apple-touch-icon.png', 180)]:
        master.resize((size, size), Image.Resampling.LANCZOS).save(output / name)
    master.resize((256, 256), Image.Resampling.LANCZOS).save(
        ROOT / 'public' / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])


if __name__ == '__main__':
    main()
