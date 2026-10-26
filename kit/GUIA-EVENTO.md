# Guia do evento: construir a Traços HQ com o agente do Cursor

Passo a passo para usar as pastas do kit com o agente de programação (o agente do Cursor, ou o que a SpaceXAI der no local, com o Grok) e chegar à demo em dois dias.

Regra de ouro: **um passo de cada vez**. Colas o prompt, esperas, testas o que está em "Confirma", fazes commit e só depois avanças. Se o agente fizer vários passos de uma vez, perdes o controlo e fica difícil voltar atrás.

Os prompts para colar estão em inglês, como o evento. As explicações estão em português.

**Há duas pastas de prompts. Não as confundas:**

| Pasta | O que é | O que fazes com ela |
|---|---|---|
| `kit/prompts-cursor/` | Os 9 pedidos que **tu colas no chat do Cursor**, um por passo (`00-ler-o-kit.txt` a `08-proposta.txt`) | Abres o ficheiro do passo, copias tudo (Ctrl+A, Ctrl+C) e colas no chat do agente |
| `kit/prompts/` | As instruções dos **agentes que vivem dentro da app** (Orquestrador, especialistas, Finanças, Leads) | Não colas em lado nenhum. O agente do Cursor lê estes ficheiros sozinho, porque os prompts da outra pasta lhe dizem para os usar |

Os mesmos 9 pedidos aparecem também neste guia, em cada passo.

---

## Parte 0. Antes de sair de casa (domingo)

### Preparação obrigatória da organização

Vem do portal oficial: https://cursor.dock.us/ai-digital-transformation-hackathon-portugal-1bnm4y7vXjuQ/re0L7tHeWRpl. A organização avisa que, sem estes passos, se perde muito tempo no evento ou se pode até ficar de fora.

1. **Conta Cursor** em cursor.com com o email de trabalho. Usa sempre o mesmo método de entrada (Google ou código por email). Não entres com o X, porque cria uma segunda conta.
2. **Inquérito de confirmação:** está no portal, no botão "Open the confirmation survey". **É este passo que dá direito aos créditos do hackathon.**
3. **Instalar o Cursor** (cursor.com/download) e entrar com a conta do passo 1.
4. **Instalar o Grok Bot** (cursor.com/download/bot). Se aparecer uma oferta de período experimental, não é preciso: os créditos entram no dia do evento.
5. **Entrar na consola da xAI** (console.x.ai) com o mesmo email e o mesmo método. É normal ainda não haver créditos. Só uma pessoa por equipa precisa desta conta, e na tua equipa és tu.

Dúvidas: paul.dumaitre@x.ai.

**De onde vem a chave do Grok para o `.env.local`:** no dia do evento, depois de os créditos entrarem, vais a console.x.ai → API Keys → criar chave. Copia-a para `XAI_API_KEY`. O nome do modelo para `XAI_MODEL` aparece na lista de modelos da mesma consola. Escolhe o modelo Grok mais recente que a organização recomendar.

Os **Cloud Agents** do Cursor (outro separador do portal) são opcionais e precisam de ligar o GitHub. Para esta demo não são necessários: o agente local do Cursor chega.

### O resto da preparação

1. **Verifica se tens as ferramentas.** Abre um terminal e corre:
   ```bash
   node -v
   ```
   ```bash
   git --version
   ```
   O Node deve ser a versão 20 ou mais recente. Se falhar, instala o Node LTS.
