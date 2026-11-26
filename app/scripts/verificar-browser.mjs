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

// Projeção: valores à mão → mudar anos e reinvestir; gráficos e tabela
for (const [nome, largura, altura] of [['projecao-pc', 1366, 900], ['projecao-telemovel', 390, 844]]) {
  await verificar(nome, '#/simular?ver=projecao', {
    largura, altura, espera: '[data-projecao]',
    armazenamento: { 'radar.projecao': JSON.stringify({ fonte: 'manual', capital: 3500, yieldManual: 0.06, mensal: 100, anos: 10 }) },
    extra: async (p, erros) => {
      const fim = async () => p.locator('[data-projecao-fim]').innerText()
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
        if (w > largura) erros.push(`${onde}: a página tem scroll para o lado (${w} > ${largura} px)`)
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
