//@ requireOptions("--useRegExpBufferBoundaries=1")

function shouldBe(actual, expected) {
    if (actual !== expected)
        throw new Error(`bad value: ${actual}, expected ${expected}`);
}

// \Z (end of input with an optional trailing line terminator) inside a lookbehind must give the same
// result in the JIT and the interpreter: the assertion is about the position, not the preceding character.
function index(re, subject) {
    const match = re.exec(subject);
    return match ? match.index : null;
}

for (let i = 0; i < 200; ++i) {
    shouldBe(index(/(?<=\Z)/u, "ab\n"), 2);
    shouldBe(index(/(?<=\Z)/u, "ab"), 2);
    shouldBe(index(/(?<=\Za)/u, "ab"), null);
    shouldBe(index(/(?<!\Z)/u, "ab"), 0);
    shouldBe(index(/(?<=\Z)/v, "aΩ"), 2);
    shouldBe(index(/(?<=\Z)/u, "ab\r\n"), 2);
    shouldBe(index(/(?<=\Z)/u, ""), 0);
    shouldBe(index(/(?<=a\Z)b/u, "ab"), null);
    // Forward uses are unchanged.
    shouldBe(index(/b\Z/u, "ab\n"), 1);
    shouldBe(index(/b\Z/u, "ab\r\n"), 1);
    shouldBe(index(/b\Z/u, "abc"), null);
    shouldBe(index(/(?<=\z)/u, "ab\n"), 3);
    shouldBe(index(/(?<=\A)/u, "ab"), 0);
}
