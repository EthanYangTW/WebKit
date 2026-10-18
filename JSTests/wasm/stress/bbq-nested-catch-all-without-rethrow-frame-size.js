//@ requireOptions("--thresholdForBBQOptimizeAfterWarmUp=0", "--thresholdForBBQOptimizeSoon=0")

// BBQ reserves one implicit frame slot per enclosing catch block, but sized its frame from the IPInt
// profile, which only reserved rethrow slots when the body used `rethrow`. Deeply nested try/catch_all
// blocks without a rethrow therefore failed BBQ's frame-size validation and aborted the compile.

function uleb(n) { const out = []; do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; out.push(b); } while (n); return out; }
function section(id, bytes) { return [id, ...uleb(bytes.length), ...bytes]; }
function vec(items) { return [...uleb(items.length), ...items.flat()]; }
function str(s) { return [...uleb(s.length), ...Array.from(s, c => c.charCodeAt(0))]; }

// Each level is `try (call the import) catch_all <next level> end`, so the catch blocks nest inside each
// other (which is what consumes BBQ's implicit slots) while only the outermost try body ever runs.
function body(depth) {
    if (!depth)
        return [0x10, 0]; // call the import
    return [0x06, 0x40, 0x10, 0, 0x19, ...body(depth - 1), 0x0b];
}
let calls = 0;
for (const depth of [22, 23, 40, 80]) {
    const code = [...body(depth), 0x0b];
    const bytes = new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
        ...section(1, vec([[0x60, 0, 0]])),
        ...section(2, vec([[...str("e"), ...str("f"), 0x00, 0]])),
        ...section(3, vec([[0]])),
        ...section(7, vec([[...str("g"), 0x00, 1]])),
        ...section(10, vec([[...uleb(code.length + 1), 0, ...code]])),
    ]);
    const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes), { e: { f() { calls++; } } });
    for (let i = 0; i < 1000; ++i)
        instance.exports.g();
}
if (calls !== 4000)
    throw new Error("unexpected call count " + calls);
