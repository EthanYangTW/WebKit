# Byte-stream stale BYOB request — dynamic confirmation plan & crash/corruption boundary

## What the assertions build will show (POC: poc/byob-stale.js)
The POC closes a byte stream with 2 pending BYOB pull-into descriptors (slots 0,1 of the
16-entry Deque), then calls ctrl.byobRequest.respond(0). That enters:
  respondInternal -> invalidateByobRequest() -> respondInClosedState loop.
  iter1: shiftPendingPullInto() (m_start 0->1); commitPullIntoDescriptor(#0)
         -> fulfillReadIntoRequest -> promise resolve -> Object.prototype.then getter runs
         -> reads ctrl.byobRequest -> getByobRequest() creates m_byobRequest over slot 1 (#1).
  iter2: shiftPendingPullInto() -> **ASSERT(!m_byobRequest) FIRES** (ReadableByteStreamController.cpp:472).

So the first observable failure on an ENABLE_ASSERTS build is the shift assertion — a direct,
deterministic demonstration that the spec invariant "byobRequest is null here" is violated by
synchronous script re-entry. This is the clean dynamic proof the finding is real and reachable
from web content. (Release build with the loop reaching an empty deque gives the RELEASE_ASSERT
in Deque::removeFirst, or, via the stashed request's respondWithNewView, the wild path below.)

## Crash vs. corruption (why confidence is Medium for memory corruption)
After the loop empties the deque (m_start past everything written), the stashed request's
respondWithNewView does `auto& firstDescriptor = m_pendingPullIntos.first();` = capacitySpan()[m_start]:
 - m_start points at a slot that was NEVER constructed -> uninitialized fastMalloc bytes (1024-byte
   bmalloc size class: 16 x sizeof(PullIntoDescriptor)=64).
 - `firstDescriptor.buffer = transferredBuffer` reads the OLD Ref::m_ptr from those bytes and
   derefs it (Ref::operator= -> temporary dtor -> derefIfNotNull). Zero bytes -> no-op then
   RELEASE_ASSERT on the following shift; attacker-groomed bytes -> refcount decrement / free on a
   chosen pointer.
 - Reaching a *destructed* slot instead is not a usable primitive: ~Ref() nulls m_ptr, so the
   assignment reads null (no-op) and the POD readerType field (not reset by destruct) steers into a
   null-buffer commit (Ref::get() assert) — still a crash, not corruption.
Therefore: deterministic crash is guaranteed and will be demonstrated; memory corruption requires
heap grooming of the 1024-byte class, which the mission scope forbids weaponizing. Confidence stays
Medium for corruption, High for reachable-crash.

## Fix (patches/0001-streams-stale-byob-request-hardening.patch)
invalidateByobRequest() inside shiftPendingPullInto (make the assertion true), bail from
respond/respondWithNewView when m_pendingPullIntos is empty, reject respondWithNewView when the
request's own m_view is null/detached, and re-check the reader identity after each commit.
