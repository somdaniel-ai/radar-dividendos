# Radar de Dividendos

Aplicação pessoal para analisar ações e ETFs de dividendos disponíveis na XTB, gerir a carteira, simular investimentos e receber alertas. Funciona no PC e no iPhone (instalável como app, sem App Store) e é gratuita de alojar.

> **Ferramenta de apoio pessoal. Não constitui aconselhamento financeiro nem fiscal.**

## Estado do projeto

| Fase | Descrição | Estado |
|---|---|---|
| 0 | Preparação (ferramentas, pastas, repositório) | ✅ concluída |
| 1 | Motor de dados (pipeline) com a lista inicial | ✅ concluída |
| 2 | App: Radar, página da ação e Definições | ✅ concluída |
| 3 | Universo completo da XTB | ⏳ |
| 4 | Supabase: login e carteira | ⏳ |
| 5 | Simulador, Meta de rendimento e Projeção | ⏳ |
| 6 | Calendário, Alertas (Telegram) e "Atualizar agora" | ⏳ |
| 7 | Afinações | ⏳ |

## Estrutura das pastas

| Pasta | Para que serve |
|---|---|
| `pipeline/` | O "motor de dados" em Python: descarrega preços e dividendos (Yahoo Finance), faz os cálculos e gera os ficheiros de dados que a app lê. |
| `pipeline/universo/` | Lista de ações a analisar (`universo_xtb.csv`) e tabela de conversão de símbolos XTB → Yahoo (`sufixos.csv`). Pode ser editada à mão. |
| `app/` | A aplicação web (o que se vê no browser/iPhone), feita em React. |
| `.github/workflows/` | Tarefas automáticas do GitHub (ex.: atualizar os dados todas as noites). |
| `privado/` | Os seus ficheiros pessoais (Excel, extratos da XTB). **Nunca é enviada para o GitHub** — está bloqueada no `.gitignore`. |

## Programas necessários (no Windows)

- Git
- Node.js (versão LTS)
- Python 3.12
- GitHub CLI (`gh`)

## A app

**Endereço:** https://somdaniel-ai.github.io/radar-dividendos/

| Página | O que tem |
|---|---|
| **Radar** | Todas as ações com dividendos, ordenadas pela pontuação. No PC aparece uma tabela (clique no título de uma coluna para ordenar); no telemóvel aparecem cartões, com "Ordenar por". Tem pesquisa, separadores por categoria (Empresas, REIT, BDC, Fundos fechados) e filtros: setor, país, moeda, frequência, nível de cor, yield, payout, só abaixo do preço justo, esconder armadilhas e esconder fora dos limites de yield. |
| **Página da ação** | Todas as métricas, gráfico dos dividendos por ano (normal e extraordinário), gráfico do preço com o preço justo e os máximos/mínimos, explicação do nível de cor e da pontuação, próximas datas e as suas notas. |
| **Favoritos** | As ações marcadas com ☆. |
| **Definições** | Todos os parâmetros ⚙️. As alterações recalculam o radar na hora. Botão "Repor valores por defeito". |
| **Sobre** | Aviso legal, explicação dos cálculos, legenda das cores e estado da última atualização. |

> Por agora, **favoritos, notas e definições ficam guardados no próprio aparelho** (PC ou iPhone). Na Fase 4 passam para o Supabase e ficam sincronizados.

### Instalar no iPhone

1. Abra o **Safari**. Tem de ser o Safari, não o Chrome.
2. Vá a https://somdaniel-ai.github.io/radar-dividendos/
3. Toque no botão **Partilhar**: o quadrado com uma seta para cima, na barra de baixo.
4. Deslize a lista para baixo e toque em **"Adicionar ao ecrã principal"**.
5. Confirme o nome ("Dividendos") e toque em **Adicionar**.
6. A app aparece no ecrã principal com o ícone do radar e abre em ecrã inteiro, como uma app normal.

### Instalar no PC (Chrome ou Edge)

1. Abra https://somdaniel-ai.github.io/radar-dividendos/
2. Na barra de endereço, à direita, clique no ícone de **instalar**: um ecrã com uma seta. Em alternativa, abra o menu **⋮** e escolha **"Instalar Radar de Dividendos"** (no Edge: **Aplicações → Instalar este site como uma aplicação**).
3. A app fica no menu Iniciar e pode ser afixada na barra de tarefas.

A app funciona **sem internet** com os dados da última vez que foi aberta. Quando há uma versão nova, atualiza-se sozinha.

