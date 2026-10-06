import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

// Filtro guardado na URL (?chave=valor), pra a tela voltar como estava ao
// trocar de tela. Valor igual ao padrao nao vai pra URL.
export function useParamUrl(chave: string, padrao: string): [string, (valor: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const valor = searchParams.get(chave) ?? padrao

  const setValor = useCallback(
    (novo: string) => {
      setSearchParams(
        (atual) => {
          const proximo = new URLSearchParams(atual)
          if (novo === padrao || novo === '') proximo.delete(chave)
          else proximo.set(chave, novo)
          return proximo
        },
        { replace: true },
      )
    },
    [setSearchParams, chave, padrao],
  )

  return [valor, setValor]
}
