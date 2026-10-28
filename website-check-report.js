// Owners Behind It website check: turns what the checker read into plain-English findings.
// Shared by the page (browser) and the tests (Node). No scores, no dollar figures.
export const STATUS = {
  fix:     {label:'Worth fixing',   order:0},
  look:    {label:'Worth a look',   order:1},
  good:    {label:'In place',       order:3},
  info:    {label:'Good to know',   order:2},
  unknown: {label:'Couldn’t check', order:4},
};
const host = u => { try { return new URL(u).hostname.replace(/^www\./,''); } catch { return ''; } };
const path = u => { try { const x = new URL(u); return (x.pathname + x.search) || '/'; } catch { return u; } };
const norm = u => { try { const x = new URL(u); x.hash=''; return (x.hostname.replace(/^www\./,'') + x.pathname.replace(/\/(index\.html?)?$/,'').replace(/\.html?$/,'') + x.search).toLowerCase(); } catch { return String(u||''); } };
const fmtPhone = d => d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : d;
const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
const verb = (n, one, many) => n === 1 ? one : many;
const listPages = (arr, max = 6) => arr.slice(0, max).map(path).join(', ') + (arr.length > max ? ` and ${arr.length - max} more` : '');
const kb = b => b >= 1048576 ? (b/1048576).toFixed(1) + ' MB' : Math.round(b/1024) + ' KB';

