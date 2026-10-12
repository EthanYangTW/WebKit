# Model of JSBigInt::ToStringFormatter size logic (JSBigInt.cpp @ e2ffc55c56).
import math, random, sys
maxBits = [0,0,32,51,64,75,83,90,96,102,107,111,115,119,122,126,128,131,134,136,139,141,143,145,147,149,151,153,154,156,158,159,160,162,163,165,166]
THRESH = 12

def ctz(x):
    return (x & -x).bit_length() - 1

class Violation(Exception): pass

def digits_of(v, DB):
    out = []
    while v:
        out.append(v & ((1<<DB)-1)); v >>= DB
    return out

def run(x, radix, DB):
    # returns string, raising Violation for precondition breaches
    digits = digits_of(x, DB)
    chunkChars = DB*32 // maxBits[radix]
    D = [radix**chunkChars]
    assert D[0] < (1<<DB)
    sizes = [1]
    bitlen = lambda v: v.bit_length()
    while bitlen(D[-1])*2 - 1 <= bitlen(x):
        D.append(D[-1]*D[-1]); sizes.append(len(digits_of(D[-1], DB)))
    S = sum(sizes)
    scratch_total = S*2 + len(digits) + len(sizes) + 1 - S
    maxChars = ((bitlen(x)*32 + (maxBits[radix]-1) - 1)//(maxBits[radix]-1))
    out = [None]*maxChars
    stats = {'minscratch': scratch_total, 'minpos': maxChars}
    def fmt(depth, chunk, position, scratch):
        # chunk: int ; scratch: available digits count
        csize = len(digits_of(chunk, DB))
        if csize < THRESH:
            if scratch < csize: raise Violation(f"leaf scratch {scratch} < {csize}")
            n = 0
            c = chunk
            while len(digits_of(c, DB)) > 1:
                c, rem = divmod(c, D[0])
                for i in range(chunkChars):
                    position -= 1
                    if position < 0: raise Violation("position underflow leaf")
                    out[position] = rem % radix; rem //= radix
            while c:
                position -= 1
                if position < 0: raise Violation("position underflow leaf2")
                out[position] = c % radix; c //= radix
            stats['minpos'] = min(stats['minpos'], position)
            return position
        if depth == 0: raise Violation("depth 0 with big chunk")
        divisor = D[depth-1]
        if chunk < divisor:
            return fmt(depth-1, chunk, position, scratch)
        chars = chunkChars << (depth-1)
        tz = chars*ctz(radix)//DB
        dsize = sizes[depth-1]
        if csize < dsize: raise Violation("chunk smaller than divisor")
        need = (csize - dsize + 1) + dsize
        if scratch < need: raise Violation(f"scratch {scratch} < {need} at depth {depth}")
        scratch -= need
        stats['minscratch'] = min(stats['minscratch'], scratch)
        if dsize - tz < 2: raise Violation(f"divisor.subspan has {dsize-tz} digits (radix {radix}, depth {depth}, DB {DB})")
        if csize - tz < dsize - tz: raise Violation("a.size() < b.size()")
        # check a and b after removing low tz digits (they are zero in divisor)
        assert divisor % (1 << (DB*tz)) == 0
        q, r = divmod(chunk, divisor)
        if position < chars: raise Violation("start underflow")
        start = position - chars
        p2 = fmt(depth-1, r, position, scratch)
        if p2 < start: raise Violation("remainder wrote too much")
        for i in range(start, p2): out[i] = 0
        return fmt(depth-1, q, start, scratch)
    pos = fmt(len(D), x, maxChars, scratch_total)
    s = ''.join('0123456789abcdefghijklmnopqrstuvwxyz'[d] for d in out[pos:])
    return s, stats

bad = 0
random.seed(1)
for DB in (32, 64):
    for radix in range(3, 37):
        if radix & (radix-1) == 0: continue
        for ndig in list(range(12, 70)) + [100, 127, 128, 129, 255, 256, 257, 511, 512, 513, 1024, 1025]:
            for shape in ('rand', 'ones', 'top', 'topone'):
                if shape == 'rand': x = random.getrandbits(DB*ndig) | (1 << (DB*ndig-1))
                elif shape == 'ones': x = (1 << (DB*ndig)) - 1
                elif shape == 'top': x = 1 << (DB*ndig - 1)
                else: x = (1 << (DB*ndig - DB)) | 1
                try:
                    s, st = run(x, radix, DB)
                    exp = ''
                    v = x
                    while v: exp = '0123456789abcdefghijklmnopqrstuvwxyz'[v % radix] + exp; v //= radix
                    if s != exp: print("MISMATCH", DB, radix, ndig, shape); bad += 1
                except Violation as e:
                    print("VIOLATION", DB, radix, ndig, shape, e); bad += 1
                    break
print("done, bad =", bad)
