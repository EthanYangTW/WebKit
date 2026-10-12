// Differential fuzz for Yarr string-list / EOL string-list optimization: prints a hash of results.
let seed = 1234; function rnd() { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed; }
const alphabet = ["a", "b", "c", "A", "B", "é", "\u{1F600}", "x", "y", "z", "\n", " "];
function randWord(maxLen) { let n = rnd() % (maxLen + 1); let s = ""; for (let i = 0; i < n; i++) s += alphabet[rnd() % alphabet.length]; return s; }
function esc(s) { return s.replace(/[\\^$.*+?()[\]{}|\/]/g, "\\$&"); }
let hash = 0;
function mix(v) { const s = String(v); for (let i = 0; i < s.length; i++) hash = (Math.imul(hash, 31) + s.charCodeAt(i)) | 0; }
let count = 0;
for (let round = 0; round < 6000; round++) {
    const nAlts = 1 + rnd() % 8;
    const alts = [];
    for (let i = 0; i < nAlts; i++) {
        let w = randWord(6);
        const wrap = rnd() % 4;
        alts.push(wrap === 0 ? "(" + esc(w) + ")" : wrap === 1 ? "(?:" + esc(w) + ")" : esc(w));
    }
    const eol = rnd() % 2 ? "$" : "";
    const bol = rnd() % 5 ? "^" : "";
    const flagsPool = ["", "i", "u", "v", "m", "y", "g", "iu", "im", "s", "d", "iy", "um"];
    const flags = flagsPool[rnd() % flagsPool.length];
    let src = bol + "(?:" + alts.join("|") + ")" + eol;
    let re;
    try { re = new RegExp(src, flags); } catch (e) { mix("syntax"); continue; }
    for (let k = 0; k < 6; k++) {
        let subject = rnd() % 3 ? alts[rnd() % alts.length].replace(/^\(\?:|^\(|\)$/g, "").replace(/\\(.)/g, "$1") : randWord(8);
        if (rnd() % 2) subject += randWord(3);
        if (rnd() % 3 === 0) subject = randWord(2) + subject;
        re.lastIndex = rnd() % 3;
        let m;
        try { m = re.exec(subject); } catch (e) { mix("err"); continue; }
        mix(m ? m.index + ":" + m[0] + ":" + m.length + ":" + re.lastIndex : "null");
        mix(re.test(subject)); mix(subject.replace(re, "#")); mix(subject.search(re));
        if (flags.includes("g")) mix(subject.match(re));
        count++;
    }
}
print("regexp fuzz hash", hash, count);
