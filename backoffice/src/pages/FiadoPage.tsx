import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { FiadoPagamento, SaldoFiadoCliente, VendaResumo } from '../types'

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

export function FiadoPage() {
  const [clientes, setClientes] = useState<SaldoFiadoCliente[]>([])
  const [carregandoClientes, setCarregandoClientes] = useState(true)
  const [clienteSelecionado, setClienteSelecionado] = useState<SaldoFiadoCliente | null>(null)

  const [inicio, setInicio] = useState(trintaDiasAtras())
  const [fim, setFim] = useState(hoje())
  const [vendas, setVendas] = useState<VendaResumo[]>([])
  const [pagamentos, setPagamentos] = useState<FiadoPagamento[]>([])
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false)

  const [valorPagamento, setValorPagamento] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function carregarClientes() {
    setCarregandoClientes(true)
    const { data, error } = await supabase
      .from('fiado_saldo_por_cliente')
      .select('*')
      .neq('saldo_em_aberto', 0)
      .order('saldo_em_aberto', { ascending: false })

    if (error) setErro(error.message)
    else setClientes((data as SaldoFiadoCliente[]) ?? [])
    setCarregandoClientes(false)
  }

  useEffect(() => {
    carregarClientes()
  }, [])

  async function carregarDetalhe(cliente: SaldoFiadoCliente) {
    setClienteSelecionado(cliente)
    setCarregandoDetalhe(true)
    setErro(null)

    const fimComHora = `${fim}T23:59:59`

    const [{ data: vendasData, error: errVendas }, { data: pagamentosData, error: errPag }] =
      await Promise.all([
        supabase
          .from('vendas')
          .select('id, total, finalizada_em')
          .eq('cliente_id', cliente.cliente_id)
          .eq('status', 'finalizada')
          .gte('finalizada_em', inicio)
          .lte('finalizada_em', fimComHora)
          .order('finalizada_em', { ascending: false }),
        supabase
          .from('fiado_pagamentos')
          .select('id, valor, pago_em, observacoes')
          .eq('cliente_id', cliente.cliente_id)
          .gte('pago_em', inicio)
          .lte('pago_em', fimComHora)
          .order('pago_em', { ascending: false }),
      ])

    if (errVendas) setErro(errVendas.message)
    else setVendas((vendasData as VendaResumo[]) ?? [])

    if (errPag) setErro(errPag.message)
    else setPagamentos((pagamentosData as FiadoPagamento[]) ?? [])

    setCarregandoDetalhe(false)
  }

  useEffect(() => {
    if (clienteSelecionado) carregarDetalhe(clienteSelecionado)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicio, fim])

  async function handleSubmitPagamento(event: FormEvent) {
    event.preventDefault()
    if (!clienteSelecionado) return

    const valor = Number(valorPagamento)
    if (!valor || valor <= 0) return

    setSalvando(true)
    setErro(null)

    const { data: sessao } = await supabase.auth.getSession()
    const operadorId = sessao.session?.user.id

    const { error } = await supabase.from('fiado_pagamentos').insert({
      cliente_id: clienteSelecionado.cliente_id,
      valor,
      recebido_por: operadorId,
      observacoes: observacoes.trim() === '' ? null : observacoes.trim(),
    })

    setSalvando(false)

    if (error) {
      setErro(error.message)
      return
    }

    setValorPagamento('')
    setObservacoes('')
    await carregarClientes()
    await carregarDetalhe(clienteSelecionado)
  }

  return (
    <div className="fiado-page">
      <section className="fiado-lista">
        <h2>Clientes com fiado em aberto</h2>
        {erro && <p className="erro">{erro}</p>}
        {carregandoClientes ? (
          <p>Carregando...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr
                  key={c.cliente_id}
                  className={clienteSelecionado?.cliente_id === c.cliente_id ? 'selecionado' : ''}
                  onClick={() => carregarDetalhe(c)}
                >
                  <td>{c.nome}</td>
                  <td>{moeda(c.saldo_em_aberto)}</td>
                </tr>
              ))}
              {clientes.length === 0 && (
                <tr>
                  <td colSpan={2}>Nenhum cliente com saldo em aberto.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>

      {clienteSelecionado && (
        <section className="fiado-detalhe">
          <h2>{clienteSelecionado.nome}</h2>
          <p className="fiado-saldo-atual">Saldo em aberto: {moeda(clienteSelecionado.saldo_em_aberto)}</p>

          <div className="fiado-periodo">
            <label>
              De
              <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </label>
            <label>
              Até
              <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
            </label>
          </div>

          {carregandoDetalhe ? (
            <p>Carregando...</p>
          ) : (
            <>
              <h3>Compras no período</h3>
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {vendas.map((v) => (
                    <tr key={v.id}>
                      <td>{new Date(v.finalizada_em).toLocaleString('pt-BR')}</td>
                      <td>{moeda(v.total)}</td>
                    </tr>
                  ))}
                  {vendas.length === 0 && (
                    <tr>
                      <td colSpan={2}>Nenhuma compra no período.</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <h3>Pagamentos no período</h3>
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Valor</th>
                    <th>Obs.</th>
                  </tr>
                </thead>
                <tbody>
                  {pagamentos.map((p) => (
                    <tr key={p.id}>
                      <td>{new Date(p.pago_em).toLocaleString('pt-BR')}</td>
                      <td>{moeda(p.valor)}</td>
                      <td>{p.observacoes ?? '—'}</td>
                    </tr>
                  ))}
                  {pagamentos.length === 0 && (
                    <tr>
                      <td colSpan={3}>Nenhum pagamento no período.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}

          <h3>Registrar pagamento</h3>
          <form onSubmit={handleSubmitPagamento} className="fiado-form-pagamento">
            <label>
              Valor
              <input
                type="number"
                step="0.01"
                min="0"
                max={clienteSelecionado.saldo_em_aberto}
                value={valorPagamento}
                onChange={(e) => setValorPagamento(e.target.value)}
                required
              />
            </label>
            <button
              type="button"
              onClick={() => setValorPagamento(String(clienteSelecionado.saldo_em_aberto))}
            >
              Preencher saldo total
            </button>
            <label>
              Observações (opcional)
              <input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
            </label>
            <button type="submit" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Registrar pagamento'}
            </button>
          </form>
        </section>
      )}
    </div>
  )
}
