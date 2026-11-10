import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { gerarPdfRelatorio } from '../lib/pdfRelatorio'
import { useParamUrl } from '../lib/useParamUrl'
import { rotuloTipoMovimentacao } from '../lib/estoqueMovimentacao'
import type { Produto, TipoEstoqueMovimentacao } from '../types'

interface LinhaMovimentacao {
  id: string
  data_hora: string
  quantidade_antes: number
  quantidade_depois: number
  diferenca: number
  tipo: TipoEstoqueMovimentacao
  motivo: string | null
  produtos: { nome: string } | null
  operadores: { nome: string } | null
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

export function EstoqueMovimentacoesPage() {
  const [inicio, setInicio] = useParamUrl('de', primeiroDiaMes())
  const [fim, setFim] = useParamUrl('ate', hoje())
  const [produtoId, setProdutoId] = useParamUrl('produto', '')
  const [tipoTexto, setTipoTexto] = useParamUrl('tipo', 'todos')
  const tipo = tipoTexto as TipoEstoqueMovimentacao | 'todos'

  const [produtos, setProdutos] = useState<Produto[]>([])
  const [movimentacoes, setMovimentacoes] = useState<LinhaMovimentacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('produtos')
      .select('*')
      .order('nome')
      .then(({ data }) => setProdutos((data as Produto[]) ?? []))
  }, [])

  async function carregar() {
    setCarregando(true)
    setErro(null)

    const fimComHora = `${fim}T23:59:59`
    let query = supabase
      .from('estoque_movimentacoes')
      .select('id, data_hora, quantidade_antes, quantidade_depois, diferenca, tipo, motivo, produtos(nome), operadores(nome)')
      .gte('data_hora', inicio)
      .lte('data_hora', fimComHora)
      .order('data_hora', { ascending: false })

    if (produtoId) query = query.eq('produto_id', produtoId)
    if (tipo !== 'todos') query = query.eq('tipo', tipo)

    const { data, error } = await query

    if (error) {
      setErro(error.message)
      setCarregando(false)
      return
    }

    setMovimentacoes((data as unknown as LinhaMovimentacao[]) ?? [])
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicio, fim, produtoId, tipo])

  function imprimir() {
    gerarPdfRelatorio({
      titulo: `Movimentações de estoque — ${new Date(inicio + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(fim + 'T00:00:00').toLocaleDateString('pt-BR')}`,
      slug: 'estoque-movimentacoes',
      colunas: ['Data/hora', 'Produto', 'Tipo', 'Antes', 'Depois', 'Diferença', 'Motivo', 'Usuário'],
      linhas: movimentacoes.map((m) => [
        new Date(m.data_hora).toLocaleString('pt-BR'),
        m.produtos?.nome ?? '—',
        rotuloTipoMovimentacao[m.tipo],
        m.quantidade_antes,
        m.quantidade_depois,
        m.diferenca,
        m.motivo ?? '—',
        m.operadores?.nome ?? '—',
      ]),
    })
  }

  return (
    <div className="fiado-page">
      <section className="fiado-detalhe">
        <h2>Movimentações de estoque</h2>

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
            <select value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
              <option value="">Todos</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo
            <select value={tipo} onChange={(e) => setTipoTexto(e.target.value)}>
              <option value="todos">Todos</option>
              {(Object.keys(rotuloTipoMovimentacao) as TipoEstoqueMovimentacao[]).map((t) => (
                <option key={t} value={t}>
                  {rotuloTipoMovimentacao[t]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button type="button" onClick={imprimir}>
          Imprimir
        </button>

        {erro && <p className="erro">{erro}</p>}
        {carregando ? (
          <p>Carregando...</p>
        ) : (
          <div className="tabela-scroll">
            <table>
              <thead>
                <tr>
                  <th>Data/hora</th>
                  <th>Produto</th>
                  <th>Tipo</th>
                  <th>Antes</th>
                  <th>Depois</th>
                  <th>Diferença</th>
                  <th>Motivo</th>
                  <th>Usuário</th>
                </tr>
              </thead>
              <tbody>
                {movimentacoes.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.data_hora).toLocaleString('pt-BR')}</td>
                    <td>{m.produtos?.nome ?? '—'}</td>
                    <td>{rotuloTipoMovimentacao[m.tipo]}</td>
                    <td>{m.quantidade_antes}</td>
                    <td>{m.quantidade_depois}</td>
                    <td>
                      {m.diferenca > 0 ? '+' : ''}
                      {m.diferenca}
                    </td>
                    <td>{m.motivo ?? '—'}</td>
                    <td>{m.operadores?.nome ?? '—'}</td>
                  </tr>
                ))}
                {movimentacoes.length === 0 && (
                  <tr>
                    <td colSpan={8}>Nenhuma movimentação no período/filtro selecionado.</td>
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
