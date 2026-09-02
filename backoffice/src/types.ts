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
  criado_em: string
  atualizado_em: string
}

export type NovoProduto = Pick<Produto, 'nome' | 'unidade' | 'preco'> &
  Partial<Pick<Produto, 'codigo_barras' | 'categoria' | 'estoque_atual'>>

export interface SaldoFiadoCliente {
  cliente_id: string
  nome: string
  total_fiado: number
  total_pago: number
  saldo_em_aberto: number
}

export interface VendaResumo {
  id: string
  total: number
  finalizada_em: string
}

export interface FiadoPagamento {
  id: string
  valor: number
  pago_em: string
  observacoes: string | null
}
