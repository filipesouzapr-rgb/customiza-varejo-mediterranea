import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Produto, ProdutoPeca } from '../types'

interface Props {
  produto: Produto
  onFechar: () => void
}

export function ProdutoPecasModal({ produto, onFechar }: Props) {
  const [pecas, setPecas] = useState<ProdutoPeca[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const [nome, setNome] = useState('')
  const [quantidade, setQuantidade] = useState('1')

  async function carregar() {
    setCarregando(true)
    const { data, error } = await supabase
      .from('produto_pecas')
      .select('*')
      .eq('produto_id', produto.id)
      .eq('ativo', true)
      .order('nome')

    if (error) setErro(error.message)
    else setPecas((data as ProdutoPeca[]) ?? [])
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produto.id])

  async function adicionar(event: FormEvent) {
    event.preventDefault()
    if (!nome.trim()) return
    setErro(null)
    setSalvando(true)

    const { error } = await supabase.from('produto_pecas').insert({
      produto_id: produto.id,
      nome: nome.trim(),
      quantidade_no_conjunto: Number(quantidade) || 1,
    })

    setSalvando(false)
    if (error) {
      setErro(error.message)
      return
    }
    setNome('')
    setQuantidade('1')
    carregar()
  }

  async function desativar(peca: ProdutoPeca) {
    const { error } = await supabase
      .from('produto_pecas')
      .update({ ativo: false })
      .eq('id', peca.id)

    if (error) setErro(error.message)
    else carregar()
  }

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal-caixa pedido-admin" onClick={(e) => e.stopPropagation()}>
        <h2>Peças — {produto.nome}</h2>
        <p className="venda-cliente-vazio">
          Cadastre as peças que compõem este produto, pra poder registrar quebras/reposição
          depois.
        </p>

        {erro && <p className="erro">{erro}</p>}

        {carregando ? (
          <p>Carregando...</p>
        ) : (
          <div className="tabela-scroll">
            <table>
              <thead>
                <tr>
                  <th>Peça</th>
                  <th>Qtd no conjunto</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pecas.map((peca) => (
                  <tr key={peca.id}>
                    <td>{peca.nome}</td>
                    <td>{peca.quantidade_no_conjunto}</td>
                    <td>
                      <button type="button" onClick={() => desativar(peca)}>
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
                {pecas.length === 0 && (
                  <tr>
                    <td colSpan={3}>Nenhuma peça cadastrada ainda.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <form onSubmit={adicionar} className="pedido-admin-pagamento-linha">
          <input
            placeholder="Nome da peça (ex: Prato raso)"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
          />
          <input
            type="number"
            step="1"
            min="1"
            placeholder="Qtd"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
          />
          <button type="submit" disabled={salvando}>
            {salvando ? 'Adicionando...' : '+ Adicionar peça'}
          </button>
        </form>

        <div className="modal-acoes">
          <button type="button" onClick={onFechar}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
