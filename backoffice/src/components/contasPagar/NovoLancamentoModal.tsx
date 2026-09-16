import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { Fornecedor, GrupoDespesa, Periodicidade } from '../../types'

interface Props {
  fornecedores: Fornecedor[]
  grupos: GrupoDespesa[]
  onFechar: () => void
  onCriado: () => void
}

const rotuloDiaSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

export function NovoLancamentoModal({ fornecedores, grupos, onFechar, onCriado }: Props) {
  const [recorrente, setRecorrente] = useState(false)
  const [fornecedorId, setFornecedorId] = useState('')
  const [grupoId, setGrupoId] = useState(grupos[0]?.id ?? '')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [desconto, setDesconto] = useState('')
  const [dataVencimento, setDataVencimento] = useState(hoje())

  const [periodicidade, setPeriodicidade] = useState<Periodicidade>('mensal')
  const [diaSemana, setDiaSemana] = useState('5')
  const [diaMes, setDiaMes] = useState('5')
  const [dataInicio, setDataInicio] = useState(hoje())

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!grupoId) {
      setErro('Cadastre ao menos 1 grupo de despesa antes de lançar uma conta.')
      return
    }
    setErro(null)
    setSalvando(true)

    if (!recorrente) {
      const { error } = await supabase.from('contas_pagar').insert({
        fornecedor_id: fornecedorId || null,
        grupo_id: grupoId,
        descricao,
        valor: Number(valor),
        desconto: desconto === '' ? 0 : Number(desconto),
        data_vencimento: dataVencimento,
      })

      setSalvando(false)
      if (error) {
        setErro(error.message)
        return
      }
      onCriado()
      onFechar()
      return
    }

    const { error: errRegra } = await supabase.from('contas_pagar_regras').insert({
      fornecedor_id: fornecedorId || null,
      grupo_id: grupoId,
      descricao,
      valor: Number(valor),
      desconto: desconto === '' ? 0 : Number(desconto),
      periodicidade,
      dia_semana: periodicidade === 'mensal' ? null : Number(diaSemana),
      dia_mes: periodicidade === 'mensal' ? Number(diaMes) : null,
      data_inicio: dataInicio,
    })

    if (errRegra) {
      setSalvando(false)
      setErro(errRegra.message)
      return
    }

    const { error: errGerar } = await supabase.rpc('gerar_ocorrencias_contas_pagar')

    setSalvando(false)
    if (errGerar) {
      setErro(errGerar.message)
      return
    }
    onCriado()
    onFechar()
  }

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <form
        onSubmit={handleSubmit}
        className="modal-caixa pedido-admin"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Nova conta a pagar</h2>

        <label className="clientes-checkbox-label">
          <input type="checkbox" checked={recorrente} onChange={(e) => setRecorrente(e.target.checked)} />
          É recorrente
        </label>

        <label>
          Fornecedor (opcional)
          <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
            <option value="">— nenhum —</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </label>

        <label>
          Grupo
          <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)} required>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
        </label>

        <label>
          Descrição
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} required />
        </label>

        <label>
          Valor
          <input
            type="number"
            step="0.01"
            min="0"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            required
          />
        </label>

        <label>
          Desconto (opcional)
          <input
            type="number"
            step="0.01"
            min="0"
            value={desconto}
            onChange={(e) => setDesconto(e.target.value)}
          />
        </label>

        {!recorrente ? (
          <label>
            Data de vencimento
            <input
              type="date"
              value={dataVencimento}
              onChange={(e) => setDataVencimento(e.target.value)}
              required
            />
          </label>
        ) : (
          <>
            <label>
              Periodicidade
              <select
                value={periodicidade}
                onChange={(e) => setPeriodicidade(e.target.value as Periodicidade)}
              >
                <option value="semanal">Semanal</option>
                <option value="quinzenal">Quinzenal</option>
                <option value="mensal">Mensal</option>
              </select>
            </label>

            {periodicidade === 'mensal' ? (
              <label>
                Dia do mês
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={diaMes}
                  onChange={(e) => setDiaMes(e.target.value)}
                  required
                />
              </label>
            ) : (
              <label>
                Dia da semana
                <select value={diaSemana} onChange={(e) => setDiaSemana(e.target.value)}>
                  {rotuloDiaSemana.map((nome, i) => (
                    <option key={i} value={i}>
                      {nome}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label>
              Data de início da contagem
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                required
              />
            </label>
          </>
        )}

        {erro && <p className="erro">{erro}</p>}

        <div className="modal-acoes">
          <button type="button" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Lançar'}
          </button>
        </div>
      </form>
    </div>
  )
}
