// Abre a app construída (pasta dist/) num browser a sério e confirma que as páginas abrem:
// sem erros na consola, sem ecrã em branco, sem a mensagem da rede de segurança.
// Usa o browser já instalado (Edge no Windows, Chrome no GitHub Actions) — nada é descarregado.
//
//   npm run build && npm run verificar
//
// As capturas de ecrã ficam em app/verificacao/ (não vai para o Git).
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const PORTA = Number(process.env.PORTA_VERIFICAR ?? 4391)
const BASE = `http://localhost:${PORTA}/radar-dividendos/`
const PASTA = 'verificacao'
const canal = process.env.BROWSER_CANAL ?? (process.platform === 'win32' ? 'msedge' : 'chrome')
mkdirSync(PASTA, { recursive: true })

const radar = JSON.parse(readFileSync('dist/data/radar.json', 'utf-8'))
const umTicker = radar.acoes[0]?.ticker
if (!umTicker) console.warn('Aviso: radar sem ações — as verificações que precisam de ações são saltadas')

// servidor local com a app construída
const servidor = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORTA), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'inherit'] })
await new Promise((ok, falha) => {
  const t = setTimeout(() => falha(new Error('o servidor local não arrancou')), 30000)
  servidor.on('exit', c => { clearTimeout(t); falha(new Error(`o servidor local parou (código ${c})`)) })
  servidor.stdout.on('data', d => { if (String(d).includes(String(PORTA))) { clearTimeout(t); ok() } })
})

const problemas = []
const browser = await chromium.launch({ channel: canal, headless: true })

async function verificar(nome, rota, { largura = 1280, altura = 800, espera, extra, armazenamento, preparar } = {}) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: altura }, serviceWorkers: 'block' })
  if (preparar) await preparar(ctx)
  if (armazenamento) await ctx.addInitScript(o => { for (const [k, v] of Object.entries(o)) localStorage.setItem(k, v) }, armazenamento)
  const pagina = await ctx.newPage()
  const erros = []
  pagina.on('pageerror', e => erros.push(`erro: ${e.message}`))
  pagina.on('console', m => { if (m.type() === 'error') erros.push(`consola: ${m.text()}`) })
  try {
    await pagina.goto(BASE + rota, { waitUntil: 'networkidle' })
    await pagina.waitForSelector(espera, { timeout: 15000 })
    if (await pagina.locator('[role="alert"]').count()) erros.push('apareceu a mensagem da rede de segurança')
    const texto = (await pagina.locator('#root').innerText()).trim()
    if (texto.length < 50) erros.push('página (quase) em branco')
    if (extra) await extra(pagina, erros)
  } catch (e) {
    erros.push(String(e.message ?? e).split('\n')[0])
  }
  await pagina.screenshot({ path: `${PASTA}/${nome}.png`, fullPage: false })
  await ctx.close()
  console.log(`${erros.length ? '✗' : '✓'} ${nome}`)
  for (const e of erros) { console.log(`    ${e}`); problemas.push(`${nome}: ${e}`) }
}

// quando a página fica mais larga do que o ecrã: que elementos saem da margem (para o registo)
async function quemSai(p, largura) {
  return p.evaluate(w => [...document.querySelectorAll('body *')]
    .map(e => ({ e, r: e.getBoundingClientRect() }))
    .filter(x => x.r.right > w + 1 && x.r.width > 0 && ![...x.e.children].some(f => f.getBoundingClientRect().right > w + 1))
    .slice(0, 6)
    .map(x => `${x.e.tagName.toLowerCase()}${x.e.id ? '#' + x.e.id : ''} (${Math.round(x.r.left)}–${Math.round(x.r.right)} px) "${(x.e.getAttribute('aria-label') || x.e.textContent || x.e.getAttribute('placeholder') || '').trim().slice(0, 40)}"`)
    .join('; '), largura)
}

// tabela do Radar no PC: cabe na largura (sem scroll para o lado), nada cortado,
// títulos presos debaixo da barra do topo com o scroll normal da página
async function tabelaCabe(p, erros) {
  const m = await p.evaluate(() => {
    const caixa = document.querySelector('[data-tabela-radar]')
    const cortadas = [...caixa.querySelectorAll('th, td')].filter(c => c.scrollWidth > c.clientWidth + 1).length
    return {
      pagina: document.documentElement.scrollWidth, janela: window.innerWidth,
      estreita: caixa.hasAttribute('data-estreita'), overflow: getComputedStyle(caixa).overflowX,
      tabela: caixa.querySelector('table').offsetWidth, caixa: caixa.clientWidth, cortadas,
      colunas: caixa.querySelectorAll('thead th').length,
    }
  })
  if (m.pagina > m.janela) erros.push(`a página tem scroll para o lado (${m.pagina} > ${m.janela} px)`)
  if (m.estreita || m.overflow !== 'visible') erros.push(`a tabela não coube (${m.tabela} px numa caixa de ${m.caixa} px)`)
  if (m.cortadas) erros.push(`${m.cortadas} células com texto cortado`)
  return m
}
async function titulosPresos(p, erros) {
  const topo = (await p.locator('header').first().boundingBox()).height
  await p.evaluate(() => window.scrollTo(0, 2000))
  await p.waitForTimeout(250)
  const th = await p.locator('[data-tabela-radar] th').nth(2).boundingBox()
  if (Math.abs(th.y - topo) > 2) erros.push(`os títulos não ficaram presos debaixo da barra (${th.y} vs ${topo})`)
}
const TODAS = JSON.stringify({ ybruto: true, freq: true, pos52: true })

