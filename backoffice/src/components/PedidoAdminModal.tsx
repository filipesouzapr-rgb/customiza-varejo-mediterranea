import { useEffect, useState } from 'react'
import { neon } from '../lib/neon'
import { SeletorModal } from './caixa/SeletorModal'
import type { FormaPagamento, Produto, UnidadeProduto } from '../types'

interface Props {
  vendaId: string
  onFechar: () => void
  onAtualizado: () => void
}

interface ItemEditavel {
  produto_id: string
  nome: string
  unidade: UnidadeProduto
  quantidade: string
  preco_unitario: string
}

interface PagamentoForm {
  forma: FormaPagamento
  valor: string
}

interface VendaDetalhe {
  id: string
  status: string
  conciliado_em: string | null
  desconto: number
  total: number
  clientes: { nome: string } | null
}

interface ItemRaw {
  produto_id: string
  quantidade: number
  preco_unitario: number
  produtos: { nome: string; unidade: UnidadeProduto } | null
}

const rotuloForma: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  cartao_debito: 'Cartão débito',
  cartao_credito: 'Cartão crédito',
  pix: 'Pix',
  fiado: 'Fiado',
}

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function PedidoAdminModal({ vendaId, onFechar, onAtualizado }: Props) {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const [clienteNome, setClienteNome] = useState('')
  const [status, setStatus] = useState('')
  const [conciliadoEm, setConciliadoEm] = useState<string | null>(null)
  const [itens, setItens] = useState<ItemEditavel[]>([])
  const [desconto, setDesconto] = useState('0')
  const [pagamentosConciliados, setPagamentosConciliados] = useState<
    { forma: FormaPagamento; valor: number }[]
  >([])
  const [pagamentosForm, setPagamentosForm] = useState<PagamentoForm[]>([])

  const [produtos, setProdutos] = useState<Produto[]>([])
  const [buscandoProduto, setBuscandoProduto] = useState(false)
  const [buscaQuery, setBuscaQuery] = useState('')

  async function carregar() {
    setCarregando(true)
    setErro(null)

    const [{ data: venda, error: errVenda }, { data: itensData, error: errItens }, { data: produtosData }] =
      await Promise.all([
        neon
          .from('vendas')
          .select('id, status, conciliado_em, desconto, total, clientes(nome)')
          .eq('id', vendaId)
          .single(),
        neon
          .from('venda_itens')
          .select('produto_id, quantidade, preco_unitario, produtos(nome, unidade)')
          .eq('venda_id', vendaId),
        neon.from('produtos').select('*').eq('ativo', true),
      ])

    if (errVenda || !venda) {
      setErro(errVenda?.message ?? 'Pedido não encontrado.')
      setCarregando(false)
      return
    }
    if (errItens) {
      setErro(errItens.message)
      setCarregando(false)
      return
    }

    const vendaDetalhe = venda as unknown as VendaDetalhe
    setClienteNome(vendaDetalhe.clientes?.nome ?? '—')
    setStatus(vendaDetalhe.status)
    setConciliadoEm(vendaDetalhe.conciliado_em)
    setDesconto(String(vendaDetalhe.desconto ?? 0))
    setProdutos((produtosData as Produto[]) ?? [])

    setItens(
      ((itensData ?? []) as unknown as ItemRaw[]).map((i) => ({
        produto_id: i.produto_id,
        nome: i.produtos?.nome ?? '—',
        unidade: i.produtos?.unidade ?? 'unidade',
        quantidade: String(i.quantidade),
        preco_unitario: String(i.preco_unitario),
      })),
    )

    if (vendaDetalhe.conciliado_em) {
      const { data: pagamentos } = await neon
        .from('venda_pagamentos')
        .select('forma, valor')
        .eq('venda_id', vendaId)
      setPagamentosConciliados((pagamentos as { forma: FormaPagamento; valor: number }[]) ?? [])
    } else {
      setPagamentosForm([{ forma: 'dinheiro', valor: String(vendaDetalhe.total) }])
    }

    setCarregando(false)
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendaId])

  const subtotalAtual = itens.reduce(
    (soma, i) => soma + (Number(i.quantidade) || 0) * (Number(i.preco_unitario) || 0),
    0,
  )
  const totalAtual = Math.max(0, subtotalAtual - (Number(desconto) || 0))
  const totalPagoForm = pagamentosForm.reduce((soma, p) => soma + (Number(p.valor) || 0), 0)
  const restanteForm = Math.round((totalAtual - totalPagoForm) * 100) / 100

  function atualizarItem(index: number, campo: 'quantidade' | 'preco_unitario', valor: string) {
    setItens((atual) => atual.map((item, i) => (i === index ? { ...item, [campo]: valor } : item)))
  }

  function removerItem(index: number) {
    setItens((atual) => atual.filter((_, i) => i !== index))
  }

  function adicionarProduto(produto: Produto) {
    setItens((atual) => [
      ...atual,
      {
        produto_id: produto.id,
        nome: produto.nome,
        unidade: produto.unidade,
        quantidade: '1',
        preco_unitario: String(produto.preco),
      },
    ])
    setBuscandoProduto(false)
  }

  async function salvarEdicao() {
    if (itens.length === 0) {
      setErro('O pedido precisa ter ao menos 1 item.')
      return
    }
    setErro(null)
    setSalvando(true)

    const { error } = await neon.rpc('editar_venda_admin', {
      p_venda_id: vendaId,
      p_itens: itens.map((i) => ({
        produto_id: i.produto_id,
        quantidade: Number(i.quantidade),
        preco_unitario: Number(i.preco_unitario),
      })),
      p_desconto: Number(desconto) || 0,
    })

    setSalvando(false)

    if (error) {
      setErro(error.message)
      return
    }

    await carregar()
    onAtualizado()
  }

  function atualizarPagamento(index: number, campo: 'forma' | 'valor', valor: string) {
    setPagamentosForm((atual) =>
      atual.map((p, i) => (i === index ? { ...p, [campo]: valor } : p)),
    )
  }

  function adicionarLinhaPagamento() {
    setPagamentosForm((atual) => [
      ...atual,
      { forma: 'dinheiro', valor: restanteForm > 0 ? String(restanteForm) : '' },
    ])
  }

  function removerLinhaPagamento(index: number) {
    setPagamentosForm((atual) => atual.filter((_, i) => i !== index))
  }

  async function confirmarConciliacao() {
    if (Math.abs(restanteForm) > 0.004) {
      setErro('A soma dos pagamentos precisa bater com o total do pedido.')
      return
    }
    setErro(null)
    setSalvando(true)

    const { error } = await neon.rpc('conciliar_venda', {
      p_venda_id: vendaId,
      p_pagamentos: pagamentosForm.map((p) => ({ forma: p.forma, valor: Number(p.valor) || 0 })),
    })

    setSalvando(false)

    if (error) {
      setErro(error.message)
      return
    }

    onAtualizado()
    onFechar()
  }

  async function cancelarPedido() {
    if (!window.confirm('Cancelar este pedido? O estoque dos itens será devolvido.')) return

    setErro(null)
    setSalvando(true)

    const { error } = await neon.rpc('cancelar_venda', { p_venda_id: vendaId })

    setSalvando(false)

    if (error) {
      setErro(error.message)
      return
    }

    onAtualizado()
    onFechar()
  }

  const podeEditar = status === 'finalizada' && !conciliadoEm
  const podeCancelar = status === 'finalizada'

  return (
    <div className="modal-fundo">
      <div className="modal-caixa pedido-admin">
        <div className="pedido-admin-cabecalho">
          <h2>Pedido — {clienteNome}</h2>
          {status === 'cancelada' && <span className="badge badge-cancelado">Cancelado</span>}
          {status === 'finalizada' && conciliadoEm && (
            <span className="badge badge-conciliado">
              Conciliado em {new Date(conciliadoEm).toLocaleString('pt-BR')}
            </span>
          )}
          {status === 'finalizada' && !conciliadoEm && (
            <span className="badge badge-pendente">Pendente de conciliação</span>
          )}
        </div>

        {carregando ? (
          <p>Carregando...</p>
        ) : (
          <>
            {erro && <p className="erro">{erro}</p>}

            <div className="tabela-scroll">
            <table className="pedido-admin-itens">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Qtd</th>
                  <th>Preço unit.</th>
                  <th>Subtotal</th>
                  {podeEditar && <th></th>}
                </tr>
              </thead>
              <tbody>
                {itens.map((item, i) => (
                  <tr key={i}>
                    <td>{item.nome}</td>
                    <td>
                      {podeEditar ? (
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={item.quantidade}
                          onChange={(e) => atualizarItem(i, 'quantidade', e.target.value)}
                        />
                      ) : (
                        `${item.quantidade}${item.unidade === 'kg' ? 'kg' : ''}`
                      )}
                    </td>
                    <td>
                      {podeEditar ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.preco_unitario}
                          onChange={(e) => atualizarItem(i, 'preco_unitario', e.target.value)}
                        />
                      ) : (
                        moeda(Number(item.preco_unitario))
                      )}
                    </td>
                    <td>{moeda((Number(item.quantidade) || 0) * (Number(item.preco_unitario) || 0))}</td>
                    {podeEditar && (
                      <td>
                        <button type="button" onClick={() => removerItem(i)}>
                          Remover
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            {podeEditar && (
              <button type="button" onClick={() => setBuscandoProduto(true)}>
                + Adicionar item
              </button>
            )}

            <div className="pedido-admin-totais">
              <label>
                Desconto
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={desconto}
                  disabled={!podeEditar}
                  onChange={(e) => setDesconto(e.target.value)}
                />
              </label>
              <span className="pedido-admin-total-valor">Total: {moeda(totalAtual)}</span>
            </div>

            {podeEditar && (
              <div className="modal-acoes">
                <button type="button" onClick={salvarEdicao} disabled={salvando}>
                  {salvando ? 'Salvando...' : 'Salvar edição'}
                </button>
              </div>
            )}

            {podeEditar && (
              <>
                <hr className="cliente-rule" />
                <h3>Conciliar pagamento</h3>
                {pagamentosForm.map((p, i) => (
                  <div key={i} className="pedido-admin-pagamento-linha">
                    <select
                      value={p.forma}
                      onChange={(e) => atualizarPagamento(i, 'forma', e.target.value)}
                    >
                      {(Object.keys(rotuloForma) as FormaPagamento[]).map((forma) => (
                        <option key={forma} value={forma}>
                          {rotuloForma[forma]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={p.valor}
                      onChange={(e) => atualizarPagamento(i, 'valor', e.target.value)}
                    />
                    {pagamentosForm.length > 1 && (
                      <button type="button" onClick={() => removerLinhaPagamento(i)}>
                        Remover
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={adicionarLinhaPagamento}>
                  + Dividir pagamento
                </button>
                <p className={restanteForm === 0 ? '' : 'erro'}>
                  {restanteForm === 0
                    ? 'Soma bate com o total.'
                    : `Falta ${moeda(Math.max(0, restanteForm))} pra fechar o total.`}
                </p>
                <div className="modal-acoes">
                  <button
                    type="button"
                    onClick={confirmarConciliacao}
                    disabled={salvando || restanteForm !== 0}
                  >
                    {salvando ? 'Confirmando...' : 'Confirmar conciliação'}
                  </button>
                </div>
              </>
            )}

            {conciliadoEm && pagamentosConciliados.length > 0 && (
              <ul className="venda-pagamentos-lista">
                {pagamentosConciliados.map((p, i) => (
                  <li key={i}>
                    <span>{rotuloForma[p.forma]}</span>
                    <span>{moeda(p.valor)}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="modal-acoes">
              {podeCancelar && (
                <button type="button" onClick={cancelarPedido} disabled={salvando}>
                  Cancelar pedido
                </button>
              )}
              <button type="button" onClick={onFechar}>
                Fechar
              </button>
            </div>
          </>
        )}
      </div>

      {buscandoProduto && (
        <SeletorModal
          titulo="Adicionar produto ao pedido"
          placeholder="Digite o nome do produto"
          itens={produtos
            .filter((p) => p.nome.toLowerCase().includes(buscaQuery.trim().toLowerCase()))
            .slice(0, 8)
            .map((p) => ({
              id: p.id,
              label: p.nome,
              sublabel: `${p.unidade === 'kg' ? 'kg' : 'un'} · ${moeda(p.preco)}`,
            }))}
          onQueryChange={setBuscaQuery}
          onSelecionar={(id) => {
            const produto = produtos.find((p) => p.id === id)
            if (produto) adicionarProduto(produto)
          }}
          onFechar={() => setBuscandoProduto(false)}
        />
      )}
    </div>
  )
}
