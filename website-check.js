// Owners Behind It website check: runs the check in steps and draws the report.
import {buildReport, readSpeed, STATUS} from '/website-check-report.js';

const $ = id => document.getElementById(id);
const ENDPOINT = '/.netlify/functions/website-check';
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const LEADS = {
  find:  'Before anyone visits, Google and AI assistants decide whether to show you at all.',
  land:  'Most visits start on a phone, often on a weak signal.',
  reach: 'The moment someone decides to call or write.',
  trust: 'The small things people notice without knowing they noticed.',
};
let run = 0;

async function call(body, ms = 15000) {
  const r = await fetch(ENDPOINT, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:AbortSignal.timeout(ms)});
  let data; try { data = await r.json(); } catch { throw new Error('The checker is busy right now. Please try again in a minute.'); }
  if (r.status === 429) throw new Error('Too many checks from this connection in the last minute. Please wait a moment and try again.');
  if (!r.ok) throw new Error(data.error || 'The check could not finish. Please try again.');
  return data;
}

function step(text) {
  const li = el('li', 'wc-step running'); li.append(el('span', '', text)); $('wc-steps').append(li);
  return {done(t){ li.className = 'wc-step done'; if (t) li.firstChild.textContent = t; }, fail(t){ li.className = 'wc-step failed'; if (t) li.firstChild.textContent = t; }};
}

async function speedTest(url) {
  let key = '';
  try { key = (await call({mode:'speedkey'}, 8000)).key || ''; } catch {}
  const api = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  api.searchParams.set('url', url); api.searchParams.set('strategy', 'mobile');
  api.searchParams.append('category', 'performance'); api.searchParams.append('category', 'accessibility');
  if (key) api.searchParams.set('key', key);
  try {
    const r = await fetch(api, {signal: AbortSignal.timeout(70000)});
    if (!r.ok) return {available:false, message: r.status === 429 ? 'Google’s speed test is busy right now, so it didn’t run.' : 'Google’s speed test couldn’t load this site.'};
    return readSpeed(await r.json());
  } catch { return {available:false, message:'Google’s speed test took too long and was stopped.'}; }
}

