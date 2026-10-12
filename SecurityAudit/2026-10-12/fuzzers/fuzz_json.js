// Stress the JSON transition/name/string caches with many shapes, GC, and structure mutations.
let seed = 42; function rnd() { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed; }
const keys = []; for (let i = 0; i < 300; i++) keys.push("k" + i.toString(36) + "x".repeat(rnd() % 30));
const vals = []; for (let i = 0; i < 100; i++) vals.push("v" + i + "y".repeat(rnd() % 40));
function build(depth) {
    const n = 1 + rnd() % 8; const o = {};
    for (let i = 0; i < n; i++) {
        const k = keys[rnd() % (depth ? 300 : 20)];
        const t = rnd() % 5;
        o[k] = t === 0 ? rnd() : t === 1 ? vals[rnd() % vals.length] : t === 2 && depth < 3 ? build(depth + 1) : t === 3 ? [1, "a", build(depth + 1)] : null;
    }
    return o;
}
let kept = [];
for (let round = 0; round < 3000; round++) {
    const o = build(0); const text = JSON.stringify(o);
    const p = JSON.parse(text);
    if (JSON.stringify(p) !== text) throw new Error("mismatch");
    if (rnd() % 7 === 0) { // mutate structures of parsed objects to perturb transition tables
        p.__proto__ = { z: 1 }; delete p[Object.keys(p)[0]]; Object.defineProperty(p, "q", { get() { return 1; } });
    }
    if (rnd() % 5 === 0) kept.push(p); if (kept.length > 50) kept = [];
    if (rnd() % 97 === 0) { gc(); }
    // 16-bit source variants
    if (rnd() % 11 === 0) { const t16 = text.replace(/"k/g, '"ké'); JSON.parse(t16); JSON.parse(text + "☃".repeat(0)); }
    // reviver
    if (rnd() % 13 === 0) JSON.parse(text, function (k, v) { if (k === "k0") gc(); return v; });
}
print("json fuzz ok");
