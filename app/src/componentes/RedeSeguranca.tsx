// "Rede de segurança" (error boundary): se uma página rebentar, mostra uma mensagem em português
// em vez de um ecrã em branco. O resto da app (menu, outras páginas) continua a funcionar.
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** quando muda (ex.: o endereço da página), a rede volta a tentar desenhar a página */
  chave?: string
}
interface Estado { erro: Error | null; chave?: string }

export class RedeSeguranca extends Component<Props, Estado> {
  state: Estado = { erro: null, chave: this.props.chave }

  static getDerivedStateFromError(erro: Error): Partial<Estado> {
    return { erro }
  }

  static getDerivedStateFromProps(props: Props, estado: Estado): Partial<Estado> | null {
    // mudou de página: esquece o erro anterior
    return props.chave !== estado.chave ? { erro: null, chave: props.chave } : null
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('Erro apanhado pela rede de segurança:', erro, info.componentStack)
  }

  render() {
    const { erro } = this.state
    if (!erro) return this.props.children
    return (
      <div role="alert" className="mx-auto my-6 max-w-xl rounded-2xl bg-red-50 p-5 text-red-950 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-100 dark:ring-red-900">
        <h2 className="text-lg font-bold">Ups, esta página teve um problema</h2>
        <p className="mt-2 text-sm">
          Algo correu mal ao mostrar esta página. Os seus favoritos, notas e definições estão guardados e não se perderam.
        </p>
        <p className="mt-2 text-sm">Pode tentar outra vez, ou ir para outra página pelo menu.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={() => this.setState({ erro: null })}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800">
            Tentar outra vez
          </button>
          <button type="button" onClick={() => window.location.reload()}
            className="rounded-lg px-4 py-2 text-sm font-medium text-red-800 ring-1 ring-red-300 dark:text-red-200 dark:ring-red-800">
            Recarregar a app
          </button>
        </div>
        <details className="mt-4 text-xs opacity-80">
          <summary className="cursor-pointer">Detalhe técnico (para enviar ao assistente)</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words">{erro.message}</pre>
        </details>
      </div>
    )
  }
}
