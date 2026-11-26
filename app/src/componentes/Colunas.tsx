import { COLUNAS_RADAR, type ListaColunas } from '../lib/colunas'

/** Caixas para escolher as colunas de uma tabela (Radar, Definições, Carteira). */
export function EscolherColunas({ visiveis, mudar, repor, personalizadas, lista = COLUNAS_RADAR,
  nota = 'A estrela e o nome da ação aparecem sempre. Só afeta a tabela do PC (no telemóvel aparecem cartões).' }: {
  visiveis: Record<string, boolean>
  mudar: (id: string, ver: boolean) => void
  repor: () => void
  personalizadas: boolean
  lista?: ListaColunas
  nota?: string
}) {
  return (
    <div>
      <p className="mb-2 text-xs text-slate-500">{nota}</p>
      <div className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {lista.map(c => (
          <label key={c.id} className="flex items-center gap-2">
            <input type="checkbox" className="size-4" checked={visiveis[c.id]} onChange={e => mudar(c.id, e.target.checked)} />
            {c.nome}
          </label>
        ))}
      </div>
      <button type="button" disabled={!personalizadas} onClick={repor}
        className="mt-3 text-sm text-sky-700 underline disabled:opacity-40 dark:text-sky-400">
        Voltar às colunas por defeito
      </button>
    </div>
  )
}
