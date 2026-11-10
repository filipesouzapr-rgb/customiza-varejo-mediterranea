import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Cliente, ClientePreco, Produto } from '../types'

interface Props {
  cliente: Cliente
  onFechar: () => void
}

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function PrecosPassadorModal({ cliente, onFechar }: Props) {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [precos, setPrecos] = useState<Record<string, ClientePreco>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [busca, setBusca] = useState('')
  const [soSemPreco, setSoSemPreco] = useState(false)
  const [valoresEdicao, setValoresEdicao] = useState<Record<string, string>>({})

  const [percentualDesconto, setPercentualDesconto] = useState('')
  const [aplicandoDesconto, setAplicandoDesconto] = useState(false)

  const [outrosPassadores, setOutrosPassadores] = useState<Cliente[]>([])
  const [passadorOrigemId, setPassadorOrigemId] = useState('')
  const [copiando, setCopiando] = useState(false)

  async function carregar() {
    setCarregando(true)
    setErro(null)

    const [{ data: produtosData, error: errProdutos }, { data: precosData, error: errPrecos }] = await Promise.all([
      supabase.from('produtos').select('*').eq('ativo', true).order('nome'),
      supabase.from('cliente_precos').select('*').eq('cliente_id', cliente.id),
    ])

    if (errProdutos || errPrecos) {
      setErro(errProdutos?.message ?? errPrecos?.message ?? 'Erro ao carregar.')
      setCarregando(false)
      return
    }

    const mapa: Record<string, ClientePreco> = {}
    for (const p of (precosData as ClientePreco[]) ?? []) mapa[p.produto_id] = p
    setPrecos(mapa)
    setValoresEdicao(
      Object.fromEntries(Object.values(mapa).map((p) => [p.produto_id, String(p.preco).replace('.', ',')])),
    )
    setProdutos((produtosData as Produto[]) ?? [])
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente.id])

  useEffect(() => {
    supabase
      .from('clientes')
      .select('*')
      .eq('eh_revendedor', true)
      .eq('ativo', true)
      .neq('id', cliente.id)
      .order('nome')
      .then(({ data }) => setOutrosPassadores((data as Cliente[]) ?? []))
  }, [cliente.id])

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return produtos.filter((p) => {
      if (termo && !p.nome.toLowerCase().includes(termo)) return false
      if (soSemPreco && precos[p.id]) return false
      return true
    })
  }, [produtos, busca, soSemPreco, precos])

  async function salvarPreco(produtoId: string) {
    const texto = (valoresEdicao[produtoId] ?? '').trim().replace(',', '.')

    if (texto === '') {
      if (!precos[produtoId]) return
      const { error } = await supabase
        .from('cliente_precos')
        .delete()
        .eq('cliente_id', cliente.id)
        .eq('produto_id', produtoId)
      if (error) {
        setErro(error.message)
        return
      }
      setPrecos((atual) => {
        const copia = { ...atual }
        delete copia[produtoId]
        return copia
      })
      return
    }

    const valor = Number(texto)
    if (isNaN(valor) || valor < 0) {
      setErro('Preço inválido.')
      return
    }

    const { data, error } = await supabase
      .from('cliente_precos')
      .upsert({ cliente_id: cliente.id, produto_id: produtoId, preco: valor }, { onConflict: 'cliente_id,produto_id' })
      .select()
      .single()

    if (error) {
      setErro(error.message)
      return
    }
    setPrecos((atual) => ({ ...atual, [produtoId]: data as ClientePreco }))
  }

  async function aplicarDesconto() {
    const percentual = Number(percentualDesconto.replace(',', '.'))
    if (isNaN(percentual) || percentual <= 0 || percentual >= 100) {
      setErro('Informe um percentual de desconto válido (entre 0 e 100).')
      return
    }
    if (
      !window.confirm(
        `Aplicar ${percentual}% de desconto sobre o preço padrão em ${produtosFiltrados.length} produto(s) visível(is)? Isso substitui o preço do passador já cadastrado para esses produtos.`,
      )
    ) {
      return
    }

    setErro(null)
    setAplicandoDesconto(true)
    const { error } = await supabase.rpc('aplicar_desconto_passador', {
      p_cliente_id: cliente.id,
      p_percentual: percentual,
      p_produto_ids: produtosFiltrados.map((p) => p.id),
    })
    setAplicandoDesconto(false)
    if (error) {
      setErro(error.message)
      return
    }
    await carregar()
  }

  async function copiarDeOutroPassador() {
    if (!passadorOrigemId) return
    const origem = outrosPassadores.find((c) => c.id === passadorOrigemId)
    if (!origem) return
    if (!window.confirm(`Copiar os preços de "${origem.nome}" para "${cliente.nome}"?`)) return

    setErro(null)
    setCopiando(true)
    const { error } = await supabase.rpc('copiar_precos_passador', {
      p_cliente_origem_id: passadorOrigemId,
      p_cliente_destino_id: cliente.id,
    })
    setCopiando(false)
    if (error) {
      setErro(error.message)
      return
    }
    await carregar()
  }

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal-caixa pedido-admin" onClick={(e) => e.stopPropagation()}>
        <h2>Preços do passador — {cliente.nome}</h2>

        <div className="pedido-admin-corpo">
          {erro && <p className="erro">{erro}</p>}

          <div className="historico-estoque-consulta">
            <input
              type="text"
              placeholder="Buscar produto pelo nome..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <label className="clientes-checkbox-label">
              <input type="checkbox" checked={soSemPreco} onChange={(e) => setSoSemPreco(e.target.checked)} />
              Só sem preço definido
            </label>
          </div>

          <div className="historico-estoque-consulta">
            <label>
              Aplicar % de desconto sobre o preço padrão (produtos visíveis)
              <input
                type="number"
                step="0.01"
                min="0"
                max="99"
                value={percentualDesconto}
                onChange={(e) => setPercentualDesconto(e.target.value)}
                placeholder="ex.: 10"
              />
            </label>
            <button type="button" onClick={aplicarDesconto} disabled={aplicandoDesconto}>
              {aplicandoDesconto ? 'Aplicando...' : 'Aplicar desconto'}
            </button>
          </div>

          {outrosPassadores.length > 0 && (
            <div className="historico-estoque-consulta">
              <label>
                Copiar preços de outro passador
                <select value={passadorOrigemId} onChange={(e) => setPassadorOrigemId(e.target.value)}>
                  <option value="">— selecione —</option>
                  {outrosPassadores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={copiarDeOutroPassador} disabled={!passadorOrigemId || copiando}>
                {copiando ? 'Copiando...' : 'Copiar'}
              </button>
            </div>
          )}

          <hr className="cliente-rule" />

          {carregando ? (
            <p>Carregando...</p>
          ) : (
            <div className="tabela-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Preço padrão</th>
                    <th>Preço do passador</th>
                  </tr>
                </thead>
                <tbody>
                  {produtosFiltrados.map((p) => (
                    <tr key={p.id}>
                      <td>{p.nome}</td>
                      <td>{moeda(p.preco)}</td>
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="padrão"
                          value={valoresEdicao[p.id] ?? ''}
                          onChange={(e) => setValoresEdicao((atual) => ({ ...atual, [p.id]: e.target.value }))}
                          onBlur={() => salvarPreco(p.id)}
                        />
                      </td>
                    </tr>
                  ))}
                  {produtosFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={3}>Nenhum produto encontrado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-acoes pedido-admin-rodape">
          <button type="button" onClick={onFechar}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
