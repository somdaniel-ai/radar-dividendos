// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { apanharErroEntrada, lerErroEntrada } from '../lib/entrada'

describe('erro ao entrar (registos fechados)', () => {
  beforeEach(() => sessionStorage.clear())
  it('apanha o erro do endereço, abre as Definições e explica em português', () => {
    window.history.replaceState(null, '', '/radar-dividendos/?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance#/')
    apanharErroEntrada()
    expect(window.location.hash).toBe('#/definicoes')
    expect(window.location.search).toBe('')
    expect(lerErroEntrada()).toMatch(/não aceita contas novas/)
    expect(lerErroEntrada()).toBeNull() // só aparece uma vez
  })
  it('também depois do "#"', () => {
    window.history.replaceState(null, '', '/radar-dividendos/#error=server_error&error_description=Algo%20falhou')
    apanharErroEntrada()
    expect(lerErroEntrada()).toBe('Não foi possível entrar: Algo falhou')
  })
  it('sem erro não mexe no endereço', () => {
    window.history.replaceState(null, '', '/radar-dividendos/#/simular?ver=meta')
    apanharErroEntrada()
    expect(window.location.hash).toBe('#/simular?ver=meta')
  })
})
