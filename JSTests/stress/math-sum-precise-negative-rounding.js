function shouldBe(actual, expected) {
    if (!Object.is(actual, expected))
        throw new Error(`bad value: ${actual}, expected ${expected}`);
}

// A sum that is exactly representable must round to itself, whatever its sign.
const exact = [-1, -0.1, -3.5, -5, -7, -9, -11, -1.25, -1.75, -1e300, -123456789.123, -(2 ** 53 - 1), -(2 ** 53 + 2), -(2 ** -1000), -(2 ** -1070), -4.137540917150678e+257, -1.9667372753887264e-166, -2.823074949754088e+25, -1.5936821971565687e+308];
for (const x of exact) {
    shouldBe(Math.sumPrecise([x]), x);
    shouldBe(Math.sumPrecise([x, 0]), x);
    shouldBe(Math.sumPrecise([x, -0]), x);
    shouldBe(Math.sumPrecise([x / 2, x / 2]), x);
    shouldBe(Math.sumPrecise([-x]), -x);
}

// Two doubles: the correctly rounded sum is the IEEE sum.
let seed = 0x12345678;
function random() {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return seed / 0x80000000;
}
for (let i = 0; i < 20000; ++i) {
    const x = (random() - 0.5) * 2 ** Math.floor(random() * 2000 - 1000);
    const y = (random() - 0.5) * 2 ** Math.floor(random() * 2000 - 1000);
    shouldBe(Math.sumPrecise([x]), x);
    shouldBe(Math.sumPrecise([x, y]), x + y);
    shouldBe(Math.sumPrecise([y, x]), x + y);
}

// Ties in the negative direction round to even, and remainders below a tie truncate.
shouldBe(Math.sumPrecise([-(2 ** 53), -1]), -(2 ** 53));          // tie, even mantissa
shouldBe(Math.sumPrecise([-(2 ** 53), -3]), -(2 ** 53 + 4));      // tie, odd mantissa
shouldBe(Math.sumPrecise([-(2 ** 53), -1, 2 ** -60]), -(2 ** 53)); // below tie
shouldBe(Math.sumPrecise([-(2 ** 53), -1, -(2 ** -60)]), -(2 ** 53 + 2)); // above tie
shouldBe(Math.sumPrecise([-(2 ** 53), -0.5]), -(2 ** 53));
shouldBe(Math.sumPrecise([-(2 ** 53), -1.5]), -(2 ** 53 + 2));

// Arrays longer than the small-accumulator threshold take the large-accumulator path, which rounds the same way.
{
    const many = new Array(2000).fill(-1);
    shouldBe(Math.sumPrecise(many), -2000);
    many[0] = -0.1;
    shouldBe(Math.sumPrecise(many), -1999.1);
    shouldBe(Math.sumPrecise(new Array(1500).fill(-(2 ** 53)).concat([-1])), -(1500 * 2 ** 53));
    shouldBe(Math.sumPrecise(new Array(1500).fill(-(2 ** 52)).concat([-1])), -(1500 * 2 ** 52 + 1));
}
