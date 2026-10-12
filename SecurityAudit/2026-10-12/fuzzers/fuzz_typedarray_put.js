// LLInt typed-array put-by-val fast path vs. DataView reference.
const ctors = [Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array];
const setters = ["setInt8", "setUint8", null, "setInt16", "setUint16", "setInt32", "setUint32", "setFloat32", "setFloat64"];
let seed = 7; function rnd() { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed; }
function store(a, i, v) { a[i] = v; }
const values = [0, 1, -1, 127, 128, 255, 256, -128, -129, 65535, 65536, -32768, -32769, 2147483647, -2147483648, 4294967295, 4294967296, 0.5, -0.5, NaN, Infinity, -Infinity, 1e10, -1e10, 254.5, 255.5, 1.5, 2.5, 3e9, "12", null, undefined, true, {valueOf() { return 77; }}];
for (let round = 0; round < 20000; round++) {
    const ci = rnd() % ctors.length; const C = ctors[ci];
    const len = rnd() % 20;
    const a = new C(len); const ref = new C(len); const dv = new DataView(ref.buffer);
    const idx = (rnd() % (len + 4)) - 2;
    const v = values[rnd() % values.length];
    store(a, idx, v);
    if (idx >= 0 && idx < len) ref[idx] = v; // generic path on reference
    for (let i = 0; i < len; i++) if (!Object.is(a[i], ref[i])) throw new Error(`mismatch ${C.name} idx ${idx} v ${v} i ${i}: ${a[i]} vs ${ref[i]}`);
    if (rnd() % 50 === 0) { const rab = new ArrayBuffer(8, { maxByteLength: 64 }); const ra = new C(rab); store(ra, 0, 1); rab.resize(64); store(ra, 3, 2); rab.resize(0); store(ra, 0, 3); }
    if (rnd() % 200 === 0) { const b = new ArrayBuffer(16); const t = new C(b); transferArrayBuffer(b); store(t, 0, 1); store(t, -1, 1); }
}
print("typed array put fuzz ok");