export function buildReport({site, pages = [], links = [], speed = null, now = new Date()}) {
  const home = site.home;
  const seen = new Set(); const all = [home, ...pages.filter(p => p && !p.error && !p.notHtml && p.status < 400 && p.titles)].filter(p => { const k = norm(p.url); if (seen.has(k)) return false; seen.add(k); return true; });
  const failed = pages.filter(p => p && (p.error || p.status >= 400));
  const F = [];
  const add = (group, status, title, saw, means, tech, extra = {}) => F.push({group, status, title, saw, means, tech, ...extra});
  const each = fn => all.filter(fn).map(p => p.url);
  const isHome = u => norm(u) === norm(home.url);

  // ---------- 1. Can people find you ----------
  const G1 = 'find';
  const hidden = each(p => p.noindex);
  if (!hidden.length) add(G1,'good','Your pages are open to search engines','None of the pages checked tell Google or Bing to stay away.','Search engines are allowed to list them. That is not the same as being listed; only Google Search Console can confirm that.','robots meta / X-Robots-Tag');
  else add(G1, hidden.some(isHome) ? 'fix' : 'look', hidden.some(isHome) ? 'Your home page tells Google not to list it' : `${plural(hidden.length,'page')} ${verb(hidden.length,'asks','ask')} search engines not to list ${verb(hidden.length,'it','them')}`, `Found a “do not list” instruction on: ${listPages(hidden)}.`, 'Google and Bing will leave these pages out of search results. Sometimes that is on purpose (a thank-you page). On a main page it usually is not.', 'noindex');

  const noTitle = each(p => !p.titles.length), multiTitle = each(p => p.titles.length > 1);
  const titleMap = {}; all.forEach(p => p.titles[0] && (titleMap[p.titles[0]] = [...(titleMap[p.titles[0]]||[]), p.url]));
  const dupTitles = Object.entries(titleMap).filter(([,u]) => u.length > 1);
  const longTitles = each(p => (p.titles[0]||'').length > 65);
  if (noTitle.length || multiTitle.length) add(G1,'fix','Some pages have no name, or more than one, in Google', [noTitle.length && `No title on: ${listPages(noTitle)}.`, multiTitle.length && `More than one title on: ${listPages(multiTitle)}.`].filter(Boolean).join(' '), 'The title is the blue headline people click in Google. Without one, Google makes one up.', 'title tag');
  else if (dupTitles.length) add(G1,'look','Different pages share the same name in Google', dupTitles.slice(0,3).map(([t,u]) => `“${t}” is used on ${plural(u.length,'page')}`).join('. ') + '.', 'When pages share a title, Google has a harder time telling them apart, and people can’t tell which result is the one they want.', 'duplicate title tags');
  else add(G1,'good','Every page has its own name in Google', `${plural(all.length,'page')} checked, each with one title of its own.` + (longTitles.length ? ` ${plural(longTitles.length,'title')} run long enough that Google may cut the end off.` : ''), 'This is the headline people see in search results.', 'title tag');

  const noDesc = each(p => !p.descriptions.length), multiDesc = each(p => p.descriptions.length > 1);
  const descMap = {}; all.forEach(p => p.descriptions[0] && (descMap[p.descriptions[0]] = [...(descMap[p.descriptions[0]]||[]), p.url]));
  const dupDesc = Object.values(descMap).filter(u => u.length > 1);
  if (multiDesc.length) add(G1,'fix','Some pages give Google two different summaries', `More than one description on: ${listPages(multiDesc)}.`, 'Google can only use one. With two, it ignores both and picks its own words.', 'duplicate meta description');
  else if (noDesc.length) add(G1,'look',`${plural(noDesc.length,'page')} ${verb(noDesc.length,'has','have')} no summary for search results`, `No description on: ${listPages(noDesc)}.`, 'The two lines under your headline in Google. Without them, Google pulls a random sentence off the page.', 'meta description');
  else if (dupDesc.length) add(G1,'look','Several pages use the same summary in search results', `${plural(dupDesc.reduce((s,u)=>s+u.length,0),'page')} share a description.`, 'Each page reads the same in Google, so a searcher can’t tell what is different about them.', 'duplicate meta description');
  else add(G1,'good','Every page has its own summary for search results', 'Each page checked has one description of its own.', 'Google may still choose different words, but it starts from yours.', 'meta description');

  const noH1 = each(p => !p.h1s.length), multiH1 = each(p => p.h1s.length > 1);
  if (noH1.some(isHome)) add(G1,'fix','Your home page has no main headline', `The home page has no main heading that a search engine can read${home.words < 80 ? ', and very little readable text at all' : ''}.`, 'The main headline is how Google and AI tools learn what the page is about.', 'H1 heading');
  else if (noH1.length || multiH1.length) add(G1,'look','Some pages don’t say what they are in one headline', [noH1.length && `No main headline on: ${listPages(noH1)}.`, multiH1.length && `More than one main headline on: ${listPages(multiH1)}.`].filter(Boolean).join(' '), 'One main headline per page tells search engines and screen readers what the page is about.', 'H1 heading');
  else add(G1,'good','Every page says what it is in one headline', `Home page headline: “${(home.h1s[0]||'').slice(0,120).replace(/[.!?]+$/,'')}.”`, 'Ask yourself: would a stranger know what you do from that line alone?', 'H1 heading');

  const multiCanon = each(p => p.canonicals.length > 1);
  const canonMismatch = each(p => p.canonicals.length === 1 && p.ogUrl && norm(p.canonicals[0]) !== norm(p.ogUrl));
  const canonElsewhere = all.filter(p => p.canonicals.length === 1 && host(p.canonicals[0]) && host(p.canonicals[0]) !== host(p.url)).map(p => p.url);
  const noCanon = each(p => !p.canonicals.length);
  if (multiCanon.length) add(G1,'fix','Some pages point Google at two different addresses', `More than one preferred address on: ${listPages(multiCanon)}.`, 'With two, Google ignores both and picks for itself. Pages can drop out of search this way.', 'duplicate canonical tags');
  else if (canonElsewhere.length) add(G1,'fix','Some pages tell Google the real page lives on another website', `On ${listPages(canonElsewhere)} the preferred address points to ${host(all.find(p=>canonElsewhere.includes(p.url)).canonicals[0])}.`, 'Google may list the other website instead of this one. This often happens after a move or a copied template.', 'cross-domain canonical');
  else if (canonMismatch.length) add(G1,'look','Some pages give two different addresses for themselves', `The search address and the share address disagree on: ${listPages(canonMismatch)}.`, 'Small, but it sends mixed signals about which address is the real one.', 'canonical vs og:url');
  else if (noCanon.length === all.length) add(G1,'look','Your pages don’t say which address is the real one', 'None of the pages checked name a preferred address.', 'The same page can often be reached a few ways (with www, without, with a slash). Without a preferred address, Google picks one, and sometimes drops the others.', 'canonical tag');
  else add(G1,'good','Pages say which address is the real one', noCanon.length ? `Set on most pages; missing on ${listPages(noCanon)}.` : 'Every page checked names one preferred address.', 'It keeps Google from splitting one page into several.', 'canonical tag');

  const sm = site.sitemap;
  if (!sm.found) add(G1,'look','Search engines have no map of your site','No sitemap was found where search engines look for one.', 'A sitemap lists every page you want found. Without one, a page that nothing links to can sit unfound for months.', 'sitemap.xml');
  else {
    const inMap = new Set(sm.urls.map(norm));
    const missing = all.filter(p => !inMap.has(norm(p.url)) && !p.noindex).map(p => p.url);
    const badFromMap = failed.filter(p => inMap.has(norm(p.url||p.requested))).map(p => p.url);
    if (badFromMap.length) add(G1,'fix','Your site map sends search engines to pages that don’t open', `Listed in the sitemap but failed to load: ${listPages(badFromMap)}.`, 'Search engines trust a map less when it leads to dead ends.', 'sitemap errors');
    else if (missing.length && sm.urls.length) add(G1,'look','Some of your pages aren’t on your site map', `The sitemap lists ${plural(sm.count,'page')}. Not on it: ${listPages(missing)}.`, 'Pages on the map get found faster.', 'sitemap coverage');
    else add(G1,'good','Search engines have a map of your site', `A sitemap lists ${plural(sm.count,'page')}${sm.listedInRobots ? ', and the robots file points to it' : ''}.`, 'A map does not guarantee a page is listed, but it makes sure it can be found.', 'sitemap.xml');
  }

  const rb = site.robots;
  const searchBlocked = rb.blocked.filter(b => ['Googlebot','Bingbot'].includes(b));
  const aiSearch = rb.blocked.filter(b => ['OAI-SearchBot','ChatGPT-User','PerplexityBot','Claude-SearchBot'].includes(b));
  const aiTrain = rb.blocked.filter(b => ['GPTBot','ClaudeBot','Google-Extended','Applebot-Extended'].includes(b));
  if (rb.everyoneBlocked || searchBlocked.length) add(G1,'fix','Your site tells search engines to stay out', `The robots file blocks ${rb.everyoneBlocked ? 'every crawler from the whole site' : searchBlocked.join(' and ')}.`, 'Google and Bing will not read the pages. This is common on sites copied from a test version.', 'robots.txt Disallow: /');
  else if (aiSearch.length) add(G1,'look','AI assistants are told not to read your site', `The robots file blocks ${aiSearch.join(', ')}.`, 'ChatGPT, Perplexity and Claude search the web before they answer. When they are blocked, they can’t name your business in an answer.', 'robots.txt AI crawlers');
  else if (site.cloudflare) add(G1,'look','Check whether AI assistants are allowed in', `Your site runs through Cloudflare.${aiTrain.length ? ` The robots file blocks ${aiTrain.join(', ')}.` : ''}`, 'Since July 2025, Cloudflare blocks AI crawlers by default on new sites, from its dashboard, without changing the robots file. The checker can’t see that setting.', 'Cloudflare AI crawl control');
  else add(G1,'good','AI assistants and search engines can read your site', rb.found ? (aiTrain.length ? `Search crawlers are allowed. The robots file blocks AI training only (${aiTrain.join(', ')}), which does not stop AI search.` : 'The robots file lets search engines and AI assistants in.') : 'No robots file, so nothing is blocked.', 'Being readable is the first step to being named in an AI answer.', 'robots.txt');

  const biz = all.map(p => p.business).find(Boolean);
  const anyInvalid = each(p => p.schemaInvalid);
  if (anyInvalid.length) add(G1,'fix','The business facts hidden in your pages are broken', `Unreadable business data on: ${listPages(anyInvalid)}.`, 'The facts written for search engines (name, phone, hours) have an error, so search engines skip them.', 'invalid JSON-LD');
  else if (biz) add(G1,'good','Search engines get your business facts directly', `Found: ${[biz.name, biz.telephone && fmtPhone(biz.telephone.replace(/\D/g,'').slice(-10)), biz.address].filter(Boolean).join(' · ')}.`, 'Check that every detail matches your Google profile exactly.', 'LocalBusiness schema');
  else add(G1,'look','Search engines have to guess your business details', home.schemaTypes.length ? `Some structured data was found (${home.schemaTypes.slice(0,4).join(', ')}), but none of it names the business with a phone or address.` : 'No business facts written for search engines were found.', 'A small hidden block can state your name, phone, address and hours so Google and AI tools don’t have to piece them together.', 'LocalBusiness schema');

  if (home.words < 80 && home.scripts > 4) add(G1,'fix','Search engines may see an almost empty home page', `Before any code runs, the home page holds about ${plural(home.words,'word')}.`, 'Visitors see the page after their browser builds it. Many search and AI crawlers read it before that, and find almost nothing.', 'client-side rendering');

  const noShare = each(p => !p.ogImage);
  if (noShare.length === all.length) add(G1,'look','A shared link to your site shows no picture', 'No share image is set on the pages checked.', 'When someone texts or posts your link, it shows up as a plain grey link instead of a picture and headline.', 'Open Graph tags');
  else if (noShare.length) add(G1,'info','Some pages show no picture when shared', `No share image on: ${listPages(noShare)}.`, 'Shared links to those pages show as plain text.', 'og:image');
  else add(G1,'good','Shared links show a picture and headline', 'Every page checked has a share image.', 'This is how your link looks in a text, on Facebook or in WhatsApp.', 'Open Graph tags');

  // ---------- 2. When someone lands on a phone ----------
  const G2 = 'land';
  if (!home.viewport) add(G2,'fix','The site isn’t set up for phones','The home page has no phone setting.', 'Phones show a shrunken desktop page that people have to pinch and zoom.', 'viewport meta tag');
  else add(G2,'good','The site is set up for phones','The home page tells phones to fit the page to the screen.', 'A basic setting. It doesn’t prove every section looks right on a phone; the speed test below shows the page the way Google’s phone sees it.', 'viewport meta tag');
  if (speed && speed.available) {
    const l = speed.lab, f = speed.field;
    const lcp = f?.lcp ?? l.lcpMs, cls = f?.cls ?? l.cls;
    const st = (lcp > 4000 || cls > 0.25) ? 'fix' : (lcp > 2500 || cls > 0.1 || (!f && l.tbtMs > 600)) ? 'look' : 'good';
    const parts = [`Main content appears in ${(l.lcpMs/1000).toFixed(1)} seconds in Google’s phone test`, `the page ${l.cls > 0.1 ? 'jumps around while it loads' : 'stays steady while it loads'} (layout shift ${l.cls.toFixed(2)})`, `buttons are blocked for ${Math.round(l.tbtMs)} ms`];
    const fieldLine = f ? ` From real Chrome visitors over the last 28 days: main content in ${(f.lcp/1000).toFixed(1)} s${f.inp ? `, buttons respond in ${f.inp} ms` : ''}.` : ' Google has no real-visitor data for this site yet, so this is the test number only.';
    add(G2, st, st === 'good' ? 'It loads quickly on a phone' : st === 'fix' ? 'It loads slowly on a phone' : 'It could load faster on a phone', parts.join(', ') + '.' + fieldLine, 'Google counts under 2.5 seconds as good. Every second past that, more people give up and hit back.', 'Core Web Vitals (LCP, CLS, INP)', {speed:true});
  } else if (speed && !speed.available) add(G2,'unknown','Phone speed test didn’t run', speed.message || 'Google’s speed test was unavailable.', 'You can run it yourself at pagespeed.web.dev.', 'PageSpeed Insights', {speed:true});
  const heavy = all.filter(p => p.inlineImageBytes > 150000);
  if (heavy.length) add(G2,'look','Some pages carry images inside the page itself', heavy.slice(0,4).map(p => `${path(p.url)}: ${kb(p.inlineImageBytes)}`).join(', ') + '.', 'Pictures baked into the page code can’t be saved by the browser, so every visit downloads them again.', 'base64 inline images');
  const bigHtml = all.filter(p => p.bytes > 1000000 || p.truncated);
  if (bigHtml.length) add(G2,'look','Some pages are very heavy before any photos load', bigHtml.slice(0,4).map(p => `${path(p.url)}: ${kb(p.bytes)}${p.truncated ? ' or more' : ''}`).join(', ') + '.', 'On a phone signal, a heavy page shows a blank screen for longer.', 'HTML page weight');
  if (all.some(p => p.freeBuilder)) add(G2,'fix','Visitors see the website builder’s name', /\.(wixsite|godaddysites|square\.site|site123|weebly|wordpress\.com|webflow\.io|carrd|business\.site|canva|framer|strikingly|netlify\.app|vercel\.app|github\.io)/i.test(site.host) ? `The site lives on a free address: ${site.host}.` : 'A “made with a free website builder” banner shows on the site.', 'Customers notice it, and it tells them the business didn’t invest in its own site.', 'free builder address or banner');

  // ---------- 3. Can they reach you ----------
  const G3 = 'reach';
  const tel = new Set(all.flatMap(p => p.telLinks));
  // Business numbers only: tapped links, the schema phone, the home page, or a number repeated across pages.
  // A helpline quoted in one article is not the business's number.
  const seenOn = {}; all.forEach(p => p.phonesText.forEach(d => seenOn[d] = (seenOn[d] || 0) + 1));
  const bizPhone = biz?.telephone ? biz.telephone.replace(/\D/g,'').slice(-10) : '';
  const shown = new Set(Object.keys(seenOn).filter(d => tel.has(d) || d === bizPhone || home.phonesText.includes(d) || seenOn[d] > 1));
  const notTappable = [...shown].filter(d => !tel.has(d));
  const tappableNowhere = all.filter(p => p.phonesText.some(d => shown.has(d) && !p.telLinks.includes(d))).map(p => p.url);
  if (!shown.size && !tel.size) add(G3,'look','No phone number on the pages checked', `Checked ${plural(all.length,'page')} and found no phone number.`, 'Many local customers want to call. If calling is not how you work, that is fine.', 'phone number');
  else if (notTappable.length) add(G3,'fix','Phone numbers that don’t dial when tapped', `${notTappable.map(fmtPhone).join(', ')} ${notTappable.length === 1 ? 'shows' : 'show'} on ${listPages(tappableNowhere,4)} without a call link.`, 'On a phone, a person has to copy the number by hand instead of tapping it.', 'tel: link');
  else add(G3,'good','Phone numbers dial when tapped', `${[...tel].map(fmtPhone).join(', ')}, tappable on a phone.`, 'One tap from the page to a call.', 'tel: link');

  const numbers = new Set([...tel, ...shown, ...(bizPhone ? [bizPhone] : [])]);
  if (numbers.size > 1) add(G3,'look','Different phone numbers on different pages', `Found ${plural(numbers.size,'number')}: ${[...numbers].map(fmtPhone).join(', ')}.`, 'If they are different lines on purpose, fine. If one is old, Google and customers can’t tell which is right.', 'NAP consistency');

  const contactPages = each(p => p.forms > 0 || p.mailto.length);
  if (!contactPages.length) add(G3,'fix','No way to write to you on the pages checked', 'No contact form and no email link were found.', 'People who can’t call right now (at work, late at night) have no way to reach out.', 'contact form / mailto');
  else add(G3,'good','People can write to you', `A form or email link is on ${listPages(contactPages,3)}.`, 'The checker does not send test messages, so make sure the form actually reaches you.', 'contact form / mailto');

  const profiles = {}; all.forEach(p => Object.entries(p.profiles).forEach(([k,v]) => profiles[k] ||= v));
  if (profiles['Google profile']) add(G3,'good','Your Google profile is linked','The site links to a Google Maps or Business Profile page.', 'It connects your website and your Google listing, which helps Google treat them as the same business.', 'Google Business Profile link');
  else add(G3,'look','The site doesn’t link to a Google profile','No link to a Google Maps or Business Profile page was found.', 'Your reviews live there. A link connects the two and lets customers read them.', 'Google Business Profile link');
  const socials = Object.keys(profiles).filter(k => k !== 'Google profile');
  if (socials.length) add(G3,'info','Profiles linked from the site', socials.join(', ') + '.', 'Search engines use these links to confirm who the business is.', 'sameAs / social links');

  const em = site.email || {};
  if (em.lookupFailed) add(G3,'unknown','Email setup for your domain','The email records for the domain could not be read.', '', 'MX, SPF, DMARC');
  else if (!em.hasMx) add(G3,'info',`No email inbox at ${em.domain}`, `The domain has no mail server, so an address like you@${em.domain} would not receive mail.`, 'Fine if you use a Gmail or other address on purpose.', 'MX records');
  else if (!em.spf || !em.dmarc) add(G3,'look',`Email from @${em.domain} may land in spam`, `Mail runs through ${em.provider}. ${!em.spf ? 'The sender record (SPF) is missing. ' : ''}${!em.dmarc ? 'The domain protection record (DMARC) is missing.' : ''}`.trim(), 'Gmail, Yahoo and Outlook check these records. Without them, your replies to customers and your invoices are more likely to land in spam, and it is easier for someone to fake mail from your name.', 'SPF / DMARC');
  else add(G3,'good',`Email from @${em.domain} is set up to reach the inbox`, `Mail runs through ${em.provider}, with a sender record (SPF) and domain protection (DMARC, policy “${em.dmarcPolicy || 'none'}”).`, 'These are the records Gmail and Outlook check before trusting your mail.', 'SPF / DMARC');

  // ---------- 4. Can they trust it ----------
  const G4 = 'trust';
  const c = site.cert || {};
  const days = c.validTo ? Math.floor((new Date(c.validTo) - now) / 86400000) : null;
  if (!site.https) add(G4,'fix','The site isn’t secure','The site opens without a secure connection.', 'Browsers show “Not secure” next to the address, and many people leave right there.', 'HTTPS');
  else if (c.trusted === false || (days !== null && days < 0)) add(G4,'fix','Browsers may warn visitors away','The security certificate ' + (days !== null && days < 0 ? 'has expired.' : 'is not trusted by browsers.'), 'Visitors get a full-screen warning before they see the site.', 'SSL/TLS certificate');
  else if (site.httpRedirect?.status === 200) add(G4,'fix','The insecure version of your site still opens', `http://${site.host} loads without moving to the secure address.`, 'Anyone who types the short address or follows an old link lands on a page marked “Not secure.”', 'HTTP to HTTPS redirect');
  else add(G4, days !== null && days < 21 ? 'look' : 'good', days !== null && days < 21 ? 'The security certificate renews soon' : 'Secure connection', days !== null ? `Secure, and the certificate is valid until ${new Date(c.validTo).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}${c.issuer ? ` (${c.issuer})` : ''}.` : 'The site loads securely.', days !== null && days < 21 ? 'Most hosts renew it on their own. If it lapses, visitors see a warning screen.' : 'Visitors see the padlock, not a warning.', 'HTTPS / certificate');

  const alt = site.altHost || {};
  if (alt.error) add(G4,'look',`${alt.host} doesn’t open`, `Your site opens at ${site.host}, but ${alt.host} ${/ENOTFOUND|not be found/i.test(alt.error) ? 'doesn’t exist' : 'didn’t load'}.`, `People who type ${alt.host} get an error page.`, 'www / non-www');
  else if (alt.finalUrl && host(alt.finalUrl) === host(site.url) && new URL(alt.finalUrl).hostname !== new URL(site.url).hostname) add(G4,'look',`Two copies of your site: with and without www`, `${alt.host} opens its own copy instead of moving visitors to ${site.host}.`, 'Google can treat them as two separate sites and split your standing between them.', 'www / non-www redirect');

  if (failed.length) add(G4,'fix',`${plural(failed.length,'page')} didn’t open`, `${failed.slice(0,6).map(p => `${path(p.url||p.requested)} (${p.status ? 'error ' + p.status : p.error})`).join(', ')}.`, 'These are linked from your own site, so visitors can land on them.', 'page errors');
  const broken = links.filter(l => l.status >= 400);
  const slow = links.filter(l => l.error === 'timeout');
  if (broken.length) add(G4,'fix',`${plural(broken.length,'link')} inside your site ${verb(broken.length,'leads','lead')} nowhere`, broken.slice(0,8).map(l => `${path(l.url)} (${l.status === 404 ? 'not found' : 'error ' + l.status})`).join(', ') + '.', 'Someone clicks and gets an error page. Search engines notice too.', 'broken internal links');
  else if (links.length) add(G4,'good','Links inside your site work', `Checked ${plural(links.length,'link')}${slow.length ? `; ${slow.length} didn’t answer in time` : ''}.`, 'No dead ends found.', 'internal links');

  const years = all.flatMap(p => p.years); const latest = years.length ? Math.max(...years) : 0;
  if (latest && latest < now.getFullYear() - 1) add(G4,'look','The site looks out of date', `The footer says © ${latest}.`, 'Customers read an old year as a business that isn’t paying attention, or isn’t open anymore.', 'copyright year');

  const privacy = all.some(p => p.privacyLink), terms = all.some(p => p.termsLink);
  const trackers = [...new Set(all.flatMap(p => p.trackers))];
  const collects = contactPages.length > 0 || trackers.length > 0;
  if (!privacy) add(G4, collects ? 'look' : 'info','No privacy page', `No link to a privacy policy was found${collects ? ', and the site ' + [contactPages.length && 'collects contact details', trackers.length && 'runs visitor tracking'].filter(Boolean).join(' and ') : ''}.`, 'Customers, Google’s ad rules and several state laws expect one when a site collects information.', 'privacy policy');
  else add(G4,'good','Privacy page in place', `A privacy page is linked${terms ? ', along with terms' : ''}.`, 'It tells visitors what happens to what they share.', 'privacy policy');
  if (trackers.length) add(G4,'info','Tools that report visitor activity to other companies', trackers.join(', ') + '.', 'Useful for knowing who visits. Florida businesses have been getting demand letters over chat widgets, pixels and session recording under the state’s wiretap law, so it’s worth knowing what runs on your site. This is information, not legal advice.', 'third-party tracking');

  const mixed = each(p => p.mixedContent > 0);
  if (mixed.length) add(G4,'look','Some pictures or scripts load insecurely', `Insecure files on: ${listPages(mixed)}.`, 'Browsers block or warn about these, so parts of the page may not show.', 'mixed content');

  const altMissing = all.reduce((s,p) => s + p.images.missingAlt, 0), imgs = all.reduce((s,p) => s + p.images.total, 0);
  const unlabeled = all.reduce((s,p) => s + p.unlabeled, 0), empty = all.reduce((s,p) => s + p.emptyLinks, 0);
  const a11y = [!home.lang && 'the language isn’t set', altMissing && `${altMissing} of ${imgs} images ${verb(altMissing,'has','have')} no description`, unlabeled && plural(unlabeled,'form field') + verb(unlabeled,' has',' have') + ' no visible label', empty && plural(empty,'link or button','links or buttons') + verb(empty,' has',' have') + ' no readable name', ...(speed?.a11y || [])].filter(Boolean);
  if (a11y.length) add(G4,'look','Some people may struggle to use the site', 'Found: ' + a11y.join('; ') + '.', 'People using screen readers, or older eyes on a phone, can get stuck. Florida has the second most website accessibility lawsuits in the country, and most target smaller businesses.', 'accessibility basics (WCAG)');
  else add(G4,'good','Accessibility basics are in place', 'Images are described, form fields labeled, and links readable on the pages checked.', 'This is a basic check, not a full accessibility audit.', 'accessibility basics (WCAG)');

  if (home.platform) add(G4,'info',`Built on ${home.platform}`, `The site appears to run on ${home.platform}.`, '', 'platform');

  // ---------- summary ----------
  F.forEach((f,i) => f.id = 'f' + i);
  const groups = [
    {id:'find',  eyebrow:'Google, Bing and AI answers', title:'Can people find you?'},
    {id:'land',  eyebrow:'The first few seconds', title:'What happens when they land?'},
    {id:'reach', eyebrow:'Calls, forms and email', title:'Can they reach you?'},
    {id:'trust', eyebrow:'Security, links and care', title:'Can they trust what they see?'},
  ].map(g => ({...g, findings: F.filter(f => f.group === g.id).sort((a,b) => STATUS[a.status].order - STATUS[b.status].order)}));
  const counts = {}; Object.keys(STATUS).forEach(k => counts[k] = F.filter(f => f.status === k).length);
  return {
    url: site.url, host: site.host, checkedAt: site.checkedAt, pagesChecked: all.length, pagesFound: (site.pages||[]).length + 1,
    preview: {title: home.titles[0] || '', description: home.descriptions[0] || '', url: site.url, h1: home.h1s[0] || '', paragraph: home.paragraphs[0] || '', ogImage: home.ogImage},
    counts, groups,
    pages: all.map(p => ({url:p.url, title:p.titles[0]||'', titles:p.titles.length, descriptions:p.descriptions.length, h1s:p.h1s.length, canonicals:p.canonicals.length, noindex:p.noindex})),
  };
}

// Reads Google's PageSpeed answer into the few numbers the report uses.
export function readSpeed(data) {
  const lab = data?.lighthouseResult; if (!lab?.audits) return {available:false, message:'Google’s speed test returned no measurement.'};
  const a = lab.audits, m = data.loadingExperience?.metrics;
  const field = m && m.LARGEST_CONTENTFUL_PAINT_MS ? {lcp: m.LARGEST_CONTENTFUL_PAINT_MS.percentile, cls: (m.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile ?? 0)/100, inp: m.INTERACTION_TO_NEXT_PAINT?.percentile || 0, overall: data.loadingExperience.overall_category} : null;
  const failing = id => a[id] && a[id].score === 0;
  const a11y = [failing('color-contrast') && 'some text is too faint against its background', failing('tap-targets') && 'some buttons are too small or close together to tap', failing('font-size') && 'some text is too small to read on a phone'].filter(Boolean);
  return {available:true, lab:{lcpMs: a['largest-contentful-paint']?.numericValue || 0, cls: a['cumulative-layout-shift']?.numericValue || 0, tbtMs: a['total-blocking-time']?.numericValue || 0}, field, a11y};
}
