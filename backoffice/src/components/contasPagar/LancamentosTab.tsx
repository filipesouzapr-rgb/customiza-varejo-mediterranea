import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { NovoLancamentoModal } from './NovoLancamentoModal'
import { EditarLancamentoModal } from './EditarLancamentoModal'
import type { Fornecedor, GrupoDespesa } from '../../types'

interface LinhaConta {
  id: string
  descricao: string
  valor: number
  desconto: number
  data_vencimento: string
  status: 'nao_conciliado' | 'conciliado'
  fornecedor_nome: string | null
  grupo_nome: string
}

interface LinhaContaRaw {
  id: string
  descricao: string
  valor: number
  desconto: number
  data_vencimento: string
  status: 'nao_conciliado' | 'conciliado'
  fornecedores: { nome: string } | null
  grupos_despesa: { nome: string } | null
}

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dataISO(date: Date) {
  return date.toISOString().slice(0, 10)
}

function primeiroDiaMes() {
  const d = new Date()
  return dataISO(new Date(d.getFullYear(), d.getMonth(), 1))
}

function ultimoDiaMes() {
  const d = new Date()
  return dataISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

export function LancamentosTab() {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [grupos, setGrupos] = useState<GrupoDespesa[]>([])

  const [filtroInicio, setFiltroInicio] = useState(primeiroDiaMes())
  const [filtroFim, setFiltroFim] = useState(ultimoDiaMes())
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'nao_conciliado' | 'conciliado'>('todos')
  const [filtroFornecedor, setFiltroFornecedor] = useState('')
  const [filtroGrupo, setFiltroGrupo] = useState('')

  const [lista, setLista] = useState<LinhaConta[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [emAtrasoTotal, setEmAtrasoTotal] = useState(0)
  const [emAtrasoCount, setEmAtrasoCount] = useState(0)

  const [mostrarNovo, setMostrarNovo] = useState(false)
  const [contaAberta, setContaAberta] = useState<string | null>(null)

  async function carregarCadastros() {
    const [{ data: forn }, { data: grup }] = await Promise.all([
      supabase.from('fornecedores').select('*').eq('ativo', true).order('nome'),
      supabase.from('grupos_despesa').select('*').eq('ativo', true).order('nome'),
    ])
    setFornecedores((forn as Fornecedor[]) ?? [])
    setGrupos((grup as GrupoDespesa[]) ?? [])
  }

  async function carregarEmAtraso() {
    const hoje = dataISO(new Date())
    const { data } = await supabase
      .from('contas_pagar')
      .select('valor, desconto')
      .eq('status', 'nao_conciliado')
      .lt('data_vencimento', hoje)

    const linhas = (data ?? []) as { valor: number; desconto: number }[]
    setEmAtrasoCount(linhas.length)
    setEmAtrasoTotal(linhas.reduce((soma, l) => soma + (Number(l.valor) - Number(l.desconto)), 0))
  }

  async function carregarLista() {
    setCarregando(true)
    setErro(null)

    let query = supabase
      .from('contas_pagar')
      .select('id, descricao, valor, desconto, data_vencimento, status, fornecedores(nome), grupos_despesa(nome)')
      .gte('data_vencimento', filtroInicio)
      .lte('data_vencimento', filtroFim)
      .order('data_vencimento', { ascending: true })

    if (filtroStatus !== 'todos') query = query.eq('status', filtroStatus)
    if (filtroFornecedor) query = query.eq('fornecedor_id', filtroFornecedor)
    if (filtroGrupo) query = query.eq('grupo_id', filtroGrupo)

    const { data, error } = await query

    if (error) {
      setErro(error.message)
      setCarregando(false)
      return
    }

    setLista(
      ((data ?? []) as unknown as LinhaContaRaw[]).map((c) => ({
        id: c.id,
        descricao: c.descricao,
        valor: c.valor,
        desconto: c.desconto,
        data_vencimento: c.data_vencimento,
        status: c.status,
        fornecedor_nome: c.fornecedores?.nome ?? null,
        grupo_nome: c.grupos_despesa?.nome ?? '—',
      })),
    )
    setCarregando(false)
  }

  async function recarregarTudo() {
    await carregarLista()
    await carregarEmAtraso()
  }

  useEffect(() => {
    async function iniciar() {
      await supabase.rpc('gerar_ocorrencias_contas_pagar')
      await carregarCadastros()
      await recarregarTudo()
    }
    iniciar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    carregarLista()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroInicio, filtroFim, filtroStatus, filtroFornecedor, filtroGrupo])

  const totalAPagar = lista
    .filter((l) => l.status === 'nao_conciliado')
    .reduce((soma, l) => soma + (Number(l.valor) - Number(l.desconto)), 0)
  const totalPago = lista
    .filter((l) => l.status === 'conciliado')
    .reduce((soma, l) => soma + (Number(l.valor) - Number(l.desconto)), 0)

  return (
    <div>
      <div className="dashboard-cards">
        <div className="dashboard-card">
          <span className="dashboard-card-titulo">A pagar no período</span>
          <span className="dashboard-card-valor">{moeda(totalAPagar)}</span>
        </div>
        <div className="dashboard-card">
          <span className="dashboard-card-titulo">Já pago no período</span>
          <span className="dashboard-card-valor">{moeda(totalPago)}</span>
        </div>
        <div className="dashboard-card">
          <span className="dashboard-card-titulo">Em atraso</span>
          <span className="dashboard-card-valor">{moeda(emAtrasoTotal)}</span>
          <span className="dashboard-card-sub">{emAtrasoCount} conta(s)</span>
        </div>
      </div>

      <div className="contas-pagar-filtros">
        <label>
          Vencimento de
          <input type="date" value={filtroInicio} onChange={(e) => setFiltroInicio(e.target.value)} />
        </label>
        <label>
          até
          <input type="date" value={filtroFim} onChange={(e) => setFiltroFim(e.target.value)} />
        </label>
        <label>
          Status
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)}>
            <option value="todos">Todos</option>
            <option value="nao_conciliado">Pendente</option>
            <option value="conciliado">Pago</option>
          </select>
        </label>
        <label>
          Fornecedor
          <select value={filtroFornecedor} onChange={(e) => setFiltroFornecedor(e.target.value)}>
            <option value="">Todos</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Grupo
          <select value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value)}>
            <option value="">Todos</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setMostrarNovo(true)}>
          + Nova conta
        </button>
      </div>

      {erro && <p className="erro">{erro}</p>}
      {carregando ? (
        <p>Carregando...</p>
      ) : (
        <div className="tabela-scroll">
          <table>
            <thead>
              <tr>
                <th>Vencimento</th>
                <th>Descrição</th>
                <th>Fornecedor</th>
                <th>Grupo</th>
                <th>Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((l) => {
                const vencida = l.status === 'nao_conciliado' && l.data_vencimento < dataISO(new Date())
                return (
                  <tr
                    key={l.id}
                    className={`linha-clicavel${vencida ? ' linha-vencida' : ''}`}
                    onClick={() => setContaAberta(l.id)}
                  >
                    <td>{new Date(l.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                    <td>{l.descricao}</td>
                    <td>{l.fornecedor_nome ?? '—'}</td>
                    <td>{l.grupo_nome}</td>
                    <td>{moeda(Number(l.valor) - Number(l.desconto))}</td>
                    <td>
                      {l.status === 'conciliado' ? (
                        <span className="badge badge-conciliado">Pago</span>
                      ) : (
                        <span className="badge badge-pendente">{vencida ? 'Atrasado' : 'Pendente'}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {lista.length === 0 && (
                <tr>
                  <td colSpan={6}>Nenhuma conta no período/filtro selecionado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {mostrarNovo && (
        <NovoLancamentoModal
          fornecedores={fornecedores}
          grupos={grupos}
          onFechar={() => setMostrarNovo(false)}
          onCriado={recarregarTudo}
        />
      )}

      {contaAberta && (
        <EditarLancamentoModal
          contaId={contaAberta}
          fornecedores={fornecedores}
          grupos={grupos}
          onFechar={() => setContaAberta(null)}
          onAtualizado={recarregarTudo}
        />
      )}
    </div>
  )
}
