# Radar de Dividendos

Aplicação pessoal para analisar ações e ETFs de dividendos disponíveis na XTB, gerir a carteira, simular investimentos e receber alertas. Funciona no PC e no iPhone (instalável como app, sem App Store) e é gratuita de alojar.

> **Ferramenta de apoio pessoal. Não constitui aconselhamento financeiro nem fiscal.**

## Estado do projeto

| Fase | Descrição | Estado |
|---|---|---|
| 0 | Preparação (ferramentas, pastas, repositório) | ✅ concluída |
| 1 | Motor de dados (pipeline) com a lista inicial | ✅ concluída |
| 2 | App: Radar, página da ação e Definições | ✅ concluída |
| 3 | Universo completo da XTB | ✅ concluída |
| 4 | Supabase: login e carteira | ✅ concluída |
| 5 | Simulador, Meta de rendimento e Projeção | ⏳ |
| 6 | Calendário, Alertas (Telegram) e "Atualizar agora" | ⏳ |
| 7 | Afinações | ⏳ |

## Estrutura das pastas

| Pasta | Para que serve |
|---|---|
| `pipeline/` | O "motor de dados" em Python: descarrega preços e dividendos (Yahoo Finance), faz os cálculos e gera os ficheiros de dados que a app lê. |
| `pipeline/universo/` | Lista de ações a analisar (`universo_xtb.csv`) e tabela de conversão de símbolos XTB → Yahoo (`sufixos.csv`). Pode ser editada à mão. |
| `supabase/migracoes/` | Os comandos SQL que criam as tabelas da conta no Supabase (só a estrutura; nunca dados). |
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
| **Radar** | Todas as ações com dividendos, ordenadas pela pontuação. No PC aparece uma tabela que ocupa a largura do ecrã (clique no título de uma coluna para ordenar). Ao descer a página, os títulos das colunas ficam presos debaixo da barra do topo. O botão **Colunas** escolhe as colunas visíveis (por defeito ficam escondidas Yield bruto, Frequência e Pos. 52s). Só numa janela muito estreita aparece scroll para o lado, com o nome da ação sempre fixo. No telemóvel aparecem cartões, com "Ordenar por". Mostra 100 de cada vez (botões "Mostrar mais" e "Mostrar todas"). Tem pesquisa, separadores por categoria (Empresas, REIT, BDC, Fundos fechados) e filtros: setor, país, moeda, frequência, nível de cor, yield, payout, só abaixo do preço justo, esconder armadilhas e esconder fora dos limites de yield. |
| **Página da ação** | Todas as métricas e os dois preços justos, com a frase "hoje rende X%, quando costuma render Y%". Gráfico dos dividendos **por ano** ou **por pagamento** (5 anos / 10 anos / tudo): normais a azul, extraordinários a laranja, aumentos a verde e cortes a vermelho; ao tocar num ponto vê a data, o valor e a variação. Também tem o gráfico do preço, a explicação do nível de cor e da pontuação, as próximas datas, os possíveis extraordinários, a descrição da empresa (tradução automática, com "ver original") e as suas notas. Se a mesma empresa existir na XTB em várias bolsas ou moedas (mesmo ISIN), mostra todas as versões, com a versão **em EUR** assinalada (evita a comissão de conversão de moeda). |
| **Favoritos** | As ações marcadas com ☆. |
| **Carteira** 💼 | As suas posições, importadas do extrato da XTB (ou compras escritas à mão): quantidade, preço médio e lotes de cada ação, dividendos **reais** recebidos (por mês, por ano e por ação) comparados com o previsto, aviso quando a retenção na fonte é maior do que devia (ex.: 30% nos EUA sem o W-8BEN, em vez de 15%) e a diversificação por setor, país, moeda e categoria. No Radar, as ações que já tem aparecem com 💼. |
| **Simular** 🧮 | **Simulador** — *Cada ação*: com X € (por defeito o valor das Definições), quantas ações compraria em cada ação do Radar (frações permitidas) e quanto receberia por mês e por ano, bruto e líquido; separadores por categoria, ⭐ Favoritos e 💼 Carteira. *Distribuição*: várias ações com percentagens (têm de somar 100%), com o nível, yield, pontos, setor, país/moeda, ⚠️ armadilhas, ✓ abaixo do preço justo e 💼 quanto já tem investido em cada uma; resumo em % por setor, categoria, país, moeda e nível; botões "Partes iguais" e "Adicionar todos os favoritos"; **cenários** guardados com nome (no aparelho e na conta). **Meta de rendimento** — "quero X € por mês líquidos": escolhe as melhores pontuações respeitando os limites ⚙️ (máximo por empresa e por setor, nível mínimo, sem armadilhas) e mostra o capital necessário e a distribuição, que pode abrir no Simulador. **Projeção** — a partir da carteira, de um cenário guardado ou de valores à mão: entrada mensal, anos, reinvestir os dividendos (sim/não), crescimento do dividendo (histórico dos últimos 5 anos das suas ações, pesado pelo valor e limitado a ±15%, ou manual) e do preço (manual); gráficos do valor e do rendimento mensal ano a ano e a tabela com os mesmos números. Se o yield de partida passar de 10%, aparece um aviso (yields altos vêm muitas vezes com descidas do preço e cortes) e o botão **Ver cenário prudente** (preço e dividendo a descer 3% por ano), com "Voltar aos valores anteriores". Não é aconselhamento financeiro. |
| **Definições** | Cartão **Conta** (entrar com o GitHub e estado da sincronização). Todos os parâmetros ⚙️. As alterações recalculam o radar na hora. Botão "Repor valores por defeito". **Colunas do Radar** (as mesmas do botão Colunas). Cartão **Universo**: quantos instrumentos o motor acompanha e um espaço para colar ou importar uma lista de símbolos (ex.: da XTB) — mostra o estado de cada um, junta-os aos favoritos e copia os que faltam. |
| **Sobre** | Aviso legal, explicação dos cálculos, legenda das cores e estado da última atualização. |

