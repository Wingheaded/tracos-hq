# Traços HQ: 5-minute pitch (English)

Timings in brackets. The total is about 4:40, which leaves 20 seconds of margin. Speak slowly and let the demo do most of the work.

---

## 1. The problem [0:00 to 0:45]

Traços Interiores is a Portuguese SME. For more than 25 years we have represented premium design brands in lighting, acoustics, outdoor furniture, workplace and biophilia. Our clients are hotels, offices, architects and restaurants.

Our knowledge sits with five segments, five people and hundreds of PDF catalogues. When a salesperson visits a hotel, they need lighting, acoustics and furniture in one proposal. Today that takes three colleagues, a day of emails and a lot of copy-paste.

Meanwhile, invoices pile up in a drawer, and we find new clients by hand, one Google search at a time.

## 2. The solution [0:45 to 1:30]

We built Traços HQ, one workspace where the team and AI agents work side by side. Think of Slack, where some of your colleagues are agents.

- The **Orchestrator** manages the AI team. It is also the only one allowed to touch our CRM.
- Five **product specialists**, one per segment: Daniel for lighting, Tomás for acoustics, Maya for outdoor, André for workplace and Inês for biophilia. Clients already talk to them as voice agents on our website. In Traços HQ they answer the team.
- A **Finance** agent reads invoices.
- A **Leads** agent researches new clients on the web.

One rule sits above everything else: nothing leaves the company, and nothing enters the CRM, until a person approves it.

## 3. Live demo [1:30 to 3:30]

*(Switch to the app.)*

1. **The client visit.** Paulo writes: "I'm visiting Casa Maré on Thursday. They have an echo problem in the lobby and want a rooftop bar. Suggest lighting, acoustics and outdoor furniture."
   The Orchestrator checks the CRM and sees that Casa Maré bought outdoor furniture from us in 2025. It asks Daniel, Tomás and Maya, and a few seconds later we have one proposal, organised by area, with brands and indicative prices.
2. **The CRM.** The Orchestrator offers to log the visit in Pipedrive. I approve, and there it is in Pipedrive.
3. **Finance.** I take a photo of a restaurant receipt and drop it in #finance. The agent pulls out the supplier, the tax number, the VAT and the total. One click and it's in the expenses table. If the numbers don't add up, it tells me.
4. **Leads.** "Find hotels in the Algarve that renovated recently or are about to open." We get twelve real hotels, each with the reason it fits and a link to the source. I pick three, approve them, and they land in the CRM as leads.

*(If the network fails, play the backup video.)*

## 4. How it is built [3:30 to 4:00]

It's a Next.js app, built with Cursor in two days. Grok does the reasoning, reads the invoices and searches the web. Pipedrive is connected through its API.

We made three design choices. Only the Orchestrator writes to the CRM, so the data stays clean. Every action that leaves the app needs a human approval. And the specialists answer from our own catalogues, so they stick to products and prices we actually sell.

## 5. Impact and next steps [4:00 to 4:40]

A combined proposal used to take about a day. Now it takes a few minutes. Invoices reach accounting the day they come in. And prospecting can happen every week, where today we manage it maybe once a quarter.

Next, we want an email agent for each colleague that sorts priorities and drafts replies, our voice agents inside the app, and a pilot with the whole team in November.

That's Traços HQ. Thank you.

---

## Likely jury questions

- **"What about hallucinations?"** The specialists only answer from our catalogue files. Prices are marked as indicative, and the person who owns each segment confirms them.
- **"Data protection?"** The demo runs on a test CRM with fictional invoices. The Leads agent only collects company information from public sources and never stores personal data.
- **"Cost?"** For a team of five, the infrastructure fits in free tiers. The real cost is AI usage, and we'll measure it during the one-month Enterprise trial.
- **"Why not just use ChatGPT?"** Because the value comes from the connections. Our catalogue, our CRM, our approval rules and our team are all in one place.