for (const largura of [1366, 1920]) {
  await verificar(`radar-pc-${largura}`, '#/', {
    largura, altura: largura === 1366 ? 768 : 1080, espera: '[data-tabela-radar] tbody tr',
    extra: async (p, erros) => {
      const m = await tabelaCabe(p, erros)
      console.log(`    ${largura} px: tabela ${m.tabela} px de ${m.caixa} px, ${m.colunas} colunas`)
      await titulosPresos(p, erros)
      await p.screenshot({ path: `${PASTA}/radar-pc-${largura}-depois-de-descer.png` })
      // ordenar ao clicar num título (com a página descida)
      await p.getByRole('button', { name: /yield líq/i }).click()
      const ordem = await p.locator('[data-tabela-radar] th[aria-sort]').innerText()
      if (!/yield líq/i.test(ordem)) erros.push('clicar no título não ordenou')
      // botão "Colunas": esconder e voltar a mostrar uma coluna
      await p.evaluate(() => window.scrollTo(0, 0))
      await p.getByRole('button', { name: 'Colunas', exact: true }).click()
      const antes = await p.locator('[data-tabela-radar] thead th').count()
      await p.getByLabel('Pontos', { exact: true }).uncheck()
      const depois = await p.locator('[data-tabela-radar] thead th').count()
      if (depois !== antes - 1) erros.push(`o botão Colunas não escondeu a coluna (${antes} → ${depois})`)
      await p.getByLabel('Pontos', { exact: true }).check()
    },
  })
  await verificar(`radar-pc-${largura}-todas-colunas`, '#/', {
    largura, altura: 900, espera: '[data-tabela-radar] tbody tr', armazenamento: { 'radar.colunas': TODAS },
    extra: async (p, erros) => {
      const m = await tabelaCabe(p, erros)
      console.log(`    ${largura} px, todas as colunas: tabela ${m.tabela} px de ${m.caixa} px, ${m.colunas} colunas`)
    },
  })
}

// janela mesmo estreita: aí sim, scroll para o lado, com o nome da ação fixo
await verificar('radar-pc-janela-estreita', '#/', {
  largura: 800, altura: 800, espera: '[data-tabela-radar] tbody tr', armazenamento: { 'radar.colunas': TODAS },
  extra: async (p, erros) => {
    const caixa = p.locator('[data-tabela-radar]')
    if (!(await caixa.getAttribute('data-estreita'))) { erros.push('a 800 px esperava scroll para o lado'); return }
    const acao = p.locator('[data-tabela-radar] th').nth(1)
    const antes = await acao.boundingBox()
    await caixa.evaluate(el => { el.scrollLeft = 500; el.scrollTop = 800 })
    await p.waitForTimeout(250)
    const depois = await acao.boundingBox()
    if (Math.abs(depois.x - antes.x) > 1 || Math.abs(depois.y - antes.y) > 1) erros.push('a coluna da ação ou os títulos não ficaram fixos')
    if ((await p.evaluate(() => document.documentElement.scrollWidth)) > 800) erros.push('a página inteira tem scroll para o lado')
    await p.screenshot({ path: `${PASTA}/radar-pc-janela-estreita-depois-de-descer.png` })
  },
})
// o menu do topo cabe com folga (o tipo de letra do Chrome no GitHub é um pouco mais largo)
for (const largura of [800, 1024, 1280]) {
  await verificar(`menu-topo-${largura}`, '#/sobre', {
    largura, altura: 700, espera: 'header nav',
    extra: async (p, erros) => {
      const m = await p.evaluate(() => {
        const caixa = document.querySelector('header > div')
        const filhos = [...caixa.children].reduce((s, f) => s + f.getBoundingClientRect().width, 0)
        return { filhos, caixa: caixa.clientWidth - 32 }
      })
      console.log(`    ${largura} px: menu ocupa ${Math.round(m.filhos)} de ${m.caixa} px`)
      if (m.filhos > m.caixa - 40) erros.push(`o menu do topo está à justa ou não cabe (${Math.round(m.filhos)} de ${m.caixa} px)`)
    },
  })
}
await verificar('radar-telemovel', '#/', { largura: 390, altura: 844, espera: 'ul li a[href*="acao/"]' })
await verificar('favoritos', '#/favoritos', { espera: 'h1' })
if (umTicker) await verificar('acao', `#/acao/${encodeURIComponent(umTicker)}`, { espera: 'text=Porque recebeu este nível' })
// uma ação que existe na XTB em várias bolsas/moedas (se houver nos dados): versão em EUR assinalada
const comVersoes = radar.acoes.map(x => x.ticker).find(t => {
  try { return JSON.parse(readFileSync(`dist/data/acoes/${t}.json`, 'utf-8')).versoes_xtb?.length > 1 } catch { return false }
})
if (comVersoes) {
  await verificar('acao-versoes-xtb', `#/acao/${encodeURIComponent(comVersoes)}`, {
    espera: 'text=Versões na XTB',
    extra: async (p, erros) => {
      const v = JSON.parse(readFileSync(`dist/data/acoes/${comVersoes}.json`, 'utf-8')).versoes_xtb
      for (const x of v) if (!(await p.locator(`b:text-is("${x.ticker}")`).count())) erros.push(`falta a versão ${x.ticker}`)
      if (v.some(x => x.moeda === 'EUR') && !(await p.locator('text=em euros: sem conversão').count())) erros.push('versão em EUR não assinalada')
      await p.locator('text=Versões na XTB').scrollIntoViewIfNeeded()
      await p.screenshot({ path: `${PASTA}/acao-versoes-xtb-pormenor.png` })
    },
  })
}
await verificar('definicoes', '#/definicoes', {
  espera: 'text=Repor valores por defeito',
  extra: async (p, erros) => {
    await p.locator('textarea#lista').click()
    await p.locator('textarea#lista').fill(`${umTicker}, XPTO.US`)
    await p.waitForSelector('section:has(#universo) >> text=Fora do universo', { timeout: 10000 }).catch(() => erros.push('cartão Universo não respondeu'))
  },
})
// Alertas: sem sessão pede para entrar; nas Definições, as escolhas ficam guardadas
await verificar('alertas-sem-sessao', '#/alertas', { espera: 'text=Entre com o GitHub para os ver' })
for (const [nome, largura, altura] of [['definicoes-alertas-pc', 1366, 900], ['definicoes-alertas-telemovel', 390, 844]]) {
  await verificar(nome, '#/definicoes#alertas', {
    largura, altura, espera: '[data-tipos-alerta]',
    extra: async (p, erros) => {
      if ((await p.locator('[data-tipos-alerta] tbody tr').count()) !== 6) erros.push('faltam tipos de alerta')
      const campo = p.locator('[id="alertas.yield_limite"] input')
      if ((await campo.inputValue()) !== '10') erros.push(`limite do yield por defeito: ${await campo.inputValue()}`)
      await campo.fill('12'); await campo.press('Enter')
      await p.getByLabel('Véspera da data ex-dividendo — favoritos').uncheck()
      await p.getByLabel('Hora da mensagem diária (Lisboa)').fill('09:15')
      const guardado = await p.evaluate(() => JSON.parse(localStorage.getItem('radar.definicoes') || '{}'))
      const al = guardado.alertas ?? {}
      if (al.yield_limite !== 0.12 || al.vespera_ex?.favoritos !== false || al.hora_envio !== '09:15')
        erros.push(`escolhas não guardadas: ${JSON.stringify(al)}`)
      const w = await p.evaluate(() => document.documentElement.scrollWidth)
      if (w > largura) erros.push(`a página tem scroll para o lado (${w} > ${largura} px): ${await quemSai(p, largura)}`)
      await p.locator('#alertas').scrollIntoViewIfNeeded()
      await p.screenshot({ path: `${PASTA}/${nome}-cartao.png` })
    },
  })
}
await verificar('sobre', '#/sobre', { espera: 'text=aconselhamento financeiro' })
await verificar('carteira-vazia', '#/carteira', { espera: 'text=Importar o extrato da XTB' })

