<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Pipedrive rule

Never change the Pipedrive account structure (fields, pipelines, stages, users) and never delete Pipedrive records without asking José first in the chat. Records may only be created through the app's approval flow. This applies to the test account now and to the real Traços Pipedrive later.

## Secrets

Never print, commit or paste the values in `.env.local`. Use `.env.example` for variable names.
