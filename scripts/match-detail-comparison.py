from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path('captures/match-detail-2026-10-25')
for width, scale in ((390, 1), (1440, 0.5)):
    before = Image.open(root / f'before-{width}.png').convert('RGB')
    after = Image.open(root / f'after-{width}.png').convert('RGB')
    if scale != 1:
        before = before.resize((round(before.width * scale), round(before.height * scale)))
        after = after.resize((round(after.width * scale), round(after.height * scale)))
    margin, gutter, heading = 15, 16, 43
    image = Image.new('RGB', (before.width + after.width + margin * 2 + gutter, max(before.height, after.height) + heading + margin), '#06121f')
    image.paste(before, (margin, heading))
    image.paste(after, (margin + before.width + gutter, heading))
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype('arial.ttf', 18)
    draw.text((margin, 11), f'ANTES · {width}px', fill='#b4d9ee', font=font)
    draw.text((margin + before.width + gutter, 11), f'DEPOIS · {width}px', fill='#f2fbff', font=font)
    image.save(root / f'comparacao-{width}.png')