// Projeção: valores à mão → mudar anos e reinvestir; gráficos e tabela
for (const [nome, largura, altura] of [['projecao-pc', 1366, 900], ['projecao-telemovel', 390, 844]]) {
  await verificar(nome, '#/simular?ver=projecao', {
    largura, altura, espera: '[data-projecao]',
    armazenamento: { 'radar.projecao': JSON.stringify({ fonte: 'manual', capital: 3500, yieldManual: 0.06, mensal: 100, anos: 10 }) },
    extra: async (p, erros) => {
      const fim = async () => p.locator('[data-projecao-fim]').innerText()
      if (await p.locator('[data-aviso-yield-alto]').count()) erros.push('aviso de yield alto com um yield de 6%')
      const antes = await fim()
      await p.getByLabel('Durante').fill('20')
      const depois = await fim()
      if (antes === depois) erros.push('mudar os anos não mudou o resultado')
      await p.getByText('Reinvestir os dividendos').click()
      if ((await fim()) === depois) erros.push('desligar o reinvestimento não mudou o resultado')
      if ((await p.locator('.recharts-surface').count()) < 2) erros.push('faltam os gráficos')
      await p.getByRole('button', { name: 'Ver tabela' }).click()
      if ((await p.locator('[data-tabela-projecao] tbody tr').count()) !== 21) erros.push('a tabela não tem os 20 anos + hoje')
      const w = await p.evaluate(() => document.documentElement.scrollWidth)
      if (w > largura) erros.push(`a página tem scroll para o lado (${w} > ${largura} px)`)
      await p.screenshot({ path: `${PASTA}/${nome}-completa.png`, fullPage: true })
    },
  })
}

// Meta de rendimento → abrir a proposta no Simulador; Favoritos no Simulador
const favs = radar.acoes.filter(a => !a.fora_batentes).slice(0, 3).map(a => a.ticker)
for (const [nome, largura, altura] of [['meta-pc', 1366, 900], ['meta-telemovel', 390, 844]]) {
  await verificar(nome, '#/simular?ver=meta', {
    largura, altura, espera: '[data-meta-rendimento]',
    armazenamento: { 'radar.favoritos': JSON.stringify(favs) },
    extra: async (p, erros) => {
      const semScroll = async onde => {
        const w = await p.evaluate(() => document.documentElement.scrollWidth)
        if (w > largura) erros.push(`${onde}: a página tem scroll para o lado (${w} > ${largura} px): ${await quemSai(p, largura)}`)
      }
      await p.getByLabel('Rendimento mensal líquido pretendido').fill('250')
      if (!(await p.locator('text=Capital necessário').count())) { erros.push('a meta não encontrou uma distribuição'); return }
      await semScroll('meta')
      await p.screenshot({ path: `${PASTA}/${nome}-resultado.png`, fullPage: true })
      await p.getByRole('button', { name: 'Abrir no Simulador (Distribuição)' }).click()
      await p.waitForSelector('[data-simulador-distribuicao]')
      const soma = await p.locator('[data-soma-pct]').innerText()
      if (!soma.includes('✓')) erros.push(`a proposta aberta no Simulador não soma 100% (${soma})`)
      // ⭐ Favoritos: separador no modo "Cada ação" e "Adicionar todos" na Distribuição
      await p.getByRole('button', { name: /Adicionar todos os favoritos/ }).click()
      const soma2 = await p.locator('[data-soma-pct]').innerText()
      if (!soma2.includes('✓')) erros.push(`depois de juntar os favoritos não soma 100% (${soma2})`)
      await p.getByRole('tab', { name: 'Cada ação' }).click()
      await p.getByRole('tab', { name: `⭐ Favoritos · ${favs.length}` }).click()
      const linhas = await p.locator(largura > 700 ? '[data-simulador-cada] tbody tr' : '[data-simulador-cada] ul > li').count()
      if (linhas !== favs.length) erros.push(`separador Favoritos: ${linhas} linhas em vez de ${favs.length}`)
      await semScroll('favoritos')
      await p.screenshot({ path: `${PASTA}/${nome}-favoritos.png`, fullPage: true })
    },
  })
}

