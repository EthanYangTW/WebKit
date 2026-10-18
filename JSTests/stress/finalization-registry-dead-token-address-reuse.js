//@ runDefault

// Holdings whose target died before their unregister token stay keyed by the token. When the token dies as
// well, that key must be dropped: otherwise an unrelated object allocated at the same address matches it,
// unregister() of a never-registered object returns true, and the queued cleanup callbacks are lost.

const count = 5000;
let ran = 0;
const registry = new FinalizationRegistry(() => { ran++; });

let tokens = [];
for (let i = 0; i < count; ++i) {
    const token = {};
    registry.register({}, i, token);
    tokens.push(token);
}
fullGC(); // Every target is dead while every token is alive.
tokens = null;
fullGC();
fullGC(); // Now the tokens are dead too.

const probes = [];
let spurious = 0;
for (let i = 0; i < 50000; ++i) {
    const object = {};
    probes.push(object);
    if (registry.unregister(object))
        spurious++;
}
if (spurious)
    throw new Error("unregister() matched " + spurious + " objects that were never registered");

setTimeout(() => {
    if (ran !== count)
        throw new Error("only " + ran + " of " + count + " cleanup callbacks ran");
}, 200);
