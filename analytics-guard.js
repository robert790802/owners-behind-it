/* Production traffic only. No IP, visitor identity, geography or guessed bot exclusions. */
(function () {
  'use strict';
  if (window.SiteAnalytics) return;
  var configs = {
    'therobertszigeti.com': {ga:'G-8X65RFL8SG'},
    'ownersbehindit.com': {ga:'G-L7XPBFX6PR'}
  };
  var host = location.hostname.replace(/^www\./, '');
  var config = configs[host];
  var query = new URLSearchParams(location.search);
  var excluded = false;
  try {
    if (query.get('analytics') === 'off') localStorage.setItem('site_analytics_excluded', '1');
    if (query.get('analytics') === 'on') localStorage.removeItem('site_analytics_excluded');
    excluded = localStorage.getItem('site_analytics_excluded') === '1';
  } catch (_) { excluded = query.get('analytics') === 'off'; }
  var testPage = /(?:^|\/)(?:voice-test|capture)(?:\.html)?\/?$/.test(location.pathname);
  var privateBrowser = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  var privateUrl = Array.from(query.keys()).some(function(key){return /name|email|phone|address|contact|message|token|password|code/i.test(key);});
  var allowed = !!config && !excluded && !testPage && !privateBrowser && !privateUrl && query.get('analytics') !== 'off';
  var quietEvents = new Set(['generate_lead', 'lead_ui_success']);
  window.dataLayer = window.dataLayer || [];
  // Legacy form code cannot report a conversion before delivery is confirmed.
  window.gtag = function () {
    if (!allowed) return;
    if (arguments[0] === 'event' && quietEvents.has(arguments[1])) return;
    window.dataLayer.push(arguments);
  };
  function enqueueConfirmed() { window.dataLayer.push(arguments); }
  window.SiteAnalytics = {
    allowed: allowed,
    ga: config && config.ga,
    // This entry point is used only by the verified response/Calendly observer.
    confirmed: function (name) {
      if (!allowed) return;
      enqueueConfirmed('event', name, {event_category:'confirmed_outcome'});
      if (name === 'lead_received' || name === 'voice_received') {
        enqueueConfirmed('event', 'generate_lead', {lead_type:name === 'voice_received' ? 'voice' : 'typed'});
      }
    }
  };
  if (config) window['ga-disable-' + config.ga] = !allowed;
  if (allowed) {
    gtag('js', new Date());
    gtag('config', config.ga);
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + config.ga;
    document.head.appendChild(script);
  }
  function notice() {
    if (!excluded && query.get('analytics') !== 'off') return;
    var aside = document.createElement('aside');
    aside.setAttribute('aria-label', 'Analytics test mode');
    aside.style.cssText = 'position:fixed;z-index:2147483646;top:0;left:0;right:0;padding:10px 16px;background:#fff6d8;color:#332800;font:14px/1.5 Arial,sans-serif;text-align:center;border-bottom:1px solid #88702b';
    aside.textContent = 'Test mode: this browser is excluded from website analytics. ';
    var resume = document.createElement('a');
    var url = new URL(location.href); url.searchParams.set('analytics', 'on');
    resume.href = url.href; resume.textContent = 'Resume normal analytics';
    resume.style.cssText = 'color:inherit;text-decoration:underline';
    aside.appendChild(resume); document.body.appendChild(aside);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', notice); else notice();
})();