// Simulador: cada ação → juntar 2 ações à distribuição → partes iguais → guardar um cenário
for (const [nome, largura, altura] of [['simular-pc', 1366, 900], ['simular-telemovel', 390, 844]]) {
  await verificar(nome, '#/simular', {
    largura, altura, espera: '[data-simulador-cada]',
    extra: async (p, erros) => {
      const semScroll = async onde => {
        const w = await p.evaluate(() => document.documentElement.scrollWidth)
        if (w > largura) erros.push(`${onde}: a página tem scroll para o lado (${w} > ${largura} px): ${await quemSai(p, largura)}`)
      }
      await semScroll('cada ação')
      const botoes = p.locator('button:visible', { hasText: '+ Distribuição' })
      if ((await botoes.count()) < 2) { erros.push('não há ações para simular'); return }
      await botoes.nth(0).click()
      await botoes.nth(0).click() // o 1.º passou a "✓ Na distribuição": este é o seguinte
      await p.getByRole('tab', { name: /Distribuição · 2/ }).click()
      await p.waitForSelector('[data-simulador-distribuicao]')
      await p.getByRole('button', { name: 'Partes iguais' }).click()
      const soma = await p.locator('[data-soma-pct]').innerText()
      if (!soma.includes('✓')) erros.push(`as percentagens não somam 100% (${soma})`)
      if ((await p.locator('[data-detalhes-acao]').count()) !== 2) erros.push('faltam os detalhes (nível, yield, setor…) nas linhas')
      for (const g of ['Setor', 'Categoria', 'País', 'Moeda', 'Nível']) {
        await p.getByRole('button', { name: g, exact: true }).click()
        if (!(await p.locator('[data-resumo-distribuicao] li').count())) erros.push(`resumo por ${g} vazio`)
        await semScroll(`resumo por ${g}`)
      }
      await p.getByLabel('Nome do cenário').fill('Teste automático')
      await p.getByRole('button', { name: 'Guardar cenário' }).click()
      await p.waitForSelector('text=Cenário "Teste automático" guardado.')
      if (!(await p.locator('li', { hasText: 'Teste automático' }).count())) erros.push('o cenário não aparece na lista')
      await semScroll('distribuição')
      await p.screenshot({ path: `${PASTA}/${nome}-distribuicao.png`, fullPage: true })
    },
  })
}

// Calendário: favoritos com datas → lista dos próximos meses e grelha do mês
await verificar('calendario-vazio', '#/calendario', { espera: 'text=Ainda não há ações para mostrar' })
const comDatas = radar.acoes.filter(a => a.pagamentos_ano > 0 && a.pagamento.ultimo_ex).slice(0, 6).map(a => a.ticker)
for (const [nome, largura, altura] of [['calendario-pc', 1366, 900], ['calendario-telemovel', 390, 844]]) {
  await verificar(nome, '#/calendario', {
    largura, altura, espera: '[data-lembrete-ex]',
    armazenamento: { 'radar.favoritos': JSON.stringify(comDatas) },
    extra: async (p, erros) => {
      const semScroll = async onde => {
        const w = await p.evaluate(() => document.documentElement.scrollWidth)
        if (w > largura) erros.push(`${onde}: a página tem scroll para o lado (${w} > ${largura} px): ${await quemSai(p, largura)}`)
      }
      await p.waitForSelector('[data-vista-lista]')
      const n = await p.locator('[data-vista-lista] [data-evento]').count()
      if (n < comDatas.length) erros.push(`lista com poucas datas (${n} para ${comDatas.length} ações)`)
      if (!(await p.locator('[data-vista-lista] [data-evento="ex"]').count())) erros.push('a lista não tem datas ex-dividendo')
      await semScroll('lista')
      await p.screenshot({ path: `${PASTA}/${nome}-lista.png`, fullPage: true })
      await p.getByRole('tab', { name: 'Mês', exact: true }).click()
      await p.waitForSelector('[data-grelha-mes]')
      const dias = await p.locator('[data-grelha-mes] tbody td').count()
      if (dias % 7 || dias < 28) erros.push(`grelha do mês estranha (${dias} células)`)
      await p.getByRole('button', { name: 'Mês seguinte' }).click()
      await p.waitForSelector('text=voltar a este mês')
      await semScroll('mês')
      await p.screenshot({ path: `${PASTA}/${nome}-mes.png`, fullPage: true })
    },
  })
}

