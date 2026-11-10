import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { rotuloTipoMovimentacao } from '../lib/estoqueMovimentacao'
import type { EstoqueMovimentacao, Produto } from '../types'

interface Props {
  produto: Produto
  onFechar: () => void
}

interface LinhaMovimentacao extends EstoqueMovimentacao {
  operadores: { nome: string } | null
}

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

export function HistoricoEstoqueModal({ produto, onFechar }: Props) {
  const [movimentacoes, setMovimentacoes] = useState<LinhaMovimentacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [dataConsulta, setDataConsulta] = useState(hoje())
  const [estoqueNaData, setEstoqueNaData] = useState<number | null>(null)
  const [consultando, setConsultando] = useState(false)

  useEffect(() => {
    supabase
      .from('estoque_movimentacoes')
      .select('*, operadores(nome)')
      .eq('produto_id', produto.id)
      .order('data_hora', { ascending: false })
      .then(({ data, error }) => {
        if (error) setErro(error.message)
        else setMovimentacoes((data as unknown as LinhaMovimentacao[]) ?? [])
        setCarregando(false)
      })
  }, [produto.id])

  async function consultarEstoqueNaData() {
    setConsultando(true)
    setErro(null)
    const { data, error } = await supabase.rpc('estoque_em_data', {
      p_produto_id: produto.id,
      p_data: dataConsulta,
    })
    setConsultando(false)
    if (error) {
      setErro(error.message)
      return
    }
    setEstoqueNaData(data === null ? null : Number(data))
  }

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal-caixa pedido-admin" onClick={(e) => e.stopPropagation()}>
        <h2>Histórico de estoque — {produto.nome}</h2>

        <div className="pedido-admin-corpo">
          {erro && <p className="erro">{erro}</p>}

          <div className="historico-estoque-consulta">
            <label>
              Ver estoque em...
              <input type="date" value={dataConsulta} onChange={(e) => setDataConsulta(e.target.value)} />
            </label>
            <button type="button" onClick={consultarEstoqueNaData} disabled={consultando}>
              {consultando ? 'Consultando...' : 'Consultar'}
            </button>
            {estoqueNaData !== null && (
              <span className="venda-cliente-vazio">
                Em {new Date(dataConsulta + 'T00:00:00').toLocaleDateString('pt-BR')}: {estoqueNaData}
                {produto.unidade === 'kg' ? 'kg' : ' un.'}
              </span>
            )}
          </div>

          <hr className="cliente-rule" />

          {carregando ? (
            <p>Carregando...</p>
          ) : (
            <div className="tabela-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Data/hora</th>
                    <th>Tipo</th>
                    <th>Antes</th>
                    <th>Depois</th>
                    <th>Diferença</th>
                    <th>Motivo</th>
                    <th>Usuário</th>
                  </tr>
                </thead>
                <tbody>
                  {movimentacoes.map((m) => (
                    <tr key={m.id}>
                      <td>{new Date(m.data_hora).toLocaleString('pt-BR')}</td>
                      <td>{rotuloTipoMovimentacao[m.tipo]}</td>
                      <td>{m.quantidade_antes}</td>
                      <td>{m.quantidade_depois}</td>
                      <td>
                        {m.diferenca > 0 ? '+' : ''}
                        {m.diferenca}
                      </td>
                      <td>{m.motivo ?? '—'}</td>
                      <td>{m.operadores?.nome ?? '—'}</td>
                    </tr>
                  ))}
                  {movimentacoes.length === 0 && (
                    <tr>
                      <td colSpan={7}>Nenhuma movimentação registrada ainda.</td>
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
