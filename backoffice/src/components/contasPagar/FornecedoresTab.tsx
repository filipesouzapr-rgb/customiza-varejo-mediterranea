import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { neon } from '../../lib/neon'
import type { Fornecedor } from '../../types'

const formVazio = { id: null as string | null, nome: '', cpf_cnpj: '', telefone: '' }

export function FornecedoresTab() {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [form, setForm] = useState(formVazio)
  const [salvando, setSalvando] = useState(false)

  async function carregar() {
    setCarregando(true)
    const { data, error } = await neon.from('fornecedores').select('*').order('nome')
    if (error) setErro(error.message)
    else setFornecedores((data as Fornecedor[]) ?? [])
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  function editar(f: Fornecedor) {
    setForm({ id: f.id, nome: f.nome, cpf_cnpj: f.cpf_cnpj ?? '', telefone: f.telefone ?? '' })
  }

  async function alternarAtivo(f: Fornecedor) {
    const { error } = await neon.from('fornecedores').update({ ativo: !f.ativo }).eq('id', f.id)
    if (error) setErro(error.message)
    else carregar()
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErro(null)
    setSalvando(true)

    const payload = {
      nome: form.nome,
      cpf_cnpj: form.cpf_cnpj.trim() === '' ? null : form.cpf_cnpj.trim(),
      telefone: form.telefone.trim() === '' ? null : form.telefone.trim(),
    }

    const { error } = form.id
      ? await neon.from('fornecedores').update(payload).eq('id', form.id)
      : await neon.from('fornecedores').insert(payload)

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
        <h2>{form.id ? 'Editar fornecedor' : 'Novo fornecedor'}</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Nome
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          </label>
          <label>
            CPF/CNPJ (opcional)
            <input value={form.cpf_cnpj} onChange={(e) => setForm({ ...form, cpf_cnpj: e.target.value })} />
          </label>
          <label>
            Telefone (opcional)
            <input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
          </label>
          <div className="produtos-form-acoes">
            <button type="submit" disabled={salvando}>
              {salvando ? 'Salvando...' : form.id ? 'Salvar alterações' : 'Adicionar fornecedor'}
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
        <h2>Fornecedores cadastrados</h2>
        {erro && <p className="erro">{erro}</p>}
        {carregando ? (
          <p>Carregando...</p>
        ) : (
          <div className="tabela-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CPF/CNPJ</th>
                  <th>Telefone</th>
                  <th>Ativo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {fornecedores.map((f) => (
                  <tr key={f.id} className={f.ativo ? '' : 'inativo'}>
                    <td>{f.nome}</td>
                    <td>{f.cpf_cnpj ?? '—'}</td>
                    <td>{f.telefone ?? '—'}</td>
                    <td>{f.ativo ? 'Sim' : 'Não'}</td>
                    <td className="produtos-lista-acoes">
                      <button type="button" onClick={() => editar(f)}>
                        Editar
                      </button>
                      <button type="button" onClick={() => alternarAtivo(f)}>
                        {f.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                    </td>
                  </tr>
                ))}
                {fornecedores.length === 0 && (
                  <tr>
                    <td colSpan={5}>Nenhum fornecedor cadastrado ainda.</td>
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
