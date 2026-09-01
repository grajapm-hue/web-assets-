/* Keep the background-music mp3 off the wire while the guards run.

   Raja: "the audio download is getting trigged on IDM ... Make sure it does
   not happen."

   Nothing in this suite tests audio, so there was no audio test to delete.
   The download is the product behaving normally, and it arrives by TWO routes:

     1. the page   -- music defaults ON, every guard clicks splash Play, and
                      ensureMusic() builds `new Audio(ASSET('bgm-monkeys.mp3'))`
                      with preload='auto';
     2. the service worker -- beta-sw.js precaches './bgm-monkeys.mp3' with
                      cache.addAll on install.

   Route 2 is the one that actually bites, and it is invisible from the page.
   A probe against the live beta measured ZERO mp3 requests on the page's own
   Network domain while 481,443 bytes sat in CacheStorage: the service worker
   had pulled the whole file down on a session nobody was watching. Intercepting
   only the page session looked like it worked and did nothing at all -- so this
   attaches at the BROWSER level, where the worker's session can be reached.

   TIMING IS THE WHOLE PROBLEM. Attaching at the browser level is necessary but
   not sufficient: measured over four runs against the live beta, arming after
   the page socket was open silenced the worker twice and missed it twice, a
   coin toss. Target.setAutoAttach freezes a worker before its first line runs
   (waitingForDebugger), and a frozen worker cannot lose -- but only if the
   auto-attach is already armed when the worker starts. So arming happens in
   two places:

     early(port)   -- called straight after Chrome is spawned, before the guard
                      even looks for its page target. It polls the DevTools
                      port every 10ms and attaches the instant Chrome answers,
                      which is while the page is still being fetched. This is
                      the one that matters for MM_TARGET runs against a live
                      https URL, the case Raja actually hit.
     quietAudio()  -- the page-session pass, and a fallback arm for anything
                      that never called early().

   Note the two offline guards were never at risk: they launch Chrome on
   about:blank and navigate later, so nothing has registered a worker by the
   time they arm. The file:// guards are not at risk either -- a service worker
   cannot register on file://, and the mp3 never touches the network there.

   Answering the request here rather than switching the music off in the page is
   deliberate. It changes what the NETWORK does, not what the PRODUCT does, so
   each guard still walks the same code path a child's phone walks. Turning
   musicOn off would have hidden the code path instead of the bytes.

   An empty 200 rather than a refusal, for the same reason: cache.addAll rejects
   the WHOLE install if a single request fails, so a blanket block would have
   broken the offline guards for a reason that has nothing to do with the
   product. Chrome is already launched --mute-audio, so nothing was ever
   audible either way. */

const MP3 = [{ urlPattern: '*.mp3*' }];
const empty = requestId => ({
  requestId: requestId,
  responseCode: 200,
  responseHeaders: [{ name: 'Content-Type', value: 'audio/mpeg' }],
  body: ''
});
const dbg = msg => { if (process.env.MM_QUIET_DEBUG) console.log('    [quiet-audio] ' + msg); };

/* One attachment per Chrome, keyed by its debugging PORT, so early() and the
   page pass share an arm instead of stacking two -- and so a guard that runs a
   SECOND Chrome (check-backup-bundle does) arms that one too instead of seeing
   the first still open and assuming it is covered. Keyed on the port and not
   the whole origin because the two callers spell the host differently:
   early() knows 127.0.0.1, the page pass reads whatever Chrome put in the
   socket URL. */
const arms = new Map();
const portOf = u => (String(u).match(/:(\d+)/) || [])[1] || String(u);
const live = origin => { const a = arms.get(portOf(origin)); return !!a && a.ws.readyState === 1; };

async function armBrowser(origin, wsUrl){
  const sock = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    sock.addEventListener('open', res);
    sock.addEventListener('error', rej);
  });
  const a = { ws: sock, id: 0, pend: new Map() };
  arms.set(portOf(origin), a);

  const bsend = (method, params, sessionId) => new Promise(res => {
    const i = ++a.id; a.pend.set(i, res);
    a.ws.send(JSON.stringify({ id: i, method: method, params: params || {}, sessionId: sessionId }));
  });

  sock.addEventListener('message', async e => {
    let m;
    try { m = JSON.parse(e.data); } catch (err){ return; }
    if (m.id && a.pend.has(m.id)){ a.pend.get(m.id)(m); a.pend.delete(m.id); return; }

    if (m.method === 'Target.attachedToTarget'){
      const sid = m.params.sessionId;
      const info = m.params.targetInfo;
      try {
        /* Arm the interception BEFORE the target is allowed to run, or the
           worker precaches the file in the gap and the whole exercise is
           pointless. */
        if (/worker/.test(info.type)){
          const r = await bsend('Fetch.enable', { patterns: MP3 }, sid);
          dbg('armed ' + info.type + ' frozen=' + !!m.params.waitingForDebugger +
              ' ' + JSON.stringify(r.error || {}) + '  ' + (info.url || '').slice(0, 60));
        }
      } finally {
        /* Every target attached with waitForDebuggerOnStart is frozen until
           this call. Missing one hangs the guard, so it runs even if the
           line above threw. */
        bsend('Runtime.runIfWaitingForDebugger', {}, sid);
      }
      return;
    }

    if (m.method === 'Fetch.requestPaused'){
      dbg('silenced ' + m.params.request.url.slice(0, 70));
      bsend('Fetch.fulfillRequest', empty(m.params.requestId), m.sessionId);
    }
  });

  await bsend('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
}

/* Arm as early as Chrome will allow: poll the DevTools port hard, attach the
   moment it answers. Called immediately after spawn, so this is racing Chrome's
   own startup rather than racing a page that has already loaded. */
async function early(port){
  const origin = 'http://127.0.0.1:' + port;
  if (live(origin)) return;
  const until = Date.now() + 20000;
  while (Date.now() < until){
    try {
      const ver = await (await fetch(origin + '/json/version')).json();
      if (ver && ver.webSocketDebuggerUrl){
        await armBrowser(origin, ver.webSocketDebuggerUrl);
        dbg('armed at startup on port ' + port);
        return;
      }
    } catch (e){ /* port not up yet */ }
    await new Promise(r => setTimeout(r, 10));
  }
}

module.exports = async function quietAudio(ws, send){
  /* The page's own session: covers a direct Audio fetch when no service
     worker is in the way (a first, uncontrolled load, or file://). */
  ws.addEventListener('message', e => {
    let m;
    try { m = JSON.parse(e.data); } catch (err){ return; }
    if (m.method === 'Fetch.requestPaused') send('Fetch.fulfillRequest', empty(m.params.requestId));
  });
  await send('Fetch.enable', { patterns: MP3 });

  /* Fallback arm for a caller that never ran early(). Derive the browser
     endpoint from the page socket rather than taking a port, because the
     guards do not agree on a name for it -- most call it PORT, the two
     offline guards call it CDP. */
  try {
    const origin = String(ws.url || '').replace(/^ws/, 'http').replace(/\/devtools\/.*$/, '');
    if (live(origin)) return;   // early() already attached; do not attach twice
    const ver = await (await fetch(origin + '/json/version')).json();
    if (ver && ver.webSocketDebuggerUrl) await armBrowser(origin, ver.webSocketDebuggerUrl);
  } catch (e){
    /* Best effort. A guard must never fail because the music could not be
       silenced -- that would be the tail wagging the dog. */
  }
};

/* Never let arming break a guard: a swallowed failure costs a download, a
   thrown one costs the check. */
module.exports.early = port => early(port).catch(() => {});
