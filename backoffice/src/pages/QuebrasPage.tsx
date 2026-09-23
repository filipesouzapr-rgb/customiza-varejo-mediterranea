import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { MotivoQuebra, Produto, ProdutoPeca, StatusQuebra } from '../types'

interface LinhaQuebra {
  id: string
  produto_nome: string
  peca_nome: string
  quantidade: number
  motivo: MotivoQuebra | null
  data_ocorrencia: string
  status: StatusQuebra
}

interface LinhaQuebraRaw {
  id: string
  quantidade: number
  motivo: MotivoQuebra | null
  data_ocorrencia: string
  status: StatusQuebra
  produtos: { nome: string } | null
  produto_pecas: { nome: string } | null
}

const rotuloMotivo: Record<MotivoQuebra, string> = {
  quebra: 'Quebra',
  estorno: 'Estorno',
  defeito: 'Defeito',
  outro: 'Outro',
}

const rotuloStatus: Record<StatusQuebra, string> = {
  pendente: 'Pendente',
  pedido: 'Pedido ao fornecedor',
  recebido: 'Recebido',
}

function dataISO(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function QuebrasPage() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [pecasDoProduto, setPecasDoProduto] = useState<ProdutoPeca[]>([])

  const [produtoIdForm, setProdutoIdForm] = useState('')
  const [pecaIdForm, setPecaIdForm] = useState('')
  const [quantidadeForm, setQuantidadeForm] = useState('1')
  const [motivoForm, setMotivoForm] = useState<MotivoQuebra | ''>('')
  const [dataForm, setDataForm] = useState(dataISO(new Date()))
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState<string | null>(null)

  const [filtroStatus, setFiltroStatus] = useState<'todos' | StatusQuebra>('todos')
  const [filtroProduto, setFiltroProduto] = useState('')

  const [lista, setLista] = useState<LinhaQuebra[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  async function carregarProdutos() {
    const { data } = await supabase.from('produtos').select('*').eq('ativo', true).order('nome')
    setProdutos((data as Produto[]) ?? [])
  }

  async function carregarLista() {
    setCarregando(true)
    setErro(null)

    let query = supabase
      .from('quebras_pecas')
      .select('id, quantidade, motivo, data_ocorrencia, status, produtos(nome), produto_pecas(nome)')
      .order('data_ocorrencia', { ascending: false })

    if (filtroStatus !== 'todos') query = query.eq('status', filtroStatus)
    if (filtroProduto) query = query.eq('produto_id', filtroProduto)

    const { data, error } = await query

    if (error) {
      setErro(error.message)
      setCarregando(false)
      return
    }

    setLista(
      ((data ?? []) as unknown as LinhaQuebraRaw[]).map((q) => ({
        id: q.id,
        produto_nome: q.produtos?.nome ?? '—',
        peca_nome: q.produto_pecas?.nome ?? '—',
        quantidade: q.quantidade,
        motivo: q.motivo,
        data_ocorrencia: q.data_ocorrencia,
        status: q.status,
      })),
    )
    setCarregando(false)
  }

  useEffect(() => {
    carregarProdutos()
  }, [])

  useEffect(() => {
    carregarLista()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroStatus, filtroProduto])

  useEffect(() => {
    if (!produtoIdForm) {
      setPecasDoProduto([])
      setPecaIdForm('')
      return
    }
    supabase
      .from('produto_pecas')
      .select('*')
      .eq('produto_id', produtoIdForm)
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => {
        setPecasDoProduto((data as ProdutoPeca[]) ?? [])
        setPecaIdForm('')
      })
  }, [produtoIdForm])

  async function registrarQuebra(event: FormEvent) {
    event.preventDefault()
    if (!produtoIdForm || !pecaIdForm) {
      setErroForm('Selecione o produto e a peça.')
      return
    }
    setErroForm(null)
    setSalvando(true)

    const { error } = await supabase.from('quebras_pecas').insert({
      produto_id: produtoIdForm,
      peca_id: pecaIdForm,
      quantidade: Number(quantidadeForm) || 1,
      motivo: motivoForm || null,
      data_ocorrencia: dataForm,
    })

    setSalvando(false)
    if (error) {
      setErroForm(error.message)
      return
    }

    setPecaIdForm('')
    setQuantidadeForm('1')
    setMotivoForm('')
    carregarLista()
  }

  async function avancarStatus(quebra: LinhaQuebra) {
    const proximo: Record<StatusQuebra, StatusQuebra | null> = {
      pendente: 'pedido',
      pedido: 'recebido',
      recebido: null,
    }
    const novoStatus = proximo[quebra.status]
    if (!novoStatus) return

    const payload: Record<string, unknown> = { status: novoStatus }
    if (novoStatus === 'pedido') payload.pedido_em = new Date().toISOString()
    if (novoStatus === 'recebido') payload.recebido_em = new Date().toISOString()

    const { error } = await supabase.from('quebras_pecas').update(payload).eq('id', quebra.id)
    if (error) setErro(error.message)
    else carregarLista()
  }

  const rotuloProximaAcao: Record<StatusQuebra, string | null> = {
    pendente: 'Marcar como pedido',
    pedido: 'Marcar como recebido',
    recebido: null,
  }

  return (
    <div className="fiado-page">
      <section className="produtos-form">
        <h2>Registrar quebra/estorno</h2>
        <form onSubmit={registrarQuebra}>
          <label>
            Produto
            <select value={produtoIdForm} onChange={(e) => setProdutoIdForm(e.target.value)} required>
              <option value="">— selecione —</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Peça
            <select
              value={pecaIdForm}
              onChange={(e) => setPecaIdForm(e.target.value)}
              disabled={!produtoIdForm}
              required
            >
              <option value="">
                {produtoIdForm ? '— selecione —' : 'selecione um produto primeiro'}
              </option>
              {pecasDoProduto.map((peca) => (
                <option key={peca.id} value={peca.id}>
                  {peca.nome}
                </option>
              ))}
            </select>
          </label>
          {produtoIdForm && pecasDoProduto.length === 0 && (
            <p className="venda-cliente-vazio">
              Esse produto não tem peças cadastradas ainda — cadastre em Produtos → Peças.
            </p>
          )}
          <label>
            Quantidade
            <input
              type="number"
              step="1"
              min="1"
              value={quantidadeForm}
              onChange={(e) => setQuantidadeForm(e.target.value)}
              required
            />
          </label>
          <label>
            Motivo (opcional)
            <select value={motivoForm} onChange={(e) => setMotivoForm(e.target.value as MotivoQuebra | '')}>
              <option value="">— nenhum —</option>
              {(Object.keys(rotuloMotivo) as MotivoQuebra[]).map((m) => (
                <option key={m} value={m}>
                  {rotuloMotivo[m]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Data
            <input type="date" value={dataForm} onChange={(e) => setDataForm(e.target.value)} required />
          </label>
          {erroForm && <p className="erro">{erroForm}</p>}
          <div className="produtos-form-acoes">
            <button type="submit" disabled={salvando}>
              {salvando ? 'Registrando...' : 'Registrar quebra'}
            </button>
          </div>
        </form>
      </section>

      <section className="fiado-detalhe">
        <h2>Quebras / reposição</h2>

        <div className="contas-pagar-filtros">
          <label>
            Status
            <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)}>
              <option value="todos">Todos</option>
              <option value="pendente">Pendente</option>
              <option value="pedido">Pedido ao fornecedor</option>
              <option value="recebido">Recebido</option>
            </select>
          </label>
          <label>
            Produto
            <select value={filtroProduto} onChange={(e) => setFiltroProduto(e.target.value)}>
              <option value="">Todos</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
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
                  <th>Data</th>
                  <th>Produto</th>
                  <th>Peça</th>
                  <th>Qtd</th>
                  <th>Motivo</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((q) => (
                  <tr key={q.id}>
                    <td>{new Date(q.data_ocorrencia + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                    <td>{q.produto_nome}</td>
                    <td>{q.peca_nome}</td>
                    <td>{q.quantidade}</td>
                    <td>{q.motivo ? rotuloMotivo[q.motivo] : '—'}</td>
                    <td>
                      <span
                        className={`badge ${q.status === 'recebido' ? 'badge-conciliado' : 'badge-pendente'}`}
                      >
                        {rotuloStatus[q.status]}
                      </span>
                    </td>
                    <td>
                      {rotuloProximaAcao[q.status] && (
                        <button type="button" onClick={() => avancarStatus(q)}>
                          {rotuloProximaAcao[q.status]}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {lista.length === 0 && (
                  <tr>
                    <td colSpan={7}>Nenhuma quebra registrada no filtro selecionado.</td>
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
