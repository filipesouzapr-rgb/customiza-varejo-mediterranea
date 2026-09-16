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
  empresa_id: string
}

export type NovoProduto = Pick<Produto, 'nome' | 'unidade' | 'preco'> &
  Partial<Pick<Produto, 'codigo_barras' | 'categoria' | 'estoque_atual'>>

export interface Operador {
  id: string
  nome: string
  papel: 'operador' | 'supervisor' | 'dono'
  ativo: boolean
  empresa_id: string
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

export interface Cliente {
  id: string
  nome: string
  cpf: string | null
  telefone: string | null
  limite_fiado_sugerido: number | null
  dia_vencimento_fiado: number | null
  eh_revendedor: boolean
  ativo: boolean
  criado_em: string
  empresa_id: string
}

export type NovoCliente = Pick<Cliente, 'nome'> &
  Partial<
    Pick<
      Cliente,
      'cpf' | 'telefone' | 'limite_fiado_sugerido' | 'dia_vencimento_fiado' | 'eh_revendedor'
    >
  >

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
  conciliado_em: string | null
}

export interface FiadoPagamento {
  id: string
  valor: number
  pago_em: string
  observacoes: string | null
}

export interface PedidoPendente {
  id: string
  total: number
  finalizada_em: string
  cliente_nome: string
}

export interface Fornecedor {
  id: string
  nome: string
  cpf_cnpj: string | null
  telefone: string | null
  ativo: boolean
  empresa_id: string
}

export interface GrupoDespesa {
  id: string
  nome: string
  ativo: boolean
  empresa_id: string
}

export type Periodicidade = 'semanal' | 'quinzenal' | 'mensal'

export interface ContaPagarRegra {
  id: string
  fornecedor_id: string | null
  grupo_id: string
  descricao: string
  valor: number
  desconto: number
  periodicidade: Periodicidade
  dia_semana: number | null
  dia_mes: number | null
  data_inicio: string
  ativo: boolean
}

export type FormaPagamentoContasPagar =
  | 'dinheiro'
  | 'cartao_debito'
  | 'cartao_credito'
  | 'pix'
  | 'transferencia'
  | 'boleto'

export interface ContaPagar {
  id: string
  fornecedor_id: string | null
  grupo_id: string
  descricao: string
  valor: number
  desconto: number
  data_vencimento: string
  data_pagamento: string | null
  forma_pagamento: FormaPagamentoContasPagar | null
  status: 'nao_conciliado' | 'conciliado'
  regra_id: string | null
}
