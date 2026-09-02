import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { SeletorModal } from './SeletorModal'

export type TipoMovimento = 'sangria' | 'suprimento'

const opcoes: { tipo: TipoMovimento; label: string }[] = [
  { tipo: 'sangria', label: 'Sangria (retirada)' },
  { tipo: 'suprimento', label: 'Suprimento (reforço)' },
]

interface Props {
  onConfirmar: (tipo: TipoMovimento, valor: number, motivo: string) => void
  onFechar: () => void
}

export function MovimentoCaixaModal({ onConfirmar, onFechar }: Props) {
  const [tipo, setTipo] = useState<TipoMovimento | null>(null)
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (tipo) inputRef.current?.focus()
  }, [tipo])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const numero = Number(valor)
    if (!numero || numero <= 0 || !tipo) return
    onConfirmar(tipo, numero, motivo)
  }

  function handleKeyDownForm(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setTipo(null)
    }
  }

  if (!tipo) {
    return (
      <SeletorModal
        titulo="Movimento de caixa"
        comBusca={false}
        itens={opcoes.map((o) => ({ id: o.tipo, label: o.label }))}
        onSelecionar={(id) => setTipo(id as TipoMovimento)}
        onFechar={onFechar}
        rodape="1-2 escolher · ↑↓ Enter · Esc cancelar"
      />
    )
  }

  return (
    <div className="modal-fundo">
      <form onSubmit={handleSubmit} className="modal-caixa" onKeyDown={handleKeyDownForm}>
        <h2>{opcoes.find((o) => o.tipo === tipo)?.label}</h2>
        <label>
          Valor
          <input
            ref={inputRef}
            type="number"
            step="0.01"
            min="0"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </label>
        <label>
          Motivo (opcional)
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
        <div className="modal-acoes">
          <button type="button" onClick={() => setTipo(null)}>
            Voltar
          </button>
          <button type="submit">Continuar</button>
        </div>
      </form>
    </div>
  )
}
