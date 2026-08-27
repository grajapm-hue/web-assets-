"""Raja's concern, made checkable: did rebuilding index.html from beta LOSE
anything the live app already had?

The promotion is a whole-file rebuild, not a hunk-by-hunk merge, so code cannot
land in the wrong place -- but it CAN drop something that existed only in live.
This lists every element id, CSS class and function name that live v147 has and
the new build does not. Anything printed here is a real loss and must be
explained before publishing."""
import re, io, sys

live = io.open('_live-v147.html', encoding='utf-8', errors='replace').read()
new = io.open('_index-built.html', encoding='utf-8', errors='replace').read()


def ids(s):
    return set(re.findall(r'id="([A-Za-z][\w-]*)"', s))


def cls(s):
    out = set()
    for m in re.findall(r'class="([^"]+)"', s):
        for c in m.split():
            out.add(c)
    return out


def fns(s):
    return set(re.findall(r'function\s+([A-Za-z_$][\w$]*)\s*\(', s))


def keys(s):
    """localStorage keys -- a renamed key silently orphans a child's progress."""
    return set(re.findall(r"['\"](mm[.\w-]+|mathmatrix[-\w]*)['\"]", s))


total_lost = 0
for label, f in (('element ids', ids), ('css classes', cls),
                 ('function names', fns), ('storage keys', keys)):
    L, N = f(live), f(new)
    lost = sorted(L - N)
    total_lost += len(lost)
    print('%-16s live=%-5d built=%-5d  LOST=%d' % (label, len(L), len(N), len(lost)))
    if lost:
        print('     MISSING FROM BUILD: ' + ', '.join(lost[:60]))

print('')
print('TOTAL LOST: %d' % total_lost)
sys.exit(1 if total_lost else 0)