### Conta e sincronização (Supabase)

Sem sessão iniciada, tudo fica **só no aparelho**. Com o botão **Entrar** (login com o GitHub), a carteira, os favoritos, as notas, as definições, as colunas do Radar e as decisões sobre extraordinários ficam guardados na sua conta e aparecem iguais no PC e no iPhone.

- **Primeiro login num aparelho:** junta o que está no aparelho com o que está na conta, sem perder nada (se a mesma coisa existir nos dois lados, ganha a conta).
- **Depois disso**, cada alteração vai logo para a conta. Ao voltar à app, lê-se a versão da conta.
- **Sem rede:** as alterações ficam guardadas no aparelho e são enviadas quando a ligação voltar (o ícone mostra ⚠️ enquanto houver alterações por enviar).
- **Sair** apaga a cópia deste aparelho; os dados continuam na conta.
- Os dados estão no Supabase (UE, Irlanda). Cada tabela tem **RLS** (cada conta só vê as suas linhas) e a criação de contas novas está **desligada**: só a sua conta existe.

### Importar o extrato da XTB

1. Na XTB (xStation): **Histórico da conta** → exportar para Excel (`.xlsx`), com o período todo.
2. Na app: **Carteira** → **Importar extrato da XTB** → escolher o ficheiro.
3. A app mostra uma pré-visualização: quantas operações reconheceu e se as posições calculadas **batem certo** com a folha `Open Positions` do extrato. Só grava se confirmar.
4. Pode importar outra vez mais tarde: operações repetidas não são duplicadas (cada uma tem o ID da XTB).
5. Se escreveu uma compra à mão e ela aparecer depois no extrato (mesma ação, mesmo dia e mesma quantidade), a compra à mão é **substituída** pela do extrato, para não contar duas vezes. A pré-visualização mostra quais.

O ficheiro é lido **só no browser**: não é enviado para lado nenhum, e o número de conta nunca é lido. Só as operações (compras, vendas, dividendos, retenções…) vão para a sua conta.

### Instalar no iPhone

