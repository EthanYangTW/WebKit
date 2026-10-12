// Differential fuzz of BigInt division/toString (BZ division + D&C toString) vs. independent paths.
let seed = 0x12345678;
function rnd() { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed; }
function randBig(digits, shape) {
    let v = 0n;
    for (let i = 0; i < digits; i++) {
        let d;
        switch (shape) {
        case 0: d = (BigInt(rnd()) << 32n) | BigInt(rnd()); break;
        case 1: d = 0xffffffffffffffffn; break;
        case 2: d = (rnd() & 3) ? 0n : (BigInt(rnd()) << 32n) | BigInt(rnd()); break;
        case 3: d = 1n << BigInt(rnd() % 64); break;
        }
        v = (v << 64n) | d;
    }
    if (v === 0n) v = 1n;
    return v;
}
function refToString(x, radix) {
    // chunked conversion via small divisors (divideSingle path), independent of BZ/D&C.
    const r = BigInt(radix); const chunk = r ** 9n; let parts = [];
    while (x >= chunk) { parts.push((x % chunk).toString(radix).padStart(9, "0")); x /= chunk; }
    parts.push(x.toString(radix));
    return parts.reverse().join("");
}
const radixes = [3, 5, 7, 10, 11, 12, 13, 17, 19, 23, 24, 25, 29, 31, 33, 35, 36];
let iter = 0;
for (let round = 0; round < 400; round++) {
    const dx = 1 + rnd() % (round < 300 ? 300 : 3000);
    const dy = 1 + rnd() % Math.max(1, dx);
    const x = randBig(dx, rnd() % 4), y = randBig(dy, rnd() % 4);
    const q = x / y, r = x % y;
    if (q * y + r !== x || r < 0n || r >= y) throw new Error("division mismatch " + dx + " " + dy);
    const radix = radixes[rnd() % radixes.length];
    const s = x.toString(radix);
    if (BigInt((radix === 10 ? "" : "") + (radix === 10 ? s : "0")) , false) {}
    // round trip via parse (multiplication-based), independent of division
    const back = radix === 10 ? BigInt(s) : null;
    if (back !== null && back !== x) throw new Error("roundtrip mismatch radix 10 " + dx);
    if (dx < 400 && s !== refToString(x, radix)) throw new Error("toString mismatch radix " + radix + " digits " + dx);
    const ns = (-x).toString(radix); if (ns !== "-" + s) throw new Error("neg mismatch");
    iter++;
}
print("bigint fuzz ok", iter);
