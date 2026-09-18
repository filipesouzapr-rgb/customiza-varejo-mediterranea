import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { ProdutosPage } from './pages/ProdutosPage'
import { ClientesPage } from './pages/ClientesPage'
import { FiadoPage } from './pages/FiadoPage'
import { VendasPage } from './pages/VendasPage'
import { ContasPagarPage } from './pages/ContasPagarPage'
import { ParametrosPage } from './pages/ParametrosPage'
import { DashboardPage } from './pages/DashboardPage'
import { CaixaApp, SemAcesso } from './pages/caixa/CaixaApp'
import { useSession } from './lib/useSession'
import { useOperador } from './lib/useOperador'
import type { Operador } from './types'
import './App.css'

// operador: só acessa /caixa. supervisor/dono: acessam /caixa e /admin
// (dashboard, produtos, fiado).
function RequireAdmin({ operador, children }: { operador: Operador; children: ReactNode }) {
  if (operador.papel === 'operador') return <Navigate to="/caixa" replace />
  return <>{children}</>
}

function App() {
  const { session, loading: carregandoSessao } = useSession()
  const { operador, loading: carregandoOperador } = useOperador(session)

  if (carregandoSessao || carregandoOperador) return null

  if (!session) return <LoginPage />

  if (!operador) return <SemAcesso />

  const rotaInicial = operador.papel === 'operador' ? '/caixa' : '/dashboard'

  return (
    <Routes>
      <Route path="/caixa/*" element={<CaixaApp operador={operador} />} />
      <Route
        element={
          <RequireAdmin operador={operador}>
            <AppLayout />
          </RequireAdmin>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/produtos" element={<ProdutosPage />} />
        <Route path="/clientes" element={<ClientesPage />} />
        <Route path="/vendas" element={<VendasPage />} />
        <Route path="/fiado" element={<FiadoPage />} />
        <Route path="/contas-pagar" element={<ContasPagarPage />} />
        <Route path="/parametros" element={<ParametrosPage />} />
      </Route>
      <Route path="/" element={<Navigate to={rotaInicial} replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
