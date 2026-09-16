import { useState } from 'react'
import { LancamentosTab } from '../components/contasPagar/LancamentosTab'
import { FornecedoresTab } from '../components/contasPagar/FornecedoresTab'
import { GruposDespesaTab } from '../components/contasPagar/GruposDespesaTab'

type Aba = 'lancamentos' | 'fornecedores' | 'grupos'

export function ContasPagarPage() {
  const [aba, setAba] = useState<Aba>('lancamentos')

  return (
    <div className="contas-pagar-page">
      <nav className="contas-pagar-abas">
        <button
          type="button"
          className={aba === 'lancamentos' ? 'ativa' : ''}
          onClick={() => setAba('lancamentos')}
        >
          Lançamentos
        </button>
        <button
          type="button"
          className={aba === 'fornecedores' ? 'ativa' : ''}
          onClick={() => setAba('fornecedores')}
        >
          Fornecedores
        </button>
        <button
          type="button"
          className={aba === 'grupos' ? 'ativa' : ''}
          onClick={() => setAba('grupos')}
        >
          Grupos de despesa
        </button>
      </nav>

      {aba === 'lancamentos' && <LancamentosTab />}
      {aba === 'fornecedores' && <FornecedoresTab />}
      {aba === 'grupos' && <GruposDespesaTab />}
    </div>
  )
}