### Experimentar a app no PC antes de publicar

Primeiro corra o pipeline (ver abaixo). Depois, num terminal:

```
cd app
npm install
npm run dev
```

Abra o endereço que aparece (normalmente http://localhost:5173/radar-dividendos/).

| Comando (dentro de `app`) | O que faz |
|---|---|
| `npm test` | Testes da app, incluindo o teste de paridade: confirma que as fórmulas da app dão os mesmos resultados que o pipeline, para 33 ações reais e 5 conjuntos de Definições |
| `npm run build` | Constrói a versão final da app na pasta `app/dist` |
| `npm run icones` | Volta a gerar os ícones a partir de `public/icone.svg` |

### Publicação automática

A tarefa **"Publicar app"** do GitHub (`.github/workflows/publicar.yml`) faz tudo sozinha:
1. descarrega os dados;
2. corre os testes;
3. constrói a app;
4. publica-a.

Corre sempre que há alterações. Também pode ser lançada à mão: no GitHub, separador **Actions** → **Publicar app** → **Run workflow**.

## Motor de dados (pipeline)

O pipeline vai buscar ao Yahoo Finance os preços, os dividendos e o perfil de cada ação da lista, faz todos os cálculos e grava ficheiros na pasta `data/`:

| Ficheiro | Conteúdo |
|---|---|
| `data/radar.json` | Resumo de todas as ações que pagaram dividendos nos últimos 24 meses, ordenadas pela pontuação |
| `data/acoes/<TICKER>.json` | Detalhe de cada ação: histórico de dividendos, valores por ano, preços para gráficos |
| `data/cambios.json` | Câmbios para EUR |
| `data/meta.json` | Data/hora da atualização, ações sem dividendos recentes e erros |
| `data/definicoes_padrao.json` | Valores por defeito de todos os parâmetros ⚙️ |

### Primeira instalação (só uma vez)

Abra um terminal no VS Code (**Terminal → Novo Terminal**) e escreva:

```
cd pipeline
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
```

### Utilização

Dentro da pasta `pipeline`:

| O que quer fazer | Comando |
|---|---|
| Atualizar os dados de todas as ações (15–20 min na 1.ª vez, depois mais rápido) | `.venv\Scripts\python -m radar.gerar` |
| Atualizar só algumas ações (as restantes ficam no radar como estavam) | `.venv\Scripts\python -m radar.gerar --tickers KO.US,NOS.PT` |
| Correr os testes automáticos dos cálculos | `.venv\Scripts\python -m pytest` |
| Recriar a lista de ações a partir do Excel antigo e do extrato da XTB | `.venv\Scripts\python ferramentas\importar_excel.py` |
| Comparar os resultados com o Excel (grava em `privado/comparacao_excel.md`) | `.venv\Scripts\python ferramentas\comparar_excel.py` |
| Gerar a amostra para o teste de paridade da app (depois de mudar fórmulas) | `.venv\Scripts\python ferramentas\gerar_amostra_app.py` |

### Lista de ações e símbolos

- `pipeline/universo/universo_xtb.csv`: as ações a analisar. Colunas: `ticker_xtb` (ex.: `KO.US`), `nome`, `tipo` (`ACAO`, `ETF` ou `FUNDO`), `ativo` (`sim`/`nao`) e, opcionalmente, `ticker_yahoo`, para forçar um símbolo do Yahoo.
- `pipeline/universo/sufixos.csv`: a conversão dos sufixos da XTB para os do Yahoo (ex.: `.UK` → `.L`, `.PT` → `.LS`).
- `pipeline/universo/descobertos.csv`: símbolos que o pipeline encontrou sozinho pela pesquisa no Yahoo, guardados para não repetir a pesquisa.
- `pipeline/universo/extraordinarios.csv`: dividendos extraordinários pagos **no mesmo dia** que o normal. O Yahoo junta os dois num só valor, por isso nenhuma regra automática os consegue separar. Exemplo: a NOS pagou em 2023 0,278 € normal + 0,152 € extra = 0,43 €. Colunas: `ticker_xtb`, `data` (data ex-dividendo), `valor_extraordinario`, `nota`.

> **Ações canadianas** (Telus, Enbridge, TD…): na XTB estão na bolsa de Nova Iorque (ex.: `TU.US`). O **rendimento** é calculado com os dados de Toronto (`T.TO`), porque é lá que o dividendo é declarado em CAD; assim o preço e o dividendo ficam na mesma moeda. A **carteira** é avaliada pela cotação da linha que tem na XTB (ex.: TU.US em USD), que vem no campo `cotacao_xtb` de cada ação.

### Atualização parcial e falhas

- `--tickers` só atualiza as ações pedidas; as outras ficam no radar tal como estavam.
- Se o Yahoo falhar numa ação, fica a versão anterior, marcada como `desatualizado`. A ação não desaparece do radar.
- `data/meta.json` indica se a última execução foi completa ou parcial, quais as ações atualizadas e a data da última atualização completa.

### Categorias

Cada ação recebe uma `categoria`, detetada pela descrição do Yahoo:

| Categoria | O que é |
|---|---|
| `EMPRESA` | Empresa normal |
| `REIT` | Imobiliário |
| `BDC` | Empresa de crédito a outras empresas |
| `CEF` | Fundo fechado |
| `ETF` | Fundo cotado |

- Para forçar uma categoria, escreva `REIT`, `BDC`, `CEF` ou `ETF` na coluna `tipo` de `universo_xtb.csv`.
- Os **fundos fechados (CEF)** mostram um aviso: a distribuição pode incluir **devolução de capital**, ou seja, parte do que recebe pode ser o seu próprio dinheiro devolvido, e não rendimento.

### Como os cálculos funcionam (resumo)

Os valores entre parênteses são os valores por defeito. Todos podem ser alterados em `pipeline/radar/parametros.py` e, a partir da Fase 2, nas Definições da app.

- **Frequência:** usa a mediana dos últimos 6 intervalos entre pagamentos.
- **Extraordinários** (ficam fora do rendimento "normal" e da consistência):
  - um dividendo maior do que 2× os vizinhos;
  - num ano com mais pagamentos do que o normal, o pagamento a mais que chega fora do ritmo;
  - os que estão registados em `extraordinarios.csv`.
- **Dividendo anual:** último dividendo normal × pagamentos por ano, como no Excel. Também é mostrado o total dos últimos 12 meses (TTM).
- **Yield:** bruto = dividendo anual ÷ preço; líquido = bruto × (1 − imposto) (imposto 30%).
- **Impostos, modo avançado:** retenção no país de origem + imposto em Portugal, com desconto da retenção até ao limite da convenção. Exemplo para os EUA: com W-8BEN, 15% + 13% = 28%; sem W-8BEN, 30% + 13% = 43%. **Estas taxas devem ser confirmadas por si.**
- **Preço justo:** dividendo anual ÷ yield alvo (6%).
- **Atraso:** se o pagamento esperado passou há mais de 30 dias e não há nova data anunciada, a ação é marcada **"Possivelmente suspenso"**.
- **Consistência:** contada por anos civis completos (o ano corrente não conta). Um ano conta como **corte** se o dividendo anual descer mais de 10%. Um pagamento que só passou de dezembro para janeiro não conta como corte.
- **Níveis de cor:**

  | Nível | Cor | Regra |
  |---|---|---|
  | 6 | Dourado escuro | ≥ 10 anos sem cortes e aumento em ≥ 8 dos últimos 10 anos (ou ≥ 5 anos seguidos de aumento) |
  | 5 | Dourado claro | ≥ 10 anos sem cortes |
  | 4 | Verde escuro | 5–9 anos sem cortes |
  | 3 | Verde médio | 3–4 anos sem cortes e nenhum corte nos últimos 5 anos |
  | 2 | Verde claro | menos de 3 anos sem cortes, ou 1 corte nos últimos 5 anos |
  | 1 | Verde muito claro | pagamentos irregulares, 2 ou mais cortes em 5 anos, ou menos de 4 pagamentos |
  | — | Alerta | possivelmente suspenso ou dados em falta |
- **Pontuação (0–100):**
  - 50% rendimento (yield líquido entre 3% e 20%);
  - 35% consistência;
  - 15% preço atrativo (abaixo do preço justo e perto do mínimo de 52 semanas);
  - −15 pontos por cada sinal de "armadilha": yield líquido acima de 20%, payout acima de 100%, queda do preço de mais de 30% em 12 meses, ou dividendo atrasado.
  - O sinal de payout **não conta** para REIT, BDC, fundos fechados e ETF. Nestes casos o lucro contabilístico não mostra o dinheiro que têm para distribuir. Esta regra pode ser alterada nas Definições.

## Segurança

O repositório é **público**. Dados pessoais, chaves e tokens nunca são guardados no código: ficam na pasta `privado/` (ignorada pelo Git) ou nos "segredos" do GitHub/Supabase.