// Só no PC do utilizador: importa o extrato real que está em privado/ (no GitHub não existe).
// As capturas ficam em app/verificacao/ (fora do Git).
const extrato = existsSync('../privado') && readdirSync('../privado').find(f => /^EUR_.*\.xlsx$/i.test(f))
if (extrato) {
  for (const [nome, largura, altura] of [['carteira-importada-pc', 1366, 900], ['carteira-importada-telemovel', 390, 844]]) {
    await verificar(nome, '#/carteira', {
      largura, altura, espera: 'text=Importar o extrato da XTB',
      extra: async (p, erros) => {
        await p.locator('[data-importar-extrato]').setInputFiles(`../privado/${extrato}`)
        await p.waitForSelector('[data-previa-importacao]', { timeout: 20000 })
        if (!(await p.locator('text=batem certo com a folha').count())) erros.push('a verificação contra Open Positions não bateu certo')
        await p.screenshot({ path: `${PASTA}/${nome}-previa.png` })
        await p.getByRole('button', { name: /^Importar \d+ operaç(ão|ões)/ }).click()
        await p.waitForSelector('text=Resumo')
        const pc = largura > 700
        const posicao = p.locator(pc ? '[data-tabela-carteira] tr[data-posicao]' : '[data-cartao-posicao] [aria-expanded]')
        const n = await posicao.count()
        if (n < 1) erros.push('não apareceram posições')
        if ((await p.evaluate(() => document.documentElement.scrollWidth)) > largura) erros.push('a página tem scroll para o lado')
        if (pc) {
          // tabela: cabe sem scroll, linha de totais, ordenar ao clicar, títulos presos, botão Colunas
          const m = await p.evaluate(() => {
            const c = document.querySelector('[data-tabela-carteira]')
            return { estreita: c.hasAttribute('data-estreita'), tabela: c.querySelector('table').offsetWidth, caixa: c.clientWidth,
              cortadas: [...c.querySelectorAll('th, td')].filter(x => x.scrollWidth > x.clientWidth + 1).length }
          })
          console.log(`    tabela da carteira: ${m.tabela} px de ${m.caixa} px`)
          if (m.estreita) erros.push(`a tabela da carteira não coube (${m.tabela} > ${m.caixa} px)`)
          if (m.cortadas) erros.push(`${m.cortadas} células da carteira com texto cortado`)
          const tot = await p.locator('[data-totais]').innerText()
          if (!/Total/.test(tot) || !/investido/.test(tot) || !/€/.test(tot)) erros.push('falta a linha de totais')
          const primeiro = async () => p.locator('[data-tabela-carteira] tr[data-posicao]').first().getAttribute('data-posicao')
          const antes = await primeiro()
          await p.locator('[data-tabela-carteira] th button', { hasText: /^Ação/i }).click()
          const ord = await p.locator('[data-tabela-carteira] th[aria-sort]').innerText()
          if (!/ação/i.test(ord)) erros.push('clicar no título não ordenou a carteira')
          const nomes = await p.locator('[data-tabela-carteira] tr[data-posicao]').evaluateAll(r => r.map(x => x.dataset.posicao))
          if (nomes.join() !== [...nomes].sort((a, b) => a.localeCompare(b)).join()) erros.push(`ordem por nome errada (${nomes.join(', ')}; antes começava em ${antes})`)
          // coluna Frequência: visível por defeito e ordenável (mensal primeiro)
          await p.locator('[data-tabela-carteira] th button', { hasText: /^Freq/i }).click()
          const ordemFreq = ['Mensal', 'Trimestral', 'Semestral', 'Anual', 'Irregular', '—']
          const freqs = await p.locator('[data-tabela-carteira] tr[data-posicao]').evaluateAll(rs => rs.map(r => {
            const i = [...r.closest('table').querySelectorAll('thead th')].findIndex(th => /^Freq/i.test(th.innerText.trim()))
            return r.children[i]?.innerText.trim()
          }))
          const idx = freqs.map(f => ordemFreq.indexOf(f))
          if (idx.some(i => i < 0) || idx.some((v, i) => i && v < idx[i - 1])) erros.push(`coluna Frequência mal ordenada (${freqs.join(', ')})`)
          await p.locator('[data-tabela-carteira] th button', { hasText: /Valor atual/i }).click()
          const th0 = await p.locator('[data-tabela-carteira] th').first().boundingBox()
          await p.evaluate(() => window.scrollTo(0, document.querySelector('[data-tabela-carteira]').getBoundingClientRect().top + window.scrollY + 150))
          await p.waitForTimeout(250)
          const topo = (await p.locator('header').first().boundingBox()).height
          const th1 = await p.locator('[data-tabela-carteira] th').first().boundingBox()
          if (n > 3 && Math.abs(th1.y - topo) > 2) erros.push(`títulos da carteira não ficaram presos (${th1.y} vs ${topo}; antes ${th0.y})`)
          await p.screenshot({ path: `${PASTA}/${nome}-tabela-descida.png` })
          await p.evaluate(() => window.scrollTo(0, 0))
          const cols = async () => p.locator('[data-tabela-carteira] thead th').count()
          const c0 = await cols()
          await p.getByRole('button', { name: 'Colunas', exact: true }).click()
          await p.getByLabel('Preço médio', { exact: true }).check()
          await p.getByLabel('Preço atual', { exact: true }).check()
          await p.getByLabel('Yield atual (líquido)', { exact: true }).check()
          if ((await cols()) !== c0 + 3) erros.push(`o botão Colunas não acrescentou as 3 colunas (${c0} → ${await cols()})`)
          const m2 = await p.evaluate(() => {
            const c = document.querySelector('[data-tabela-carteira]')
            return { tabela: c.querySelector('table').offsetWidth, caixa: c.clientWidth, pagina: document.documentElement.scrollWidth }
          })
          console.log(`    com todas as colunas: ${m2.tabela} px de ${m2.caixa} px`)
          if (m2.pagina > largura) erros.push('com todas as colunas, a página inteira ficou com scroll para o lado')
          await p.screenshot({ path: `${PASTA}/${nome}-todas-colunas.png`, fullPage: true })
          await p.getByRole('button', { name: 'Voltar às colunas por defeito' }).click()
          await p.getByRole('button', { name: 'Colunas', exact: true }).click()
        } else {
          await p.getByLabel('Ordenar por').selectOption('acao')
          const nomes = await p.locator('[data-cartao-posicao] a[href*="acao/"], [data-cartao-posicao] .font-semibold:first-child').evaluateAll(r => r.length)
          if (!nomes) erros.push('cartões sem nome da ação')
          if (!(await p.locator('[data-totais-telemovel]').count())) erros.push('faltam os totais no telemóvel')
          await p.getByLabel('Ordenar por').selectOption('c_freq')
          if (!(await p.locator('[data-cartao-posicao] dt', { hasText: 'Frequência' }).count())) erros.push('os cartões não mostram a frequência')
        }
        await posicao.first().click()
        if (!(await p.locator('[data-detalhe-posicao]').count())) erros.push('clicar na posição não abriu os lotes')
        await p.screenshot({ path: `${PASTA}/${nome}-pagina.png`, fullPage: true })
        // o Radar mostra 💼 nas ações da carteira
        await p.goto(BASE + '#/')
        await p.waitForSelector(largura > 700 ? '[data-tabela-radar] tbody tr' : 'ul li a[href*="acao/"]')
        if (!(await p.locator('[aria-label="Na carteira"]').count())) erros.push('o Radar não mostra 💼 nas ações da carteira')
        // separador "💼 Carteira": só as ações que tem
        await p.getByRole('tab', { name: /Carteira/ }).click()
        const linhas = p.locator(largura > 700 ? '[data-tabela-radar] tbody tr' : 'ul li:has(a[href*="acao/"])')
        await linhas.first().waitFor()
        const total = await linhas.count()
        const com = await linhas.filter({ has: p.locator('[aria-label="Na carteira"]') }).count()
        if (!total || com !== total) erros.push(`separador Carteira: ${com} de ${total} linhas são da carteira`)
        await p.screenshot({ path: `${PASTA}/${nome}-radar-separador.png`, fullPage: true })
        await p.getByRole('tab', { name: /^Todas/ }).click() // não deixar o separador escolhido para as verificações seguintes
        // compra escrita à mão igual a uma do extrato: ao reimportar é substituída (não conta duas vezes)
        if (largura > 700) {
          await p.evaluate(() => {
            const c = JSON.parse(localStorage.getItem('radar.carteira'))
            const i = c.findIndex(t => t.tipo === 'compra' && t.origem === 'xtb')
            const x = c[i]
            const dia = new Date(x.data).toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
            c.splice(i, 1, { ...x, id: 'manual-teste', origem: 'manual', data: `${dia}T12:00:00.000Z`, comentario: null })
            localStorage.setItem('radar.carteira', JSON.stringify(c))
          })
          await p.goto(BASE + '#/carteira')
          await p.reload()
          await p.waitForSelector('text=Importar o extrato da XTB')
          await p.locator('[data-importar-extrato]').setInputFiles(`../privado/${extrato}`)
          await p.waitForSelector('[data-previa-importacao]', { timeout: 20000 })
          if (!(await p.locator('[data-substituidas]', { hasText: '1 compra que escreveu à mão' }).count())) erros.push('a compra escrita à mão não foi reconhecida como a do extrato')
          if (!(await p.locator('text=batem certo com a folha').count())) erros.push('depois da substituição, as posições não batem certo')
          await p.screenshot({ path: `${PASTA}/${nome}-substituicao.png` })
          await p.getByRole('button', { name: /^Importar \d+ operaç(ão|ões)/ }).click()
          const manuais = await p.evaluate(() => JSON.parse(localStorage.getItem('radar.carteira')).filter(t => t.id === 'manual-teste').length)
          if (manuais) erros.push('a compra escrita à mão continua guardada depois de importar')
        }
        // Projeção a partir da carteira verdadeira
        await p.goto(BASE + '#/simular?ver=projecao')
        await p.waitForSelector('[data-projecao]')
        await p.getByRole('radio', { name: '💼 A minha carteira' }).click()
        if (!(await p.locator('text=A sua carteira hoje').count())) erros.push('a Projeção não usou a carteira como ponto de partida')
        // yield de partida acima de 10% → aviso e "Ver cenário prudente" (preço −3%, dividendo 0%)
        if (await p.locator('[data-aviso-yield-alto]').count()) {
          const antes = await p.locator('[data-projecao-fim]').innerText()
          await p.getByRole('button', { name: 'Ver cenário prudente' }).click()
          if ((await p.getByLabel('Crescimento do preço por ano').inputValue()) !== '-3,0') erros.push('o cenário prudente não pôs o preço a −3%')
          if ((await p.locator('[data-projecao-fim]').innerText()) === antes) erros.push('o cenário prudente não mudou o resultado')
          await p.screenshot({ path: `${PASTA}/${nome}-projecao-prudente.png`, fullPage: true })
          await p.getByRole('button', { name: 'Voltar aos valores anteriores' }).click()
          if ((await p.locator('[data-projecao-fim]').innerText()) !== antes) erros.push('"Voltar aos valores anteriores" não repôs o resultado')
        }
        await p.screenshot({ path: `${PASTA}/${nome}-projecao.png`, fullPage: true })
        // Simulador → Distribuição: as ações da carteira mostram 💼 com o valor investido
        await p.goto(BASE + '#/simular')
        await p.waitForSelector('[data-simulador-cada]')
        await p.getByRole('tab', { name: /💼 Carteira/ }).click()
        await p.locator('button:visible', { hasText: '+ Distribuição' }).first().click()
        await p.getByRole('tab', { name: /Distribuição · / }).click()
        await p.waitForSelector('[data-detalhes-acao]')
        if (!(await p.locator('[data-detalhes-acao]', { hasText: 'investidos' }).count())) erros.push('a Distribuição não mostra 💼 com o valor investido')
        if ((await p.evaluate(() => document.documentElement.scrollWidth)) > largura) erros.push('Distribuição com scroll para o lado')
        await p.screenshot({ path: `${PASTA}/${nome}-distribuicao-carteira.png`, fullPage: true })
        // Calendário só da carteira: valores previstos em euros
        await p.goto(BASE + '#/calendario?vista=lista')
        await p.waitForSelector('[data-lembrete-ex]')
        await p.getByRole('tab', { name: '💼 Carteira' }).click()
        if (!(await p.locator('[data-vista-lista] [data-evento]', { hasText: 'líquido' }).count())) erros.push('o Calendário não mostra os valores previstos da carteira')
        if ((await p.evaluate(() => document.documentElement.scrollWidth)) > largura) erros.push('Calendário com scroll para o lado')
        await p.screenshot({ path: `${PASTA}/${nome}-calendario.png`, fullPage: true })
        await p.getByRole('tab', { name: 'Mês', exact: true }).click()
        await p.getByRole('button', { name: 'Mês anterior' }).click()
        await p.screenshot({ path: `${PASTA}/${nome}-calendario-mes-anterior.png`, fullPage: true })
      },
    })
  }
}

