export type UnidadeProduto = 'unidade' | 'kg'

export interface Produto {
  id: string
  nome: string
  codigo_barras: string | null
  codigo_interno: string
  unidade: UnidadeProduto
  preco: number
  categoria: string | null
  estoque_atual: number
  ativo: boolean
}

export interface Operador {
  id: string
  nome: string
  papel: 'operador' | 'supervisor' | 'dono'
  ativo: boolean
}

export interface CaixaSessao {
  id: string
  operador_id: string
  aberto_em: string
  fechado_em: string | null
  valor_abertura: number
}

export type FormaPagamento = 'dinheiro' | 'cartao_debito' | 'cartao_credito' | 'pix' | 'fiado'

export interface ItemCarrinho {
  produto: Produto
  quantidade: number
}

export interface Pagamento {
  forma: FormaPagamento
  valor: number
}