> Se já tinha a app instalada e quer usar a conta: abra a app → **Definições** → **Entrar com GitHub** (ver "Entrar no iPhone" abaixo).

1. Abra o **Safari**. Tem de ser o Safari, não o Chrome.
2. Vá a https://somdaniel-ai.github.io/radar-dividendos/
3. Toque no botão **Partilhar**: o quadrado com uma seta para cima, na barra de baixo.
4. Deslize a lista para baixo e toque em **"Adicionar ao ecrã principal"**.
5. Confirme o nome ("Dividendos") e toque em **Adicionar**.
6. A app aparece no ecrã principal com o ícone do radar e abre em ecrã inteiro, como uma app normal.

#### Entrar no iPhone

1. Abra a app a partir do ícone no ecrã principal.
2. Toque em **Definições** (barra de baixo) → cartão **Conta** → **Entrar com GitHub**.
3. Abre-se a página do GitHub: entre com o seu utilizador e palavra-passe (e o código de verificação, se tiver). Se pedir, toque em **Authorize**.
4. Volta sozinho à app, com "Sessão iniciada como …" e "☁️ Sincronizado". A carteira, os favoritos e as definições do PC aparecem.
5. Se não voltar à app com a sessão iniciada (por exemplo, se a página acabar no **Safari**), feche essa página, abra a app pelo ícone e repita o passo 2: o GitHub já se lembra de si, por isso costuma bastar um toque.

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
| `npm run verificar` | Depois do `build`: abre a app num **browser a sério** (o Edge do PC, ou o Chrome no GitHub) e confirma que todas as páginas abrem sem erros, que a tabela do Radar cabe em ecrãs de 1366 e 1920 px sem scroll para o lado e que os títulos ficam presos. Guarda capturas de ecrã em `app/verificacao/` (não vai para o Git). |
| `npm run icones` | Volta a gerar os ícones a partir de `public/icone.svg` |

### Publicação automática

A tarefa **"Publicar app"** do GitHub (`.github/workflows/publicar.yml`) faz tudo sozinha:
1. descarrega os dados;
2. corre os testes;
3. constrói a app;
4. publica-a.

Quando corre:
- **todas as noites** às 02:15 UTC (02:15 em Lisboa no inverno, 03:15 no verão), com até 3 horas para os dados;
- quando há alterações ao código (atualização curta, de 20 minutos, só para publicar);
- à mão: no GitHub, separador **Actions** → **Publicar app** → **Run workflow** (pode indicar quantos minutos).

Antes de publicar, a tarefa corre os testes e a verificação num browser (`npm run verificar`). Se alguma página não abrir, **não publica**, e a versão anterior continua no ar.

Se uma página da app falhar no seu aparelho, aparece uma mensagem em português ("Ups, esta página teve um problema"), com os botões "Tentar outra vez" e "Recarregar a app", em vez de um ecrã em branco. O menu continua a funcionar.

#### Onde fica a cópia local dos dados

A cópia local dos dados tem os preços, a triagem, as traduções e a lista da XTB: são `pipeline/cache/` e `data/`, com ~200–300 MB quando o universo estiver completo.
- **Nunca vai para o Git:** as duas pastas estão no `.gitignore`. Assim, o repositório não cresce todas as noites.
- **Fica na cache do GitHub Actions**, que não tem histórico. Cada execução guarda uma cópia nova; no fim, o passo "Arrumar a cache" apaga as antigas e ficam só as 3 mais recentes.
- **É guardada mesmo que algum passo falhe**, para a noite seguinte continuar onde parou.
- **Limites do GitHub (grátis):** até 10 GB de cache por repositório. Uma cache que não seja usada durante 7 dias é apagada automaticamente.