2. **Abre o Cursor e entra com a tua conta.** Confirma que consegues escolher o modelo Grok no seletor de modelos do chat. Se não aparecer, pergunta no evento qual é o acesso.
3. **Cria o Pipedrive de teste** e importa `kit/pipedrive/pipedrive-import.csv`. Em Definições → Preferências pessoais → API, copia o **token** e o **domínio** da empresa (o que vem antes de `.pipedrive.com`).
4. **Leva tudo no portátil:**
   - o kit: `D:\AIOS\projects\hackathon-spacexai\kit\`
   - os PDF completos: `D:\Hackathon-SpaceXAI\catalogos\` (não entram na app, servem para mostrar)

---

## Parte 1. Preparar o projeto (dia 1, antes de começar a construir)

### 1.1 Criar a pasta do projeto

O projeto fica **fora do AIOS**, numa pasta só dele. O kit é copiado para lá, e o original fica intacto no AIOS.

```bash
mkdir -p "/d/Hackathon-SpaceXAI/tracos-hq"
```
```bash
cp -r "/d/AIOS/projects/hackathon-spacexai/kit" "/d/Hackathon-SpaceXAI/tracos-hq/kit"
```

### 1.2 Abrir no Cursor

No Cursor: **File → Open Folder** → `D:\Hackathon-SpaceXAI\tracos-hq`. Na versão nova do Cursor também podes usar o ícone de pasta com "+" ao lado de **Repositories**, na barra da esquerda.

Antes de colar o primeiro prompt, confirma duas coisas por cima da caixa de texto:
- o local diz **This PC**, ou seja, trabalha no teu portátil e não na nuvem;
- o modelo é o **Grok 4.7** (muda-o no seletor, que por defeito pode vir no Grok 4.6).

### 1.3 Primeiro prompt: ler o kit, sem construir nada

```
Read kit/BRIEF.md and kit/README.md, then skim kit/prompts/ and one file in kit/catalog/.
Do NOT write any code yet.
Reply with: (1) a 5-line summary of the app, (2) the folder structure you plan for the Next.js project,
(3) any question you need answered before step 1.
```

**Confirma:** o resumo fala do chat com canais, do Orquestrador como único a escrever no Pipedrive, da aprovação humana e dos 4 tipos de agente. Se faltar alguma destas coisas, corrige já, antes de haver código.

### 1.4 Chaves

O ficheiro `.env.local` já está criado em `D:\Hackathon-SpaceXAI\tracos-hq\` (feito a 2026-10-25, com o domínio do Pipedrive preenchido). Abre-o no Cursor e substitui os `COLAR_AQUI_...` pelos valores verdadeiros. Fica assim:

```
XAI_API_KEY=a chave que o evento der
XAI_MODEL=o nome do modelo Grok indicado no evento
PIPEDRIVE_API_TOKEN=o token do Pipedrive de teste
PIPEDRIVE_DOMAIN=joseaisolutions
LEADS_FALLBACK=false
```

Nunca coles as chaves no chat do agente. Ficam só neste ficheiro.

---

## Parte 2. Construir, passo a passo

Depois de cada passo:
1. corre a app (`npm run dev`) e abre `http://localhost:3000`;
2. testa o que está em **Confirma**;
3. se estiver bem, faz commit:
   ```bash
   git add -A && git commit -m "passo N"
   ```

Se o agente estragar alguma coisa, volta ao último passo bom com `git checkout -- .` ou pede-lhe "revert your last changes".

### Passo 1. Esqueleto: chat, base de dados e um agente de teste (dia 1, ~1h30)

```
Do step 1 of the build order in kit/BRIEF.md only.
Create the Next.js app (App Router, TypeScript, Tailwind) in this folder, without touching kit/ or .env.local.
The folder is not empty: if create-next-app refuses, scaffold it in a temporary subfolder and move the files up, keeping kit/ and .env.local as they are.
Run git init first and add a .gitignore that excludes node_modules, .env.local and data/.
Build the chat screen: sidebar with #general, #clients, #finance, #leads and the agent list,
a user dropdown (Paulo, Nelson, José), messages stored in SQLite (data/app.db, schema from the BRIEF).
Add one "Echo" agent that replies when mentioned with @Echo, just to prove the loop works.
Tell me the exact command to run it.
```

**Confirma:** escreves no #general, a mensagem fica lá depois de recarregar a página e o `@Echo` responde.

### Passo 2. Os 5 especialistas (dia 1, ~1h)

```
Do step 2 only. Implement the five specialists using kit/prompts/specialist.md as the template
and the matching file in kit/catalog/ as {{catalog_json}}. Use the xAI API (OpenAI-compatible SDK,
baseURL https://api.x.ai/v1, model and key from .env.local). Stream the replies.
Each specialist answers when mentioned: @Daniel, @Tomás, @Maya, @André, @Inês.
```

**Confirma:** pergunta `@Tomás the lobby of a hotel has a lot of echo, what do you suggest?`. Deve falar de ECOcero, Feltouch ou Greenarea, dizer que os preços são indicativos e citar a Joana. Se inventar marcas que não estão na ficha, diz-lhe: "Only use brands and products from the catalog JSON."

### Passo 3. O Orquestrador (dia 1, ~1h30)

```
Do step 3 only. Implement the Orchestrator with kit/prompts/orchestrator.md and tool calling.
For now implement only the ask_specialist tool (it calls the specialist function from step 2).
Show a small "Consulted: ..." line above its reply.
```

