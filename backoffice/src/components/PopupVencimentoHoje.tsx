interface Conta {
  id: string
  descricao: string
  valor: number
  desconto: number
  fornecedor_nome: string | null
}

interface Props {
  contas: Conta[]
  onFechar: () => void
}

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function PopupVencimentoHoje({ contas, onFechar }: Props) {
  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal-caixa pedido-admin" onClick={(e) => e.stopPropagation()}>
        <h2>Contas vencendo hoje</h2>

        <div className="tabela-scroll">
          <table>
            <thead>
              <tr>
                <th>Fornecedor</th>
                <th>Descrição</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {contas.map((c) => (
                <tr key={c.id}>
                  <td>{c.fornecedor_nome ?? '—'}</td>
                  <td>{c.descricao}</td>
                  <td>{moeda(Number(c.valor) - Number(c.desconto))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="modal-acoes">
          <button type="button" onClick={onFechar}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
