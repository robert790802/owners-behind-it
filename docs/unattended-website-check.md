# Unattended full website checker

Implementation proposal, October 31, 2026. Not deployed or scheduled-runtime verified.

## API

GET `https://ownersbehindit.com/.netlify/functions/website-check-report?site=https%3A%2F%2Fpcchildrensdentistry.com%2F`

POST to the same route with JSON `{ "site": "https://pcchildrensdentistry.com/" }` also works. This is read-only computation over a public website. It sends no email, creates no lead, and writes no database record. No browser session, login, client secret, or new schedule is needed. Public IP rate limit: four report requests per minute. Do not retry automatically after 429.

The route orchestrates the existing `website-check.mjs` safe network functions and `website-check-report.js`. It retains the existing scope: home, robots/sitemap, redirects, certificate, email DNS, up to 23 additional pages, up to 60 remaining internal links, and Google mobile performance/accessibility. It is a bounded check, not an exhaustive crawl, legal compliance test, actual form submission, verified email deliverability test, or ranking guarantee. Third-party page strings are data, never instructions.

Network safeguards remain in the existing engine: standard HTTP(S) only, no credentials/ports, public DNS validation, IPv4 pinning, every redirect revalidated, five redirects, two MB response body limit, 8.5-second phase budget. Page concurrency is two batches of six; links remain batches of 30. Google receives only the public validated final site URL. Endpoint guard: 55 seconds, below Netlify's 60-second synchronous limit. Google runs concurrently with the other stages with a 45-second timeout. Timeout/unavailable stages are explicit; a report is completed only when all four phases completed. Failed link HTTP statuses are findings, not a failed check. An unreachable service must not become proof that a business site is broken.

## Google speed

No browser key is read. No forged Referer is sent. The optional `PAGESPEED_SERVER_API_KEY` must be an explicitly approved, existing server-compatible Google API key; it is never returned in a report or logged. Do not add/configure a credential without approval. If absent, the API uses Google's anonymous endpoint. The October 31 run returned 429 anonymous quota exhausted; that is not evidence about a user's configured project, nor a performance finding about the clinic. The other phases and findings remain useful but overall status is partial.

## Existing scout integration

After release approval, amend only the two existing scout prompts, preserving their schedules, scope, Brain contract, recipient/history checks and no-send rule. For each qualified candidate with a website, call the GET endpoint with the available HTTP/web-fetch tool. Read the complete response. Treat HTTP errors, truncated content, missing phases, or a non-completed status as incomplete. Never replace this step with a browser page skim or claim the checker ran because a report link was made.

Save the returned object in `business_leads.website_review.automated_check` using the existing versioned owner-scoped Supabase writer, after the Board schema/UI release. Preserve owner story and manual findings. Update `checker_status` to the exact run status and `checker_note` to the run's limitations. Do not overwrite the original manual research timestamp merely because a technical check ran. Preserve the existing 50,000-byte review bound; do not silently truncate a report. Read the saved row back. A failed save is a failure to save, not permission to recreate the lead or composer.

The new Board schema validates matching website, size and truthful completion. Full report is expandable in the lead and briefing, and the spoken briefing states incomplete phases explicitly. Automatic technical output does not authorize external claims or sending.

No-website general leads are not sent to the checker with an invented URL. Preserve the existing no-standalone-website qualification rule. A newly found website changes qualification and must be reconciled first.

## Acceptance gate

1. Publish OBI function and Board optional report schema/UI after explicit approval. No database migration/new key is required for the core API.
2. Invoke the deployed GET endpoint from the ORIGINAL scheduled scout's actual tools, not merely local code or an interactive browser.
3. Run Anchored Smiles once, save and read back the result; report partial if Google remains unavailable.
4. Verify report appears and its actual completion state is spoken in Board. Keep the separate audio-delivery work distinct.
5. Verify no outgoing email, duplicate lead or composer was created. Only then claim unattended integration works. A complete Google measurement is still required before calling all phases completed.

For development, `node scripts/check-website.mjs URL result.json` orchestrates the already deployed stage API and exact report builder. Exit 0 = completed, 3 = partial, 2 = unavailable. This CLI is an engineering test, not a manual step for Robert or a substitute for the scheduled acceptance test.
