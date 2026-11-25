// Saúde da atualização noturna: quantas noites seguidas correram mal.
// Duas fontes, usa-se a pior:
//  - o pipeline conta as noites com problemas que ainda assim publicaram (ex.: Yahoo bloqueou);
//  - uma noite que falha de todo não publica nada, por isso a app vê há quanto tempo
//    não há uma noite bem-sucedida (cada 24 h sem sucesso = uma noite falhada).
import type { Meta } from '../tipos'

export const NOITES_PARA_AVISAR = 3
const DIA = 24 * 60 * 60 * 1000

export interface Saude {
  noitesFalhadas: number
  ultimaNoiteOk: string | null
  avisar: boolean
}

export function saudeAtualizacao(meta: Meta | null, agora: Date = new Date()): Saude {
  if (!meta) return { noitesFalhadas: 0, ultimaNoiteOk: null, avisar: false }
  const ultima = meta.ultima_noite_ok ?? meta.gerado_em
  const t = Date.parse(ultima)
  const semSucesso = Number.isFinite(t) ? Math.max(0, Math.floor((agora.getTime() - t) / DIA)) : 0
  const noitesFalhadas = Math.max(meta.noites_com_problemas ?? 0, semSucesso)
  return { noitesFalhadas, ultimaNoiteOk: ultima, avisar: noitesFalhadas >= NOITES_PARA_AVISAR }
}
