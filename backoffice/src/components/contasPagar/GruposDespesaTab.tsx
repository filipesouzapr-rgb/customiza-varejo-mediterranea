import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { neon } from '../../lib/neon'
import type { GrupoDespesa } from '../../types'

const formVazio = { id: null as string | null, nome: '' }

export function GruposDespesaTab() {
  const [grupos, setGrupos] = useState<GrupoDespesa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [form, setForm] = useState(formVazio)
  const [salvando, setSalvando] = useState(false)

  async function carregar() {
    setCarregando(true)
    const { data, error } = await neon.from('grupos_despesa').select('*').order('nome')
    if (error) setErro(error.message)
    else setGrupos((data as GrupoDespesa[]) ?? [])
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  function editar(g: GrupoDespesa) {
    setForm({ id: g.id, nome: g.nome })
  }

  async function alternarAtivo(g: GrupoDespesa) {
    const { error } = await neon.from('grupos_despesa').update({ ativo: !g.ativo }).eq('id', g.id)
    if (error) setErro(error.message)
    else carregar()
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErro(null)
    setSalvando(true)

    const payload = { nome: form.nome }

    const { error } = form.id
      ? await neon.from('grupos_despesa').update(payload).eq('id', form.id)
      : await neon.from('grupos_despesa').insert(payload)

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
        <h2>{form.id ? 'Editar grupo' : 'Novo grupo de despesa'}</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Nome
            <input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex.: Impostos, Aluguel, Salários"
              required
            />
          </label>
          <div className="produtos-form-acoes">
            <button type="submit" disabled={salvando}>
              {salvando ? 'Salvando...' : form.id ? 'Salvar alterações' : 'Adicionar grupo'}
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
        <h2>Grupos cadastrados</h2>
        {erro && <p className="erro">{erro}</p>}
        {carregando ? (
          <p>Carregando...</p>
        ) : (
          <div className="tabela-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Ativo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => (
                  <tr key={g.id} className={g.ativo ? '' : 'inativo'}>
                    <td>{g.nome}</td>
                    <td>{g.ativo ? 'Sim' : 'Não'}</td>
                    <td className="produtos-lista-acoes">
                      <button type="button" onClick={() => editar(g)}>
                        Editar
                      </button>
                      <button type="button" onClick={() => alternarAtivo(g)}>
                        {g.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                    </td>
                  </tr>
                ))}
                {grupos.length === 0 && (
                  <tr>
                    <td colSpan={3}>Nenhum grupo cadastrado ainda.</td>
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
