# Traços HQ

A team workspace where the people of Traços Interiores and a small crew of AI agents work side by side. Built in two days at the SpaceXAI Digital Transformation Lab (Forum Braga, 26–27 October 2026) with Cursor and Grok.

## The problem

Traços Interiores is a Portuguese SME that represents premium design brands (lighting, acoustics, outdoor furniture, workplace and biophilia) for hotels, offices, architects and restaurants. A small team carries a lot of manual work:

- Product knowledge is spread across five segments, five people and hundreds of PDF catalogues. One client proposal can need three colleagues and a day of emails.
- Client visits, emails and new contacts reach the CRM late or twice.
- New clients are searched for by hand, one Google query at a time.

## What it does

A chat with channels and @mentions, like Slack, where people and agents talk in the same place.

| Agent | Role |
|---|---|
| **Orchestrator** | Manages the AI team. Reads the client's history in Pipedrive, asks the right specialists, joins their answers into one proposal by area. The only agent allowed to touch the CRM. |
| **Daniel** | Lighting specialist |
| **Tomás** | Acoustics specialist |
| **Maya** | Outdoor furniture specialist |
| **André** | Corporate and workplace specialist |
| **Inês** | Biophilia specialist |
| **Leads** | Searches the web (Grok web search) for companies that fit, with the reason and the source, and turns the chosen ones into CRM leads. |
| **Finance** | On the roadmap: reads invoice photos and PDFs into expense entries. |

The five specialists answer only from the brands' catalogues (`kit/catalog/`). Prices are marked as indicative and confirmed by the human owner of each segment.

## Design rules

- **One door to the CRM.** Only the Orchestrator reads and writes Pipedrive. Other agents and people hand information to it.
- **A person approves every action.** Every CRM note, activity and lead becomes an approval card in `/admin`. Nothing is written until someone clicks Aprovar.
- **No duplicates.** Before any lead is proposed, the server checks Pipedrive for the same company name (case and accents ignored), email or website domain.
- **Safe data.** The demo runs on a Pipedrive test account with fictional clients, fictional invoices and public company news. No personal data is collected from the web.

## Why a custom app and not only Grok Bot

The lab offered three tools: Cursor, Grok Bot and the xAI API. We used Cursor to build and the xAI API to run the agents. We chose not to build Traços HQ as a set of Grok Bot assistants, because an assistant can do much of the work (answer from the catalogues, search the web, read a CRM when it is connected to one) but it cannot by itself guarantee the parts that make this safe for a team:

- **Rules enforced in code, not in a prompt.** Human approval before any CRM write and the duplicate check run on the server every time. With an assistant they depend on the model following its instructions. During testing the Orchestrator proposed a client visit nobody had asked for; the approval queue, not the model, kept it out of Pipedrive.
- **One door to the CRM.** Only the Orchestrator writes to Pipedrive. Several assistants connected to the CRM would each write on their own.
- **One shared workspace.** Paulo, Nelson and José see the same channels, approvals and leads. Assistants are usually personal to each user.
- **Control of data and cost.** The catalogues, prices and history stay with Traços, and the AI model can be changed later without rebuilding the app.

Grok Bot fits the personal side of the roadmap: an email assistant for each colleague that sorts priorities and drafts replies, handing anything that belongs in the CRM to Traços HQ.

## Demo

1. In `#clients`: *"@Orchestrator Vou visitar a Casa Maré na quinta-feira. Têm um problema de eco no lobby e querem um bar no rooftop. Sugere iluminação, acústica e mobiliário de exterior."* The Orchestrator reads the CRM, consults Daniel, Tomás and Maya, and returns one proposal by area.
2. It proposes to log the visit. One click on Aprovar in `/admin` and the activity appears in Pipedrive.
3. In `#leads`: *"@Leads encontra hotéis no Algarve que foram renovados recentemente ou vão abrir em breve"*. A table of real hotels with sources. The chosen ones go through approval into Pipedrive. A hotel already in the CRM is flagged instead of duplicated.

The interface is in European Portuguese. Agents answer in the language of each message.

## Stack

- Next.js (App Router, TypeScript, Tailwind)
- Grok through the xAI API: chat, tool calling, web search
- Pipedrive REST API
- SQLite (`data/app.db`, created on first run)

## Run it locally

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000. Set `LEADS_FALLBACK=true` to use the saved Algarve hotel results in `kit/leads/` instead of a live web search.

## Repository map

- `app/`, `components/`, `lib/`: the application
- `kit/`: the material prepared before the event: specialist knowledge files built from the brands' catalogues, agent prompts, the Pipedrive test import, sample invoices, saved lead results, the step-by-step build prompts and the pitch
