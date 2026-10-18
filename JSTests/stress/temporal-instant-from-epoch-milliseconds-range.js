function shouldBe(actual, expected) {
    if (actual !== expected)
        throw new Error(`bad value: ${actual}, expected ${expected}`);
}

function shouldThrow(func, errorType) {
    let error;
    try {
        func();
    } catch (e) {
        error = e;
    }
    if (!(error instanceof errorType))
        throw new Error(`Expected ${errorType.name}, got ${error}`);
}

// Values that do not fit in an int64_t must be rejected before any conversion.
for (const value of [1e300, -1e300, 2 ** 63, -(2 ** 63), 2 ** 64, 1.8e308, 9007199254740992e10, -9007199254740992e10])
    shouldThrow(() => Temporal.Instant.fromEpochMilliseconds(value), RangeError);

// Non-integers and non-finite values are rejected as before.
for (const value of [0.5, NaN, Infinity, -Infinity, 1e15 + 0.5])
    shouldThrow(() => Temporal.Instant.fromEpochMilliseconds(value), RangeError);

// The supported range is ±8.64e15 milliseconds inclusive.
shouldBe(Temporal.Instant.fromEpochMilliseconds(8.64e15).epochMilliseconds, 8.64e15);
shouldBe(Temporal.Instant.fromEpochMilliseconds(-8.64e15).epochMilliseconds, -8.64e15);
shouldThrow(() => Temporal.Instant.fromEpochMilliseconds(8.64e15 + 1), RangeError);
shouldThrow(() => Temporal.Instant.fromEpochMilliseconds(-8.64e15 - 1), RangeError);
shouldBe(Temporal.Instant.fromEpochMilliseconds(-0).epochMilliseconds, 0);
shouldBe(Temporal.Instant.fromEpochMilliseconds("1000").epochMilliseconds, 1000);
