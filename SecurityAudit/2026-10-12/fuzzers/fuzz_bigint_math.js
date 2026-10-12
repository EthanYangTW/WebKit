let seed = 99; function rnd() { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed; }
function randBig(digits) { let v = 0n; for (let i = 0; i < digits; i++) v = (v << 64n) | ((BigInt(rnd()) << 32n) | BigInt(rnd())); return v; }
for (let round = 0; round < 3000; round++) {
    const d = 1 + rnd() % (round < 2500 ? 64 : 1200);
    let x = randBig(d); if (rnd() % 3 === 0) x = (1n << BigInt(rnd() % (64 * d + 1))) + BigInt(rnd() % 3) - 1n; if (x < 0n) x = -x;
    const s = BigInt.sqrt(x); if (s * s > x || (s + 1n) * (s + 1n) <= x) throw new Error("sqrt wrong " + d);
    const c = BigInt.cbrt(x); if (c * c * c > x || (c + 1n) ** 3n <= x) throw new Error("cbrt wrong " + d);
    const nc = BigInt.cbrt(-x); if (nc !== -c) throw new Error("neg cbrt");
    if (BigInt.abs(-x) !== x || BigInt.sign(-x) !== (x ? -1n : 0n)) throw new Error("abs/sign");
    if (d < 40) { const e = BigInt(rnd() % 40); if (BigInt.pow(x & 0xffffn, e) !== (x & 0xffffn) ** e) throw new Error("pow"); }
    if (BigInt.max(x, x + 1n, -x) !== x + 1n || BigInt.min(x, x + 1n, -x) !== -x) throw new Error("minmax");
}
print("bigint math fuzz ok");
