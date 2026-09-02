import type { ItemCarrinho, Pagamento } from '../types'
import { NOME_ESTABELECIMENTO } from '../lib/config'

const rotuloForma: Record<Pagamento['forma'], string> = {
  dinheiro: 'Dinheiro',
  cartao_debito: 'Cartão débito',
  cartao_credito: 'Cartão crédito',
  pix: 'Pix',
  fiado: 'Outros',
}

interface Props {
  itens: ItemCarrinho[]
  pagamentos: Pagamento[]
  subtotal: number
  desconto: number
  total: number
  troco: number
  onFechar: () => void
}

export function Cupom({ itens, pagamentos, subtotal, desconto, total, troco, onFechar }: Props) {
  return (
    <div className="modal-fundo">
      <div className="cupom">
        <h2>{NOME_ESTABELECIMENTO}</h2>
        <p className="cupom-aviso">
          Cupom não fiscal — emissão de NFC-e ainda não integrada (fase de homologação)
        </p>
        <hr />
        {itens.map((item, i) => (
          <div key={i} className="cupom-linha">
            <span>
              {item.produto.nome} x{item.quantidade}
              {item.produto.unidade === 'kg' ? 'kg' : ''}
            </span>
            <span>
              {(item.quantidade * item.produto.preco).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
            </span>
          </div>
        ))}
        <hr />
        <div className="cupom-linha">
          <span>Subtotal</span>
          <span>{subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
        </div>
        {desconto > 0 && (
          <div className="cupom-linha">
            <span>Desconto</span>
            <span>-{desconto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
          </div>
        )}
        <div className="cupom-linha cupom-total">
          <span>Total</span>
          <span>{total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
        </div>
        <hr />
        {pagamentos.map((pagamento, i) => (
          <div key={i} className="cupom-linha">
            <span>{rotuloForma[pagamento.forma]}</span>
            <span>
              {pagamento.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
        ))}
        {troco > 0 && (
          <div className="cupom-linha cupom-total">
            <span>Troco</span>
            <span>{troco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
          </div>
        )}
        <div className="cupom-acoes">
          <button type="button" onClick={() => window.print()}>
            Imprimir
          </button>
          <button type="button" onClick={onFechar}>
            Nova venda
          </button>
        </div>
      </div>
    </div>
  )
}
