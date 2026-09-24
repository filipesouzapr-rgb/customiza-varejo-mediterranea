import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PedidoAdminModal } from '../components/PedidoAdminModal'
import { gerarPdfRelatorio } from '../lib/pdfRelatorio'
import { rotuloSituacao, situacaoVenda } from '../lib/situacaoVenda'
import type { SituacaoVenda } from '../lib/situacaoVenda'
import type { FormaPagamento } from '../types'

interface VendaLinha {
  id: string
  total: number
  finalizada_em: string
  status: 'finalizada' | 'cancelada'
  situacao: SituacaoVenda
  forma: string
  cliente_nome: string | null
  operador_nome: string | null
}

interface VendaRaw {
  id: string
  total: number
  finalizada_em: string
  status: 'aberta' | 'finalizada' | 'cancelada'
  clientes: { nome: string } | null
  operadores: { nome: string } | null
  // venda_pagamentos.venda_id NAO e unique aqui (conciliacao pode dividir o
  // pagamento em mais de uma forma) - o embed vem como array.
  venda_pagamentos: { forma: FormaPagamento; valor: number }[] | null
  fiado_pagamento_vendas: { valor: number; fiado_pagamentos: { forma: FormaPagamento | null } | null }[] | null
}

const classeBadge: Record<SituacaoVenda, string> = {
  cancelada: 'badge-cancelado',
  pendente: 'badge-pendente',
  fiado: 'badge-fiado',
  pago: 'badge-pago',
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

function trintaDiasAtras() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return dataISO(d)
}

export function VendasPage() {
  const [inicio, setInicio] = useState(trintaDiasAtras())
  const [fim, setFim] = useState(hoje())
  const [buscaCliente, setBuscaCliente] = useState('')

  const [vendas, setVendas] = useState<VendaLinha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [vendaAberta, setVendaAberta] = useState<string | null>(null)

  // Guarda contra corrida: trocar a data rápido (inclusive digitando no
  // campo, que dispara onChange por segmento) faz mais de uma busca
  // acontecer em paralelo - sem isso, a resposta mais lenta podia
  // sobrescrever a mais recente com dado desatualizado.
  const cargaRef = useRef(0)

  async function carregar() {
    const minhaCarga = ++cargaRef.current
    setCarregando(true)
    setErro(null)

    const fimComHora = `${fim}T23:59:59`

    const { data, error } = await supabase
      .from('vendas')
      .select('id, total, finalizada_em, status, clientes(nome), operadores!operador_id(nome), venda_pagamentos(forma, valor), fiado_pagamento_vendas(valor, fiado_pagamentos(forma))')
      .in('status', ['finalizada', 'cancelada'])
      .gte('finalizada_em', inicio)
      .lte('finalizada_em', fimComHora)
      .order('finalizada_em', { ascending: false })

    if (minhaCarga !== cargaRef.current) return // resposta obsoleta, ignora

    if (error) {
      setErro(error.message)
      setCarregando(false)
      return
    }

    setVendas(
      ((data ?? []) as unknown as VendaRaw[]).map((v) => {
        const status = v.status as 'finalizada' | 'cancelada'
        const { situacao, forma } = situacaoVenda({
          status,
          pagamentos: v.venda_pagamentos ?? [],
          quitacoes: (v.fiado_pagamento_vendas ?? []).map((q) => ({
            valor: q.valor,
            forma: q.fiado_pagamentos?.forma ?? null,
          })),
        })
        return {
          id: v.id,
          total: v.total,
          finalizada_em: v.finalizada_em,
          status,
          situacao,
          forma,
          cliente_nome: v.clientes?.nome ?? null,
          operador_nome: v.operadores?.nome ?? null,
        }
      }),
    )
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicio, fim])

  const vendasFiltradas = vendas.filter((v) => {
    const q = buscaCliente.trim().toLowerCase()
    if (!q) return true
    return (v.cliente_nome ?? '').toLowerCase().includes(q)
  })

  function gerarRelatorioVendas() {
    gerarPdfRelatorio({
      titulo: `Relatório de vendas — ${new Date(inicio + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(fim + 'T00:00:00').toLocaleDateString('pt-BR')}`,
      slug: 'vendas',
      colunas: ['Data', 'Cliente', 'Total', 'Forma', 'Status'],
      linhas: vendasFiltradas.map((v) => [
        new Date(v.finalizada_em).toLocaleString('pt-BR'),
        v.cliente_nome ?? '—',
        moeda(v.total),
        v.forma,
        rotuloSituacao[v.situacao],
      ]),
    })
  }

  const totalPeriodo = vendasFiltradas
    .filter((v) => v.status === 'finalizada')
    .reduce((soma, v) => soma + v.total, 0)

  return (
    <div className="fiado-page">
      <section className="fiado-detalhe">
        <h2>Vendas</h2>

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
            Cliente (opcional)
            <input
              type="text"
              placeholder="Filtrar por nome"
              value={buscaCliente}
              onChange={(e) => setBuscaCliente(e.target.value)}
            />
          </label>
        </div>

        <button type="button" onClick={gerarRelatorioVendas}>
          Gerar PDF do período
        </button>

        <div className="dashboard-cards">
          <div className="dashboard-card">
            <span className="dashboard-card-titulo">Total no período (filtrado)</span>
            <span className="dashboard-card-valor">{moeda(totalPeriodo)}</span>
            <span className="dashboard-card-sub">{vendasFiltradas.length} venda(s)</span>
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
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Operador</th>
                  <th>Total</th>
                  <th>Forma</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {vendasFiltradas.map((v) => (
                  <tr key={v.id} className="linha-clicavel" onClick={() => setVendaAberta(v.id)}>
                    <td>{new Date(v.finalizada_em).toLocaleString('pt-BR')}</td>
                    <td>{v.cliente_nome ?? '—'}</td>
                    <td>{v.operador_nome ?? '—'}</td>
                    <td>{moeda(v.total)}</td>
                    <td>{v.forma}</td>
                    <td>
                      <span className={`badge ${classeBadge[v.situacao]}`}>{rotuloSituacao[v.situacao]}</span>
                    </td>
                  </tr>
                ))}
                {vendasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={6}>Nenhuma venda no período/filtro selecionado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {vendaAberta && (
        <PedidoAdminModal
          vendaId={vendaAberta}
          onFechar={() => setVendaAberta(null)}
          onAtualizado={carregar}
        />
      )}
    </div>
  )
}
