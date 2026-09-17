import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { SaldoFiadoCliente } from '../types'

const rotuloForma: Record<string, string> = {
  dinheiro: 'Dinheiro',
  cartao_debito: 'Cartão débito',
  cartao_credito: 'Cartão crédito',
  pix: 'Pix',
  fiado: 'Fiado',
}

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function DashboardPage() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [totalHoje, setTotalHoje] = useState(0)
  const [numVendasHoje, setNumVendasHoje] = useState(0)
  const [pendenteTotal, setPendenteTotal] = useState(0)
  const [pendenteCount, setPendenteCount] = useState(0)
  const [porForma, setPorForma] = useState<Record<string, number>>({})
  const [fiadoTotal, setFiadoTotal] = useState(0)
  const [fiadoClientes, setFiadoClientes] = useState(0)
  const [topFiado, setTopFiado] = useState<SaldoFiadoCliente[]>([])

  useEffect(() => {
    async function carregar() {
      setCarregando(true)
      setErro(null)

      const inicioHoje = new Date()
      inicioHoje.setHours(0, 0, 0, 0)

      const { data: vendasHoje, error: errVendas } = await supabase
        .from('vendas')
        .select('id, total')
        .eq('status', 'finalizada')
        .gte('finalizada_em', inicioHoje.toISOString())

      if (errVendas) {
        setErro(errVendas.message)
        setCarregando(false)
        return
      }

      setNumVendasHoje((vendasHoje ?? []).length)
      setTotalHoje((vendasHoje ?? []).reduce((soma, v) => soma + Number(v.total), 0))

      const { data: pendentes, error: errPendentes } = await supabase
        .from('vendas')
        .select('total')
        .eq('status', 'finalizada')
        .is('conciliado_em', null)

      if (errPendentes) {
        setErro(errPendentes.message)
      } else {
        setPendenteCount((pendentes ?? []).length)
        setPendenteTotal((pendentes ?? []).reduce((soma, v) => soma + Number(v.total), 0))
      }

      const { data: pagamentosHoje, error: errPag } = await supabase
        .from('venda_pagamentos')
        .select('forma, valor')
        .gte('criado_em', inicioHoje.toISOString())

      if (errPag) {
        setErro(errPag.message)
      } else {
        const soma: Record<string, number> = {}
        for (const p of pagamentosHoje ?? []) {
          soma[p.forma] = (soma[p.forma] ?? 0) + Number(p.valor)
        }
        setPorForma(soma)
      }

      const { data: fiado, error: errFiado } = await supabase
        .from('fiado_saldo_por_cliente')
        .select('*')
        .neq('saldo_em_aberto', 0)
        .order('saldo_em_aberto', { ascending: false })

      if (errFiado) {
        setErro(errFiado.message)
      } else {
        const clientes = (fiado as SaldoFiadoCliente[]) ?? []
        setFiadoClientes(clientes.length)
        setFiadoTotal(clientes.reduce((soma, c) => soma + c.saldo_em_aberto, 0))
        setTopFiado(clientes.slice(0, 5))
      }

      setCarregando(false)
    }

    carregar()
  }, [])

  if (carregando) return <p>Carregando...</p>

  return (
    <div className="dashboard-page">
      {erro && <p className="erro">{erro}</p>}

      <div className="dashboard-cards">
        <div className="dashboard-card">
          <span className="dashboard-card-titulo">Vendas de hoje</span>
          <span className="dashboard-card-valor">{moeda(totalHoje)}</span>
          <span className="dashboard-card-sub">{numVendasHoje} venda(s)</span>
        </div>
        <div className="dashboard-card">
          <span className="dashboard-card-titulo">Pendente de conciliação</span>
          <span className="dashboard-card-valor">{moeda(pendenteTotal)}</span>
          <span className="dashboard-card-sub">{pendenteCount} pedido(s)</span>
        </div>
        <div className="dashboard-card">
          <span className="dashboard-card-titulo">Fiado em aberto</span>
          <span className="dashboard-card-valor">{moeda(fiadoTotal)}</span>
          <span className="dashboard-card-sub">{fiadoClientes} cliente(s)</span>
        </div>
      </div>

      <section>
        <h2>Conciliado hoje por forma de pagamento</h2>
        <div className="tabela-scroll">
          <table>
            <thead>
              <tr>
                <th>Forma</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(porForma).map(([forma, valor]) => (
                <tr key={forma}>
                  <td>{rotuloForma[forma] ?? forma}</td>
                  <td>{moeda(valor)}</td>
                </tr>
              ))}
              {Object.keys(porForma).length === 0 && (
                <tr>
                  <td colSpan={2}>Nenhuma conciliação hoje ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Maiores saldos de fiado</h2>
        <div className="tabela-scroll">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {topFiado.map((c) => (
                <tr key={c.cliente_id}>
                  <td>{c.nome}</td>
                  <td>{moeda(c.saldo_em_aberto)}</td>
                </tr>
              ))}
              {topFiado.length === 0 && (
                <tr>
                  <td colSpan={2}>Nenhum cliente com saldo em aberto.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
