// Netlify fires this automatically after every successful deploy.
// Tells Bing (and the other IndexNow search engines) which pages are new or
// changed, so they get crawled within days instead of waiting to be found.
// A page is sent when its <lastmod> in sitemap.xml is within the last 7 days.
// To push a changed page, update its lastmod in the sitemap.

const SITE = 'https://ownersbehindit.com';
const HOST = 'ownersbehindit.com';
const KEY = '7300d43ad3b9393810e796e41d588cff';
const WINDOW_DAYS = 7;

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body || '{}');
    const deploy = body.payload || {};
    if (deploy.context && deploy.context !== 'production') {
      console.log('IndexNow: not a production deploy, skipping.');
      return { statusCode: 200, body: 'skipped' };
    }

    const res = await fetch(SITE + '/sitemap.xml', {
      headers: { 'User-Agent': 'ownersbehindit-indexnow' },
    });
    if (!res.ok) {
      console.log('IndexNow: could not read sitemap, status ' + res.status);
      return { statusCode: 200, body: 'no sitemap' };
    }
    const xml = await res.text();

    const cutoff = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const urls = [];
    const blocks = xml.split('<url>').slice(1);
    for (const block of blocks) {
      const loc = (block.match(/<loc>([^<]+)<\/loc>/) || [])[1];
      const lastmod = (block.match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1];
      if (!loc || !lastmod) continue;
      const when = Date.parse(lastmod);
      if (!isNaN(when) && when >= cutoff) urls.push(loc.trim());
    }

    if (urls.length === 0) {
      console.log('IndexNow: no pages changed in the last ' + WINDOW_DAYS + ' days.');
      return { statusCode: 200, body: 'nothing to send' };
    }

    const submit = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: HOST,
        key: KEY,
        keyLocation: SITE + '/' + KEY + '.txt',
        urlList: urls,
      }),
    });
    console.log('IndexNow: sent ' + urls.length + ' pages, response ' + submit.status);
    return { statusCode: 200, body: 'sent ' + urls.length };
  } catch (err) {
    console.log('IndexNow error: ' + err.message);
    return { statusCode: 200, body: 'error' };
  }
};
