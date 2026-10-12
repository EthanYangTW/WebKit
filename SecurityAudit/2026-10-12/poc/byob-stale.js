// Headless driver for the stale-BYOB-request path. Run with MiniBrowser --headless or via run-webkit-tests.
// Expected under ENABLE_ASSERTS: ASSERT in ReadableByteStreamController::respondWithNewView / Deque::first().
globalThis.__result = "start";
(async () => {
  let ctrl, stash = null;
  const rs = new ReadableStream({ type: 'bytes', start(c){ctrl=c;}, pull(){return new Promise(()=>{});} });
  await null;
  const reader = rs.getReader({ mode: 'byob' });
  reader.read(new Uint8Array(8)).catch(()=>{});
  reader.read(new Uint8Array(8)).catch(()=>{});
  ctrl.close();
  Object.defineProperty(Object.prototype,'then',{configurable:true,get(){ if(!stash){try{stash=ctrl.byobRequest;}catch(e){}} return undefined;}});
  ctrl.byobRequest.respond(0);
  delete Object.prototype.then;
  globalThis.__result = stash ? "stash-acquired" : "no-stash";
  try { stash.respondWithNewView(new Uint8Array(new ArrayBuffer(0),0,0)); globalThis.__result += "; survived"; }
  catch(e){ globalThis.__result += "; threw:"+e; }
})();
