import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

export interface ItemSelecionavel {
  id: string
  label: string
  sublabel?: string
}

interface Props {
  titulo: string
  placeholder?: string
  itens: ItemSelecionavel[]
  comBusca?: boolean
  onQueryChange?: (query: string) => void
  onSelecionar: (id: string) => void
  onFechar: () => void
  rodape?: string
  aviso?: string
  erro?: string | null
}

export function SeletorModal({
  titulo,
  placeholder,
  itens,
  comBusca = true,
  onQueryChange,
  onSelecionar,
  onFechar,
  rodape,
  aviso,
  erro,
}: Props) {
  const [indice, setIndice] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIndice(0)
  }, [itens])

  useEffect(() => {
    if (comBusca) inputRef.current?.focus()
    else containerRef.current?.focus()
  }, [comBusca])

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onFechar()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIndice((i) => Math.min(i + 1, itens.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIndice((i) => Math.max(i - 1, 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (itens[indice]) onSelecionar(itens[indice].id)
      return
    }
    if (!comBusca && /^[1-9]$/.test(event.key)) {
      event.preventDefault()
      const posicao = Number(event.key) - 1
      if (itens[posicao]) onSelecionar(itens[posicao].id)
    }
  }

  return (
    <div className="modal-fundo">
      <div className="modal-caixa seletor-modal" onKeyDown={handleKeyDown} tabIndex={-1} ref={containerRef}>
        <h2>{titulo}</h2>
        {aviso && <p className="seletor-modal-aviso">{aviso}</p>}
        {erro && <p className="erro">{erro}</p>}
        {comBusca && (
          <input
            ref={inputRef}
            placeholder={placeholder}
            onChange={(e) => onQueryChange?.(e.target.value)}
          />
        )}
        <ul className="seletor-modal-lista">
          {itens.map((item, i) => (
            <li key={item.id} className={i === indice ? 'ativo' : ''}>
              {!comBusca && <span className="seletor-modal-numero">{i + 1}</span>}
              <span>{item.label}</span>
              {item.sublabel && <span className="seletor-modal-sublabel">{item.sublabel}</span>}
            </li>
          ))}
          {itens.length === 0 && <li className="seletor-modal-vazio">Nenhum resultado.</li>}
        </ul>
        <p className="seletor-modal-rodape">{rodape ?? '↑↓ navegar · Enter selecionar · Esc cancelar'}</p>
      </div>
    </div>
  )
}
