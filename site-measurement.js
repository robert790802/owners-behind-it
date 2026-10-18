/* Only accepted server responses and Calendly's event_scheduled are outcomes.
 * Event names only go to Clarity; contact values, audio and booking IDs never do. */
(function () {
  'use strict';
  if (window.SiteMeasurement) return;
  var allowed = window.SiteAnalytics && window.SiteAnalytics.allowed;
  var nativeFetch = window.fetch.bind(window);
  var seen = new Set();
  var fingerprints = new Map();
  var volatileSequence = 0;
  var bookingAttempt = null;
  var widgetPromise = null;
  var leadNames = new Set(['visualizer-leads', 'closing-table-leads']);
  var voiceNames = new Set(['voice-story', 'tell-your-story']);

  function track(name, key) {
    if (!allowed || seen.has(name + ':' + key)) return;
    // Outcomes occurring before Clarity consent are not replayed after consent.
    seen.add(name + ':' + key);
    if (window.SiteClarityConsented && typeof window.clarity === 'function') window.clarity('event', name);
    window.SiteAnalytics.confirmed(name);
  }
  function uuid() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + (++volatileSequence); }
  async function receiptFor(body) {
    if (body.get('submission_id')) return body.get('submission_id');
    // Retrying the same recording/contact payload keeps the same receipt in this tab.
    // Fingerprints remain in memory and are never sent to an analytics service.
    var chunks = [];
    for (var entry of Array.from(body.entries()).sort(function(a,b){return a[0].localeCompare(b[0]);})) {
      if (entry[0] === 'submission_id' || entry[0] === 'submitted_at') continue;
      chunks.push(entry[0] + ':');
      if (entry[1] instanceof Blob) chunks.push(await entry[1].arrayBuffer());
      else chunks.push(String(entry[1]));
      chunks.push('\n');
    }
    var hash;
    try {
      var buffer = await new Blob(chunks).arrayBuffer();
      hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))).map(function(v){return v.toString(16).padStart(2,'0');}).join('');
    } catch (_) { return uuid(); }
    if (!fingerprints.has(hash)) fingerprints.set(hash, uuid());
    return fingerprints.get(hash);
  }
  function fields(body) {
    if (body instanceof FormData || body instanceof URLSearchParams) return body;
    if (typeof body === 'string') return new URLSearchParams(body);
    return null;
  }
  // Limit the observer to the site's own POST endpoints. It never changes a
  // destination, treats an opaque response as success, or consumes the caller's response.
  window.fetch = async function (input, init) {
    var url;
    try { url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href); } catch (_) { return nativeFetch(input, init); }
    var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (method !== 'POST' || url.origin !== location.origin || !init) return nativeFetch(input, init);
    var body = fields(init.body);
    var form = body && body.get('form-name');
    var isRelay = url.pathname === '/.netlify/functions/lead';
    var isNetlify = url.pathname === '/' && (leadNames.has(form) || voiceNames.has(form));
    if (!body || (!isRelay && !isNetlify)) return nativeFetch(input, init);
    var kind = isRelay && /voice/i.test(body.get('form_type') || '') ? null : voiceNames.has(form) ? 'voice_received' : 'lead_received';
    // A voice count requires an actual nonempty file, not just contact metadata.
    if (kind === 'voice_received' && (!(body.get('audio') instanceof Blob) || !body.get('audio').size)) kind = null;
    if (body.get('bot-field')) kind = null;
    var contact = String(body.get('email') || body.get('contact') || body.get('phone') || '').trim().toLowerCase();
    if (kind === 'lead_received' && !(contact.indexOf('@') > 0 || contact.replace(/\D/g,'').length >= 7)) kind = null;
    var leadKey = kind === 'lead_received' ? await receiptFor(new URLSearchParams({page:location.pathname.replace(/\.html$/, ''), contact:contact})) : null;
    var receipt = await receiptFor(body);
    body.set('submission_id', receipt);
    if (!body.get('submitted_at')) body.set('submitted_at', new Date().toISOString());
    var options = Object.assign({}, init, {body: body instanceof FormData ? body : body.toString()});
    var response = await nativeFetch(input, options);
    if (response.ok && response.type !== 'opaque') {
      if (isRelay) {
        try {
          var proof = await response.clone().json();
          if (proof.ok === true && proof.accepted === true && proof.receipt === receipt && kind) track(kind, leadKey || receipt);
        } catch (_) { /* An HTML/error fallback is not a confirmed lead. */ }
      } else if (kind) track(kind, leadKey || receipt);
    }
    return response;
  };

  function widget() {
    if (window.Calendly && window.Calendly.initPopupWidget) return Promise.resolve();
    if (widgetPromise) return widgetPromise;
    widgetPromise = new Promise(function(resolve,reject){
      var css = document.createElement('link'); css.rel='stylesheet'; css.href='https://assets.calendly.com/assets/external/widget.css'; document.head.appendChild(css);
      var js = document.createElement('script'); js.async=true; js.src='https://assets.calendly.com/assets/external/widget.js';
      js.onload=function(){resolve();}; js.onerror=function(){widgetPromise=null;reject(new Error('scheduler unavailable'));};
      document.head.appendChild(js);
    });
    return widgetPromise;
  }
  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var url; try {url=new URL(link.href);} catch (_) {return;}
    if (url.origin !== 'https://calendly.com' || !url.pathname.startsWith('/robertszigeti/')) return;
    event.preventDefault();
    var attempt = uuid(); bookingAttempt = attempt;
    widget().then(function(){
      window.Calendly.initPopupWidget({url:url.href});
    }).catch(function(){bookingAttempt=null; location.assign(url.href);});
  });
  window.addEventListener('message', function (event) {
    if (event.origin !== 'https://calendly.com' || !event.data || event.data.event !== 'calendly.event_scheduled') return;
    var frame = Array.from(document.querySelectorAll('.calendly-overlay iframe, .calendly-popup iframe')).find(function(frame){return frame.contentWindow === event.source;});
    if (!bookingAttempt || !frame) return;
    var payload = event.data.payload || {};
    var key = (payload.invitee && payload.invitee.uri) || (payload.event && payload.event.uri) || bookingAttempt;
    track('booking_completed', key);
  });
  window.SiteMeasurement = {version:1};
})();
