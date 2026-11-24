// Copia os ficheiros gerados pelo pipeline (../data) para public/data, para a app os servir.
import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const origem = resolve(aqui, '..', '..', 'data')
const destino = resolve(aqui, '..', 'public', 'data')

if (!existsSync(resolve(origem, 'radar.json'))) {
  console.error(`\nNão encontrei ${origem}\\radar.json.\nCorra primeiro o pipeline: cd pipeline && .venv\\Scripts\\python -m radar.gerar\n`)
  process.exit(1)
}
rmSync(destino, { recursive: true, force: true })
cpSync(origem, destino, { recursive: true })
console.log(`Dados copiados de ${origem} para ${destino}`)
