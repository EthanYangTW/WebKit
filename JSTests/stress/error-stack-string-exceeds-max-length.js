//@ skip if $memoryLimited
//@ runDefault

// The stack string of an error is the join of one line per frame. Both the number of frames
// (Error.stackTraceLimit) and the length of each line (the function name) are chosen by the
// script, so the total can exceed the maximum string length. Materializing such a stack must
// produce a truncated string rather than crash.

Error.stackTraceLimit = 1000000;
var name = "f" + "x".repeat(1500000);
eval("function " + name + "(n) { if (n) return " + name + "(n - 1); throw new Error('e'); }");

var error;
try {
    globalThis[name](2000);
} catch (e) {
    error = e;
}

if (error.message !== "e")
    throw new Error("bad message: " + error.message);

var stack = error.stack;
if (typeof stack !== "string")
    throw new Error("stack is not a string");
if (stack.length > 0x7fffffff)
    throw new Error("stack exceeds the maximum string length: " + stack.length);
if (stack.length < 1500000)
    throw new Error("stack lost every frame: " + stack.length);
if (!stack.startsWith(name))
    throw new Error("stack does not start with the innermost frame");