**Se a cache for apagada** (ex.: as atualizações pararam mais de 7 dias):
1. Na noite seguinte, a tarefa vai buscar ao **site publicado** o radar, as páginas das ações, as traduções e o estado de cada instrumento (`data/universo.json`). O script é `pipeline/ferramentas/recuperar_publicado.py`.
2. A triagem é reconstruída a partir daí. Quem estava sem dividendos não volta a ser verificado antes dos 60 dias.
3. O radar continua visível, com as ações marcadas como desatualizadas até serem atualizadas.
4. Só os **preços históricos** voltam a ser descarregados: as ~3 000 ações do radar levam 1 a 2 noites.
5. O modelo de tradução volta a ser preparado sozinho (~10 minutos).

Não se perde nada que não se recupere sozinho. Os seus favoritos, notas e definições estão no aparelho e não dependem disto.

#### A atualização noturna nunca se desliga sozinha

Num repositório público sem alterações durante **60 dias**, o GitHub desliga as tarefas agendadas. Como os dados não vão para o Git, isto podia acontecer. Por isso, a cada execução, o primeiro passo ("Manter a atualização noturna ativa") volta a ativar a tarefa pela API do GitHub (`PUT …/actions/workflows/publicar.yml/enable`). Isso conta como atividade e reinicia o contador. **Não há commits automáticos** e o histórico do repositório não cresce.

Se mesmo assim a tarefa for desligada (o GitHub envia um email a avisar), basta ir ao separador **Actions** → **Publicar app** → **Enable workflow**.

#### O Supabase nunca adormece

O plano gratuito do Supabase pausa projetos sem atividade durante uma semana. Todas as noites, a atualização chama a função `ping()` do Supabase (só devolve "ok", não lê dados de ninguém), o que conta como atividade. Se o Supabase estiver em baixo, o resto da atualização continua.

#### Aviso de falhas

Se a atualização noturna falhar **3 noites seguidas**, aparece um aviso vermelho no topo de todas as páginas da app. A página **Sobre** explica o que fazer. Há dois casos:
- **A noite falhou de todo e não publicou nada:** a app vê que a "última atualização noturna bem-sucedida" (`ultima_noite_ok` em `data/meta.json`) tem mais de 3 dias.
- **A noite publicou, mas com problemas** (o Yahoo bloqueou ou nada foi processado): o pipeline conta essas noites em `noites_com_problemas`.

As atualizações curtas, feitas depois de uma alteração ao código, não contam. Na Fase 6 o aviso passa a ir também para o Telegram.

## Motor de dados (pipeline)

O pipeline vai buscar ao Yahoo Finance os preços, os dividendos e o perfil de cada ação da lista, faz todos os cálculos e grava ficheiros na pasta `data/`:

| Ficheiro | Conteúdo |
|---|---|
| `data/radar.json` | Resumo de todas as ações que pagaram dividendos nos últimos 24 meses, ordenadas pela pontuação |
| `data/acoes/<TICKER>.json` | Detalhe de cada ação: histórico de dividendos, valores por ano, preços para gráficos |
| `data/cambios.json` | Câmbios para EUR |
| `data/meta.json` | Data/hora da atualização, universo, triagem, traduções e erros |
| `data/universo.json` | Estado de cada instrumento do universo (no radar, sem dividendos, por verificar…) |
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
| Atualizar os dados (só a lista manual) | `.venv\Scripts\python -m radar.gerar` |
| Atualizar com a lista completa da XTB, durante no máximo 30 minutos (PowerShell) | `$env:RADAR_LISTA_XTB="sim"; $env:RADAR_MINUTOS_DADOS="30"; .venv\Scripts\python -m radar.gerar` |
| Atualizar só algumas ações (as restantes ficam no radar como estavam) | `.venv\Scripts\python -m radar.gerar --tickers KO.US,NOS.PT` |
| Correr os testes automáticos dos cálculos | `.venv\Scripts\python -m pytest` |
| Recriar a lista de ações a partir do Excel antigo e do extrato da XTB | `.venv\Scripts\python ferramentas\importar_excel.py` |
| Comparar os resultados com o Excel (grava em `privado/comparacao_excel.md`) | `.venv\Scripts\python ferramentas\comparar_excel.py` |
| Gerar a amostra para o teste de paridade da app (depois de mudar fórmulas) | `.venv\Scripts\python ferramentas\gerar_amostra_app.py` |

