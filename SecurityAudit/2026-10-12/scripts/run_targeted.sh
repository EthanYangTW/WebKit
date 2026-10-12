#!/bin/bash
cd /home/user/WebKit
export ASAN_OPTIONS=detect_leaks=0:abort_on_error=1
J=WebKitBuild/JSCOnly/Release/bin/jsc
for t in array-buffer-incoming-references-across-eden-and-full-gc bigint-divide-burnikel-ziegler bigint-to-string-divide-and-conquer bigint-to-string-in-array by-val-megamorphic-key-collected-in-slow-path json-parse-cached-property-name-16bit-source json-parse-cached-property-name json-parse-cached-string-value json-parse-long-string-value-cache json-parse-object-key-branching-transitions json-parse-object-key-matches-transition json-parse-transition-cache-across-gc json-parse-transition-cache-structure-changes put-by-val-detached-typed-array-llint put-by-val-integer-typed-array-values regexp-stringlist-eol-length-groups regexp-stringlist-eol-multiline; do
  for opts in "" "--useJIT=0" "--useDFGJIT=0 --useLLInt=0" "--forceEagerCompilation=1"; do
    out=$(timeout 600 $J $opts JSTests/stress/$t.js 2>&1); rc=$?
    echo "[$rc] $t ($opts) :: $(echo "$out" | grep -i -E "error|sanitizer|assert|crash" | head -2)"
  done
done
echo ALLDONE
