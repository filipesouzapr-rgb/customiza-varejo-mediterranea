-- Controle de quebra/reposicao de pecas de produtos que sao jogos/conjuntos
-- (ex: jogo de jantar com prato raso, prato fundo, xicara, etc). Cadastro de
-- pecas por produto (feito uma vez) + registro de quebras/estornos com
-- status pendente/pedido/recebido, pra saber o que pedir ao fornecedor.

create table produto_pecas (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos (id) on delete cascade,
  nome text not null,
  quantidade_no_conjunto numeric(10, 3) not null default 1 check (quantidade_no_conjunto > 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (produto_id, nome)
);

create table quebras_pecas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas (id) default empresa_do_usuario_atual(),
  produto_id uuid not null references produtos (id),
  peca_id uuid not null references produto_pecas (id),
  quantidade numeric(10, 3) not null check (quantidade > 0),
  motivo text check (motivo in ('quebra', 'estorno', 'defeito', 'outro')),
  data_ocorrencia date not null default current_date,
  status text not null default 'pendente' check (status in ('pendente', 'pedido', 'recebido')),
  registrado_por uuid not null references operadores (id) default auth.uid(),
  pedido_em timestamptz,
  recebido_em timestamptz,
  criado_em timestamptz not null default now()
);

alter table produto_pecas enable row level security;
alter table quebras_pecas enable row level security;

-- produto_pecas nao tem empresa_id proprio (mesma decisao ja tomada pra
-- venda_itens em 0005_multitenant.sql) - isola via join com produtos.
create policy "isolado por empresa via produto" on produto_pecas for all
  using (exists (
    select 1 from produtos p where p.id = produto_pecas.produto_id and p.empresa_id = empresa_do_usuario_atual()
  ))
  with check (exists (
    select 1 from produtos p where p.id = produto_pecas.produto_id and p.empresa_id = empresa_do_usuario_atual()
  ));

create policy "isolado por empresa" on quebras_pecas for all
  using (empresa_id = empresa_do_usuario_atual())
  with check (empresa_id = empresa_do_usuario_atual());

-- "auto expose" desligado nesse projeto - toda tabela/sequence/view criada
-- via SQL puro precisa de GRANT explicito, senao o PostgREST barra antes
-- mesmo de avaliar RLS (ver memoria supabase_grants_views).
grant select, insert, update, delete on produto_pecas to authenticated;
grant select, insert, update, delete on quebras_pecas to authenticated;