**Confirma:** no #clients escreve:
`@Orchestrator I'm visiting Casa Maré on Thursday. They have an echo problem in the lobby and want a rooftop bar. Suggest lighting, acoustics and outdoor furniture.`
Deve consultar Daniel, Tomás e Maya e dar uma resposta única, organizada por zona.

### Passo 4. Ler o Pipedrive (dia 1, ~1h)

```
Do step 4 only. Add the crm_search and crm_get_client tools to the Orchestrator using the
Pipedrive REST API v1 (token and domain from .env.local). Read-only. Server side only.
```

**Confirma:** repete o pedido da Casa Maré. O Orquestrador deve agora dizer que a Casa Maré comprou mobiliário Kettal em 2025 e que há um negócio aberto para o lobby e o rooftop.

**Fim do dia 1:** a demo "Casa Maré" funciona de ponta a ponta. Faz commit e, se der, grava já um vídeo curto do ecrã (Win + Alt + R no Windows), para o caso de algo correr mal amanhã.

### Passo 5. Aprovações e escrita no Pipedrive (dia 2, manhã, ~1h30)

```
Do step 5 only. Build /admin with the Approvals tab. Add the propose_crm_write tool to the Orchestrator:
it inserts a pending approval and never writes to Pipedrive directly. When a human clicks Approve,
the server creates the note or activity in Pipedrive and marks the approval as approved.
Show approval cards in the chat too, with Approve / Reject buttons.
```

**Confirma:** pede `@Orchestrator log my visit to Casa Maré on Thursday`. Aparece um cartão, carregas em Approve e a atividade aparece no Pipedrive de teste.

### Passo 6. Agente de Finanças (dia 2, manhã, ~1h30)

```
Do step 6 only. In #finance, allow dropping an image or PDF. Send it to Grok vision with
kit/prompts/finance.md, parse the JSON, create an approval of type "expense", and on approval
save it in the expenses table. Add the Expenses tab in /admin with a CSV export.
If the model cannot read PDFs directly, convert the first page to an image first.
```

**Confirma:** arrasta `kit/invoices/02-lunch-client-photo.jpg` e compara com `kit/invoices/answer-key.json`: fornecedor Tasca do Mar Azul, total 73,99 €, aviso de dois IVA. Depois arrasta `08-wrong-total.pdf`: tem de aparecer o aviso "amounts do not add up".

### Passo 7. Agente de Leads (dia 2, início da tarde, ~1h30)

```
Do step 7 only. Implement @Leads in #leads with kit/prompts/leads.md and Grok web search.
Show the result as a table in the chat with checkboxes; selected rows become approvals of type "crm_lead",
and on approval they are created as leads in Pipedrive. Add the Leads tab in /admin with CSV export.
Add an env flag LEADS_FALLBACK=true that returns kit/leads/backup-search-algarve-hotels.json instead of searching.
```

**Confirma:** `@Leads find hotels in the Algarve that renovated recently or are about to open` devolve uma tabela com fontes. Testa também com `LEADS_FALLBACK=true`. É o plano B para o pitch, se a pesquisa falhar.

### Passo 8. Exportar a proposta (só se sobrar tempo)

```
Do step 8 only. Add an "Export proposal" button under Orchestrator answers that renders a clean
HTML proposal (client, areas, products, indicative prices, human owners) with photos from kit/images/
matched via kit/images/index.json by brand and collection. Printable to PDF from the browser.
```

---

## Parte 3. Fechar (dia 2, fim da tarde)

Reserva pelo menos **1h30** antes da apresentação para esta parte. A partir daqui não se constrói mais nada: só se prepara a demo.

### 3.1 Congelar o código (5 min)

Faz um último commit e não peças mais alterações ao agente. Uma mudança feita à pressa a 30 minutos do pitch é a forma mais comum de chegar à apresentação com a app partida.

```bash
git add -A && git commit -m "versão do pitch"
```

### 3.2 Limpar e preparar os dados da demo (20 min)

Durante os testes a app fica cheia de mensagens repetidas. O júri deve ver um ecrã limpo.

1. Pede ao agente uma única vez:
   ```
   Add a script "npm run reset-demo" that empties messages, approvals, expenses and leads in data/app.db. Change nothing else.
   ```
