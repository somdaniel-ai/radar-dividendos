# Radar de Dividendos

Aplicação pessoal para analisar ações e ETFs de dividendos disponíveis na XTB, gerir a carteira, simular investimentos e receber alertas. Funciona no PC e no iPhone (instalável como app, sem App Store) e é gratuita de alojar.

> **Ferramenta de apoio pessoal. Não constitui aconselhamento financeiro nem fiscal.**

## Estado do projeto

| Fase | Descrição | Estado |
|---|---|---|
| 0 | Preparação (ferramentas, pastas, repositório) | ✅ concluída |
| 1 | Motor de dados (pipeline) com a lista inicial | ⏳ por fazer |
| 2 | App: Radar, página da ação e Definições | ⏳ |
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

## Segurança

O repositório é **público**. Dados pessoais, chaves e tokens nunca são guardados no código: ficam na pasta `privado/` (ignorada pelo Git) ou nos "segredos" do GitHub/Supabase.
