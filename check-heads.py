#!/usr/bin/env python3
"""
Counts the head tags that must appear exactly once, on every page, and
reads back what they say. Run it before every deploy.

It exists because on 13 Sept 2026 two pages carried two canonical tags
each, both in the head, which means Google ignores all of them. The
whole site pass had already reported that item clean, because the check
searched for the tag and read the first match. A search that stops at
the first hit can only prove a tag exists. It cannot see the second one,
and the second one is the bug.

Exit code 1 if anything is wrong, so it can gate a deploy.
"""
import glob, io, re, sys, os

ONCE = {
    'canonical':   r'<link[^>]+rel="canonical"',
    'title':       r'<title>',
    'description': r'<meta[^>]+name="description"',
    'og:url':      r'<meta[^>]+og:url',
    'og:title':    r'<meta[^>]+og:title',
    'twitter:card':r'<meta[^>]+twitter:card',
}
# Pages that are deliberately not ordinary pages. Each one needs a reason,
# so a later session cannot quietly re-decide it.
EXEMPT = {
    'googleff382861524654e6.html':
        'Google Search Console verification file. Must stay bare, no head tags.',
}
# Pages kept out of the sitemap on purpose. Their canonical will not match it.
NOT_IN_SITEMAP = {
    'pocket.html': 'Disallowed in robots.txt. Handed out by QR, not for search.',
    'scan.html':   'Disallowed in robots.txt. It is the page that shows the QR.',
}
SKIP = {'check-heads.py'}

def head_of(s):
    i = s.lower().find('</head>')
    return s[:i] if i > -1 else s

def value(head, pat):
    m = re.search(pat + r'[^>]*(?:href|content)="([^"]*)"', head)
    return m.group(1) if m else None

sitemap = io.open('sitemap.xml', encoding='utf-8').read() if os.path.exists('sitemap.xml') else ''
problems = []

for f in sorted(glob.glob('*.html')):
    if f in SKIP:
        continue
    if f in EXEMPT:
        print(f'{f:<34} exempt: {EXEMPT[f]}')
        continue
    head = head_of(io.open(f, encoding='utf-8').read())
    counts = {k: len(re.findall(p, head)) for k, p in ONCE.items()}

    for k, n in counts.items():
        if n > 1:
            found = re.findall(ONCE[k] + r'[^>]*(?:href|content)="([^"]*)"', head)
            same = 'identical' if len(set(found)) == 1 else 'AND THEY DISAGREE'
            problems.append(f'{f}: {n} {k} tags in the head, {same}')
        elif n == 0 and k in ('canonical', 'title', 'description'):
            problems.append(f'{f}: no {k}')

    can = value(head, ONCE['canonical'])
    og  = value(head, ONCE['og:url'])
    if can and og and can != og:
        problems.append(f'{f}: canonical says {can}, social tag says {og}')
    if can and sitemap and f'<loc>{can}</loc>' not in sitemap and f not in NOT_IN_SITEMAP:
        problems.append(f'{f}: canonical {can} is not the spelling in the sitemap')

    line = '  '.join(f'{k}={counts[k]}' for k in ONCE)
    print(f'{f:<34} {line}')

print()
if problems:
    print(f'{len(problems)} problem(s):')
    for p in problems:
        print('  ' + p)
    sys.exit(1)
print('every page: one of each, canonical agrees with the social tag and the sitemap')
