import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { gerarPdfRelatorio } from '../lib/pdfRelatorio'
import type { Cliente, SaldoFiadoCliente } from '../types'

const formVazio = {
  id: null as string | null,
  nome: '',
  cpf: '',
  telefone: '',
  limite_fiado_sugerido: '',
  dia_vencimento_fiado: '',
  eh_revendedor: false,
}

type FiltroRevendedor = 'todos' | 'revendedores' | 'nao-revendedores'

export function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [form, setForm] = useState(formVazio)
  const [salvando, setSalvando] = useState(false)
  const [filtroRevendedor, setFiltroRevendedor] = useState<FiltroRevendedor>('todos')

  async function carregarClientes() {
    setCarregando(true)
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('nome', { ascending: true })

    if (error) setErro(error.message)
    else setClientes(data as Cliente[])
    setCarregando(false)
  }

  useEffect(() => {
    carregarClientes()
  }, [])

  function editar(cliente: Cliente) {
    setForm({
      id: cliente.id,
      nome: cliente.nome,
      cpf: cliente.cpf ?? '',
      telefone: cliente.telefone ?? '',
      limite_fiado_sugerido:
        cliente.limite_fiado_sugerido === null ? '' : String(cliente.limite_fiado_sugerido),
      dia_vencimento_fiado:
        cliente.dia_vencimento_fiado === null ? '' : String(cliente.dia_vencimento_fiado),
      eh_revendedor: cliente.eh_revendedor,
    })
  }

  async function alternarAtivo(cliente: Cliente) {
    const { error } = await supabase
      .from('clientes')
      .update({ ativo: !cliente.ativo })
      .eq('id', cliente.id)

    if (error) setErro(error.message)
    else carregarClientes()
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErro(null)
    setSalvando(true)

    const payload = {
      nome: form.nome,
      cpf: form.cpf.trim() === '' ? null : form.cpf.trim(),
      telefone: form.telefone.trim() === '' ? null : form.telefone.trim(),
      limite_fiado_sugerido:
        form.limite_fiado_sugerido === '' ? null : Number(form.limite_fiado_sugerido),
      dia_vencimento_fiado:
        form.dia_vencimento_fiado === '' ? null : Number(form.dia_vencimento_fiado),
      eh_revendedor: form.eh_revendedor,
    }

    const { error } = form.id
      ? await supabase.from('clientes').update(payload).eq('id', form.id)
      : await supabase.from('clientes').insert(payload)

    setSalvando(false)

    if (error) {
      setErro(error.message)
      return
    }

    setForm(formVazio)
    carregarClientes()
  }

  async function gerarRelatorioClientes() {
    const { data } = await supabase.from('fiado_saldo_por_cliente').select('*')
    const saldos = new Map(
      ((data as SaldoFiadoCliente[]) ?? []).map((s) => [s.cliente_id, s.saldo_em_aberto]),
    )

    gerarPdfRelatorio({
      titulo: 'Relatório de clientes',
      slug: 'clientes',
      colunas: ['Nome', 'Contato', 'Saldo fiado em aberto'],
      linhas: clientes.map((c) => [
        c.nome,
        c.telefone ?? c.cpf ?? '—',
        (saldos.get(c.id) ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      ]),
    })
  }

  return (
    <div className="clientes-page">
      <section className="clientes-form">
        <h2>{form.id ? 'Editar cliente' : 'Novo cliente'}</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Nome
            <input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              required
            />
          </label>
          <label>
            CPF (opcional)
            <input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
          </label>
          <label>
            Telefone (opcional)
            <input
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
            />
          </label>
          <label>
            Limite de fiado sugerido (opcional)
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.limite_fiado_sugerido}
              onChange={(e) => setForm({ ...form, limite_fiado_sugerido: e.target.value })}
            />
          </label>
          <label>
            Dia de vencimento do fiado (opcional)
            <input
              type="number"
              min="1"
              max="31"
              value={form.dia_vencimento_fiado}
              onChange={(e) => setForm({ ...form, dia_vencimento_fiado: e.target.value })}
            />
          </label>
          <label className="clientes-checkbox-label">
            <input
              type="checkbox"
              checked={form.eh_revendedor}
              onChange={(e) => setForm({ ...form, eh_revendedor: e.target.checked })}
            />
            É revendedor
          </label>
          <div className="clientes-form-acoes">
            <button type="submit" disabled={salvando}>
              {salvando ? 'Salvando...' : form.id ? 'Salvar alterações' : 'Adicionar cliente'}
            </button>
            {form.id && (
              <button type="button" onClick={() => setForm(formVazio)}>
                Cancelar edição
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="clientes-lista">
        <div className="clientes-lista-cabecalho">
          <h2>Clientes cadastrados</h2>
          <button type="button" onClick={gerarRelatorioClientes}>
            Gerar PDF
          </button>
          <label className="clientes-filtro">
            Mostrar
            <select
              value={filtroRevendedor}
              onChange={(e) => setFiltroRevendedor(e.target.value as FiltroRevendedor)}
            >
              <option value="todos">Todos</option>
              <option value="revendedores">Só revendedores</option>
              <option value="nao-revendedores">Só não revendedores</option>
            </select>
          </label>
        </div>
        {erro && <p className="erro">{erro}</p>}
        {carregando ? (
          <p>Carregando...</p>
        ) : (
          <div className="tabela-scroll">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>CPF</th>
                <th>Telefone</th>
                <th>Limite fiado</th>
                <th>Venc.</th>
                <th>Revendedor</th>
                <th>Ativo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clientes
                .filter((cliente) => {
                  if (filtroRevendedor === 'revendedores') return cliente.eh_revendedor
                  if (filtroRevendedor === 'nao-revendedores') return !cliente.eh_revendedor
                  return true
                })
                .map((cliente) => (
                  <tr key={cliente.id} className={cliente.ativo ? '' : 'inativo'}>
                    <td>{cliente.nome}</td>
                    <td>{cliente.cpf ?? '—'}</td>
                    <td>{cliente.telefone ?? '—'}</td>
                    <td>
                      {cliente.limite_fiado_sugerido === null
                        ? '—'
                        : cliente.limite_fiado_sugerido.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                    </td>
                    <td>{cliente.dia_vencimento_fiado ?? '—'}</td>
                    <td>{cliente.eh_revendedor ? 'Sim' : 'Não'}</td>
                    <td>{cliente.ativo ? 'Sim' : 'Não'}</td>
                    <td className="clientes-lista-acoes">
                      <button type="button" onClick={() => editar(cliente)}>
                        Editar
                      </button>
                      <button type="button" onClick={() => alternarAtivo(cliente)}>
                        {cliente.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              {clientes.length === 0 && (
                <tr>
                  <td colSpan={8}>Nenhum cliente cadastrado ainda.</td>
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
