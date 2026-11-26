import { lazy, Suspense } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { Carregando } from './componentes/Comuns'
import { Layout } from './componentes/Layout'
import { RedeSeguranca } from './componentes/RedeSeguranca'
import { ProvedorApp } from './lib/contexto'
import { Radar } from './paginas/Radar'

// páginas carregadas só quando são abertas (o Radar abre mais depressa no telemóvel)
const Acao = lazy(() => import('./paginas/Acao').then(m => ({ default: m.Acao })))
const Alertas = lazy(() => import('./paginas/Alertas').then(m => ({ default: m.Alertas })))
const Calendario = lazy(() => import('./paginas/Calendario').then(m => ({ default: m.Calendario })))
const Carteira = lazy(() => import('./paginas/Carteira').then(m => ({ default: m.Carteira })))
const Definicoes = lazy(() => import('./paginas/Definicoes').then(m => ({ default: m.Definicoes })))
const Simular = lazy(() => import('./paginas/Simular').then(m => ({ default: m.Simular })))
const Sobre = lazy(() => import('./paginas/Sobre').then(m => ({ default: m.Sobre })))

// HashRouter (endereços com #/) para funcionar no GitHub Pages sem configuração extra.
export default function App() {
  return (
    // rede de segurança exterior: apanha falhas fora das páginas (ex.: no menu)
    <RedeSeguranca>
    <ProvedorApp>
      <HashRouter>
        <Suspense fallback={<Carregando />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Radar />} />
              <Route path="favoritos" element={<Radar soFavoritos />} />
              <Route path="carteira" element={<Carteira />} />
              <Route path="simular" element={<Simular />} />
              <Route path="calendario" element={<Calendario />} />
              <Route path="alertas" element={<Alertas />} />
              <Route path="acao/:ticker" element={<Acao />} />
              <Route path="definicoes" element={<Definicoes />} />
              <Route path="sobre" element={<Sobre />} />
              <Route path="*" element={<Radar />} />
            </Route>
          </Routes>
        </Suspense>
      </HashRouter>
    </ProvedorApp>
    </RedeSeguranca>
  )
}
