import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { SeletorModal } from './SeletorModal'
import type { FormaPagamento } from '../types'

const formas: { forma: FormaPagamento; label: string }[] = [
  { forma: 'dinheiro', label: 'Dinheiro' },
  { forma: 'cartao_debito', label: 'Cartão débito' },
  { forma: 'cartao_credito', label: 'Cartão crédito' },
  { forma: 'pix', label: 'Pix' },
  { forma: 'fiado', label: 'Outros' },
]

interface Props {
  restante: number
  mensagemTopo?: string
  validarForma?: (forma: FormaPagamento) => string | null
  onConfirmar: (forma: FormaPagamento, valor: number, troco: number) => void
  onFechar: () => void
}

export function PagamentoModal({ restante, mensagemTopo, validarForma, onConfirmar, onFechar }: Props) {
  const [formaEscolhida, setFormaEscolhida] = useState<FormaPagamento | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [valor, setValor] = useState(restante > 0 ? String(restante) : '')
  const inputValorRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (formaEscolhida) {
      inputValorRef.current?.focus()
      inputValorRef.current?.select()
    }
  }, [formaEscolhida])

  function escolherForma(forma: FormaPagamento) {
    const erroValidacao = validarForma?.(forma)
    if (erroValidacao) {
      setErro(erroValidacao)
      return
    }
    setErro(null)
    setFormaEscolhida(forma)
  }

  function handleKeyDownValor(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setFormaEscolhida(null)
    }
  }

  function handleSubmitValor(event: FormEvent) {
    event.preventDefault()
    const numero = Number(valor)
    if (!formaEscolhida || !numero || numero <= 0) return

    // Só dinheiro tem troco — nas outras formas o valor cobrado é exato.
    if (formaEscolhida === 'dinheiro' && numero > restante) {
      onConfirmar(formaEscolhida, restante, numero - restante)
    } else {
      onConfirmar(formaEscolhida, numero, 0)
    }
  }

  if (!formaEscolhida) {
    return (
      <SeletorModal
        titulo="Forma de pagamento"
        comBusca={false}
        itens={formas.map((f) => ({ id: f.forma, label: f.label }))}
        onSelecionar={(id) => escolherForma(id as FormaPagamento)}
        onFechar={onFechar}
        aviso={mensagemTopo}
        erro={erro}
        rodape="1-5 escolher · ↑↓ Enter · Esc cancelar"
      />
    )
  }

  return (
    <div className="modal-fundo">
      <form onSubmit={handleSubmitValor} className="modal-caixa">
        <h2>{formas.find((f) => f.forma === formaEscolhida)?.label}</h2>
        <label>
          {formaEscolhida === 'dinheiro' ? 'Valor recebido do cliente' : 'Valor a pagar nessa forma'}
          <input
            ref={inputValorRef}
            type="number"
            step="0.01"
            min="0"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={handleKeyDownValor}
          />
        </label>
        <div className="modal-acoes">
          <button type="button" onClick={() => setFormaEscolhida(null)}>
            Voltar
          </button>
          <button type="submit">Confirmar</button>
        </div>
      </form>
    </div>
  )
}
