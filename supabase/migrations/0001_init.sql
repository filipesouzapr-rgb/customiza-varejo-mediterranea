-- Schema inicial do PDV Padaria BDI
-- Cobre: catalogo de produtos, vendas (com pagamento misto), caixa
-- (abertura/sangria/suprimento/fechamento), clientes e fiado, status de NFC-e.
-- Fora deste schema por decisao (ver plano): mesas/comandas, balanca com
-- etiqueta, fornecedores/compras, devolucao pos-janela legal.

create extension if not exists "pgcrypto";

-- Perfil do operador, vinculado ao usuario de auth do Supabase.
create table operadores (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  papel text not null default 'operador' check (papel in ('operador', 'supervisor', 'dono')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  codigo_barras text unique,
  codigo_interno text not null unique,
  unidade text not null default 'unidade' check (unidade in ('unidade', 'kg')),
  preco numeric(10, 2) not null check (preco >= 0),
  categoria text,
  estoque_atual numeric(10, 3) not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf text unique,
  telefone text,
  limite_fiado_sugerido numeric(10, 2),
  dia_vencimento_fiado smallint check (dia_vencimento_fiado between 1 and 31),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table caixa_sessoes (
  id uuid primary key default gen_random_uuid(),
  operador_id uuid not null references operadores (id),
  aberto_em timestamptz not null default now(),
  fechado_em timestamptz,
  valor_abertura numeric(10, 2) not null default 0,
  valor_fechamento_informado numeric(10, 2),
  observacoes text
);

create table caixa_movimentos (
  id uuid primary key default gen_random_uuid(),
  caixa_sessao_id uuid not null references caixa_sessoes (id) on delete cascade,
  tipo text not null check (tipo in ('sangria', 'suprimento')),
  valor numeric(10, 2) not null check (valor > 0),
  motivo text,
  criado_em timestamptz not null default now()
);

create table vendas (
  id uuid primary key default gen_random_uuid(),
  caixa_sessao_id uuid not null references caixa_sessoes (id),
  operador_id uuid not null references operadores (id),
  cliente_id uuid references clientes (id),
  status text not null default 'aberta' check (status in ('aberta', 'finalizada', 'cancelada')),
  subtotal numeric(10, 2) not null default 0,
  desconto numeric(10, 2) not null default 0,
  desconto_autorizado_por uuid references operadores (id),
  total numeric(10, 2) not null default 0,
  nfce_status text not null default 'pendente' check (nfce_status in ('pendente', 'emitida', 'erro', 'nao_aplicavel')),
  nfce_chave text,
  criada_em timestamptz not null default now(),
  finalizada_em timestamptz,
  cancelada_em timestamptz,
  cancelada_por uuid references operadores (id)
);

create table venda_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas (id) on delete cascade,
  produto_id uuid not null references produtos (id),
  quantidade numeric(10, 3) not null check (quantidade > 0),
  preco_unitario numeric(10, 2) not null check (preco_unitario >= 0),
  subtotal numeric(10, 2) not null check (subtotal >= 0)
);

-- Uma venda pode ter mais de um pagamento (dinheiro + cartao, fiado + pix, etc).
create table venda_pagamentos (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas (id) on delete cascade,
  forma text not null check (forma in ('dinheiro', 'cartao_debito', 'cartao_credito', 'pix', 'fiado')),
  valor numeric(10, 2) not null check (valor > 0),
  criado_em timestamptz not null default now()
);

-- Baixa (total ou parcial) de divida de fiado de um cliente.
create table fiado_pagamentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id),
  valor numeric(10, 2) not null check (valor > 0),
  pago_em timestamptz not null default now(),
  recebido_por uuid not null references operadores (id),
  observacoes text
);

-- Saldo de fiado em aberto por cliente: soma do que foi vendido "fiado" menos
-- o que ja foi pago. Usado no dashboard/tela de cobranca.
create view fiado_saldo_por_cliente as
select
  c.id as cliente_id,
  c.nome,
  coalesce(sum(vp.valor), 0) as total_fiado,
  coalesce((select sum(fp.valor) from fiado_pagamentos fp where fp.cliente_id = c.id), 0) as total_pago,
  coalesce(sum(vp.valor), 0) - coalesce((select sum(fp.valor) from fiado_pagamentos fp where fp.cliente_id = c.id), 0) as saldo_em_aberto
from clientes c
left join vendas v on v.cliente_id = c.id and v.status = 'finalizada'
left join venda_pagamentos vp on vp.venda_id = v.id and vp.forma = 'fiado'
group by c.id, c.nome;

-- RLS: sistema interno, qualquer operador autenticado pode ler/escrever.
-- Restricoes mais finas (ex: so supervisor pode dar desconto) ficam a cargo
-- da aplicacao por enquanto; podem virar policy dedicada depois se necessario.
alter table operadores enable row level security;
alter table produtos enable row level security;
alter table clientes enable row level security;
alter table caixa_sessoes enable row level security;
alter table caixa_movimentos enable row level security;
alter table vendas enable row level security;
alter table venda_itens enable row level security;
alter table venda_pagamentos enable row level security;
alter table fiado_pagamentos enable row level security;

create policy "operadores autenticados podem tudo" on operadores for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "operadores autenticados podem tudo" on produtos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "operadores autenticados podem tudo" on clientes for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "operadores autenticados podem tudo" on caixa_sessoes for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "operadores autenticados podem tudo" on caixa_movimentos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "operadores autenticados podem tudo" on vendas for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "operadores autenticados podem tudo" on venda_itens for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "operadores autenticados podem tudo" on venda_pagamentos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "operadores autenticados podem tudo" on fiado_pagamentos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
