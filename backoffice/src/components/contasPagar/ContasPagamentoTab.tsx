import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { AporteModal } from './AporteModal'
import type { ContaPagamentoSaldo } from '../../types'

const formVazio = { id: null as string | null, nome: '', saldoInicial: '' }

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function ContasPagamentoTab() {
  const [contas, setContas] = useState<ContaPagamentoSaldo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [form, setForm] = useState(formVazio)
  const [salvando, setSalvando] = useState(false)
  const [contaAporte, setContaAporte] = useState<ContaPagamentoSaldo | null>(null)

  async function carregar() {
    setCarregando(true)
    const { data, error } = await supabase.from('contas_pagamento_saldo').select('*').order('nome')
    if (error) setErro(error.message)
    else setContas((data as ContaPagamentoSaldo[]) ?? [])
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  function editar(c: ContaPagamentoSaldo) {
    setForm({ id: c.id, nome: c.nome, saldoInicial: String(c.saldo_inicial) })
  }

  async function alternarAtivo(c: ContaPagamentoSaldo) {
    const { error } = await supabase.from('contas_pagamento').update({ ativo: !c.ativo }).eq('id', c.id)
    if (error) setErro(error.message)
    else carregar()
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErro(null)
    setSalvando(true)

    const payload = {
      nome: form.nome,
      saldo_inicial: form.saldoInicial === '' ? 0 : Number(form.saldoInicial),
    }

    const { error } = form.id
      ? await supabase.from('contas_pagamento').update(payload).eq('id', form.id)
      : await supabase.from('contas_pagamento').insert(payload)

    setSalvando(false)
    if (error) {
      setErro(error.message)
      return
    }
    setForm(formVazio)
    carregar()
  }

  return (
    <div className="produtos-page">
      <section className="produtos-form">
        <h2>{form.id ? 'Editar conta de pagamento' : 'Nova conta de pagamento'}</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Nome
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          </label>
          <label>
            Saldo inicial
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.saldoInicial}
              onChange={(e) => setForm({ ...form, saldoInicial: e.target.value })}
            />
          </label>
          <div className="produtos-form-acoes">
            <button type="submit" disabled={salvando}>
              {salvando ? 'Salvando...' : form.id ? 'Salvar alterações' : 'Adicionar conta'}
            </button>
            {form.id && (
              <button type="button" onClick={() => setForm(formVazio)}>
                Cancelar edição
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="produtos-lista">
        <h2>Contas de pagamento cadastradas</h2>
        {erro && <p className="erro">{erro}</p>}
        {carregando ? (
          <p>Carregando...</p>
        ) : (
          <div className="tabela-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Saldo atual</th>
                  <th>Ativa</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {contas.map((c) => (
                  <tr key={c.id} className={c.ativo ? '' : 'inativo'}>
                    <td>{c.nome}</td>
                    <td>{moeda(Number(c.saldo_atual))}</td>
                    <td>{c.ativo ? 'Sim' : 'Não'}</td>
                    <td className="produtos-lista-acoes">
                      <button type="button" onClick={() => setContaAporte(c)}>
                        + Aporte
                      </button>
                      <button type="button" onClick={() => editar(c)}>
                        Editar
                      </button>
                      <button type="button" onClick={() => alternarAtivo(c)}>
                        {c.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                    </td>
                  </tr>
                ))}
                {contas.length === 0 && (
                  <tr>
                    <td colSpan={4}>Nenhuma conta de pagamento cadastrada ainda.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {contaAporte && (
        <AporteModal conta={contaAporte} onFechar={() => setContaAporte(null)} onCriado={carregar} />
      )}
    </div>
  )
}
