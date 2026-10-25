from pathlib import Path
from PIL import Image

official = Path('dist/assets/official')
source = Image.open(official / '03_icone_app_transparente.png').convert('RGBA')
source.resize((192, 192), Image.Resampling.LANCZOS).save(official / '03_icone_app_192.png', optimize=True)

for size in (192, 512):
    canvas = Image.new('RGBA', (size, size), '#071326')
    emblem = source.resize((round(size * .78), round(size * .78)), Image.Resampling.LANCZOS)
    canvas.alpha_composite(emblem, ((size - emblem.width) // 2, (size - emblem.height) // 2))
    canvas.convert('RGB').save(official / f'03_icone_app_maskable_{size}.png', optimize=True)
