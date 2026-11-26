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

async function verificar(nome, rota, { largura = 1280, altura = 800, espera, extra, armazenamento } = {}) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: altura }, serviceWorkers: 'block' })
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
await verificar('sobre', '#/sobre', { espera: 'text=aconselhamento financeiro' })
await verificar('carteira-vazia', '#/carteira', { espera: 'text=Importar o extrato da XTB' })

// Simulador: cada ação → juntar 2 ações à distribuição → partes iguais → guardar um cenário
for (const [nome, largura, altura] of [['simular-pc', 1366, 900], ['simular-telemovel', 390, 844]]) {
  await verificar(nome, '#/simular', {
    largura, altura, espera: '[data-simulador-cada]',
    extra: async (p, erros) => {
      const semScroll = async onde => {
        const w = await p.evaluate(() => document.documentElement.scrollWidth)
        if (w > largura) erros.push(`${onde}: a página tem scroll para o lado (${w} > ${largura} px)`)
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
      await p.getByLabel('Nome do cenário').fill('Teste automático')
      await p.getByRole('button', { name: 'Guardar cenário' }).click()
      await p.waitForSelector('text=Cenário "Teste automático" guardado.')
      if (!(await p.locator('li', { hasText: 'Teste automático' }).count())) erros.push('o cenário não aparece na lista')
      await semScroll('distribuição')
      await p.screenshot({ path: `${PASTA}/${nome}-distribuicao.png`, fullPage: true })
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
        await p.getByRole('button', { name: /^Importar \d+ operações/ }).click()
        await p.waitForSelector('text=Resumo')
        const n = await p.locator('[aria-expanded]').filter({ hasText: 'Quantidade' }).count()
        if (n < 1) erros.push('não apareceram posições')
        if ((await p.evaluate(() => document.documentElement.scrollWidth)) > largura) erros.push('a página tem scroll para o lado')
        await p.locator('[aria-expanded]').filter({ hasText: 'Quantidade' }).first().click()
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
