function shouldBe(actual, expected) {
    if (actual !== expected)
        throw new Error(`bad value: ${actual}, expected ${expected}`);
}

// When the result of `!` is only used as an int32, its operand must still be computed as a full number:
// a product or sum that wraps to zero, or a quotient truncated to zero, would otherwise read as falsy.

function notMul(a) { return (!(a * 1024)) | 0; }
function notAdd(a, b) { return (!(a + b)) | 0; }
function notSub(a, b) { return (!(a - b)) | 0; }
function notDiv(a) { return (!(a / 3)) | 0; }
function notNeg(a) { return (!(-a)) | 0; }
function doubleNot(a) { return (!!(a * 65536)) | 0; }
function notMulXor(a) { return (!(a * 1024)) ^ 1; }
function notMulShift(a) { return (!(a * 1024)) << 1; }
function notAddImul(a, b) { return Math.imul(!(a + b), 7); }
function notMod(a, b) { return (!(a % b)) | 0; }
noInline(notMul); noInline(notAdd); noInline(notSub); noInline(notDiv); noInline(notNeg);
noInline(doubleNot); noInline(notMulXor); noInline(notMulShift); noInline(notAddImul); noInline(notMod);

for (let i = 0; i < 1e5; ++i) {
    shouldBe(notMul(3), 0);
    shouldBe(notMul(0), 1);
    shouldBe(notMul(2 ** 30), 0);
    shouldBe(notMul(2 ** 22), 0);
    shouldBe(notAdd(1, 2), 0);
    shouldBe(notAdd(0, 0), 1);
    shouldBe(notAdd(-2147483648, -2147483648), 0);
    shouldBe(notAdd(2147483647, 1), 0);
    shouldBe(notSub(5, 5), 1);
    shouldBe(notSub(-2147483648, 1), 0);
    shouldBe(notDiv(9), 0);
    shouldBe(notDiv(1), 0);
    shouldBe(notDiv(0), 1);
    shouldBe(notNeg(4), 0);
    shouldBe(notNeg(0), 1);
    shouldBe(notNeg(-2147483648), 0);
    shouldBe(doubleNot(1), 1);
    shouldBe(doubleNot(65536), 1);
    shouldBe(doubleNot(0), 0);
    shouldBe(notMulXor(2 ** 30), 1);
    shouldBe(notMulShift(2 ** 30), 0);
    shouldBe(notAddImul(-2147483648, -2147483648), 0);
    shouldBe(notMod(7, 3), 0);
    shouldBe(notMod(6, 3), 1);
    shouldBe(notMod(1, 0), 1);
    shouldBe(notMod(-2147483648, -1), 1);
}
