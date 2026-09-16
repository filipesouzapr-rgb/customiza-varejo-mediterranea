import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { NOME_ESTABELECIMENTO } from '../../lib/config'
import { useRelogio } from '../../lib/useRelogio'
import { SeletorModal } from '../../components/caixa/SeletorModal'
import { TerminalFrame } from '../../components/caixa/TerminalFrame'
import { PedidoA4 } from '../../components/PedidoA4'
import logoCustomiza from '../../assets/logo-customiza.png'
import type { ItemCarrinho, Operador, Produto } from '../../types'

interface Props {
  operador: Operador
}

interface ClienteResumo {
  id: string
  nome: string
  cpf: string | null
  telefone: string | null
}

type Modo = null | 'busca-produto' | 'cliente'

interface VendaConcluida {
  vendaId: string
  dataHora: Date
  cliente: ClienteResumo
  itens: ItemCarrinho[]
}

export function VendaPage({ operador }: Props) {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [codigo, setCodigo] = useState('')
  const [erroCodigo, setErroCodigo] = useState<string | null>(null)
  const [produtoQuantidadePendente, setProdutoQuantidadePendente] = useState<Produto | null>(null)
  const [quantidadeInput, setQuantidadeInput] = useState('')

  const [itens, setItens] = useState<ItemCarrinho[]>([])
  const [cliente, setCliente] = useState<ClienteResumo | null>(null)
  const [clienteResultados, setClienteResultados] = useState<ClienteResumo[]>([])

  const [buscaProdutoQuery, setBuscaProdutoQuery] = useState('')

  const [modo, setModo] = useState<Modo>(null)

  const [finalizando, setFinalizando] = useState(false)
  const [erroFinalizar, setErroFinalizar] = useState<string | null>(null)
  const [vendaConcluida, setVendaConcluida] = useState<VendaConcluida | null>(null)
  const [impressao, setImpressao] = useState<{ mostrarValores: boolean } | null>(null)

  const inputCodigoRef = useRef<HTMLInputElement>(null)
  const agora = useRelogio()

  function carregarProdutos() {
    supabase
      .from('produtos')
      .select('*')
      .eq('ativo', true)
      .then(({ data }) => setProdutos((data as Produto[]) ?? []))
  }

  useEffect(() => {
    carregarProdutos()
  }, [])

  useEffect(() => {
    if (modo === null && !produtoQuantidadePendente && !vendaConcluida) inputCodigoRef.current?.focus()
  }, [modo, produtoQuantidadePendente, vendaConcluida])

  useEffect(() => {
    if (impressao) window.print()
  }, [impressao])

  // Atalhos de teclado: F2 busca produto por nome, F4 vincula cliente
  // (obrigatório), F9 finaliza. Nada de valor passa por aqui — o operador
  // não vê preço, subtotal, desconto ou troco em nenhum momento.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (vendaConcluida) return

      if (modo !== null) {
        if (event.key === 'Escape') {
          event.preventDefault()
          setModo(null)
        }
        return
      }

      if (event.key === 'F2') {
        event.preventDefault()
        setBuscaProdutoQuery('')
        setModo('busca-produto')
      } else if (event.key === 'F4') {
        event.preventDefault()
        setClienteResultados([])
        setModo('cliente')
      } else if (event.key === 'F9') {
        event.preventDefault()
        finalizarVenda()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, itens, cliente, finalizando, vendaConcluida])

  function adicionarItem(produto: Produto, quantidade: number) {
    setItens((atual) => {
      if (produto.unidade === 'unidade') {
        const existente = atual.find((i) => i.produto.id === produto.id)
        if (existente) {
          return atual.map((i) =>
            i.produto.id === produto.id ? { ...i, quantidade: i.quantidade + quantidade } : i,
          )
        }
      }
      return [...atual, { produto, quantidade }]
    })
  }

  // Selecionar pela busca por nome (F2) sempre pergunta a quantidade — é o
  // caminho mais visível pra "colocar a quantidade" de um produto, sem
  // depender de saber o atalho "5x<código>" do campo de código de barras.
  function selecionarProdutoNaBusca(produto: Produto) {
    setProdutoQuantidadePendente(produto)
    setQuantidadeInput(produto.unidade === 'kg' ? '' : '1')
    setModo(null)
  }

  // Escanear/digitar o código direto continua rápido pra item por unidade
  // (adiciona 1 na hora, sem pedir nada) — só pesagem (kg) sempre precisa
  // de um número. Quem quiser lançar mais de 1 unidade no scanner usa o
  // atalho "5x<código>".
  function selecionarProdutoNoScan(produto: Produto) {
    if (produto.unidade === 'kg') {
      setProdutoQuantidadePendente(produto)
      setQuantidadeInput('')
    } else {
      adicionarItem(produto, 1)
    }
  }

  function handleCodigoSubmit(event: FormEvent) {
    event.preventDefault()
    setErroCodigo(null)
    const valor = codigo.trim()
    if (!valor) return

    // Aceita "5x<codigo>" ou "5*<codigo>" pra lançar varias unidades de
    // uma vez, sem precisar escanear o mesmo item repetidas vezes.
    const match = valor.match(/^(\d+(?:[.,]\d+)?)\s*[xX*]\s*(.+)$/)
    const quantidadeInformada = match ? Number(match[1].replace(',', '.')) : null
    const codigoBuscado = match ? match[2].trim() : valor

    const produto = produtos.find(
      (p) => p.codigo_barras === codigoBuscado || p.codigo_interno === codigoBuscado,
    )

    if (!produto) {
      setErroCodigo('Produto não encontrado. F2 para buscar por nome.')
      setCodigo('')
      return
    }

    setCodigo('')

    if (quantidadeInformada && quantidadeInformada > 0) {
      adicionarItem(produto, quantidadeInformada)
      return
    }

    selecionarProdutoNoScan(produto)
  }

  function confirmarQuantidadePendente(event: FormEvent) {
    event.preventDefault()
    if (!produtoQuantidadePendente) return
    const quantidade = Number(quantidadeInput)
    if (!quantidade || quantidade <= 0) return

    adicionarItem(produtoQuantidadePendente, quantidade)
    setProdutoQuantidadePendente(null)
    setQuantidadeInput('')
  }

  function removerItem(index: number) {
    setItens((atual) => atual.filter((_, i) => i !== index))
  }

  function atualizarQuantidadeItem(index: number, valor: string) {
    const quantidade = Number(valor)
    if (!quantidade || quantidade <= 0) return
    setItens((atual) => atual.map((item, i) => (i === index ? { ...item, quantidade } : item)))
  }

  async function buscarClientes(query: string) {
    if (query.trim().length < 2) {
      setClienteResultados([])
      return
    }
    const { data } = await supabase
      .from('clientes')
      .select('id, nome, cpf, telefone')
      .or(`nome.ilike.%${query}%,cpf.ilike.%${query}%`)
      .eq('ativo', true)
      .limit(8)
    setClienteResultados((data as ClienteResumo[]) ?? [])
  }

  function selecionarCliente(id: string) {
    const encontrado = clienteResultados.find((c) => c.id === id)
    if (encontrado) setCliente(encontrado)
    setModo(null)
  }

  async function finalizarVenda() {
    if (itens.length === 0 || finalizando) return
    if (!cliente) {
      setErroFinalizar('Selecione um cliente (F4) antes de finalizar.')
      return
    }

    setErroFinalizar(null)
    setFinalizando(true)

    const { data, error } = await supabase.rpc('finalizar_venda', {
      p_operador_id: operador.id,
      p_cliente_id: cliente.id,
      p_itens: itens.map((i) => ({ produto_id: i.produto.id, quantidade: i.quantidade })),
    })

    setFinalizando(false)

    if (error) {
      setErroFinalizar(error.message)
      return
    }

    setVendaConcluida({ vendaId: data as string, dataHora: new Date(), cliente, itens })
    setItens([])
    setCliente(null)
    carregarProdutos()
  }

  function novaVenda() {
    setVendaConcluida(null)
    setImpressao(null)
    setErroFinalizar(null)
  }

  function imprimir(mostrarValores: boolean) {
    setImpressao({ mostrarValores })
  }

  if (vendaConcluida) {
    return (
      <TerminalFrame titulo="VENDA REGISTRADA">
        <div className="venda-confirmacao">
          <h1>Venda registrada</h1>
          <p>
            Cliente: {vendaConcluida.cliente.nome} — {vendaConcluida.itens.length} item(ns)
          </p>
          <p className="venda-cliente-vazio">Pagamento a conciliar pelo admin.</p>
          {operador.papel === 'operador' ? (
            <div className="venda-confirmacao-acoes">
              <button type="button" onClick={() => imprimir(false)}>
                Imprimir pedido
              </button>
              <button type="button" onClick={novaVenda}>
                Nova venda
              </button>
            </div>
          ) : (
            <div className="venda-confirmacao-escolha">
              <div className="venda-confirmacao-acoes">
                <button type="button" onClick={() => imprimir(true)}>
                  Imprimir com valores
                </button>
                <button type="button" onClick={() => imprimir(false)}>
                  Imprimir só itens
                </button>
              </div>
              <button type="button" onClick={novaVenda}>
                Nova venda
              </button>
            </div>
          )}
        </div>
        {impressao && (
          <PedidoA4
            numeroPedido={vendaConcluida.vendaId.slice(0, 8).toUpperCase()}
            dataHora={vendaConcluida.dataHora.toLocaleString('pt-BR')}
            cliente={vendaConcluida.cliente.nome}
            mostrarValores={impressao.mostrarValores}
            itens={vendaConcluida.itens.map((i) => ({
              nome: i.produto.nome,
              quantidade: i.quantidade,
              unidade: i.produto.unidade,
              precoUnitario: i.produto.preco,
            }))}
            total={vendaConcluida.itens.reduce(
              (soma, i) => soma + i.quantidade * i.produto.preco,
              0,
            )}
          />
        )}
      </TerminalFrame>
    )
  }

  const produtosFiltrados = produtos
    .filter((p) => {
      const q = buscaProdutoQuery.trim().toLowerCase()
      if (!q) return true
      return (
        p.nome.toLowerCase().includes(q) ||
        p.codigo_interno.toLowerCase().includes(q) ||
        (p.codigo_barras ?? '').toLowerCase().includes(q)
      )
    })
    .slice(0, 8)

  const dataHora = `${String(agora.getDate()).padStart(2, '0')}/${String(agora.getMonth() + 1).padStart(2, '0')}/${agora.getFullYear()} ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`

  return (
    <>
      <TerminalFrame
        titulo="VENDA"
        rodape={
          <div className="statusbar">
            <span className="item">
              <span className="k">Loja</span>
              <span className="v">{NOME_ESTABELECIMENTO}</span>
            </span>
            <span className="item">
              <span className="k">Operador</span>
              <span className="v">{operador.nome}</span>
            </span>
            <span className="item">
              <span className="k">Data</span>
              <span className="v">{dataHora}</span>
            </span>
            <span className="shortcuts">
              <span>
                <span className="key">F2</span>Produto
              </span>
              <span>
                <span className="key">F4</span>Cliente
              </span>
              <span>
                <span className="key">F9</span>Finalizar
              </span>
            </span>
          </div>
        }
      >
        <div className="col-left">
          <form onSubmit={handleCodigoSubmit} className="scan-row">
            <label>Código de barras / interno</label>
            <input
              ref={inputCodigoRef}
              className="scan-input"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              autoFocus
              disabled={modo !== null || !!produtoQuantidadePendente}
            />
            <div className="scan-hint">5x&lt;código&gt; lança quantidade direto — F2 busca por nome</div>
          </form>
          <button
            type="button"
            onClick={() => {
              setBuscaProdutoQuery('')
              setModo('busca-produto')
            }}
          >
            Buscar produto (F2)
          </button>
          {erroCodigo && <p className="erro">{erroCodigo}</p>}

          {produtoQuantidadePendente && (
            <form onSubmit={confirmarQuantidadePendente} className="venda-peso">
              <span className="venda-peso-label">
                {produtoQuantidadePendente.nome} —{' '}
                {produtoQuantidadePendente.unidade === 'kg' ? 'informe o peso (kg)' : 'informe a quantidade'}
              </span>
              <input
                type="number"
                step={produtoQuantidadePendente.unidade === 'kg' ? '0.001' : '1'}
                min={produtoQuantidadePendente.unidade === 'kg' ? '0' : '1'}
                value={quantidadeInput}
                onChange={(e) => setQuantidadeInput(e.target.value)}
                autoFocus
                required
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setProdutoQuantidadePendente(null)
                    setQuantidadeInput('')
                  }
                }}
              />
              <div className="venda-peso-acoes">
                <button type="submit">Adicionar</button>
                <button type="button" onClick={() => setProdutoQuantidadePendente(null)}>
                  Cancelar (Esc)
                </button>
              </div>
            </form>
          )}

          <div className="cart">
            <div className="cart-head">
              <span>Item</span>
              <span>Descrição</span>
              <span>Qtd</span>
              <span></span>
            </div>
            {itens.map((item, i) => (
              <div className="cart-row" key={i}>
                <span className="cart-num">{String(i + 1).padStart(3, '0')}</span>
                <span className="cart-desc">
                  <span className="cart-code">{item.produto.codigo_barras ?? item.produto.codigo_interno}</span>
                  {item.produto.nome}
                </span>
                <span className="cart-qty">
                  <input
                    type="number"
                    className="cart-qty-input"
                    step={item.produto.unidade === 'kg' ? '0.001' : '1'}
                    min={item.produto.unidade === 'kg' ? '0.001' : '1'}
                    value={item.quantidade}
                    onChange={(e) => atualizarQuantidadeItem(i, e.target.value)}
                  />
                  {item.produto.unidade === 'kg' ? 'kg' : ''}
                </span>
                <button type="button" onClick={() => removerItem(i)}>
                  Remover
                </button>
              </div>
            ))}
            {itens.length === 0 && <p className="venda-cliente-vazio">Nenhum item ainda.</p>}
          </div>
        </div>

        <div className="col-right">
          <div className={`cliente-box${!cliente && erroFinalizar ? ' obrigatorio-pendente' : ''}`}>
            <div className="cliente-header">Cliente (obrigatório)</div>
            <hr className="cliente-rule" />
            {cliente ? (
              <div className="cliente-linha">
                <span className="cliente-nome">
                  <b>Nome:</b> {cliente.nome.toUpperCase()}
                </span>
                <button type="button" onClick={() => setCliente(null)}>
                  Remover
                </button>
              </div>
            ) : (
              <div className="cliente-linha">
                <p className="venda-cliente-vazio">Nenhum cliente selecionado</p>
                <button
                  type="button"
                  onClick={() => {
                    setClienteResultados([])
                    setModo('cliente')
                  }}
                >
                  Selecionar cliente (F4)
                </button>
              </div>
            )}
          </div>

          {erroFinalizar && <p className="erro">{erroFinalizar}</p>}

          <button
            type="button"
            onClick={finalizarVenda}
            disabled={itens.length === 0 || finalizando}
          >
            {finalizando ? 'Finalizando...' : 'Finalizar venda (F9)'}
          </button>

          <div className="brand-card">
            <img src={logoCustomiza} alt="Customiza Sistemas" />
            <span className="brand-name">{NOME_ESTABELECIMENTO}</span>
          </div>
        </div>
      </TerminalFrame>

      {modo === 'busca-produto' && (
        <SeletorModal
          titulo="Buscar produto por nome"
          placeholder="Digite o nome do produto"
          itens={produtosFiltrados.map((p) => ({
            id: p.id,
            label: p.nome,
            sublabel: p.unidade === 'kg' ? 'kg' : 'un',
          }))}
          onQueryChange={setBuscaProdutoQuery}
          onSelecionar={(id) => {
            const produto = produtos.find((p) => p.id === id)
            if (produto) selecionarProdutoNaBusca(produto)
          }}
          onFechar={() => setModo(null)}
        />
      )}

      {modo === 'cliente' && (
        <SeletorModal
          titulo="Selecionar cliente"
          placeholder="Nome ou CPF (mín. 2 letras)"
          itens={clienteResultados.map((c) => ({
            id: c.id,
            label: c.nome,
            sublabel: c.cpf ?? undefined,
          }))}
          onQueryChange={buscarClientes}
          onSelecionar={selecionarCliente}
          onFechar={() => setModo(null)}
        />
      )}
    </>
  )
}
