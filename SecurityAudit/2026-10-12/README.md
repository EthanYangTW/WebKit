# WebKit offensive-minded security audit — source-only, trunk 8130e91ce0 (2026-10-12)

Scope: Source/JavaScriptCore, Source/WebCore, Source/WebKit at commit 8130e91ce0. Methods: manual review of all JSC/WebCore/WebKit
changes landed in the last ~3 weeks plus targeted review of long-lived hot spots, seven parallel code-review passes over distinct
attack surfaces, a JSCOnly Release+ASan build used to run existing stress tests and five purpose-written differential fuzzers,
and a Python model of the new BigInt toString size arithmetic. No WebCore/WebKit build was possible on this host (4 cores), so
WebCore/WebKit findings are static with line-level evidence.

Severity key: "trust-boundary" findings need a compromised WebContent process (renderer RCE already achieved) and matter as
sandbox-escape / cross-origin primitives; "crash" findings are reachable from untrusted web content without prior compromise.

------------------------------------------------------------------------------------------------------------------------------
## Finding 1 — Service Worker server lets a compromised process inject imported-script bytes into ANY origin's service worker
Location: Source/WebKit/NetworkProcess/ServiceWorker/WebSWServerToContextConnection.messages.in:43 (SetScriptResource);
  Source/WebCore/workers/service/server/SWServerToContextConnection.cpp:115-119 (setScriptResource, not overridden by the WebKit
  subclass); SWServerWorker.cpp:40-49 (allWorkers()/existingWorkerForIdentifier, process-wide map), :278-281 (setScriptResource),
  :88-99 (contextData() ships m_scriptResourceMap); SWServer.cpp:1322-1343 (runServiceWorker -> installServiceWorkerContext),
  :949-959 (storeRegistrationForWorkerIfNecessary persists contextData()); Source/WebCore/workers/WorkerScriptLoader.cpp:88-95
  (importScripts uses the cached entry instead of fetching); ServiceWorkerGlobalScope.cpp:220-224;
  NetworkConnectionToWebProcess.cpp:346-350 (dispatch), :1789-1814 (establishSWContextConnection, FIXME at 1799);
  UIProcess/WebProcessPool.cpp:751-753 (a site's own page process is reused as its SW host).
Bug class: CWE-284 Improper Access Control / CWE-345 Insufficient verification of data authenticity (IPC trust boundary).
Entry point: IPC message WebSWServerToContextConnection::SetScriptResource(ServiceWorkerIdentifier, URL, ImportedScript) sent from
  any WebContent process that holds a service-worker context connection (obtained legitimately for the attacker's own site).
Root cause: Context-connection handlers look workers up in a process-wide map keyed by a sequential AtomicObjectIdentifier and
  never check that the worker belongs to the connection's site (m_site is stored but unused). Nonexistent IDs are silently ignored,
  so the identifier space can be swept.
Reachability: evil.com page registers a SW -> UI process asks the (compromised) evil.com process to EstablishSWContextConnection
  (gate at :1796 only validates evil.com itself) -> attacker sends SetScriptResource(id, "https://bank.com/lib.js", {payload}) for a
  range of ids -> bank.com's SWServerWorker::m_scriptResourceMap now maps that URL to attacker bytes -> on the next (re)start of
  bank.com's worker, contextData() carries the map into bank.com's process, where importScripts("https://bank.com/lib.js") returns
  the cached payload without any network fetch (WorkerScriptLoader.cpp:89-94, checked before the install-state check) ->
  attacker JS executes with bank.com's origin in bank.com's process. Persistence: any didFinishInstall / navigation-preload update
  (WebSWServerConnection.cpp:897-934, also unchecked) writes the poisoned contextData() to the registration database.
Validation: static; every step read in source (no SW build available here). Sibling handlers with the same missing check give
  further cross-site primitives: Claim, MatchAll/FindClientByVisibleIdentifier (client URL leak), SkipWaiting, OpenWindow (attributed
  to worker->origin()), Navigate (WebSWServerToContextConnection.cpp:531-570: navigates any client controlled by any worker; the
  same-origin check lives only in the untrusted SW process), PostMessageToServiceWorkerClient (sourceOrigin attacker-chosen).
Impact: hypothetical-but-direct: persistent, cross-process, cross-origin script execution from one compromised renderer. This is a
  site-isolation / sandbox boundary bypass, not memory corruption.
Confidence: High (chain fully traced; preconditions are the standard "compromised renderer" threat model WebKit's MESSAGE_CHECKs
  are designed for).
Mitigation: In SWServerToContextConnection (or the WebKit subclass) resolve workers through the connection's own site: e.g.
  `RefPtr worker = existingWorkerForIdentifier(id); MESSAGE_CHECK(worker && worker->registrableDomain() == m_site.domain() &&
  worker->contextConnection() == this)` for every handler taking a ServiceWorkerIdentifier; additionally require scriptURL to be
  same-origin with the worker's script URL (or at least a URL the worker may import) and reject SetScriptResource for workers
  whose context connection is not the sender. Also MESSAGE_CHECK m_swContextConnection in NetworkConnectionToWebProcess (the
  existing FIXME).

## Finding 1b — Native byte streams: stale ReadableStreamBYOBRequest reaches Deque::first() on an EMPTY deque (dead-slot read, pointer deref)
Location: Source/WebCore/Modules/streams/ReadableByteStreamController.cpp respondInternal :893-910 (invalidateByobRequest only at entry),
  respondInClosedState :912-926 (loop: shiftPendingPullInto + commitPullIntoDescriptor), commitPullIntoDescriptor :960-984 ->
  ReadableStream::fulfillReadIntoRequest (ReadableStream.cpp:443-461) -> ReadableStreamReadRequest.cpp:88-96 runCloseSteps ->
  DeferredPromise::resolve (JSDOMPromiseDeferred.cpp:98-108, synchronous) -> JSPromise::resolvePromise (JSPromise.cpp:572-580: once
  Object.prototype.then exists, isDefinitelyNonThenable() is false and `get(then)` runs USER SCRIPT synchronously);
  getByobRequest :181-192 (lazily creates m_byobRequest over the current first descriptor; reachable from that getter);
  shiftPendingPullInto :470-474 (ASSERT(!m_byobRequest) only); ReadableStreamBYOBRequest.cpp:78-86 respondWithNewView (checks
  m_controller and the ARGUMENT view only, not its own detached m_view — contrast respond() :62-75); controller respondWithNewView
  :853-891 (`ASSERT(!m_pendingPullIntos.isEmpty()); auto& firstDescriptor = m_pendingPullIntos.first();` :855-858, then
  `firstDescriptor.buffer = transferred` :884); WTF/Deque.h:81 (first() = capacitySpan()[m_start], no emptiness check), :481-485
  (takeFirst moves out then destructs the slot), :457 (initial capacity 16, buffer fastMalloc'd and never zeroed);
  WTF/Ref.h:232-241 (move-assign swaps, then the temporary's destructor derefs the OLD pointer, :87-95).
Bug class: CWE-825 Expired pointer dereference / CWE-908 use of uninitialized resource (via CWE-662 improper synchronization of
  state across a re-entrant callback).
Entry point: untrusted page JS; needs only ReadableStream({type:'bytes'}), a BYOB reader and Object.prototype.then.
Root cause: the C++ port of the spec algorithms turned the spec's "Assert: byobRequest is null / pendingPullIntos not empty" steps into
  debug-only ASSERTs, while promise resolution inside the fulfil loops runs user code that can create a new BYOB request over a
  descriptor that the loop then shifts without invalidating it.
Reachability (closed-state variant, verified line by line):
  1. byob reader r; r.read(new Uint8Array(8)); r.read(new Uint8Array(8))  -> two pending descriptors (slots 0,1 of a fresh 16-slot
     deque), two read-into requests; controller.close() keeps them (close :273-290, bytesFilled 0 is aligned).
  2. Object.defineProperty(Object.prototype,'then',{get(){ stash = stash || ctrl.byobRequest; }}).
  3. ctrl.byobRequest.respond(0) -> respondInternal: invalidate, Closed -> respondInClosedState loop: shift #1, commit #1 -> read promise
     resolved -> `then` getter -> ctrl.byobRequest creates m_byobRequest over #2 (deque non-empty, m_byobRequest was null) ->
     loop: shift #2, commit #2 (convertPullIntoDescriptor :627-639 transfers #2's buffer, so stash.m_view is detached but
     stash.m_controller stays set) -> loop ends; m_pendingPullIntos is EMPTY (m_start == 2), m_byobRequest == stash (dangling).
  4. stash.respondWithNewView(new Uint8Array(new ArrayBuffer(N), off, 0)) -> ReadableStreamBYOBRequest::respondWithNewView passes
     (controller set, argument view not detached) -> controller->respondWithNewView: `firstDescriptor` is a reference to deque slot 2,
     which was NEVER constructed (uninitialized fastMalloc bytes of a 1024-byte chunk: sizeof(PullIntoDescriptor)==64 x 16).
     Its size_t fields feed the three range checks (:869-878) — the attacker picks N/off to satisfy whatever values are there — and
     then `firstDescriptor.buffer = transferred` (:884) swaps in a Ref and DEREFS THE STALE POINTER read from the dead slot
     (Ref.h:239-240 -> derefIfNotNull -> refcount decrement at garbage+offset, destruction if it reaches 0). respondInternal then
     reads the same slot again; readerType==None (0) -> shiftPendingPullInto -> Deque::removeFirst RELEASE_ASSERT (:527).
  Variant: if the slot is zero-filled (fresh pages) the Ref write is a leak and the outcome is the RELEASE_ASSERT crash; if the
  1024-byte chunk previously held attacker-shaped data (e.g. a freed ~1000-char StringImpl or Vector buffer in the same bmalloc size
  class), the pointer and the three size_t fields are attacker-chosen.
Validation: static only (no WebCore build on this host); each step above was read in the source. Not executed.
Impact: hypothetical memory corruption (refcount decrement / free on an attacker-influenced pointer) reachable from web content without
  a prior compromise; at minimum a deterministic RELEASE_ASSERT crash. This is the only finding of the audit with a plausible path to
  memory corruption from untrusted content.
Confidence: Medium (mechanics verified; exploitability depends on heap grooming of the deque buffer; not reproduced dynamically).
Mitigation: (a) in ReadableByteStreamController::respond/respondWithNewView, return a TypeError when m_pendingPullIntos.isEmpty()
  (RELEASE_ASSERT at minimum); (b) make ReadableStreamBYOBRequest::respondWithNewView reject when its own m_view is null/detached, as
  respond() does; (c) invalidateByobRequest() inside shiftPendingPullInto() (make the spec assertion true) and re-validate
  stream->byobReader()/defaultReader() after every commitPullIntoDescriptor/fulfill* call (the sibling null-WeakPtr dereferences at
  ReadableStream.cpp:576-589 and enqueue :385-387 are the same root cause, crash-only).

## Finding 1c — Byte-stream reader released inside a synchronous `then` getter: null WeakPtr dereference (crash)
Location: ReadableByteStreamController.cpp enqueue :385-395 (processReadRequestsUsingQueue runs script, then
  stream->getNumReadRequests()), respondInClosedState :920-924; ReadableStream.cpp getNumReadIntoRequests :576-581 /
  getNumReadRequests :584-589 (`ASSERT(m_xxxReader); m_xxxReader.get()->...` on a WeakPtr); releaseLock paths
  ReadableStreamDefaultReader.cpp:167-187 / ReadableStreamBYOBReader.cpp:112-122 clear the WeakPtr.
Bug class: CWE-476. Entry point: untrusted page JS (same `then` getter technique; getter calls reader.releaseLock()).
Impact: renderer crash (near-null read). Also tee branches: ReadableByteStreamController::stop() :119-123 clears the JS algorithms
  but not the native pull wrapper, so a parent-frame holder of a detached child frame's tee branch reader can drive
  StreamTeeState pull lambdas (StreamTeeUtilities.cpp:231-239, 631-649) after stop() nulled branches/readers (null deref).
Confidence: High that the enqueue/closed-state sequences reach the dereference; Medium-Low for the tee variant.
Mitigation: re-fetch and null-check readers after each script-running call; make getNumRead*Requests() tolerate a null reader.

## Finding 2 — FinishFetchingScriptInServer accepts a forged job identifier (attacker supplies another origin's SW script)
Location: WebSWServerConnection.messages.in (FinishFetchingScriptInServer); SWServer.cpp:532-536 (Connection::finishFetchingScriptInServer),
  :857-865 (scriptFetchFinished, ASSERT only), SWServerJobQueue.cpp:55-58,72-124; WebSWServerConnection.cpp:1086-1097 (checkTopOrigin
  applied to scheduleJobInServer/matchRegistration/registerServiceWorkerClient but not here).
Bug class: CWE-345 / CWE-362 (race on a guessable identifier).
Entry point: any WebContent process's WebSWServerConnection.
Root cause: jobDataIdentifier.connectionIdentifier is never compared with the sending connection; registrationKey is public.
Reachability: spray FinishFetchingScriptInServer({conn, job}, {bank.com, scope}, {script=payload}) while a bank.com register/update
  job is between startScriptFetchInClient and the genuine reply (soft updates on every navigation use the network process's own
  connection identifier, which is fixed). Winning the race makes the payload the installing worker and it is persisted on install.
Validation: static. Impact: hypothetical, cross-origin persistent SW. Confidence: Medium.
Mitigation: MESSAGE_CHECK(jobDataIdentifier.connectionIdentifier == identifier()) and checkTopOrigin(registrationKey.topOrigin()).

## Finding 3 — PostMessageToServiceWorker lets any process message any origin's SW with a spoofed same-origin client source
Location: WebSWServerConnection.cpp:385-431; contrast registerServiceWorkerClient :555-557 and NetworkBroadcastChannelRegistry.cpp:106-110.
Bug class: CWE-284. Entry point: WebSWServerConnection::PostMessageToServiceWorker from any WebContent process.
Root cause: destination worker looked up globally; source client validated only as "a client of the destination's origin", never
  as belonging to the sending process. TerminateWorkerFromClient (:823-831) has the same gap (cross-origin SW DoS).
Validation: static. Impact: hypothetical; attacker-controlled message with event.source = a genuine bank.com window client.
Confidence: Medium. Mitigation: require the source client to be owned by this connection (processIdentifier() == identifier()) and
  the destination worker's origin to match the client/top origin of the sender.

## Finding 4 — WKScriptMessage frameInfo (securityOrigin/topOrigin/isMainFrame) is web-process controlled
Location: UIProcess/WebProcessProxy.messages.in (DidPostMessage, DidPostMessageSync); WebProcessProxy.cpp:3806-3817; UserContent/
  WebUserContentControllerProxy.cpp:394-400; APIFrameInfo.cpp:37-59 (global WebFrameProxy::webFrame(frameID) lookup); APIFrameInfo.h:55.
Bug class: CWE-345. Root cause: FrameInfoData's embedded origins are not validated with ProcessSpeaksForDomain (unlike the 37 standalone
  origin parameters hardened in 8e1483499e), and frameID is resolved without checking it belongs to the sending process/page.
Impact: hypothetical; embedders that gate privileged native message handlers on frameInfo.securityOrigin/isMainFrame can be spoofed by a
  compromised cross-site iframe process. Confidence: Medium. Mitigation: validate securityOrigin/topOrigin against the process's
  committed origins and require WebFrameProxy::webFrame(frameID)->process() == sender.

## Finding 5 — Popover hint re-entrancy: hidePopoverInternal dereferences freed-and-nulled PopoverData (null-pointer crash)
Location: Source/WebCore/html/HTMLElement.cpp hidePopoverInternal :1343-1392 (hint loop :1376-1389, unguarded setInvoker(nullptr) :1392),
  setInvoker :1333-1340 (popoverData()->invoker() with no null check), popoverAttributeChanged :1493-1525 (nested hide at :1517 then
  clearPopoverData() at :1522).
Bug class: CWE-476 NULL pointer dereference (CWE-416-adjacent: PopoverData object is destroyed mid-operation).
Entry point: untrusted web content (popover=hint is enabled by default: PopoverHintEnabled defaultValue true).
Root cause: every other script re-entry point in show/hide is followed by checkPopoverValidity or a null check; the descendant-hint
  loop fires cancelable beforetoggle on hints, after which the outer function touches popoverData() unconditionally.
Reachability: O (popover=auto) shown; H (popover=hint) shown nested under O; H's beforetoggle handler does O.removeAttribute('popover')
  -> nested hidePopoverInternal(O) (FireEvents::No) completes -> clearPopoverData() frees O's PopoverData -> back in O's outer hide,
  setInvoker(nullptr) reads through elementRareData()->popoverData() == nullptr.
Validation: static (no WebCore build on this host). Expected: SEGV at a small address in HTMLElement::setInvoker.
Impact: demonstrated-by-reading DoS; PopoverData is only reachable through the now-null rare-data slot, so no dangling pointer use.
Confidence: Medium. Mitigation: re-run checkPopoverValidity(*this, Showing) after the hint loop (as done at :1360-1368), and make
  setInvoker tolerate a null popoverData().
Repro sketch:
  <div id=o popover=auto><button id=b popovertarget=h>x</button></div><div id=h popover=hint>hint</div>
  <script>o.showPopover(); h.showPopover({source:b});
  h.addEventListener('beforetoggle', e => { if (e.newState==='closed') o.removeAttribute('popover'); }); o.hidePopover();</script>

## Finding 6 — GPUQueue.copyExternalImageToTexture with a detached ImageData hits a RELEASE_ASSERT (controlled crash)
Location: Source/WebCore/Modules/WebGPU/GPUQueue.cpp:988-997 (ImageData arm of isStateValid checks only width/height; the
  OffscreenCanvas arm at :1037 checks isDetached()), :767-776/:502-503 (byteArrayPixelBuffer()); html/ImageData.cpp:173-178;
  ImageDataArray.cpp:127-148 (returns the same, detached Uint8ClampedArray); platform/graphics/TypedArrayPixelBuffer.cpp:34-38 (no size
  check); PixelBuffer.cpp:100-106 (RELEASE_ASSERT_WITH_SECURITY_IMPLICATION(bufferSize <= bytes.size())).
Bug class: CWE-617 reachable assertion (CWE-20). Entry point: untrusted web content where WebGPU is enabled (ENABLE(WEBGPU_BY_DEFAULT)
  platforms). Root cause: missing imageData->data().isDetached() check; every other ImageData consumer (canvas putImageData :2906,
  ImageBitmap :1149, WebGL texImageSource :3442) re-checks detachment.
Repro sketch: const id = new ImageData(2,2); postMessage(id.data.buffer,'*',[id.data.buffer]);
  device.queue.copyExternalImageToTexture({source:id},{texture},[2,2]);
Validation: static; the assertion is unconditional so the crash is deterministic. Impact: renderer DoS only. Confidence: High (crash) /
  Low (security). Mitigation: reject detached ImageData in isStateValid with InvalidStateError (same as the OffscreenCanvas arm).
  Same pattern (inspector-only) at page/FrameConsoleClient.cpp:427 and workers/WorkerConsoleClient.cpp:230.

## Finding 7 — GPU process deadlock via ReleaseRenderingBackend ordering (cross-site DoS from a compromised renderer)
Location: GPUProcess/GPUConnectionToWebProcess.cpp:718-723 (releaseRenderingBackend) -> RemoteRenderingBackend.cpp:140-145
  (stopListeningForIPC sets m_shouldQuit); Platform/IPC/StreamConnectionWorkQueue.cpp:46-63 (dispatch() silently drops the function
  once m_shouldQuit, :54-55); GPUProcess/graphics/WebGPU/RemoteGPU.cpp:255-290 (dispatch + BinarySemaphore::wait with a Ref kept in
  RemoteGPU.h:150); reached from RemoteQueue::copyExternalImageToTexture (RemoteQueue.cpp:~227, synchronous message).
Bug class: CWE-667 improper locking / CWE-833 deadlock. Root cause: no liveness check of the rendering backend and no failure signal
  from dispatch(). Sequence: CreateRenderingBackend(B), CreateGPU(G,B), ReleaseRenderingBackend(B), then
  RemoteQueue::CopyExternalImageToTexture on G's stream -> WebGPU work queue blocks forever; subsequent ReleaseGPU / teardown then
  blocks the GPU-process main thread. Impact: shared GPU process hangs for all sites. Confidence: Medium. Mitigation: make
  dispatch() return a bool and signal the semaphore (or skip the wait) when the queue has quit; or hold the backend alive via the
  GPU object graph rather than dispatching across streams.

## Finding 8 — RemoteImageBufferSet with web-chosen RenderingMode::PDFDocument calls through a null backend-sharing pointer (GPU process)
Location: Shared/graphics/RemoteImageBufferSetConfiguration.serialization.in:27-37 (renderingMode: enum only); RemoteImageBufferSet.cpp
  :89-93, :131-174 (ensureBufferForDisplay allocates with m_configuration.renderingMode at :152), :118-119 (downcast of
  toBackendSharing() without a null check — contrast RemoteImageBuffer.cpp:75-79); RemoteRenderingBackend.cpp:319-323
  (PDFDocument -> ImageBufferCGPDFDocumentBackend, which does not override toBackendSharing(); base returns nullptr at
  ImageBufferBackend.h:162).
Bug class: CWE-476 (null virtual call in a privileged process). Impact: GPU-process crash from a compromised renderer (Cocoa, USE(CG)).
  Confidence: Medium (crash) / Low (security). Mitigation: validate renderingMode in the serialization validator
  (Accelerated/Unaccelerated only for layer backing) and null-check toBackendSharing().

## Finding 9 — moveBefore() does not run slot moving steps: stale NamedSlotAssignment reaches RELEASE_ASSERT / null deref (flag-gated)
Location: dom/ContainerNode.cpp:1518-1616 (moveBefore; FIXME(281223) at :1595); html/HTMLSlotElement.cpp:60-86 (insertion/removal steps
  only, no movingSteps); dom/SlotAssignment.cpp:361-384 (RELEASE_ASSERT(slot) at :370), :99-109; dom/ComposedTreeIterator.h:376,458.
Bug class: CWE-617 / CWE-476. Entry point: web content with MoveBeforeEnabled (defaultValue false in UnifiedWebPreferences.yaml:4363).
Reachability: move a named <slot> from shadow root A to shadow root B (same shadow-including root) with rb.moveBefore(s,null); then
  s.assignedNodes() -> B's NamedSlotAssignment has no entry -> RELEASE_ASSERT; moving the slot into light DOM instead leaves A's table
  pointing at it and ComposedTreeIterator derefs a null assignedNodes(). All node storage is WeakPtr, so this is a safe crash.
Confidence: Medium (crash). Mitigation: add HTMLSlotElement::movingSteps that removes from the old root's SlotAssignment and adds to
  the new one (and fix live ranges per the FIXME) before enabling the flag.

## Finding 10 — Lower-severity GPU-process items (compromised renderer, DoS/spoof only)
- Snapshot recorder self-reference: RemoteSnapshotRecorder.cpp:73-80 + RemoteRenderingBackend.cpp:290-299 (sinkSnapshotRecorderIntoSnapshotFrame,
  explicit FIXME "global identifiers is not secure") let a frame's display list draw itself -> unbounded recursion in
  RemoteSnapshot::applyFrame (RemoteSnapshot.cpp:215-232) when the UI process draws the snapshot; GPUProcess::snapshotForRecorder
  (GPUProcess.cpp:673-679) has no owner check (cross-process snapshot content injection). Confidence: Low.
- RemoteAudioMediaStreamTrackRendererInternalUnitManager.cpp:264-286,:310 dereference an empty std::optional<CAAudioStreamDescription>
  when the audio unit failed to create (unit is still registered, AudioMediaStreamTrackRendererInternalUnit.cpp:94-98,:134). UB read,
  bounded downstream by SharedCARingBuffer validation; libc++ hardening traps on CMake builds. Confidence: Low.
- RemoteQueue.cpp:191-196 checks convertedDestination twice instead of convertedDataLayout (typo); harmless today because
  ConvertFromBackingContext::convertFromBacking(ImageDataLayout) (Shared/WebGPU/WebGPUImageDataLayout.cpp:42-45) cannot fail.

------------------------------------------------------------------------------------------------------------------------------
## Code reviewed in depth and found sound (negative results, with the evidence)
JSC (all newly landed 2026-09-24..10-11; each also run under ASan):
- JSBigInt Burnikel-Ziegler division (b071cfab28, 13a1f29169) and divide-and-conquer toString (e2ffc55c56): scratch sizing, position
  arithmetic and divideDigitsInto preconditions modeled in Python (scratchpad/model/tostring_model.py: no violation for radix 3..36,
  32/64-bit digits, 12..1025 digits); differential fuzz vs. single-digit-division reference (400 rounds up to 3000 digits) and
  near-maximum (2^20-70 bit) division/toString/sqrt/cbrt all ASan clean. Observation (functional): BigInt(x.toString(10)) throws
  "too big" for values within ~0.6% of maxLengthBits because parse uses the ceil'd bits-per-char estimate (JSBigInt.cpp:5843-5861).
- Yarr EOL string-list length grouping (8d2c95ee3b): multiline excluded at YarrPattern.cpp:2241; index/length equality checks keep
  reads in bounds; 36,000-case differential fuzz gives identical results with JIT, --useRegExpJIT=0 and --useJIT=0.
- LLInt integer TypedArray put-by-val fast path (4130297630): resizable/detached/negative-index/large-array exits verified in
  LowLevelInterpreter.asm:1308-1330 and LowLevelInterpreter64.asm:2137-2165; 20,000-round fuzz vs. generic path clean.
- JSON.parse transition/name/string caches (1e80c1e3ef, 7fb452f1a4, 26fbddd98c): full-name comparison in transitionIfMatches, 32-byte
  source-length guards before SIMD loads, JSString* entries cleared in every GC end phase (Heap.cpp:1711-1718), transitions marked
  while parsing; 3,000-round fuzz with GC/structure mutation clean.
- JIT butterfly allocation (0c5333c36c): size-class index (vectorLength>>1)+1 matches MarkedSpace::sizeClassToIndex (ceil); null
  allocator falls to slow path (AssemblyHelpers.cpp:1050-1052).
- Eden sweep of ArrayBuffer incoming references (91e8fd1b2f): old entries only skip filtering when all their cells are marked from the
  previous sweep; new incoming refs are tracked; RELEASE_ASSERT guards the invariant.
- JSWeakMap/JSWeakSet inline buffer (54a3720b4e): rehash from capacity 4 always grows to 8 (HashMapHelper.h:149-161), so the inline
  buffer is never both source and destination of a rehash.
- Megamorphic by-val uid handling (9b61fb4887): isCacheableIdentifierCell precondition + GCOwnedDataScope keeps the key cell alive.
- MakeRope StringOrOther (db86e0961a): fixup inserts ToString(StringOrOtherUse) so MakeRope only sees strings.
- Uint8Array.setFromBase64/setFromHex: length and vector read after all option getters; detached views give length 0.
Agent passes (hypotheses tried and disproved are listed in the per-area reports, summarized): JSC runtime re-entrancy (TypedArray/
ArrayBuffer/DataView/Atomics/Array/String/Temporal: every length re-validated after user code); DFG/FTL side-effect modeling
(no def(PureValue)/clobber mismatch found; two Low notes: StringReplaceString modeled effect-free, GetUndetachedTypeArrayLength relies
on the detach watchpoint); WebAssembly parser/runtime/IPInt/BBQ/OMG (no inconsistency; fragility notes on fixed-size table hoisting
and IPInt i32 upper-half convention); GPU-process graphics IPC (typed resource maps, serialization validators, Checked<> byte sizes);
DOM/editing (select/option/optgroup moving steps, dialog/CloseWatcher, custom element define); rendering/layout/SVG/MathML/AX
(line-clamp, IFC SVG text, LFC grid, HTML-in-canvas, view transitions, anchor positioning: all CheckedPtr/WeakPtr-held); canvas/
WebCodecs/WebAudio/WebGL/WebGPU/streams/structured clone buffer arithmetic (resizable buffers rejected by bindings, Checked<>,
RELEASE_ASSERT'd copies); Network-process storage (FS Access name validation incl. NUL, per-origin handle resolution, IDB/Cache
origin gating), UI-process origin parameters (IPC::Untrusted/ProcessSpeaksForDomain), pasteboard, cookies, RTC/WebTransport ownership.

## Validation artifacts (scratchpad)
- Build: WebKitBuild/JSCOnly/Release/bin/jsc (clang 18, -fsanitize=address, USE_SYSTEM_MALLOC).
- tests/run_targeted.sh (17 stress tests x 4 tiers: pass), tests/run_suite.sh (362 bigint/json/typed-array/weakmap tests: pass; 8
  need --useBigIntMathMethods=1 and pass with it), tests/run_suite2.sh (316 regexp/string tests: pass; 2 need --useRegExpBufferBoundaries=1 and pass with it, 3 are stale `//@ skip` too-long-rope tests whose expectation predates the 2^31-1 string limit), tests/fuzz_*.js, model/tostring_model.py.
