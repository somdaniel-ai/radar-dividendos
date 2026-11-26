// Alertas guardados na conta (tabela "alertas" do Supabase, ver supabase/migracoes/0004).
// São criados pelo motor, todas as noites; a app só os lê, marca como lidos e apaga (só os seus).
import { obterCliente } from './supabase'

export interface Alerta {
  chave: string
  tipo: 'abaixo_justo' | 'dividendo_aumento' | 'dividendo_corte' | 'atrasado' | 'yield_alto' | 'nova_ex' | 'vespera_ex' | 'falha' | 'teste'
  ticker: string | null
  titulo: string
  texto: string
  criado_em: string
  enviado_em: string | null
  lido: boolean
}

/** Escolhas por defeito (as mesmas de pipeline/radar/parametros.py → "alertas"). */
export const ALERTAS_PADRAO = {
  telegram: true,
  hora_envio: '08:30',
  valores_em_euros: true,
  yield_limite: 0.10,
  abaixo_justo: { carteira: true, favoritos: true },
  dividendo: { carteira: true, favoritos: true },
  atrasado: { carteira: true, favoritos: true },
  yield_alto: { carteira: true, favoritos: true },
  nova_ex: { carteira: true, favoritos: true },
  vespera_ex: { carteira: true, favoritos: true },
  falha_atualizacao: true,
}
export type EscolhasAlertas = typeof ALERTAS_PADRAO

/** Tipos que se podem ligar para a carteira e/ou os favoritos (por esta ordem nas Definições). */
export const TIPOS_ALERTA = [
  { id: 'nova_ex', emoji: '📅', nome: 'Nova data ex-dividendo anunciada', ajuda: 'Com a data limite para comprar e o dia do pagamento.' },
  { id: 'vespera_ex', emoji: '⏳', nome: 'Véspera da data ex-dividendo', ajuda: 'No último dia útil para comprar (só datas confirmadas).' },
  { id: 'dividendo', emoji: '📈', nome: 'Aumento ou corte do dividendo', ajuda: 'Quando aparece um pagamento novo diferente do anterior (mais de ±1%).' },
  { id: 'atrasado', emoji: '⏰', nome: 'Pagamento atrasado ou suspenso', ajuda: 'Quando o pagamento esperado passa da data.' },
  { id: 'abaixo_justo', emoji: '💚', nome: 'Preço abaixo do preço justo', ajuda: 'Quando passa de acima para abaixo (no máximo 1 vez por semana).' },
  { id: 'yield_alto', emoji: '🔥', nome: 'Yield líquido acima do limite', ajuda: 'Quando passa o limite de cima (⚠️ se tiver sinais de armadilha).' },
] as const

export const EMOJI_ALERTA: Record<Alerta['tipo'], string> = {
  falha: '⚠️', vespera_ex: '⏳', nova_ex: '📅', dividendo_corte: '📉', atrasado: '⏰', dividendo_aumento: '📈',
  abaixo_justo: '💚', yield_alto: '🔥', teste: '✅',
}

const COLUNAS = 'chave,tipo,ticker,titulo,texto,criado_em,enviado_em,lido'

/** Aviso para o 🔔 do topo atualizar (depois de marcar como lidos, apagar…). */
export const EVENTO_ALERTAS = 'radar:alertas'
const avisar = () => window.dispatchEvent(new Event(EVENTO_ALERTAS))

export async function lerAlertas(): Promise<Alerta[]> {
  const c = await obterCliente()
  const { data, error } = await c.from('alertas').select(COLUNAS).order('criado_em', { ascending: false }).limit(300)
  if (error) throw new Error(error.message)
  return (data ?? []) as Alerta[]
}

export async function contarPorLer(): Promise<number> {
  const c = await obterCliente()
  const { count, error } = await c.from('alertas').select('chave', { count: 'exact', head: true }).eq('lido', false)
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function marcarLidos(chaves: string[]): Promise<void> {
  if (!chaves.length) return
  const c = await obterCliente()
  const { error } = await c.from('alertas').update({ lido: true }).in('chave', chaves)
  if (error) throw new Error(error.message)
  avisar()
}

export async function apagarAlertas(chaves: string[]): Promise<void> {
  if (!chaves.length) return
  const c = await obterCliente()
  const { error } = await c.from('alertas').delete().in('chave', chaves)
  if (error) throw new Error(error.message)
  avisar()
}

/** "2026-11-27" (dia em Lisboa) de uma data/hora. */
export const diaLisboa = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
export const horaLisboa = (iso: string) => new Date(iso).toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' })