2. Corre `npm run reset-demo`.
3. No Pipedrive de teste, apaga as notas e atividades que foram criadas nos testes. O negócio da Casa Maré deve ficar como estava quando importaste o CSV.
4. Põe à mão uma ou duas mensagens "de equipa" no #general (por exemplo, Nelson a escrever "Bom dia, alguém tem o catálogo novo da Vibia?"), para a app parecer usada por pessoas e não vazia.
5. Deixa abertos, em separadores do navegador e por esta ordem: a app no #clients, o `/admin` no separador Aprovações, e o Pipedrive de teste no negócio da Casa Maré.
6. Põe na área de trabalho a fatura que vais arrastar (`02-lunch-client-photo.jpg`), para não perderes tempo à procura dela.

### 3.3 Fazer a demo completa uma vez, a cronometrar (15 min)

Segue o guião do pitch (secção 3, "Live demo") do princípio ao fim, como se fosse a sério. Anota quanto tempo cada momento demora. Se a resposta do Orquestrador demorar mais de 20 segundos, prepara uma frase para ocupar a espera, por exemplo: "Right now it is checking the CRM and asking three specialists at the same time."

Depois da volta de ensaio, corre de novo o `npm run reset-demo` e repete o ponto 3 da secção 3.2.

### 3.4 Gravar o vídeo de segurança (20 min)

É o plano B se a rede ou a app falharem durante o pitch.

1. Abre a janela do navegador com a app em ecrã inteiro.
2. Carrega em **Win + Alt + R** para começar a gravar (é a Barra de Jogo do Windows). Para parar, carrega outra vez em Win + Alt + R. O vídeo fica em `Vídeos\Capturas`.
3. Grava os 4 momentos: o pedido da Casa Maré, a aprovação a aparecer no Pipedrive, a fatura e a pesquisa de leads.
4. Tenta não passar dos 2 minutos. Se precisares, grava cada momento em separado.
5. Vê o vídeo uma vez até ao fim, para confirmares que gravou o ecrã certo e que se lê bem.
6. Copia-o também para uma pen USB ou para o telemóvel.

### 3.5 Ensaiar o pitch (30 min)

1. Lê o `kit/pitch/pitch-5min.md` em voz alta três vezes, com o cronómetro do telemóvel.
2. Na primeira volta, lê. Na segunda, olha só para os títulos das secções. Na terceira, fala sem papel e com a app aberta.
3. Se passares dos 5 minutos, corta primeiro na secção 4 ("How it is built"). A demo não se corta.
4. Treina em voz alta as respostas às perguntas do júri que estão no fim do ficheiro do pitch.

### 3.6 Minutos antes de entrar

- Portátil ligado à corrente e notificações desligadas (Windows: Assistência de concentração, ou "Não incomodar").
- Se a rede do evento estiver lenta, põe `LEADS_FALLBACK=true` no `.env.local` e reinicia o `npm run dev`. Assim a pesquisa de leads mostra os 12 hotéis já guardados.
- Hotspot do telemóvel preparado, caso o Wi-Fi caia.
- O vídeo de segurança aberto num separador, pronto para carregares em play.

---

## Se alguma coisa correr mal

| Problema | O que fazer |
|---|---|
| O agente mexe em muitos ficheiros de uma vez | "Stop. Revert to the last commit and do only step N." |
| O agente esquece o objetivo a meio | "Re-read kit/BRIEF.md before continuing." |
| A app não arranca | Cola o erro do terminal no chat: "Fix this error, change nothing else." |
| O Grok responde 401 | A chave ou o nome do modelo no `.env.local` estão errados. Reinicia o `npm run dev` depois de mudar. |
| O Pipedrive responde 401 ou 404 | Token ou domínio errado. O domínio é só o nome, sem `.pipedrive.com`. |
| A pesquisa web não existe no acesso do evento | Liga o `LEADS_FALLBACK=true` e explica no pitch que no produto final usa pesquisa ao vivo. |
| Os especialistas inventam produtos | "Only answer from the catalog JSON. If something is not there, say price/product on request." |
| Falta tempo | Corta por esta ordem: passo 8, depois a escrita de leads no Pipedrive (fica só o CSV), depois o separador Agentes. |

## Cuidados

- **Não ponhas o projeto num repositório público.** O kit tem preços Kettal e imagens dos catálogos. Se o evento pedir um link para o código, usa um repositório privado e partilha o acesso com o júri.
- **Dados reais da Traços não entram.** Só o Pipedrive de teste e faturas fictícias.
- **A pasta `D:\Hackathon-SpaceXAI\catalogos\`** serve para mostrar os PDF se o júri perguntar. Não a copies para dentro do projeto.
