import { useEffect, useState } from 'react'
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
import { QuebrasPage } from './pages/QuebrasPage'
import { RelatorioVendidosPage } from './pages/RelatorioVendidosPage'
import { DashboardPage } from './pages/DashboardPage'
import { CaixaApp, SemAcesso } from './pages/caixa/CaixaApp'
import { PopupVencimentoHoje } from './components/PopupVencimentoHoje'
import { useSession } from './lib/useSession'
import { useOperador } from './lib/useOperador'
import { supabase } from './lib/supabase'
import { CHAVE_POPUP_VENCIMENTO_MOSTRADO, PAPEIS_COM_POPUP_VENCIMENTO } from './lib/popupVencimentoHoje'
import type { Operador } from './types'
import './App.css'

interface ContaVencendoHoje {
  id: string
  descricao: string
  valor: number
  desconto: number
  fornecedor_nome: string | null
}

// Mostra, uma vez por sessao de login, as contas a pagar vencendo hoje -
// a flag em sessionStorage e' limpa no SIGNED_OUT (useSession.ts), entao um
// novo login volta a mostrar se ainda houver conta vencendo.
function usePopupVencimentoHoje(operador: Operador) {
  const [contas, setContas] = useState<ContaVencendoHoje[] | null>(null)

  useEffect(() => {
    if (!PAPEIS_COM_POPUP_VENCIMENTO.includes(operador.papel)) return
    if (sessionStorage.getItem(CHAVE_POPUP_VENCIMENTO_MOSTRADO) === '1') return

    sessionStorage.setItem(CHAVE_POPUP_VENCIMENTO_MOSTRADO, '1')

    const hoje = new Date().toISOString().slice(0, 10)
    supabase
      .from('contas_pagar')
      .select('id, descricao, valor, desconto, fornecedores(nome)')
      .eq('status', 'nao_conciliado')
      .eq('data_vencimento', hoje)
      .then(({ data, error }) => {
        if (error || !data || data.length === 0) return
        setContas(
          (data as unknown as { id: string; descricao: string; valor: number; desconto: number; fornecedores: { nome: string } | null }[]).map(
            (c) => ({
              id: c.id,
              descricao: c.descricao,
              valor: c.valor,
              desconto: c.desconto,
              fornecedor_nome: c.fornecedores?.nome ?? null,
            }),
          ),
        )
      })
  }, [operador.papel])

  return { contas, fechar: () => setContas(null) }
}

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

  return <AppRoutes operador={operador} rotaInicial={rotaInicial} />
}

function AppRoutes({ operador, rotaInicial }: { operador: Operador; rotaInicial: string }) {
  const { contas, fechar } = usePopupVencimentoHoje(operador)

  return (
    <>
      {contas && <PopupVencimentoHoje contas={contas} onFechar={fechar} />}
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
          <Route path="/quebras" element={<QuebrasPage />} />
          <Route path="/vendidos" element={<RelatorioVendidosPage />} />
          <Route path="/parametros" element={<ParametrosPage />} />
        </Route>
        <Route path="/" element={<Navigate to={rotaInicial} replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default App
