/* Shared Clarity integration for ownersbehindit.com only.
 * Official loader: https://learn.microsoft.com/clarity/setup-and-installation/clarity-setup
 * Consent V2: https://learn.microsoft.com/clarity/setup-and-installation/clarity-consent-api-v2
 * No Clarity request is made before an explicit opt-in. */
(function () {
  'use strict';
  if (!window.SiteAnalytics || !window.SiteAnalytics.allowed) return;
  if (window.rtsClarityPrivacy) return;
  if (!/^(www\.)?ownersbehindit\.com$/.test(location.hostname)) return;
  window.rtsClarityPrivacy = true;

  var PROJECT = 'ymckcxsv99';
  var KEY = 'rts-clarity-consent-v1';
  var MAX_AGE = 180 * 24 * 60 * 60 * 1000;
  var loaded = false;
  var stopped = false;
  var banner, settings, allow, decline;
  var privateBrowser = navigator.globalPrivacyControl === true ||
    navigator.doNotTrack === '1' || window.doNotTrack === '1';
  // Never send URLs carrying contact details or access credentials to analytics.
  var privateUrl = Array.from(new URLSearchParams(location.search).keys()).some(function (key) {
    return /name|email|phone|address|contact|message|token|password|code/i.test(key);
  });
  var choice = readChoice();

  function readChoice() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY));
      if (saved && (saved.value === 'granted' || saved.value === 'denied') &&
          typeof saved.at === 'number' && saved.at <= Date.now() && Date.now() - saved.at < MAX_AGE) return saved.value;
    } catch (e) { /* Storage unavailable: ask again on the next page. */ }
    return null;
  }

  function signal(value) {
    if (typeof window.clarity === 'function') {
      window.clarity('consentv2', { analytics_Storage: value, ad_Storage: 'denied' });
    }
  }

  function clearCookies() {
    ['_clck', '_clsk'].forEach(function (name) {
      ['', '; domain=' + location.hostname, '; domain=.ownersbehindit.com'].forEach(function (domain) {
        document.cookie = name + '=; Max-Age=0; path=/' + domain + '; SameSite=Lax; Secure';
      });
    });
  }

  function start() {
    if (privateBrowser || privateUrl || choice !== 'granted') return;
    window.SiteClarityConsented = true;
    if (loaded) {
      if (stopped) { window.clarity('start'); stopped = false; }
      signal('granted');
      return;
    }
    // Avoid a second tracker if another installation is ever introduced.
    if (document.querySelector('script[src*="clarity.ms/tag/"]') || window.clarity) return;
    loaded = true;
    window.clarity = function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
    signal('granted');
    // Microsoft's official asynchronous tracking snippet, invoked only after consent.
    (function(c,l,a,r,i,t,y){
      c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
      t=l.createElement(r);t.async=1;t.src='https://www.clarity.ms/tag/'+i;
      y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, 'clarity', 'script', PROJECT);
  }

  function stop() {
    window.SiteClarityConsented = false;
    signal('denied');
    if (loaded) { window.clarity('stop'); stopped = true; }
    clearCookies();
  }

  function choose(value) {
    choice = value;
    try { localStorage.setItem(KEY, JSON.stringify({ value: value, at: Date.now() })); } catch (e) {}
    if (value === 'granted') start(); else stop();
    banner.hidden = true;
    settings.focus({ preventScroll: true });
  }

  function render() {
    var style = document.createElement('style');
    style.textContent = '#rts-clarity-banner[hidden]{display:none!important}' +
      '#rts-clarity-banner{position:fixed;z-index:2147483000;inset:auto 16px 16px;margin:auto;width:calc(100% - 32px);max-width:680px;box-sizing:border-box;padding:20px;background:#18121f;color:#f5efe1;border:1px solid #c9a14a;border-radius:8px;box-shadow:0 8px 32px #0006;font:400 16px/1.5 Inter,Arial,sans-serif;max-height:80vh;overflow:auto;text-align:left}' +
      '#rts-clarity-banner p{margin:0 0 16px;font:inherit;color:inherit}' +
      '#rts-clarity-banner a{color:#e3c375;text-decoration:underline;text-underline-offset:3px}' +
      '#rts-clarity-actions{display:flex;gap:12px;flex-wrap:wrap}' +
      '#rts-clarity-actions button,#rts-clarity-settings{min-height:44px;padding:10px 16px;border:1px solid #c9a14a;border-radius:4px;background:#18121f;color:#f5efe1;font:500 14px/1.4 Inter,Arial,sans-serif;cursor:pointer;letter-spacing:normal;text-transform:none}' +
      '#rts-clarity-actions button:hover,#rts-clarity-settings:hover{background:#302539}' +
      '#rts-clarity-actions button:focus-visible,#rts-clarity-settings:focus-visible,#rts-clarity-banner a:focus-visible{outline:3px solid #e3c375;outline-offset:3px}' +
      '#rts-clarity-actions button:disabled{opacity:.65;cursor:default}' +
      '#rts-clarity-settings-wrap{padding:16px;text-align:center;background:#18121f}';
    document.head.appendChild(style);
    banner = document.createElement('section');
    banner.id = 'rts-clarity-banner';
    banner.setAttribute('aria-label', 'Optional Clarity recordings');
    banner.innerHTML = '<p id="rts-clarity-copy">May I use Microsoft Clarity to see clicks, scrolling, and masked session recordings to improve this site? It is optional. Contact details and voice form content are masked. <a href="/privacy#clarity">Privacy details</a></p><div id="rts-clarity-actions"><button type="button" id="rts-clarity-decline">Decline recordings</button><button type="button" id="rts-clarity-allow">Allow recordings</button></div>';
    document.body.appendChild(banner);
    var wrap = document.createElement('div');
    wrap.id = 'rts-clarity-settings-wrap';
    wrap.innerHTML = '<button type="button" id="rts-clarity-settings" aria-controls="rts-clarity-banner">Clarity privacy settings</button>';
    document.body.appendChild(wrap);
    settings = document.getElementById('rts-clarity-settings');
    allow = document.getElementById('rts-clarity-allow');
    decline = document.getElementById('rts-clarity-decline');
    allow.addEventListener('click', function () { choose('granted'); });
    decline.addEventListener('click', function () { choose('denied'); });
    settings.addEventListener('click', function () {
      banner.hidden = false;
      decline.focus({ preventScroll: true });
    });
    if (privateBrowser || privateUrl) {
      document.getElementById('rts-clarity-copy').textContent = privateBrowser ?
        'Clarity recordings are off because your browser has requested privacy protection.' :
        'Clarity recordings are off on this page because its URL may contain private details.';
      allow.disabled = true;
    }
    banner.hidden = choice !== null || privateBrowser || privateUrl;
  }

  // Withdraw in other open tabs, too, without reloading or losing a draft form.
  window.addEventListener('storage', function (event) {
    if (event.key !== KEY && event.key !== null) return;
    choice = readChoice();
    if (choice === 'granted') start(); else stop();
    if (banner) banner.hidden = choice !== null || privateBrowser || privateUrl;
  });

  if (choice === 'granted') start(); else clearCookies();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();

