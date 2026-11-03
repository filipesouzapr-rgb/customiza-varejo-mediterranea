import { useParamUrl } from '../lib/useParamUrl'
import { LancamentosTab } from '../components/contasPagar/LancamentosTab'
import { FornecedoresTab } from '../components/contasPagar/FornecedoresTab'
import { GruposDespesaTab } from '../components/contasPagar/GruposDespesaTab'
import { ContasPagamentoTab } from '../components/contasPagar/ContasPagamentoTab'

type Aba = 'lancamentos' | 'fornecedores' | 'grupos' | 'contas_pagamento'

export function ContasPagarPage() {
  const [abaTexto, setAbaTexto] = useParamUrl('aba', 'lancamentos')
  const aba = abaTexto as Aba
  const setAba = setAbaTexto

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
        <button
          type="button"
          className={aba === 'contas_pagamento' ? 'ativa' : ''}
          onClick={() => setAba('contas_pagamento')}
        >
          Contas de pagamento
        </button>
      </nav>

      {aba === 'lancamentos' && <LancamentosTab />}
      {aba === 'fornecedores' && <FornecedoresTab />}
      {aba === 'grupos' && <GruposDespesaTab />}
      {aba === 'contas_pagamento' && <ContasPagamentoTab />}
    </div>
  )
}
