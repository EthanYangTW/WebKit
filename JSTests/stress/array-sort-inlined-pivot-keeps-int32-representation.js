//@ runDefault("--useConcurrentJIT=0", "--thresholdForJITAfterWarmUp=10", "--thresholdForOptimizeAfterWarmUp=20")
//@ runDefault("--useConcurrentJIT=0", "--thresholdForJITAfterWarmUp=10", "--thresholdForOptimizeAfterWarmUp=20", "--thresholdForFTLOptimizeAfterWarmUp=50")

function shouldBe(actual, expected) {
    if (actual !== expected)
        throw new Error(`bad value: ${actual}, expected ${expected}`);
}

// The DFG-inlined Array.prototype.sort keeps the pivot in a temporary that is also passed to the
// comparator. A comparator that uses its argument in double arithmetic must not change the
// representation of the value that is written back into an Int32 array.

function multiplyComparator(x) { return x * 1.5; }
function divideComparator(x, y) { return x / 3 - y / 3; }
function sortInt32(cmp) {
    var a = [10, 20, 30, 40, 50];
    a.push(60);
    return a.sort(cmp);
}
noInline(sortInt32);

for (var i = 0; i < 2000; ++i) {
    var r = sortInt32(multiplyComparator);
    shouldBe(r.join(), "10,20,30,40,50,60");
    shouldBe(r.indexOf(20), 1);
    shouldBe(r.includes(60), true);
    shouldBe(JSON.stringify(r), "[10,20,30,40,50,60]");
    r[0] = 1.5; // Int32 -> Double conversion must see real int32 values.
    shouldBe(JSON.stringify(r), "[1.5,20,30,40,50,60]");

    var s = sortInt32(divideComparator);
    shouldBe(s.join(), "10,20,30,40,50,60");
    s[1] = 0.5;
    shouldBe(JSON.stringify(s), "[10,0.5,30,40,50,60]");
}
