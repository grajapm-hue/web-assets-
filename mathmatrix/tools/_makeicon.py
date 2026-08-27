"""Rebuild icon-512-maskable.png so the monkey is not tiny on the home screen.

Raja: "can home screen app icon [be] a little bigger like beta, without chrome
badge". The badge is a separate thing (a shortcut, not an install). This is the
size half.

The current maskable icon puts the artwork at 59% of the canvas with a 105px
white margin on every side. Android then crops a maskable icon to its own mask
-- a circle at worst, a squircle on most launchers -- so a picture that already
starts small gets shrunk a second time.

Constraint that decides the number: this artwork has PIPS AT THE FOUR CORNERS,
which is exactly what a round mask eats first. Content of side S has its corners
at S/2*sqrt(2) from the centre, and the guaranteed-safe circle has radius
0.4*512 = 205px. Today's 302px puts them at 214px -- already a shade outside the
guarantee, and fine in practice because real launchers use squircles. So this
grows deliberately, not maximally: 348px puts the corners at 246px, about 15%
bigger art while staying inside the squircle that renders it today.

Renders every candidate under both masks so the decision is looked at, not
assumed.
"""
from PIL import Image, ImageDraw
import sys

SRC = '_live-mask.png'
CANVAS = 512
TARGET = 348          # artwork side, up from 302

im = Image.open(SRC).convert('RGBA')
px = im.load()
bg = px[0, 0]


def differs(p):
    if p[3] < 8:
        return False
    return sum(abs(a - b) for a, b in zip(p[:3], bg[:3])) > 30


minx, miny, maxx, maxy = CANVAS, CANVAS, -1, -1
for y in range(CANVAS):
    for x in range(CANVAS):
        if differs(px[x, y]):
            minx = min(minx, x); maxx = max(maxx, x)
            miny = min(miny, y); maxy = max(maxy, y)

art = im.crop((minx, miny, maxx + 1, maxy + 1))
print('source artwork: %dx%d at (%d,%d)' % (art.width, art.height, minx, miny))

scale = TARGET / float(max(art.width, art.height))
nw, nh = int(round(art.width * scale)), int(round(art.height * scale))
art = art.resize((nw, nh), Image.LANCZOS)

out = Image.new('RGBA', (CANVAS, CANVAS), (255, 255, 255, 255))
out.paste(art, ((CANVAS - nw) // 2, (CANVAS - nh) // 2), art)
out.save('_icon-512-maskable-new.png')
print('wrote _icon-512-maskable-new.png  artwork %dx%d = %.0f%% of canvas'
      % (nw, nh, 100.0 * nw / CANVAS))
corner = (nw / 2.0) * (2 ** 0.5)
print('corner pips sit %.0fpx from centre (safe circle is %.0fpx, squircle shows more)'
      % (corner, 0.4 * CANVAS))


def masked(img, kind):
    """Apply Android's worst case (circle) and typical case (squircle)."""
    m = Image.new('L', (CANVAS, CANVAS), 0)
    d = ImageDraw.Draw(m)
    if kind == 'circle':
        d.ellipse([0, 0, CANVAS - 1, CANVAS - 1], fill=255)
    else:
        d.rounded_rectangle([0, 0, CANVAS - 1, CANVAS - 1], radius=int(CANVAS * 0.26), fill=255)
    o = img.copy()
    o.putalpha(m)
    return o


old = Image.open(SRC).convert('RGBA')
new = Image.open('_icon-512-maskable-new.png').convert('RGBA')
strip = Image.new('RGB', (CANVAS * 4 + 60, CANVAS + 20), (24, 24, 28))
for i, (img, kind) in enumerate([(old, 'squircle'), (new, 'squircle'),
                                 (old, 'circle'), (new, 'circle')]):
    strip.paste(masked(img, kind), (10 + i * (CANVAS + 12), 10), masked(img, kind))
strip.save('_icon-compare.png')
print('wrote _icon-compare.png  (old, new, old, new -- squircle then circle)')
