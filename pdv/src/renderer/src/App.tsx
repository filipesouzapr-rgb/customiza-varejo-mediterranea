import { useEffect, useState } from 'react'
import { useSession } from './lib/useSession'
import { useOperador } from './lib/useOperador'
import { supabase } from './lib/supabase'
import { TerminalFrame } from './components/TerminalFrame'
import { LoginPage } from './pages/LoginPage'
import { AbrirCaixaPage } from './pages/AbrirCaixaPage'
import { VendaPage } from './pages/VendaPage'
import type { CaixaSessao } from './types'

function App(): React.JSX.Element | null {
  const { session, loading: carregandoSessao } = useSession()
  const { operador, loading: carregandoOperador } = useOperador(session)
  const [caixaSessao, setCaixaSessao] = useState<CaixaSessao | null>(null)
  const [carregandoCaixa, setCarregandoCaixa] = useState(true)

  useEffect(() => {
    if (!session) {
      setCarregandoCaixa(false)
      return
    }

    setCarregandoCaixa(true)
    supabase
      .from('caixa_sessoes')
      .select('*')
      .is('fechado_em', null)
      .order('aberto_em', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setCaixaSessao(data as CaixaSessao | null)
        setCarregandoCaixa(false)
      })
  }, [session])

  if (carregandoSessao || carregandoOperador || carregandoCaixa) return null

  if (!session) return <LoginPage />

  if (!operador) {
    return (
      <TerminalFrame titulo="SEM ACESSO">
        <div className="tela-central">
          <p>Este usuário não tem um perfil de operador cadastrado. Fale com o dono.</p>
        </div>
      </TerminalFrame>
    )
  }

  if (!caixaSessao) {
    return <AbrirCaixaPage operadorId={operador.id} onAberta={setCaixaSessao} />
  }

  return (
    <VendaPage
      operador={operador}
      caixaSessao={caixaSessao}
      onCaixaFechado={() => setCaixaSessao(null)}
    />
  )
}

export default App
