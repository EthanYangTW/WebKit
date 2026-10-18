function shouldBe(actual, expected) {
    if (actual !== expected)
        throw new Error(`bad value: ${actual}, expected ${expected}`);
}

// A sloppy function whose parameter is captured by a closure uses ScopedArguments. Overriding
// callee, length or @@iterator must keep the real argument count, and redefining then deleting an
// element beyond the named parameters must remove it, exactly like DirectArguments.

function scoped(a) {
    function capture() { return a; }
    delete arguments.callee;
    return arguments.length + ":" + Array.prototype.join.call(arguments) + ":" + [...arguments].length;
}
noInline(scoped);

function scopedIterator(a) {
    function capture() { return a; }
    arguments[Symbol.iterator] = Array.prototype[Symbol.iterator];
    return Math.max.apply(null, arguments);
}
noInline(scopedIterator);

function scopedDefineDelete(a) {
    function capture() { return a; }
    Object.defineProperty(arguments, "2", { value: 9 });
    const before = arguments[2];
    delete arguments[2];
    return before + ":" + arguments[2] + ":" + (2 in arguments) + ":" + arguments.length;
}
noInline(scopedDefineDelete);

function scopedLengthProperty(a) {
    function capture() { return a; }
    arguments.length = 100;
    delete arguments.length;
    return arguments.length;
}
noInline(scopedLengthProperty);

for (let i = 0; i < 1e4; ++i) {
    shouldBe(scoped(1, 2, 3), "3:1,2,3:3");
    shouldBe(scoped(), "0::0");
    shouldBe(scopedIterator(1, 2, 3, 4), 4);
    shouldBe(scopedDefineDelete(1, 2, 3), "9:undefined:false:3");
    shouldBe(scopedDefineDelete(1), "9:undefined:false:1");
    shouldBe(scopedLengthProperty(1, 2, 3, 4, 5), undefined);
}