### Universo: lista da XTB + lista manual

O universo junta duas listas:
1. **A lista oficial da XTB**: o PDF público "Tabela de especificações – Instrumentos do mercado organizado (OMI)", com ações e ETF reais (não CFD). O `robots.txt` do site não proíbe este ficheiro. Para não sobrecarregar o site, é descarregado **no máximo uma vez por semana**; se falhar, usa-se a última cópia. Código: `pipeline/radar/xtb.py`.
   - **Termos da XTB** (lidos em novembro de 2026): o "Disclaimer do Website" só diz que a informação do site não é uma recomendação de investimento. O Regulamento de clientes (ponto 5.22) proíbe redistribuir ou descarregar **dados de mercado da Plataforma de Negociação** (preços e dados fundamentais, que são de terceiros). O PDF público da lista de instrumentos não é a plataforma e não tem preços. A app também não publica o PDF: só a lista de símbolos e nomes. Os preços vêm do Yahoo, não da XTB.
2. **A lista manual** (`pipeline/universo/universo_xtb.csv`). É esta que manda: os símbolos forçados mantêm-se, e uma linha com `ativo=nao` tira um instrumento do radar mesmo que esteja na lista da XTB.

Regras (código em `pipeline/radar/universo.py`):
- entram **ações** (incluindo REIT, BDC e fundos fechados) e **ETF de distribuição**, e também os ETF sem indicação;
- ficam de fora os **ETF de acumulação** e os **ETC/ETN**, que não pagam dividendos;
- a mesma empresa ou fundo (mesmo ISIN) entra **uma só vez**: na bolsa "de casa" no caso das ações, na linha em euros no caso dos ETF;
- as outras linhas da XTB com o mesmo ISIN (outras bolsas/moedas, ou o símbolo antigo da empresa) ficam guardadas como **versões** e aparecem na página da ação, com a versão em EUR em primeiro;
- **ações canadianas em Nova Iorque**: dividendos de Toronto (`.TO`) e cotação da linha da XTB. Se não existir em Toronto, usa-se a de Nova Iorque.

### Triagem e atualização noturna

São milhares de instrumentos, por isso o motor faz uma **triagem** e guarda o resultado de cada um em `pipeline/cache/triagem.json`:
- **Instrumentos novos:** verificação leve, só com os últimos ~2 anos. Se não pagaram dividendos nos últimos 24 meses, ficam fora do radar, sem guardar dados, e voltam a ser verificados **de 2 em 2 meses**.
- **Ordem de cada noite:**
  1. as ações do radar, primeiro as atualizadas há mais tempo;
  2. as novas, primeiro as da lista manual;
  3. as que já chegou a altura de rever.
- **Limite de tempo** (`RADAR_MINUTOS_DADOS`, 180 minutos à noite): o que não couber fica para a noite seguinte. As ações do radar que não foram atualizadas continuam lá, marcadas como desatualizadas se tiverem mais de 2 dias.
- **Proteção contra bloqueios do Yahoo:** se o Yahoo recusar pedidos ("Too Many Requests"), o motor faz uma pausa de 2 minutos. Ao 3.º bloqueio para por hoje, sem marcar nada como erro.
- **Espaço:** os preços guardam-se comprimidos, com todos os dias dos últimos 12 anos. Dos anos anteriores ficam só os dias com os máximos e mínimos de cada mês, para os valores "de sempre" continuarem exatos. Os dividendos guardam-se todos.
- **Estado:** `data/meta.json`, em "universo" e "triagem"; na app, em **Definições → Universo** e em **Sobre**.

### Lista de ações e símbolos

