import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

interface Props {
  subtotal: number
  onConfirmar: (valor: number) => void
  onFechar: () => void
}

export function DescontoModal({ subtotal, onConfirmar, onFechar }: Props) {
  const [valor, setValor] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const numero = Number(valor)
    if (!numero || numero <= 0 || numero > subtotal) return
    onConfirmar(numero)
  }

  return (
    <div className="modal-fundo">
      <form onSubmit={handleSubmit} className="modal-caixa">
        <h2>Aplicar desconto</h2>
        <label>
          Valor do desconto
          <input
            ref={inputRef}
            type="number"
            step="0.01"
            min="0"
            max={subtotal}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onFechar()}
          />
        </label>
        <div className="modal-acoes">
          <button type="button" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit">Continuar</button>
        </div>
      </form>
    </div>
  )
}
