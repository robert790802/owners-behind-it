# OwnersBoard form handoff

Netlify's verified `formSubmitted` event forwards accepted `tell-your-story` and `visualizer-leads` data to OwnersBoard. Add the same server-only `WEBSITE_WEBHOOK_SECRET` (32+ random characters) to Functions scope on both sites and deploy OwnersBoard's receiver/migration first. Neither secret nor OwnersBoard URL is sent by the visitor's browser. Existing Netlify submissions and audio remain intact if the receiver is unavailable.

Both forms include receipt metadata. The recording keeps its receipt on a network retry; repeated server deliveries deduplicate in OwnersBoard. The existing removed calculator lead UI is not reenabled. Failed handoffs throw for Netlify background retries; original form submissions remain the recovery source if retries run out. Old submissions without receipt metadata are not automatically imported.

The static build stages only public pages, metadata, images and videos in `dist`. Server functions, setup scripts and tests remain outside the public directory. Functions are bundled separately from `netlify/functions`. Run `node scripts/build-site.mjs` to verify this staging step.

Run `node --test tests/ownersboard-intake.test.mjs`. Then verify one genuine accepted form reaches OwnersBoard Inquiries after deployment.
