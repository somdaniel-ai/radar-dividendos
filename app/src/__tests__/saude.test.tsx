// Aviso quando a atualização noturna falha 3 noites seguidas.
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { Layout } from '../componentes/Layout'
import { ContextoApp, type Contexto } from '../lib/contexto'
import { saudeAtualizacao } from '../lib/saude'
import { Sobre } from '../paginas/Sobre'
import type { Meta } from '../tipos'

const base: Meta = {
  gerado_em: '2026-11-20T03:30:00+00:00', data_referencia: '2026-11-20', tipo_atualizacao: 'completa',
  ultima_atualizacao_completa: null, total_universo: 10, total_radar: 5, sem_dividendos_recentes: [], erros: [], aviso: '',
}
const agora = (iso: string) => new Date(iso)

describe('saúde da atualização noturna', () => {
  it('noites seguidas sem publicar (a app vê que os dados não avançam)', () => {
    const m = { ...base, ultima_noite_ok: '2026-11-20T03:30:00+00:00' }
    expect(saudeAtualizacao(m, agora('2026-11-21T08:00:00Z'))).toMatchObject({ noitesFalhadas: 1, avisar: false })
    expect(saudeAtualizacao(m, agora('2026-11-22T08:00:00Z'))).toMatchObject({ noitesFalhadas: 2, avisar: false })
    expect(saudeAtualizacao(m, agora('2026-11-23T08:00:00Z'))).toMatchObject({ noitesFalhadas: 3, avisar: true })
    // durante a noite seguinte (ainda a correr) não conta antes do tempo
    expect(saudeAtualizacao(m, agora('2026-11-23T03:00:00Z')).avisar).toBe(false)
  })
  it('noites com problemas que publicaram (ex.: Yahoo bloqueou)', () => {
    const m = { ...base, gerado_em: '2026-11-23T03:30:00+00:00', ultima_noite_ok: '2026-11-23T03:00:00+00:00', noites_com_problemas: 3 }
    expect(saudeAtualizacao(m, agora('2026-11-23T08:00:00Z')).avisar).toBe(true)
  })
  it('sem a data da última noite boa usa a data da publicação; sem meta não avisa', () => {
    expect(saudeAtualizacao(base, agora('2026-11-20T08:00:00Z')).avisar).toBe(false)
    expect(saudeAtualizacao(null).avisar).toBe(false)
  })

  const desenhar = (meta: Meta, el: React.ReactNode) => renderToString(
    <ContextoApp.Provider value={{ meta } as Contexto}>
      <MemoryRouter><Routes><Route element={<Layout />}><Route path="*" element={el} /></Route></Routes></MemoryRouter>
    </ContextoApp.Provider>)
  it('o aviso aparece no topo de todas as páginas e o Sobre explica o que fazer', () => {
    const velho = { ...base, ultima_noite_ok: '2020-01-01T03:00:00+00:00' }
    const html = desenhar(velho, <Sobre />).replace(/<!-- -->/g, '')
    expect(html).toContain('data-aviso-atualizacao')
    expect(html).toMatch(/A atualização noturna falhou nas últimas \d+ noites/)
    expect(html).toContain('Enable workflow')
    const hoje = new Date().toISOString()
    expect(desenhar({ ...base, gerado_em: hoje, ultima_noite_ok: hoje }, <p>x</p>)).not.toContain('data-aviso-atualizacao')
  })
})
