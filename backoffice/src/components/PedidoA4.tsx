import { NOME_ESTABELECIMENTO } from '../lib/config'
import type { UnidadeProduto } from '../types'

export interface ItemPedidoA4 {
  nome: string
  quantidade: number
  unidade: UnidadeProduto
  precoUnitario?: number
}

interface Props {
  numeroPedido: string
  dataHora: string
  cliente: string
  itens: ItemPedidoA4[]
  mostrarValores: boolean
  total?: number
}

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// So aparece na impressao (window.print()) - em tela fica sempre display:none,
// mesmo pra quem chamou a impressao (ver .pedido-a4 em caixa.css/App.css).
// Isso e o que garante que a tela do /caixa nunca mostra valor nenhum, mesmo
// quando a via impressa mostra (pedido de admin, com mostrarValores=true).
export function PedidoA4({ numeroPedido, dataHora, cliente, itens, mostrarValores, total }: Props) {
  return (
    <div className="pedido-a4">
      <header>
        <h1>{NOME_ESTABELECIMENTO}</h1>
        <p>
          Pedido {numeroPedido} — {dataHora}
        </p>
        <p>Cliente: {cliente}</p>
      </header>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qtd</th>
            {mostrarValores && <th>Preço unit.</th>}
            {mostrarValores && <th>Subtotal</th>}
          </tr>
        </thead>
        <tbody>
          {itens.map((item, i) => (
            <tr key={i}>
              <td>{item.nome}</td>
              <td>
                {item.quantidade}
                {item.unidade === 'kg' ? 'kg' : ''}
              </td>
              {mostrarValores && <td>{moeda(item.precoUnitario ?? 0)}</td>}
              {mostrarValores && <td>{moeda((item.precoUnitario ?? 0) * item.quantidade)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {mostrarValores && total !== undefined && (
        <p className="pedido-a4-total">Total: {moeda(total)}</p>
      )}
      {!mostrarValores && <p className="pedido-a4-aviso">Pagamento a conciliar.</p>}
    </div>
  )
}
