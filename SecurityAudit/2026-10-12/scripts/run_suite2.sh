#!/bin/bash
cd /home/user/WebKit
export ASAN_OPTIONS=detect_leaks=0
J=WebKitBuild/JSCOnly/Release/bin/jsc
for f in $(ls JSTests/stress/ | grep -E "^(regexp|string-list|yarr|string-prototype-(replace|split|match)|weak-ref|finalization)" ); do
  opts=$(grep -o -m1 'requireOptions("[^)]*")|runDefault("[^)]*")' JSTests/stress/$f | sed -E 's/(runDefault|requireOptions)\(//; s/\)//; s/"//g; s/,/ /g')
  out=$(timeout 900 $J --useDollarVM=1 $opts JSTests/stress/$f 2>&1); rc=$?
  if [ $rc -ne 0 ] || echo "$out" | grep -q -i "sanitizer"; then echo "[$rc] $f ($opts) :: $(echo "$out" | grep -i -E "error|sanitizer|assert|crash" | head -3)"; fi
done
echo SUITE2DONE
