import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PedidoAdminModal } from '../components/PedidoAdminModal'
import type { FormaPagamento } from '../types'

interface VendaLinha {
  id: string
  total: number
  finalizada_em: string
  status: 'finalizada' | 'cancelada'
  cliente_nome: string | null
  operador_nome: string | null
  formas_pagamento: FormaPagamento[]
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
  venda_pagamentos: { forma: FormaPagamento }[] | null
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

function rotuloFormas(formas: FormaPagamento[]) {
  if (formas.length === 0) return '—'
  if (formas.length === 1) return rotuloForma[formas[0]]
  return 'Múltiplas formas'
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
      .select('id, total, finalizada_em, status, clientes(nome), operadores!operador_id(nome), venda_pagamentos(forma)')
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
      ((data ?? []) as unknown as VendaRaw[]).map((v) => ({
        id: v.id,
        total: v.total,
        finalizada_em: v.finalizada_em,
        status: v.status as 'finalizada' | 'cancelada',
        cliente_nome: v.clientes?.nome ?? null,
        operador_nome: v.operadores?.nome ?? null,
        formas_pagamento: (v.venda_pagamentos ?? []).map((p) => p.forma),
      })),
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
                    <td>{rotuloFormas(v.formas_pagamento)}</td>
                    <td>
                      {v.status === 'cancelada' ? (
                        <span className="badge badge-cancelado">Cancelada</span>
                      ) : (
                        <span className="badge badge-conciliado">Finalizada</span>
                      )}
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
