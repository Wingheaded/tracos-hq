# Kit para levar: hackathon SpaceXAI (26–27/10/2026)

Preparado com o Claude a 2026-10-23. Plano do MVP: `../plano-mvp.md`. Cartão: `D:\AIOS\vault\projects\hackathon-spacexai-tracos-hq.md`.

| Pasta | O que tem | Para que serve |
|---|---|---|
| `GUIA-EVENTO.md` | Passo a passo para o evento: preparar o projeto, os 8 prompts para o agente do Cursor, o que testar em cada passo, e o que fazer se algo falhar | **Começar por aqui no evento** |
| `BRIEF.md` | Instruções em inglês para o Cursor | Colar no primeiro minuto |
| `catalog/` | 5 fichas JSON, uma por especialista (Daniel, Tomás, Maya, André, Inês), com marcas, coleções e produtos | Conhecimento dos especialistas |
| `images/` | 32 páginas de catálogo em JPG (uma por coleção-chave) + `index.json` com marca, coleção, PDF e página | Fotos para a proposta exportada |
| `prompts-cursor/` | Os 9 pedidos para colar no chat do Cursor, um por passo (00 a 08) | Construir a app no evento |
| `prompts/` | Orquestrador, especialista (modelo), Finanças, Leads | Instruções dos agentes dentro da app (não se colam) |
| `pipedrive/pipedrive-import.csv` | 8 clientes fictícios, 9 negócios com notas | Importar na conta de teste do Pipedrive |
| `invoices/` | 8 faturas PDF + 3 fotos (uma desfocada) + `answer-key.json` | Demo do agente de Finanças |
| `leads/` | 12 hotéis reais do Algarve (JSON + CSV) com fonte | Plano B se a pesquisa ao vivo falhar |
| `pitch/pitch-5min.md` | Pitch em inglês, cronometrado, com perguntas do júri | Ensaiar |

## De onde vieram os dados

- **Fichas dos especialistas:** perfis de marca e regras dos agentes de voz (`D:\Paulo\VoiceAgentKB`). Os intervalos de preço desses perfis são **indicativos** (vêm de pesquisa de marca, não de tabela) e estão marcados assim.
- **Produtos e coleções (acrescentado a 2026-10-25):** tirados dos **19 PDF exatos que o agente de voz usa**, no bucket `gs://tracos-knowledge-base`. Cada marca indica o PDF de origem em `source_catalogue`. Nas marcas em que o PDF é quase só imagem (Vondom, iSiMAR, Roger Pradier, Archipanels) só há nome e tipo de peça, sem descrição.
  - Os PDF completos (524 MB) e o texto extraído estão **fora do git**, em `D:\Hackathon-SpaceXAI\catalogos\` (texto em `texto\`). Servem para abrir no evento, não entram na app.
  - Cruzamento bucket × `VoiceAgentKB`: 17 PDF iguais. O LZF e o Kriskadecor têm versões diferentes no disco, por isso foram descarregados do bucket.
  - No bucket há três marcas que não estavam nas fichas e foram acrescentadas: Feltouch (acústica), Chameleon e Kriskadecor (escritórios).
  - A a·emotional light não tem catálogo no bucket, por isso a ficha do Daniel não tem produtos dessa marca.
  - A Ofitres deixou de citar Nara e Bimu, que não aparecem no catálogo Issue 01 usado pelo agente.
- **Preços Kettal** (em `maya-outdoor.json`, 89 produtos): extração automática da tabela de preços Kettal 2026, sem IVA, só linhas de produto completo com confiança alta. A família Arc ficou de fora por ter um valor implausível. São indicativos.
- **A pasta `Costs` (custos e margens) não foi lida nem usada.**
- **Pipedrive e faturas:** tudo inventado. Os NIF são falsos (100000001 a 100000008), os emails usam o domínio reservado `example.com` e os telefones são +351 900 000 0xx. Todas as faturas dizem "DOCUMENTO FICTÍCIO".
- **Leads:** empresas reais, só a partir de notícias públicas. Sites e contactos ficaram vazios de propósito.

## Decisões fechadas a 2026-10-25

- **Preços Kettal:** vão para o evento (o bloco `price_samples` fica).
- **Responsáveis por segmento:** confirmados por José.
- **Imagens dos catálogos:** podem aparecer no ecrã do evento.
- **Leads:** as 12 fontes foram verificadas e todas as empresas aparecem na página citada. Mudaram-se as fontes de Palácio de Tavira, Wine & Books, Lagos Marina e Canopy. O Holiday Inn Express Portimão saiu (não estava na fonte) e entrou o Casa de Sada Algarve Beach Resort (Hilton, abertura prevista no 2.º trimestre de 2026).
- **Pipedrive de teste:** importado e verificado pela API (8 organizações, 8 pessoas, 7 negócios abertos, 1 ganho, 1 perdido, sem dados "[Sample]").
- **Faturas:** sem impressora. Em vez disso, abrir o PDF no ecrã do computador e fotografá-lo com o telemóvel, um pouco de lado. As 3 fotos já geradas (`*-photo.jpg`) também servem.

## O que era para confirmar (histórico)

1. **Preços Kettal no evento:** os preços passam pelo Grok, que é uma ferramenta externa. Se preferires não os levar, apaga o bloco `price_samples` de `maya-outdoor.json`. Os especialistas passam a dizer "preço sob consulta".
2. **Leads:** abre os 12 links. Algumas datas de abertura variam entre fontes (Masana, Holiday Inn Portimão).
3. **Pipedrive de teste:** cria a conta e importa o CSV (Importar dados → Folha de cálculo; cada linha cria organização + pessoa + negócio + nota). O negócio "Esplanada Central" está como perdido, e o primeiro da Casa Maré como ganho.
4. **Faturas em foto:** imprime 2 ou 3 PDF e fotografa-os com o telemóvel. Fica mais real do que as JPG geradas.
5. **Responsáveis por segmento**, segundo os agentes de voz: João (iluminação), Joana (acústica), Paulo (exterior), Célia (escritórios), Nelson (biofilia). Confirma se estão certos.
6. **Imagens de catálogo:** são páginas inteiras dos catálogos das marcas. Servem para propostas internas e para a demo. Confirma se podem aparecer no ecrã do evento.
