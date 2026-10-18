//@ requireOptions("--thresholdForBBQOptimizeAfterWarmUp=0", "--thresholdForBBQOptimizeSoon=0", "--useOMGJIT=0")

// MacroAssembler::and64/or64/xor64(Imm64, src, dest) take the constant-blinding path for roughly one
// constant in 64, and used to compute `dest = <stale dest> OP imm` because they never copied src into
// dest. With hundreds of blindable constants per function and a fresh compile per module, the old code
// is practically certain to produce a wrong result.

function uleb(n) { const out = []; n = BigInt(n); do { let b = Number(n & 0x7fn); n >>= 7n; if (n) b |= 0x80; out.push(b); } while (n); return out; }
function sleb(n) { const out = []; n = BigInt(n); for (;;) { let b = Number(n & 0x7fn); n >>= 7n; const done = (n === 0n && !(b & 0x40)) || (n === -1n && (b & 0x40)); if (!done) b |= 0x80; out.push(b); if (done) return out; } }
function section(id, bytes) { return [id, ...uleb(bytes.length), ...bytes]; }
function vec(items) { return [...uleb(items.length), ...items.flat()]; }
function str(s) { return [...uleb(s.length), ...Array.from(s, c => c.charCodeAt(0))]; }

const I64 = 0x7e;
function chain(op, consts) {
    // (param i64) (result i64) (local i64): fold the constants into the local. Reading the operand from a
    // local that stays bound to a register makes BBQ pick a different register for the result, which is
    // what exposed the dropped source operand.
    const code = [0x20, 0, 0x21, 1];
    for (const k of consts) code.push(0x20, 1, 0x42, ...sleb(k), op, 0x21, 1);
    code.push(0x20, 1, 0x0b);
    const locals = [1, 1, I64]; // one group of one i64 local
    return [...uleb(code.length + locals.length), ...locals, ...code];
}
const toI64 = v => BigInt.asIntN(64, v);
const xorConsts = [], andConsts = [], orConsts = [];
for (let i = 0; i < 400; ++i) {
    xorConsts.push(toI64(-0x1681n - BigInt(i) * 0x10001n));            // NaN bit patterns are blindable
    andConsts.push(toI64(0xffffffffffffffffn ^ (1n << BigInt(i % 48)))); // clears one bit each
    orConsts.push(toI64(0xfff8000000000000n | (1n << BigInt(i % 48)))); // sets one bit each
}
const bytes = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...section(1, vec([[0x60, ...vec([[I64]]), ...vec([[I64]])]])),
    ...section(3, vec([[0], [0], [0]])),
    ...section(7, vec([[...str("fxor"), 0x00, 0], [...str("fand"), 0x00, 1], [...str("for"), 0x00, 2]])),
    ...section(10, vec([chain(0x85, xorConsts), chain(0x83, andConsts), chain(0x84, orConsts)])),
]);

const x = 0x0f0f0f0f0f0f0f0fn;
let expectedXor = x; for (const k of xorConsts) expectedXor ^= k;
let expectedAnd = -1n; for (const k of andConsts) expectedAnd &= k;
let expectedOr = 0n; for (const k of orConsts) expectedOr |= k;

for (let module = 0; module < 16; ++module) {
    const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes));
    for (let i = 0; i < 3000; ++i) {
        const rx = instance.exports.fxor(x), ra = instance.exports.fand(-1n), ro = instance.exports.for(0n);
        if (rx !== toI64(expectedXor)) throw new Error(`module ${module}: i64.xor chain gave ${rx}, expected ${toI64(expectedXor)}`);
        if (ra !== toI64(expectedAnd)) throw new Error(`module ${module}: i64.and chain gave ${ra}, expected ${toI64(expectedAnd)}`);
        if (ro !== toI64(expectedOr)) throw new Error(`module ${module}: i64.or chain gave ${ro}, expected ${toI64(expectedOr)}`);
    }
}
