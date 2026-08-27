"""How much of each icon is actually artwork, and how much is empty margin?

Android crops a `maskable` icon to a safe zone -- roughly the inner 80% -- and
then applies the launcher's own shape. Artwork that already sits small inside a
big margin gets shrunk twice, which is why the monkey reads as tiny in a white
square on the home screen."""
from PIL import Image
import sys

for name in sys.argv[1:]:
    im = Image.open(name).convert('RGBA')
    w, h = im.size
    px = im.load()
    # background = the colour of the top-left pixel
    bg = px[0, 0]

    def differs(p):
        if p[3] < 8:
            return False                      # transparent counts as empty
        return sum(abs(a - b) for a, b in zip(p[:3], bg[:3])) > 30

    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if differs(px[x, y]):
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
    if maxx < 0:
        print('%-24s %dx%d  NO ARTWORK FOUND' % (name, w, h))
        continue
    cw, chh = maxx - minx + 1, maxy - miny + 1
    print('%-24s %dx%d  bg=%s' % (name, w, h, bg[:3]))
    print('    artwork box: x %d..%d  y %d..%d  -> %dx%d' % (minx, maxx, miny, maxy, cw, chh))
    print('    fills %.0f%% of width, %.0f%% of height' % (100.0 * cw / w, 100.0 * chh / h))
    print('    margins: left %d  right %d  top %d  bottom %d' % (minx, w - 1 - maxx, miny, h - 1 - maxy))
