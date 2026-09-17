import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Produto, UnidadeProduto } from '../types'

const formVazio = {
  id: null as string | null,
  nome: '',
  codigo_barras: '',
  unidade: 'unidade' as UnidadeProduto,
  preco: '',
  categoria: '',
  estoque_atual: '',
}

export function ProdutosPage() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [form, setForm] = useState(formVazio)
  const [salvando, setSalvando] = useState(false)

  async function carregarProdutos() {
    setCarregando(true)
    const { data, error } = await supabase
      .from('produtos')
      .select('*')
      .order('nome', { ascending: true })

    if (error) setErro(error.message)
    else setProdutos(data as Produto[])
    setCarregando(false)
  }

  useEffect(() => {
    carregarProdutos()
  }, [])

  function editar(produto: Produto) {
    setForm({
      id: produto.id,
      nome: produto.nome,
      codigo_barras: produto.codigo_barras ?? '',
      unidade: produto.unidade,
      preco: String(produto.preco),
      categoria: produto.categoria ?? '',
      estoque_atual: String(produto.estoque_atual),
    })
  }

  async function alternarAtivo(produto: Produto) {
    const { error } = await supabase
      .from('produtos')
      .update({ ativo: !produto.ativo })
      .eq('id', produto.id)

    if (error) setErro(error.message)
    else carregarProdutos()
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErro(null)
    setSalvando(true)

    const payload = {
      nome: form.nome,
      codigo_barras: form.codigo_barras.trim() === '' ? null : form.codigo_barras.trim(),
      unidade: form.unidade,
      preco: Number(form.preco),
      categoria: form.categoria.trim() === '' ? null : form.categoria.trim(),
      estoque_atual: form.estoque_atual === '' ? 0 : Number(form.estoque_atual),
    }

    const { error } = form.id
      ? await supabase.from('produtos').update(payload).eq('id', form.id)
      : await supabase.from('produtos').insert(payload)

    setSalvando(false)

    if (error) {
      setErro(error.message)
      return
    }

    setForm(formVazio)
    carregarProdutos()
  }

  return (
    <div className="produtos-page">
      <section className="produtos-form">
        <h2>{form.id ? 'Editar produto' : 'Novo produto'}</h2>
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
            Código de barras (opcional)
            <input
              value={form.codigo_barras}
              onChange={(e) => setForm({ ...form, codigo_barras: e.target.value })}
              placeholder="deixe em branco para produção própria"
            />
          </label>
          <label>
            Unidade de venda
            <select
              value={form.unidade}
              onChange={(e) => setForm({ ...form, unidade: e.target.value as UnidadeProduto })}
            >
              <option value="unidade">Por unidade</option>
              <option value="kg">Por peso (kg)</option>
            </select>
          </label>
          <label>
            Preço ({form.unidade === 'kg' ? 'por kg' : 'por unidade'})
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.preco}
              onChange={(e) => setForm({ ...form, preco: e.target.value })}
              required
            />
          </label>
          <label>
            Categoria (opcional)
            <input
              value={form.categoria}
              onChange={(e) => setForm({ ...form, categoria: e.target.value })}
            />
          </label>
          <label>
            Estoque atual
            <input
              type="number"
              step="0.001"
              min="0"
              value={form.estoque_atual}
              onChange={(e) => setForm({ ...form, estoque_atual: e.target.value })}
            />
          </label>
          <div className="produtos-form-acoes">
            <button type="submit" disabled={salvando}>
              {salvando ? 'Salvando...' : form.id ? 'Salvar alterações' : 'Adicionar produto'}
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
        <h2>Produtos cadastrados</h2>
        {erro && <p className="erro">{erro}</p>}
        {carregando ? (
          <p>Carregando...</p>
        ) : (
          <div className="tabela-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Código interno</th>
                  <th>Cód. barras</th>
                  <th>Unidade</th>
                  <th>Preço</th>
                  <th>Estoque</th>
                  <th>Ativo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {produtos.map((produto) => (
                  <tr key={produto.id} className={produto.ativo ? '' : 'inativo'}>
                    <td>{produto.nome}</td>
                    <td>{produto.codigo_interno}</td>
                    <td>{produto.codigo_barras ?? '—'}</td>
                    <td>{produto.unidade === 'kg' ? 'kg' : 'un'}</td>
                    <td>
                      {produto.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td>{produto.estoque_atual}</td>
                    <td>{produto.ativo ? 'Sim' : 'Não'}</td>
                    <td className="produtos-lista-acoes">
                      <button type="button" onClick={() => editar(produto)}>
                        Editar
                      </button>
                      <button type="button" onClick={() => alternarAtivo(produto)}>
                        {produto.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                    </td>
                  </tr>
                ))}
                {produtos.length === 0 && (
                  <tr>
                    <td colSpan={8}>Nenhum produto cadastrado ainda.</td>
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