// ——— ETF: composição (10 maiores posições, setores, TER), indisponível e ainda por obter ———
{
  const etf = radar.acoes.find(a => a.categoria === 'ETF')
  const comp = {
    disponivel: true, ter: 0.0022, obtida_em: '2026-11-27T03:10:00+00:00',
    posicoes: Array.from({ length: 10 }, (_, i) => ({ simbolo: `S${i}`, nome: i === 0 ? 'Uma empresa com um nome comprido de propósito, Inc. Ordinary Shares - Class A' : `Empresa ${i}`, peso: 0.08 - i * 0.005 })),
    setores: [{ setor: 'Tecnologia', peso: 0.35 }, { setor: 'Serviços Financeiros', peso: 0.18 }, { setor: 'Saúde', peso: 0.12 }],
  }
  const casos = [
    ['etf-composicao-pc', 1280, comp, async (p, erros) => {
      if ((await p.locator('[data-composicao-etf] li').count()) !== 13) erros.push('não mostrou as 10 posições e os 3 setores')
      if (!(await p.locator('[data-ter]', { hasText: '0,22%' }).count())) erros.push('não mostrou o TER')
    }],
    ['etf-composicao-telemovel', 390, comp, async (p, erros) => {
      if (!(await p.locator('[data-composicao-etf]', { hasText: 'As 10 maiores posições' }).count())) erros.push('sem as 10 maiores posições')
    }],
    ['etf-indisponivel', 390, { disponivel: false, posicoes: [], setores: [], ter: 0.0015, obtida_em: '2026-11-27T03:10:00+00:00' }, async (p, erros) => {
      if (!(await p.locator('[data-composicao-indisponivel]').count())) erros.push('não disse "composição indisponível"')
      if (!(await p.locator('[data-ter]', { hasText: '0,15%' }).count())) erros.push('sem o TER quando não há composição')
    }],
    ['etf-por-obter', 1280, null, async (p, erros) => {
      if (!(await p.locator('[data-composicao-etf]', { hasText: 'Ainda por obter' }).count())) erros.push('não disse "ainda por obter"')
    }],
  ]
  if (etf) for (const [nome, largura, c, testar] of casos) {
    await verificar(nome, `#/acao/${etf.ticker}`, {
      largura, altura: largura < 500 ? 844 : 800, espera: '[data-composicao-etf]',
      preparar: ctx => ctx.route(`**/data/acoes/${encodeURIComponent(etf.ticker)}.json`, async rota => {
        const r = await rota.fetch()
        const j = await r.json()
        if (c) j.composicao = c
        else delete j.composicao
        await rota.fulfill({ response: r, json: j })
      }),
      extra: async (p, erros) => {
        await testar(p, erros)
        await p.locator('[data-composicao-etf]').scrollIntoViewIfNeeded()
        if ((await p.evaluate(() => document.documentElement.scrollWidth)) > largura) erros.push(`scroll para o lado: ${await quemSai(p, largura)}`)
        await p.locator('[data-composicao-etf]').screenshot({ path: `${PASTA}/${nome}-cartao.png` })
      },
    })
  }
}

