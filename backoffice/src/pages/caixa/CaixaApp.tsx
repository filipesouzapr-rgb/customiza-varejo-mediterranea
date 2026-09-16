import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { TerminalFrame } from '../../components/caixa/TerminalFrame'
import { VendaPage } from './VendaPage'
import type { Operador } from '../../types'

interface Props {
  operador: Operador
}

export function CaixaApp({ operador }: Props) {
  return (
    <>
      <div className="caixa-topbar">
        {operador.papel !== 'operador' && <Link to="/dashboard">Painel admin</Link>}
        <button type="button" onClick={() => supabase.auth.signOut()}>
          Sair
        </button>
      </div>
      <VendaPage operador={operador} />
    </>
  )
}

export function SemAcesso() {
  return (
    <TerminalFrame titulo="SEM ACESSO">
      <div className="tela-central">
        <p>Este usuário não tem um perfil de operador cadastrado. Fale com o dono.</p>
      </div>
    </TerminalFrame>
  )
}
