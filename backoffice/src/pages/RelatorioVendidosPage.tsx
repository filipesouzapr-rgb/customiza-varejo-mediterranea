import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { gerarPdfRelatorio } from '../lib/pdfRelatorio'
import type { UnidadeProduto } from '../types'

type Modo = 'produto' | 'categoria'
type Campo = 'rotulo' | 'quantidade' | 'valor'
type Direcao = 'asc' | 'desc'

interface LinhaRelatorio {
  chave: string
  rotulo: string
  quantidade: number
  valor: number
  unidade: UnidadeProduto
}

interface ItemVendaRaw {
  quantidade: number
  preco_unitario: number
  produtos: { nome: string; unidade: UnidadeProduto; categoria: string | null } | null
}

interface VendaRaw {
  finalizada_em: string
  venda_itens: ItemVendaRaw[] | null
}

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dataISO(date: Date) {
  return date.toISOString().slice(0, 10)
}

function hoje() {
  return dataISO(new Date())
}

function primeiroDiaMes() {
  const d = new Date()
  return dataISO(new Date(d.getFullYear(), d.getMonth(), 1))
}

function rotuloQtd(quantidade: number, unidade: UnidadeProduto) {
  return `${quantidade}${unidade === 'kg' ? 'kg' : ''}`
}

export function RelatorioVendidosPage() {
  const [inicio, setInicio] = useState(primeiroDiaMes())
  const [fim, setFim] = useState(hoje())
  const [busca, setBusca] = useState('')
  const [modo, setModo] = useState<Modo>('produto')
  const [ordenacao, setOrdenacao] = useState<{ campo: Campo; direcao: Direcao }>({
    campo: 'quantidade',
    direcao: 'desc',
  })

  const [itensCarregados, setItensCarregados] = useState<ItemVendaRaw[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const cargaRef = useRef(0)

  async function carregar() {
    const minhaCarga = ++cargaRef.current
    setCarregando(true)
    setErro(null)

    const fimComHora = `${fim}T23:59:59`

    const { data, error } = await supabase
      .from('vendas')
      .select('finalizada_em, venda_itens(quantidade, preco_unitario, produtos(nome, unidade, categoria))')
      .eq('status', 'finalizada')
      .gte('finalizada_em', inicio)
      .lte('finalizada_em', fimComHora)

    if (minhaCarga !== cargaRef.current) return

    if (error) {
      setErro(error.message)
      setCarregando(false)
      return
    }

    const todosItens = ((data ?? []) as unknown as VendaRaw[]).flatMap((v) => v.venda_itens ?? [])
    setItensCarregados(todosItens)
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicio, fim])

  function agregar(): LinhaRelatorio[] {
    const q = busca.trim().toLowerCase()
    const grupos = new Map<string, LinhaRelatorio>()

    for (const item of itensCarregados) {
      const produto = item.produtos
      if (!produto) continue
      if (q && !produto.nome.toLowerCase().includes(q)) continue

      const rotulo =
        modo === 'produto' ? produto.nome : (produto.categoria ?? '').trim() || produto.nome
      const chave = `${rotulo.toLowerCase()}__${produto.unidade}`
      const quantidade = Number(item.quantidade) || 0
      const valor = quantidade * (Number(item.preco_unitario) || 0)

      const existente = grupos.get(chave)
      if (existente) {
        existente.quantidade += quantidade
        existente.valor += valor
      } else {
        grupos.set(chave, { chave, rotulo, quantidade, valor, unidade: produto.unidade })
      }
    }

    const linhas = Array.from(grupos.values())
    linhas.sort((a, b) => {
      let cmp = 0
      if (ordenacao.campo === 'rotulo') cmp = a.rotulo.localeCompare(b.rotulo, 'pt-BR')
      else cmp = a[ordenacao.campo] - b[ordenacao.campo]
      return ordenacao.direcao === 'asc' ? cmp : -cmp
    })
    return linhas
  }

  const linhas = agregar()
  const totalQuantidade = linhas.reduce((soma, l) => soma + l.quantidade, 0)
  const totalValor = linhas.reduce((soma, l) => soma + l.valor, 0)

  function alternarOrdenacao(campo: Campo) {
    setOrdenacao((atual) =>
      atual.campo === campo
        ? { campo, direcao: atual.direcao === 'asc' ? 'desc' : 'asc' }
        : { campo, direcao: 'desc' },
    )
  }

  function indicador(campo: Campo) {
    if (ordenacao.campo !== campo) return ''
    return ordenacao.direcao === 'asc' ? ' ▲' : ' ▼'
  }

  function gerarPdf() {
    gerarPdfRelatorio({
      titulo: `Quantidade vendida por ${modo === 'produto' ? 'produto' : 'categoria'} — ${new Date(inicio + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(fim + 'T00:00:00').toLocaleDateString('pt-BR')}`,
      slug: modo === 'produto' ? 'vendidos-produto' : 'vendidos-categoria',
      colunas: [modo === 'produto' ? 'Produto' : 'Categoria', 'Quantidade', 'Valor total'],
      linhas: linhas.map((l) => [l.rotulo, rotuloQtd(l.quantidade, l.unidade), moeda(l.valor)]),
    })
  }

  return (
    <div className="fiado-page">
      <section className="fiado-detalhe">
        <h2>Quantidade vendida</h2>

        <div className="fiado-periodo">
          <label>
            De
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </label>
          <label>
            Até
            <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </label>
          <label>
            Produto (opcional)
            <input
              type="text"
              placeholder="Filtrar por nome"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </label>
          <div className="filtro-situacao">
            <button type="button" className={modo === 'produto' ? 'ativo' : ''} onClick={() => setModo('produto')}>
              Por produto
            </button>
            <button
              type="button"
              className={modo === 'categoria' ? 'ativo' : ''}
              onClick={() => setModo('categoria')}
            >
              Por categoria
            </button>
          </div>
        </div>

        <button type="button" onClick={gerarPdf}>
          Gerar PDF
        </button>

        <div className="dashboard-cards">
          <div className="dashboard-card">
            <span className="dashboard-card-titulo">Total vendido no período</span>
            <span className="dashboard-card-valor">{moeda(totalValor)}</span>
            <span className="dashboard-card-sub">
              {totalQuantidade} item(ns) · {linhas.length} {modo === 'produto' ? 'produto(s)' : 'categoria(s)'}
            </span>
          </div>
        </div>

        {erro && <p className="erro">{erro}</p>}
        {carregando ? (
          <p>Carregando...</p>
        ) : (
          <div className="tabela-scroll">
            <table>
              <thead>
                <tr>
                  <th className="coluna-ordenavel" onClick={() => alternarOrdenacao('rotulo')}>
                    {modo === 'produto' ? 'Produto' : 'Categoria'}
                    {indicador('rotulo')}
                  </th>
                  <th className="coluna-ordenavel" onClick={() => alternarOrdenacao('quantidade')}>
                    Quantidade{indicador('quantidade')}
                  </th>
                  <th className="coluna-ordenavel" onClick={() => alternarOrdenacao('valor')}>
                    Valor total{indicador('valor')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.chave}>
                    <td>{l.rotulo}</td>
                    <td>{rotuloQtd(l.quantidade, l.unidade)}</td>
                    <td>{moeda(l.valor)}</td>
                  </tr>
                ))}
                {linhas.length === 0 && (
                  <tr>
                    <td colSpan={3}>Nenhuma venda no período/filtro selecionado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
