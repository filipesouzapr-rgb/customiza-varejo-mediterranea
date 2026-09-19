import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
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
  finalizada_em: string | null
  clientes: { nome: string } | null
  operadores: { nome: string } | null
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

// <input type="datetime-local"> trabalha em horário local, sem timezone
// (ex: "2026-09-11T14:30") - as duas funções convertem pra ida e volta do
// timestamptz (UTC) que vem/vai pro banco.
function paraDatetimeLocal(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function deDatetimeLocal(valor: string) {
  return new Date(valor).toISOString()
}

export function PedidoAdminModal({ vendaId, onFechar, onAtualizado }: Props) {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const [clienteNome, setClienteNome] = useState('')
  const [operadorNome, setOperadorNome] = useState('')
  const [status, setStatus] = useState('')
  const [conciliadoEm, setConciliadoEm] = useState<string | null>(null)
  const [dataVendaInput, setDataVendaInput] = useState('')
  const [itens, setItens] = useState<ItemEditavel[]>([])
  const [desconto, setDesconto] = useState('0')
  const [pagamentosConciliados, setPagamentosConciliados] = useState<
    { forma: FormaPagamento; valor: number }[]
  >([])
  const [pagamentosForm, setPagamentosForm] = useState<PagamentoForm[]>([])

  const [produtos, setProdutos] = useState<Produto[]>([])
  const [buscandoProduto, setBuscandoProduto] = useState(false)
  const [buscaQuery, setBuscaQuery] = useState('')
  // quantidade original (ja deduzida do estoque) por produto, no momento em
  // que o modal abriu - usado pra calcular ate onde da pra aumentar a
  // quantidade de um item sem violar o estoque real.
  const [reservadoOriginal, setReservadoOriginal] = useState<Record<string, number>>({})

  async function carregar() {
    setCarregando(true)
    setErro(null)

    const [{ data: venda, error: errVenda }, { data: itensData, error: errItens }, { data: produtosData }] =
      await Promise.all([
        supabase
          .from('vendas')
          .select('id, status, conciliado_em, desconto, total, finalizada_em, clientes(nome), operadores!operador_id(nome)')
          .eq('id', vendaId)
          .single(),
        supabase
          .from('venda_itens')
          .select('produto_id, quantidade, preco_unitario, produtos(nome, unidade)')
          .eq('venda_id', vendaId),
        supabase.from('produtos').select('*').eq('ativo', true),
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
    setOperadorNome(vendaDetalhe.operadores?.nome ?? '—')
    setStatus(vendaDetalhe.status)
    setConciliadoEm(vendaDetalhe.conciliado_em)
    setDataVendaInput(vendaDetalhe.finalizada_em ? paraDatetimeLocal(vendaDetalhe.finalizada_em) : '')
    setDesconto(String(vendaDetalhe.desconto ?? 0))
    setProdutos((produtosData as Produto[]) ?? [])

    const itensCarregados = (itensData ?? []) as unknown as ItemRaw[]

    setItens(
      itensCarregados.map((i) => ({
        produto_id: i.produto_id,
        nome: i.produtos?.nome ?? '—',
        unidade: i.produtos?.unidade ?? 'unidade',
        quantidade: String(i.quantidade),
        preco_unitario: String(i.preco_unitario),
      })),
    )

    setReservadoOriginal(
      itensCarregados.reduce<Record<string, number>>((acc, i) => {
        acc[i.produto_id] = (acc[i.produto_id] ?? 0) + i.quantidade
        return acc
      }, {}),
    )

    if (vendaDetalhe.conciliado_em) {
      const { data: pagamentos } = await supabase
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

  // Ate quanto da pra colocar nessa linha (produtoId) sem estourar o
  // estoque - soma o que ja estava reservado por essa venda (essa
  // quantidade ja foi deduzida no banco, entao "volta" pro calculo) menos o
  // que outras linhas do mesmo produto ja estao usando no pedido em edicao.
  function limiteEstoque(produtoId: string, ignorarIndex?: number) {
    const emEstoque = produtos.find((p) => p.id === produtoId)?.estoque_atual ?? 0
    const reservado = reservadoOriginal[produtoId] ?? 0
    const emOutrasLinhas = itens.reduce(
      (soma, item, i) =>
        item.produto_id === produtoId && i !== ignorarIndex ? soma + (Number(item.quantidade) || 0) : soma,
      0,
    )
    return emEstoque + reservado - emOutrasLinhas
  }

  function atualizarItem(index: number, campo: 'quantidade' | 'preco_unitario', valor: string) {
    if (campo === 'quantidade') {
      const item = itens[index]
      const quantidade = Number(valor)
      const limite = limiteEstoque(item.produto_id, index)
      if (quantidade > limite) {
        setErro(`Quantidade indisponível para "${item.nome}" — estoque atual: ${limite}`)
        return
      }
      setErro(null)
    }
    setItens((atual) => atual.map((item, i) => (i === index ? { ...item, [campo]: valor } : item)))
  }

  function removerItem(index: number) {
    setItens((atual) => atual.filter((_, i) => i !== index))
  }

  function adicionarProduto(produto: Produto) {
    const limite = limiteEstoque(produto.id)
    if (limite < 1) {
      setErro(`Quantidade indisponível para "${produto.nome}" — estoque atual: ${limite}`)
      setBuscandoProduto(false)
      return
    }
    setErro(null)
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
    if (!dataVendaInput) {
      setErro('Informe a data da venda.')
      return
    }
    setErro(null)
    setSalvando(true)

    const { error } = await supabase.rpc('editar_venda_admin', {
      p_venda_id: vendaId,
      p_itens: itens.map((i) => ({
        produto_id: i.produto_id,
        quantidade: Number(i.quantidade),
        preco_unitario: Number(i.preco_unitario),
      })),
      p_desconto: Number(desconto) || 0,
      p_finalizada_em: deDatetimeLocal(dataVendaInput),
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

    const { error } = await supabase.rpc('conciliar_venda', {
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

    const { error } = await supabase.rpc('cancelar_venda', { p_venda_id: vendaId })

    setSalvando(false)

    if (error) {
      setErro(error.message)
      return
    }

    onAtualizado()
    onFechar()
  }

  async function reativarPedido() {
    if (!window.confirm('Reativar este pedido? O estoque dos itens será deduzido de novo.')) return

    setErro(null)
    setSalvando(true)

    const { error } = await supabase.rpc('reativar_venda', { p_venda_id: vendaId })

    setSalvando(false)

    if (error) {
      setErro(error.message)
      return
    }

    await carregar()
    onAtualizado()
  }

  const podeEditar = status === 'finalizada'
  const podeCancelar = status === 'finalizada'
  const podeReativar = status === 'cancelada'

  return (
    <div className="modal-fundo">
      <div className="modal-caixa pedido-admin">
        <div className="pedido-admin-cabecalho">
          <h2>Pedido — {clienteNome}</h2>
          <span className="venda-cliente-vazio">Vendido por: {operadorNome}</span>
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
          <div className="pedido-admin-corpo">
            {erro && <p className="erro">{erro}</p>}

            {podeEditar ? (
              <div className="cliente-box">
                <div className="cliente-header">Data da venda</div>
                <hr className="cliente-rule" />
                <input
                  type="datetime-local"
                  value={dataVendaInput}
                  onChange={(e) => setDataVendaInput(e.target.value)}
                />
              </div>
            ) : (
              dataVendaInput && (
                <p className="venda-cliente-vazio">
                  Data da venda: {new Date(deDatetimeLocal(dataVendaInput)).toLocaleString('pt-BR')}
                </p>
              )
            )}

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
                        <>
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={item.quantidade}
                            onChange={(e) => atualizarItem(i, 'quantidade', e.target.value)}
                          />
                          <div className="venda-peso-estoque">
                            est.: {limiteEstoque(item.produto_id, i)}
                          </div>
                        </>
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

            {podeEditar && !conciliadoEm && (
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
              <>
                <ul className="venda-pagamentos-lista">
                  {pagamentosConciliados.map((p, i) => (
                    <li key={i}>
                      <span>{rotuloForma[p.forma]}</span>
                      <span>{moeda(p.valor)}</span>
                    </li>
                  ))}
                </ul>
                {podeEditar && (
                  <p className="venda-cliente-vazio">
                    Editar itens/desconto reajusta esses valores proporcionalmente ao novo total.
                  </p>
                )}
              </>
            )}
          </div>

            <div className="modal-acoes pedido-admin-rodape">
              {podeCancelar && (
                <button type="button" onClick={cancelarPedido} disabled={salvando}>
                  Cancelar pedido
                </button>
              )}
              {podeReativar && (
                <button type="button" onClick={reativarPedido} disabled={salvando}>
                  {salvando ? 'Reativando...' : 'Reativar pedido'}
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
