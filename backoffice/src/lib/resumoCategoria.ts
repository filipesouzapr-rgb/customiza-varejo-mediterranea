import type { UnidadeProduto } from '../types'

export interface ItemParaResumo {
  categoria: string | null
  nome: string
  unidade: UnidadeProduto
  quantidade: number
}

export interface LinhaResumoCategoria {
  rotulo: string
  quantidade: number
  unidade: UnidadeProduto
}

export function rotuloQuantidade(quantidade: number, unidade: UnidadeProduto) {
  if (unidade === 'kg') return `${quantidade}kg`
  return `${quantidade} unidade${quantidade === 1 ? '' : 's'}`
}

// Agrupa os itens do pedido por categoria (ignorando caixa/espaco nas
// pontas), somando quantidade. Produto sem categoria agrupa pelo proprio
// nome, pra nao sumir do resumo. Categorias com produtos de unidades
// diferentes (ex: "kg" e "unidade") viram linhas separadas - nunca soma
// unidades de medida diferentes juntas.
export function resumoPorCategoria(itens: ItemParaResumo[]): LinhaResumoCategoria[] {
  const grupos = new Map<string, LinhaResumoCategoria>()

  for (const item of itens) {
    const rotulo = (item.categoria ?? '').trim() || item.nome
    const chave = `${rotulo.toLowerCase()}__${item.unidade}`
    const quantidade = Number(item.quantidade) || 0

    const existente = grupos.get(chave)
    if (existente) {
      existente.quantidade += quantidade
    } else {
      grupos.set(chave, { rotulo, quantidade, unidade: item.unidade })
    }
  }

  return Array.from(grupos.values()).sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
}