function render(report, opts = {}) {
  $('results-title').textContent = report.host;
  const when = new Date(report.checkedAt).toLocaleString('en-US', {month:'long', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit'});
  $('results-lead').textContent = `Read ${report.pagesChecked} ${report.pagesChecked === 1 ? 'page' : 'pages'} on ${when}.` + (report.pagesFound > report.pagesChecked ? ' Some linked pages could not be read.' : '');
  const counts = $('wc-counts'); counts.replaceChildren();
  for (const k of ['fix','look','good','info','unknown']) if (report.counts[k]) { const li = el('li'); const s = el('strong', '', String(report.counts[k])); li.append(s, ' ' + STATUS[k].label.toLowerCase()); counts.append(li); }
  counts.hidden = false;
  if (!opts.keepSteps) $('wc-steps').hidden = true;
  const p = report.preview;
  $('pv-url').textContent = p.url.replace(/^https?:\/\//,'').replace(/\/$/,'');
  $('pv-title').textContent = p.title || '(No title, so Google writes its own)';
  $('pv-desc').textContent = p.description || '(No summary, so Google pulls a sentence from the page)';
  $('pv-h1').textContent = p.h1 || '(No main headline)';
  $('pv-p').textContent = p.paragraph ? (p.paragraph.length > 260 ? p.paragraph.slice(0, 257) + '…' : p.paragraph) : '';
  $('wc-preview').hidden = false;

  const wrap = $('wc-groups'); wrap.replaceChildren();
  report.groups.forEach((g, i) => {
    const sec = el('section', `feat ${i % 2 ? 'paper' : 'cream'} wc-group`); sec.id = 'g-' + g.id; sec.setAttribute('aria-labelledby', 'gt-' + g.id);
    const shell = el('div', 'shell'); const head = el('div', 'wc-ghead');
    const left = el('div'); left.append(el('span', 'eyebrow', g.eyebrow)); const h2 = el('h2', '', g.title); h2.id = 'gt-' + g.id; left.append(h2);
    head.append(left, el('p', 'lead', LEADS[g.id]));
    const list = el('div', 'wc-list');
    g.findings.forEach(f => {
      const row = el('article', 'wc-row s-' + f.status);
      const st = el('p', 'wc-status'); st.append(el('span', 'wc-mark'), STATUS[f.status].label);
      const body = el('div', 'wc-body'); body.append(el('h3', '', f.title), el('p', 'wc-saw', f.saw)); if (f.means) body.append(el('p', 'wc-means', f.means));
      row.append(st, body, el('p', 'wc-tech', f.tech)); list.append(row);
    });
    if (g.id === 'land' && opts.speedPending) { const row = el('article', 'wc-row s-unknown pending'); const st = el('p', 'wc-status'); st.append(el('span', 'wc-mark'), 'Running'); const b = el('div', 'wc-body'); b.append(el('h3', '', 'Google’s phone speed test'), el('p', 'wc-saw', 'Still running. It usually takes 20 to 40 seconds and fills in here when it’s done.')); row.append(st, b, el('p', 'wc-tech', 'PageSpeed Insights')); list.append(row); }
    shell.append(head, list);
    if (g.id === 'trust') {
      const d = el('details', 'wc-pages'); d.append(el('summary', '', `Page by page: the ${report.pages.length} ${report.pages.length === 1 ? 'page' : 'pages'} read`));
      const t = el('table'); const hr = el('tr'); ['Page','Titles','Summaries','Headlines','Preferred address','Search'].forEach(h => hr.append(el('th', '', h))); t.append(hr);
      report.pages.forEach(pg => { const tr = el('tr'); const a = el('a', '', new URL(pg.url).pathname || '/'); a.href = pg.url; a.target = '_blank'; a.rel = 'noopener nofollow'; const td = el('td'); td.append(a);
        tr.append(td, el('td', pg.titles === 1 ? '' : 'off', String(pg.titles)), el('td', pg.descriptions === 1 ? '' : 'off', String(pg.descriptions)), el('td', pg.h1s === 1 ? '' : 'off', String(pg.h1s)), el('td', pg.canonicals === 1 ? '' : 'off', String(pg.canonicals)), el('td', pg.noindex ? 'off' : '', pg.noindex ? 'Hidden' : 'Open')); t.append(tr); });
      const sc = el('div', 'wc-table'); sc.append(t); d.append(sc, el('p', 'wc-means', 'One of each is what you want. Anything else is shown in gold.')); shell.append(d);
    }
    sec.append(shell); wrap.append(sec);
  });
  $('wc-actions').hidden = false;
}

async function check(input) {
  const me = ++run;
  $('check-error').hidden = true; $('wc-steps').replaceChildren(); $('wc-steps').hidden = false; $('wc-counts').hidden = true; $('wc-actions').hidden = true; $('wc-preview').hidden = true; $('wc-groups').replaceChildren();
  $('results-title').textContent = 'Reading the site…'; $('results-lead').textContent = 'This takes about a minute. Each step shows here as it finishes.';
  $('results').hidden = false; $('results').scrollIntoView({behavior:'smooth', block:'start'});
  const btn = $('check-form').querySelector('button'); btn.disabled = true; btn.textContent = 'Checking…';
  try {
    const s1 = step('Reading the home page, the site map, the robots file, the email setup and the certificate');
    let site;
    try { site = await call({url: input}, 20000); } catch (e) { s1.fail(); throw e; }
    if (me !== run) return;
    s1.done(`Read the home page of ${site.host}, plus its site files`);
    const speedP = speedTest(site.url);
    const s2 = step(`Reading ${site.pages.length} more ${site.pages.length === 1 ? 'page' : 'pages'}`);
    const batches = []; for (let i = 0; i < site.pages.length; i += 6) batches.push(site.pages.slice(i, i + 6));
    const pages = [];
    for (let i = 0; i < batches.length; i += 2) {
      const got = await Promise.all(batches.slice(i, i + 2).map(b => call({mode:'pages', site: site.url, urls: b}, 20000).then(r => r.pages).catch(() => b.map(u => ({url:u, error:'Could not be read in time.'})))));
      got.flat().forEach(p => pages.push(p));
      if (me !== run) return;
    }
    s2.done(`Read ${pages.filter(p => !p.error).length + 1} pages`);
    const s3 = step('Testing the links inside the site');
    const read = new Set([site.url, ...site.pages].map(u => u.replace(/\/$/, '')));
    const linkSet = new Set(); [site.home, ...pages].forEach(p => (p.internal || []).forEach(u => { if (!read.has(u.replace(/\/$/, ''))) linkSet.add(u); }));
    const toTest = [...linkSet].slice(0, 60); const links = [];
    for (let i = 0; i < toTest.length; i += 30) { try { links.push(...(await call({mode:'links', site: site.url, urls: toTest.slice(i, i + 30)}, 20000)).links); } catch {} }
    if (me !== run) return;
    s3.done(toTest.length ? `Tested ${links.length} more links` : 'No other links to test');
    const s4 = step('Running Google’s phone speed test (20 to 40 seconds)');
    render(buildReport({site, pages, links}), {speedPending: true, keepSteps: true});
    const speed = await speedP;
    if (me !== run) return;
    speed.available ? s4.done('Google’s phone speed test finished') : s4.fail(speed.message);
    render(buildReport({site, pages, links, speed}));
    // Count the check in the site's own analytics: the checked website's address only, never the visitor.
    try { if (window.SiteAnalytics && window.SiteAnalytics.allowed && window.gtag) window.gtag('event', 'website_check', {checked_site: site.host, pages_read: pages.length + 1}); if (window.SiteClarityConsented && typeof window.clarity === 'function') window.clarity('event', 'website_check'); } catch {}
  } catch (e) {
    if (me !== run) return;
    $('results').hidden = true; $('check-error').textContent = e.name === 'TimeoutError' ? 'That website took too long to answer. It may be down or blocking automated visitors.' : e.message; $('check-error').hidden = false;
    $('check-form').scrollIntoView({behavior:'smooth', block:'center'});
  } finally {
    if (me === run) { btn.disabled = false; btn.textContent = 'Check the website'; }
  }
}

$('check-form').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('website').value.trim();
  if (!v || !/\./.test(v)) { $('check-error').textContent = 'Type a website address, like yourbusiness.com.'; $('check-error').hidden = false; return; }
  history.replaceState(null, '', '?site=' + encodeURIComponent(v.replace(/^https?:\/\//, '').replace(/\/$/, '')));
  check(v);
});
$('wc-print').addEventListener('click', () => { document.querySelectorAll('.wc-pages').forEach(d => d.open = true); window.print(); });
$('wc-again').addEventListener('click', () => { $('website').value = ''; $('website').focus(); window.scrollTo({top:0, behavior:'smooth'}); });
const pre = new URLSearchParams(location.search).get('site');
if (pre) { $('website').value = pre; check(pre); }