- `pipeline/universo/universo_xtb.csv`: a lista manual (ver acima). Colunas: `ticker_xtb` (ex.: `KO.US`), `nome`, `tipo` (`ACAO`, `ETF` ou `FUNDO`), `ativo` (`sim`/`nao`) e, opcionalmente, `ticker_yahoo`, para forçar um símbolo do Yahoo.
- `pipeline/universo/sufixos.csv`: a conversão dos sufixos da XTB para os do Yahoo (ex.: `.UK` → `.L`, `.PT` → `.LS`).
- `pipeline/universo/descobertos.csv`: símbolos que o pipeline encontrou sozinho pela pesquisa no Yahoo, guardados para não repetir a pesquisa.
- `pipeline/universo/extraordinarios.csv`: dividendos extraordinários pagos **no mesmo dia** que o normal. O Yahoo junta os dois num só valor, por isso nenhuma regra automática os consegue separar. Exemplo: a NOS pagou em 2023 0,278 € normal + 0,152 € extra = 0,43 €. Colunas: `ticker_xtb`, `data` (data ex-dividendo), `valor_extraordinario`, `nota`.

> **Ações canadianas** (Telus, Enbridge, TD…): na XTB estão na bolsa de Nova Iorque (ex.: `TU.US`). O **rendimento** é calculado com os dados de Toronto (`T.TO`), porque é lá que o dividendo é declarado em CAD; assim o preço e o dividendo ficam na mesma moeda. A **carteira** é avaliada pela cotação da linha que tem na XTB (ex.: TU.US em USD), que vem no campo `cotacao_xtb` de cada ação.

### Possíveis extraordinários (a confirmar)

O pipeline assinala automaticamente pagamentos que parecem extraordinários. Os critérios são:
- um pagamento isolado, mais de 1,5× acima dos outros pagamentos desse ano e dos pagamentos vizinhos;
- um salto de mais de 25% seguido de uma descida de mais de 15%, comparando com o **mesmo** pagamento do ano anterior e do ano seguinte. Assim, o ritmo "intercalar pequeno + final grande" de muitas empresas europeias não conta como extraordinário.

Funciona assim:
1. Os pagamentos assinalados aparecem com ❓ e numa lista nas **Definições**, onde pode confirmar cada um (indicando a parte extra) ou rejeitá-lo.
2. Enquanto não decidir, contam como normais.
3. Com sessão iniciada, as decisões ficam na conta e o pipeline **lê-as sozinho todas as noites**. As ações com decisões novas são as primeiras a ser recalculadas.
4. Sem sessão, ficam só no aparelho. O botão **Copiar decisões** gera as linhas para `extraordinarios.csv` (confirmados) e `extraordinarios_rejeitados.csv` (rejeitados), que também continuam a ser lidos. Se a mesma data estiver nos dois lados, ganha a decisão da conta.

**Como o pipeline lê as decisões com o mínimo de acesso:** não usa a chave secreta do Supabase (que daria acesso a tudo, incluindo a carteira). Usa a chave publicável (pública) e uma **chave do motor**, guardada nos Secrets do GitHub como `SUPABASE_CHAVE_MOTOR`. Essa chave só serve para chamar a função `decisoes_motor`, que devolve apenas ticker, data, decisão e parte extra (ver `supabase/migracoes/0002_motor_decisoes.sql`). No Supabase fica só a "impressão digital" (SHA-256) da chave. Para trocar a chave: no SQL Editor, `select privado.nova_chave_motor();` e copiar o resultado para o segredo do GitHub (a antiga deixa de funcionar). Sem o segredo, o pipeline usa só os ficheiros CSV.

A lista completa fica em `data/extraordinarios_suspeitos.json`.

### Traduções