// ——— Simulador: abrir uma ação e voltar para trás → mesmo separador, filtros, pesquisa e posição ———
for (const [nome, largura] of [['simular-voltar-pc', 1280], ['simular-voltar-telemovel', 390]]) {
  const telemovel = largura < 500
  await verificar(nome, '#/simular', {
    largura, altura: telemovel ? 844 : 800, espera: '[data-simulador-cada]',
    extra: async (p, erros) => {
      await p.getByRole('tab', { name: /^REIT · / }).click()
      await p.locator('[data-simulador-cada] select').selectOption('mensal')
      await p.getByPlaceholder('Pesquisar ticker ou nome…').fill('e')
      const zona = telemovel ? '[data-simulador-cada] ul' : '[data-simulador-cada] table'
      const links = p.locator(`${zona} a[href*="/acao/"]`)
      const alvo = links.nth(Math.min(16, (await links.count()) - 1))
      await alvo.scrollIntoViewIfNeeded()
      await p.mouse.wheel(0, 120)
      await p.waitForTimeout(300)
      const antes = await p.evaluate(() => window.scrollY)
      if (antes < 300) erros.push(`não desceu o suficiente para o teste (${antes} px)`)
      await alvo.click()
      await p.waitForURL(/#\/acao\//)
      await p.waitForTimeout(300)
      if ((await p.evaluate(() => window.scrollY)) > 5) erros.push('a página da ação não abriu no topo')
      await p.goBack()
      await p.waitForSelector('[data-simulador-cada]')
      await p.waitForTimeout(800)
      if (!(await p.getByRole('tab', { name: /^REIT · / }).getAttribute('aria-selected'))?.includes('true')) erros.push('voltou sem o separador REIT')
      if ((await p.locator('[data-simulador-cada] select').inputValue()) !== 'mensal') erros.push('voltou sem a ordenação')
      if ((await p.getByPlaceholder('Pesquisar ticker ou nome…').inputValue()) !== 'e') erros.push('voltou sem a pesquisa')
      const depois = await p.evaluate(() => window.scrollY)
      if (Math.abs(depois - antes) > 5) erros.push(`voltou noutra posição (${depois} px em vez de ${antes} px)`)
      await p.screenshot({ path: `${PASTA}/${nome}-depois.png` })
      // Distribuição: a lista montada e o "⭐ Favoritos" ficam como estavam
      await p.getByRole('tab', { name: /^Distribuição/ }).click()
      const tickers = radar.acoes.slice(0, 3).map(a => a.ticker)
      for (const t of tickers) {
        await p.getByLabel('Acrescentar ação').fill(t)
        await p.locator('ul button', { hasText: t }).first().click()
      }
      await p.getByRole('tab', { name: /^⭐ Favoritos/ }).click()
      await p.locator('[data-simulador-distribuicao] li a[href*="/acao/"]').nth(1).click()
      await p.waitForURL(/#\/acao\//)
      await p.goBack()
      await p.waitForSelector('[data-simulador-distribuicao]')
      if ((await p.locator('[data-detalhes-acao]').count()) !== 3) erros.push('a distribuição montada não ficou igual')
      if (!(await p.getByRole('tab', { name: /^⭐ Favoritos/ }).getAttribute('aria-selected'))?.includes('true')) erros.push('voltou sem o "⭐ Favoritos" da Distribuição')
      if ((await p.evaluate(() => document.documentElement.scrollWidth)) > largura) erros.push(`scroll para o lado: ${await quemSai(p, largura)}`)
    },
  })
}

// ——— Meta: limites com barras deslizantes (a proposta muda logo; ao largar, grava nas Definições) ———
for (const [nome, largura] of [['meta-limites-pc', 1280], ['meta-limites-telemovel', 390]]) {
  await verificar(nome, '#/simular?ver=meta', {
    largura, altura: largura < 500 ? 844 : 800, espera: '[data-limites-meta]',
    extra: async (p, erros) => {
      const capital = () => p.locator('[data-numero="capital"]').innerText().catch(() => '')
      const c0 = await capital()
      const barra = p.locator('[data-barra="max_empresa"]')
      await barra.focus()
      for (let i = 0; i < 5; i++) await p.keyboard.press('ArrowRight')
      if ((await p.locator('[data-valor-limite="max_empresa"]').innerText()) !== '15%') erros.push('a barra do máximo por empresa não chegou aos 15%')
      const guardado = await p.evaluate(() => JSON.parse(localStorage.getItem('radar.definicoes') ?? '{}')?.meta?.max_empresa)
      if (guardado !== 0.15) erros.push(`o limite não ficou gravado nas Definições (${guardado})`)
      if ((await capital()) === c0) erros.push('o capital necessário não mudou com o limite')
      const pais = p.locator('[data-barra="max_pais"]')
      await pais.focus()
      await p.keyboard.press('Home')
      if ((await p.locator('[data-valor-limite="max_pais"]').innerText()) !== '10%') erros.push('a barra do máximo por país não desceu aos 10%')
      await p.screenshot({ path: `${PASTA}/${nome}-pagina.png`, fullPage: true })
      // sem favoritos, "Só favoritos" não consegue chegar a 100%
      await p.locator('[data-interruptor="so_favoritos"]').check()
      if (!(await p.locator('text=desligue «Só favoritos»').count())) erros.push('"Só favoritos" sem favoritos não explicou o que fazer')
      // as Definições mostram o mesmo valor
      await p.goto(BASE + '#/definicoes#meta')
      await p.waitForSelector('#meta')
      const campo = p.locator('[id="meta.max_empresa"] input').first()
      const v = await campo.inputValue().catch(() => '')
      if (!v.startsWith('15')) erros.push(`as Definições mostram ${v} em vez de 15%`)
      if ((await p.evaluate(() => document.documentElement.scrollWidth)) > largura) erros.push(`scroll para o lado: ${await quemSai(p, largura)}`)
    },
  })
}

// ——— "Atualizar agora" (⟳) com uma sessão a fingir: o Supabase e as Edge Functions são
// imitados aqui, no browser (nada sai para a internet nem toca na conta verdadeira) ———
{
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24
  const user = { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated', email: null,
    user_metadata: { user_name: 'teste' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  const sessaoFalsa = JSON.stringify({ access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, exp, role: 'authenticated' })}.x`,
    refresh_token: 'falso', token_type: 'bearer', expires_in: 86400, expires_at: exp, user })
  const favsAt = radar.acoes.filter(a => a.preco && a.cambio_eur && a.moeda !== 'EUR').slice(0, 3)
  // o que o Yahoo "responderia": preço +10%, com a moeda certa; câmbios a partir dos dados
  const cot = {}
  for (const a of radar.acoes) {
    if (a.preco) cot[a.ticker_yahoo] = { preco: a.preco * 1.1, moeda: a.moeda, anterior: a.preco, hora: null }
    const x = a.cotacao_xtb
    if (x?.simbolo && x.preco) cot[x.simbolo] = { preco: x.preco * 1.1, moeda: x.moeda, anterior: x.preco, hora: null }
    if (a.moeda && a.cambio_eur && a.moeda !== 'EUR') {
      const base = { GBp: 'GBP', GBX: 'GBP', ILA: 'ILS', ZAc: 'ZAR' }[a.moeda]
      cot[`EUR${base ?? a.moeda}=X`] = { preco: 1 / (a.cambio_eur * (base ? 100 : 1)), moeda: base ?? a.moeda, anterior: null, hora: null }
    }
  }
  const inicio = new Date(Date.now() - 12 * 60000).toISOString()
  const preparar = async ctx => {
    await ctx.route('https://mimdxffecbctnzhskjwh.supabase.co/**', async rota => {
      const r = rota.request(), url = new URL(r.url())
      const json = (corpo, extra = {}) => rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo), ...extra })
      if (url.pathname === '/functions/v1/precos') {
        const { simbolos } = r.postDataJSON()
        return json({ precos: Object.fromEntries(simbolos.filter(x => cot[x]).map(x => [x, cot[x]])), falhados: simbolos.filter(x => !cot[x]), em: new Date().toISOString() })
      }
      if (url.pathname === '/functions/v1/atualizar')
        return json({ ultima: { id: 1, estado: 'in_progress', resultado: null, origem: 'workflow_dispatch', criada_em: inicio, iniciada_em: inicio, atualizada_em: inicio },
          a_correr: true, validade_token: new Date(Date.now() + 20 * 86400000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' })
      if (url.pathname.startsWith('/auth/v1/user')) return json(user)
      if (url.pathname === '/rest/v1/favoritos' && r.method() === 'GET') return json(favsAt.map(a => ({ ticker: a.ticker })))
      if (r.method() === 'GET' || r.method() === 'HEAD') return json([], { headers: { 'content-range': '*/0' } })
      return rota.fulfill({ status: 201, body: '' })
    })
  }
  const armazenamento = { 'radar.sessao': sessaoFalsa, 'radar.sync.utilizador': JSON.stringify(user.id) }
  for (const [nome, largura] of [['atualizar-pc', 1280], ['atualizar-telemovel', 390]]) {
    await verificar(nome, '#/favoritos', {
      largura, altura: largura < 500 ? 844 : 800, espera: '[data-botao-atualizar]', armazenamento, preparar,
      extra: async (p, erros) => {
        await p.locator('[data-botao-atualizar]').click()
        await p.waitForSelector('[data-painel-atualizar]')
        await p.waitForSelector('[data-estado-atualizacao] >> text=A correr há', { timeout: 5000 }).catch(() => erros.push('não mostrou a atualização a correr'))
        if (!(await p.locator('[data-lancar-atualizacao]').isDisabled())) erros.push('deixa lançar outra atualização com uma a correr')
        if (!(await p.locator('[data-aviso-token]').count())) erros.push('não avisou que o token expira daqui a 20 dias')
        await p.locator('[data-atualizar-precos]').click()
        await p.waitForSelector('[data-resultado-precos]', { timeout: 5000 }).catch(() => erros.push('os preços não chegaram'))
        const res = await p.locator('[data-resultado-precos]').innerText().catch(() => '')
        if (!res.includes('3 de 3')) erros.push(`resultado inesperado: "${res}"`)
        if (!(await p.locator('[data-hora-precos]', { hasText: 'hoje às' }).count())) erros.push('não mostra a hora dos preços')
        const caixa = await p.locator('[data-painel-atualizar]').boundingBox()
        if (caixa && (caixa.x < 0 || caixa.x + caixa.width > largura)) erros.push(`o painel sai do ecrã (${Math.round(caixa.x)}–${Math.round(caixa.x + caixa.width)} px)`)
        if ((await p.evaluate(() => document.documentElement.scrollWidth)) > largura) erros.push(`scroll para o lado: ${await quemSai(p, largura)}`)
        await p.screenshot({ path: `${PASTA}/${nome}-painel.png` })
        // o preço novo (+10%) chega à página
        await p.keyboard.press('Escape')
        const guardado = await p.evaluate(() => JSON.parse(localStorage.getItem('radar.precos') ?? 'null'))
        if (!guardado?.precos?.[favsAt[0].ticker_yahoo]) erros.push('os preços não ficaram guardados neste aparelho')
      },
    })
  }
}

await browser.close()
servidor.kill()
if (problemas.length) {
  console.error(`\n${problemas.length} problema(s) no browser. Capturas em app/${PASTA}/`)
  process.exit(1)
}
console.log(`\nTudo abriu bem no browser (${canal}). Capturas em app/${PASTA}/`)
