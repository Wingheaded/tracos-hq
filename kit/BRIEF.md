# BRIEF for Cursor: Traços HQ

Paste this file into Cursor at the start. Build in small steps and run the app after each one.

## Goal

A web app where a small team (Paulo, Nelson, José) and AI agents work together in chat channels. Demo at a hackathon in 2 days. Runs locally on a laptop.

## Stack

- Next.js (App Router, TypeScript), Tailwind
- SQLite via better-sqlite3 (file `data/app.db`)
- Grok via the xAI API (OpenAI-compatible SDK, `baseURL: https://api.x.ai/v1`). Use tool calling. Vision for invoices. Web search for leads (check which search tool the event's Grok access provides).
- Pipedrive REST API v1 with `PIPEDRIVE_API_TOKEN` and `PIPEDRIVE_DOMAIN`
- `.env.local`: `XAI_API_KEY`, `XAI_MODEL`, `PIPEDRIVE_API_TOKEN`, `PIPEDRIVE_DOMAIN`. Never hardcode keys.

## Files already prepared (folder `kit/`)

- `catalog/*.json`: one knowledge file per specialist (brands, collections, products, indicative prices)
- `images/*.jpg` + `images/index.json`: one catalogue photo per key collection, for the proposal export (match by brand + collection)
- `prompts/orchestrator.md`, `prompts/specialist.md` (template), `prompts/finance.md`, `prompts/leads.md`
- `invoices/`: test invoices (PDF + JPG) and `answer-key.json` with the expected values
- `leads/backup-search-algarve-hotels.json`: fallback if live web search fails
- `pipedrive/pipedrive-import.csv`: already imported into the test Pipedrive account

## Screens

1. **Chat** (`/`): left sidebar with channels `#general`, `#clients`, `#finance`, `#leads` and a list of agents (Orchestrator, Daniel, Tomás, Maya, André, Inês, Finance, Leads). The user picks their name from a dropdown (no auth). Messages support `@Agent` mentions. Agent replies stream in. An agent reply can show a small "Consulted: Daniel, Tomás" line.
2. **Back office** (`/admin`), four tabs:
   - **Approvals**: pending actions (CRM note, CRM activity, new CRM lead, expense) with Approve / Edit / Reject. Approve executes the action.
   - **Expenses**: table of approved expenses, file preview, CSV export.
   - **Leads**: searches, leads found, status (new / approved / sent to CRM), CSV export.
   - **Agents**: list of agents, their prompt and catalog file (read-only is fine for the MVP).

## Agents (server side, `app/api/...`)

- **Orchestrator**: tools `crm_search`, `crm_get_client` (Pipedrive read), `ask_specialist` (calls a specialist with its prompt + catalog), `propose_crm_write` (inserts an approval, never writes directly).
- **Specialists**: one function, prompt template + catalog JSON in the system prompt. No RAG.
- **Finance**: on file upload in `#finance`, send the image/PDF to Grok vision with `prompts/finance.md`, parse the JSON, create an approval of type `expense`.
- **Leads**: on `@Leads` in `#leads`, run the leads prompt with web search, show a table in the chat, save the leads, and let the user select some → approval of type `crm_lead`.

## Data model (SQLite)

`messages(id, channel, author, author_type[human|agent], content, meta_json, created_at)`
`approvals(id, type, payload_json, reason, status[pending|approved|rejected], created_by, decided_by, created_at, decided_at)`
`expenses(id, supplier_name, supplier_nif, invoice_number, issue_date, net_amount, vat_amount, total_amount, category, file_path, created_at)`
`leads(id, search_id, company, website, city, sector, why_it_fits, segments, general_contact, source_url, status)`

## Build order

1. Chat UI + SQLite + one echo agent
2. Specialists answering from the catalog JSON
3. Orchestrator with `ask_specialist` → demo "Casa Maré" works
4. Pipedrive read (`crm_search`, `crm_get_client`)
5. Approvals tab + `propose_crm_write` → creates a note/activity in Pipedrive when approved
6. Finance (upload → vision → approval → expenses)
7. Leads (search → table → approval → Pipedrive lead)
8. Proposal export (optional)

## Rules

- No action leaves the app without an approval.
- Agents never invent prices. Prices in the catalog are indicative.
- UI in English. Agents reply in the language of the message.
- Keep it simple. A working demo beats a complete one.