- **Setores, indústrias, países e tipos de instrumento** são traduzidos com uma tabela fixa, em `pipeline/radar/traducoes.py`. Termos novos que não estejam na tabela ficam em inglês e aparecem em `data/meta.json` ("termos_sem_traducao").
- A tabela de impostos por país usa os nomes em português (ex.: "Estados Unidos", "Canadá").
- **Descrições das empresas:** são traduzidas uma vez por empresa e guardadas em cache (`pipeline/cache/traducoes.json`). Só voltam a ser traduzidas se o texto original mudar. Se a tradução falhar, a app mostra o original com a nota "tradução indisponível" e a tradução é tentada de novo na atualização seguinte.
  - **Serviço (ligado):** modelo de código aberto **OPUS-MT** (`Helsinki-NLP/opus-mt-tc-big-en-pt`, da Universidade de Helsínquia, licença CC-BY-4.0). Corre no próprio GitHub Actions: **sem contas, chaves, cartões nem limites**. Usa a variante europeia do modelo (marca `>>por<<`; a do Brasil seria `>>pob<<`).
  - **Português de Portugal:** depois da tradução aplica-se uma tabela de correções (`pipeline/radar/ptpt.py`), por exemplo: registro → registo, usuário → utilizador, treinamento → formação, controle → controlo, "com suas filiais" → "com as suas filiais", "está fornecendo" → "está a fornecer". Para acrescentar uma correção basta juntar uma linha à tabela.
  - **O modelo:** é convertido uma vez para um formato rápido (CTranslate2, `int8`, ~230 MB) por `pipeline/ferramentas/preparar_modelo.py` e fica guardado na cache do GitHub. Nunca vai para o repositório (`pipeline/modelos/` está no `.gitignore`).
  - **Tempo:** cerca de 12 segundos por descrição. Por isso traduz no máximo 25 minutos por noite (`RADAR_TRADUCAO_MINUTOS`), primeiro as ações com melhor pontuação. O resto fica para as noites seguintes; depois disso só há descrições novas ou alteradas.
  - **Alternativa desligada:** o Microsoft Azure Translator continua no código (`RADAR_TRADUTOR=azure`, com os segredos `AZURE_TRANSLATOR_KEY` e `AZURE_TRANSLATOR_REGION`), com limites de segurança de 1,5 milhões de caracteres por mês e 300 mil por execução. Para o ligar, ver os comentários em `publicar.yml`.
  - **Na app:** o texto traduzido está marcado como português (`lang="pt-PT"`) e o original como inglês (`lang="en"`). Assim, o Safari e o Edge podem oferecer a sua própria tradução do original como alternativa.
  - **Estado:** `data/meta.json` → "traducoes" mostra quantas descrições foram traduzidas, quanto tempo demorou e quantas faltam.
  - **Cópia pública:** as traduções ficam também em `data/traducoes.json`, publicada com a app. Assim, se a cache do GitHub se perder, recuperam-se sem traduzir outra vez.

### Atualização parcial e falhas

- `--tickers` só atualiza as ações pedidas; as outras ficam no radar tal como estavam.
- Se o Yahoo falhar numa ação, fica a versão anterior, marcada como `desatualizado`. A ação não desaparece do radar.
- `data/meta.json` indica se a última execução foi completa ou parcial (por ter acabado o tempo, ou por bloqueio), quais as ações atualizadas, a data da última atualização completa e os erros. Os erros ficam registados até serem resolvidos numa execução seguinte.

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
- **Preço justo (alvo):** dividendo anual ÷ yield alvo (6%).
- **Preço justo histórico:** dividendo anual ÷ yield habitual da própria ação nos últimos 5 anos.
  - Em cada mês, o yield = dividendo normal anual dessa altura (sem extraordinários e com a frequência que a ação tinha nessa altura) ÷ preço desse mês.
  - "Habitual" = a **mediana** dos meses, para um pagamento ou um mês de pânico na bolsa não distorcerem o valor.
  - Se a ação tiver menos de 5 anos de histórico, usa os que houver; com menos de 2 anos fica vazio.
  - Por defeito é este que conta para o "preço atrativo" da pontuação. Isso, e o número de anos, mudam-se nas Definições.
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

- No código só está a **chave publicável** do Supabase (`sb_publishable_…`), que foi feita para ser pública: sozinha não dá acesso a nenhuma tabela (o papel "anon" não tem permissões e todas as tabelas têm RLS).
- A chave secreta do Supabase, a palavra-passe da base de dados e o "client secret" do GitHub **não** são usados pela app nem pelo pipeline.
- O único segredo do pipeline ligado ao Supabase é `SUPABASE_CHAVE_MOTOR` (só lê as decisões sobre extraordinários).
- O extrato da XTB nunca é enviado para o GitHub nem para o servidor: é lido no browser.
