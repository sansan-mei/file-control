"""Reproducible original folder artwork; requires Pillow only for regeneration."""
from pathlib import Path
from PIL import Image, ImageDraw

output = Path(__file__).resolve().parents[1] / 'public' / 'icons'
output.mkdir(parents=True, exist_ok=True)
for name, size in [('icon-192.png', 192), ('icon-512.png', 512), ('maskable-512.png', 512)]:
    image = Image.new('RGB', (size, size), '#eef3ff')
    draw = ImageDraw.Draw(image)
    def box(coords):
        return tuple(round(value * size) for value in coords)
    # Entire symbol fits inside the central maskable safe circle (radius 40%).
    draw.rounded_rectangle(box((.22, .31, .53, .48)), radius=round(size * .035), fill='#5266ce')
    draw.rounded_rectangle(box((.22, .38, .78, .69)), radius=round(size * .04), fill='#5266ce')
    draw.line(box((.30, .48, .70, .48)), fill='#eef3ff', width=round(size * .025))
    image.save(output / name)
