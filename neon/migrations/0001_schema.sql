-- Schema da Mediterranea no Neon (projeto proprio, sem multi-tenant).
-- Consolidado a partir das migrations 0001-0010 do projeto Supabase
-- compartilhado (customiza-varejo-core), removendo so a camada de tenant
-- (tabela empresas, coluna empresa_id, empresa_do_usuario_atual()) -
-- nenhuma regra de negocio muda:
--   * PDV sem valor visivel pro operador (decisao de frontend - a funcao
--     de finalizar sempre calculou o preco a partir do cadastro, nunca
--     confiou em valor vindo do app)
--   * venda sempre exige cliente vinculado
--   * sem caixa fisico (abrir/fechar/sangria/suprimento) - retirado na
--     fase "PDV simplificado" da Mediterranea, nem chega a existir aqui
--   * toda venda nasce pendente de conciliacao; admin concilia forma de
--     pagamento e pode editar o pedido (itens/preco/desconto) sem limite
--     de tempo
--   * controle de acesso por papel (operador so /caixa, supervisor/dono
--     tudo) - reforcado tambem no banco via eh_admin(), nao so no frontend
--
-- Auth: Neon Auth (Managed Better Auth) + Neon Data API. operadores.id NAO
-- tem FK pro schema interno neon_auth (mesma decisao do apreciarcafe -
-- nome exato da tabela interna nao e garantido pela doc publica);
-- current_operador_id() resolve o id certo independente de FK.

create extension if not exists "pgcrypto";

create table operadores (
  id uuid primary key,
  nome text not null,
  papel text not null default 'operador' check (papel in ('operador', 'supervisor', 'dono')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Equivalente ao auth.uid() do Supabase. auth.user_id() do proprio Neon so
-- resolve dentro de uma expressao de RLS avaliada pela Data API - chamado
-- de dentro de uma funcao nossa, da "permission denied for schema auth"
-- (a role authenticated nao tem, e nao da pra conceder de forma
-- persistente, USAGE nesse schema). Os claims do JWT ja validado chegam
-- como GUC de sessao comum, entao lemos direto dali.
create or replace function current_operador_id()
returns uuid
language sql
stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub')::uuid
$$;

create or replace function eh_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from operadores where id = current_operador_id() and papel in ('supervisor', 'dono')
  )
$$;

create sequence produtos_codigo_interno_seq;

create table produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  codigo_barras text unique,
  codigo_interno text not null unique default ('PLU' || lpad(nextval('produtos_codigo_interno_seq')::text, 6, '0')),
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
  -- Feature de negocio propria da Mediterranea (nada a ver com tenant) -
  -- continua existindo aqui.
  eh_revendedor boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table vendas (
  id uuid primary key default gen_random_uuid(),
  operador_id uuid not null references operadores (id),
  cliente_id uuid not null references clientes (id),
  status text not null default 'aberta' check (status in ('aberta', 'finalizada', 'cancelada')),
  subtotal numeric(10, 2) not null default 0,
  desconto numeric(10, 2) not null default 0 check (desconto >= 0),
  desconto_autorizado_por uuid references operadores (id),
  total numeric(10, 2) not null default 0,
  nfce_status text not null default 'nao_aplicavel' check (nfce_status in ('pendente', 'emitida', 'erro', 'nao_aplicavel')),
  nfce_chave text,
  criada_em timestamptz not null default now(),
  finalizada_em timestamptz,
  cancelada_em timestamptz,
  cancelada_por uuid references operadores (id),
  conciliado_em timestamptz,
  conciliado_por uuid references operadores (id),
  editado_em timestamptz,
  editado_por uuid references operadores (id)
);

create table venda_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas (id) on delete cascade,
  produto_id uuid not null references produtos (id),
  quantidade numeric(10, 3) not null check (quantidade > 0),
  preco_unitario numeric(10, 2) not null check (preco_unitario >= 0),
  subtotal numeric(10, 2) not null check (subtotal >= 0)
);

-- Sem unique(venda_id): a conciliacao (feita pelo admin, depois da venda)
-- pode dividir o pagamento em mais de uma forma.
create table venda_pagamentos (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas (id) on delete cascade,
  forma text not null check (forma in ('dinheiro', 'cartao_debito', 'cartao_credito', 'pix', 'fiado')),
  valor numeric(10, 2) not null check (valor > 0),
  criado_em timestamptz not null default now()
);

create table fiado_pagamentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id),
  valor numeric(10, 2) not null check (valor > 0),
  pago_em timestamptz not null default now(),
  recebido_por uuid not null references operadores (id),
  observacoes text
);

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

-- =========================================================================
-- FUNCOES DE VENDA
-- =========================================================================

-- Finaliza uma venda: sem caixa, sem pagamento, sem desconto (isso tudo
-- vira acao do admin depois, na conciliacao). O preco de cada item vem do
-- cadastro de produtos NESTE MOMENTO - nunca confia em preco mandado pelo
-- app, e' assim que a regra "operador nao ve/nao influencia valor" fica
-- garantida na propria arquitetura, nao so na tela.
-- v_operador_id vem de current_operador_id() (sessao logada), nunca de um
-- parametro mandado pelo app - evita que alguem finalize uma venda em nome
-- de outro operador so adivinhando/mandando um uuid.
create or replace function finalizar_venda(
  p_cliente_id uuid,
  p_itens jsonb -- [{produto_id, quantidade}]
)
returns uuid
language plpgsql
as $$
declare
  v_operador_id uuid := current_operador_id();
  v_venda_id uuid;
  v_subtotal numeric(10, 2);
  v_item jsonb;
  v_produto_id uuid;
  v_quantidade numeric(10, 3);
  v_preco numeric(10, 2);
begin
  if v_operador_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  if not exists (select 1 from operadores where id = v_operador_id and ativo) then
    raise exception 'Operador não encontrado ou inativo';
  end if;

  if p_cliente_id is null then
    raise exception 'Venda exige um cliente vinculado';
  end if;

  if not exists (select 1 from clientes where id = p_cliente_id) then
    raise exception 'Cliente não encontrado';
  end if;

  if jsonb_array_length(p_itens) = 0 then
    raise exception 'Venda sem itens';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_itens) item
    where not exists (select 1 from produtos p where p.id = (item->>'produto_id')::uuid)
  ) then
    raise exception 'Um ou mais produtos não encontrados';
  end if;

  select coalesce(sum(p.preco * (item->>'quantidade')::numeric), 0)
  into v_subtotal
  from jsonb_array_elements(p_itens) as item
  join produtos p on p.id = (item->>'produto_id')::uuid;

  insert into vendas (
    operador_id, cliente_id, status, subtotal, desconto, total, finalizada_em
  )
  values (
    v_operador_id, p_cliente_id, 'finalizada', v_subtotal, 0, v_subtotal, now()
  )
  returning id into v_venda_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_produto_id := (v_item->>'produto_id')::uuid;
    v_quantidade := (v_item->>'quantidade')::numeric;

    select preco into v_preco from produtos where id = v_produto_id;

    insert into venda_itens (venda_id, produto_id, quantidade, preco_unitario, subtotal)
    values (v_venda_id, v_produto_id, v_quantidade, v_preco, v_quantidade * v_preco);

    update produtos
    set estoque_atual = estoque_atual - v_quantidade,
        atualizado_em = now()
    where id = v_produto_id;
  end loop;

  return v_venda_id;
end;
$$;

-- editar_venda_admin: so em pedidos finalizados e AINDA NAO conciliados
-- (evita ter que reconciliar venda_pagamentos com split de forma).
create or replace function editar_venda_admin(
  p_venda_id uuid,
  p_itens jsonb, -- [{produto_id, quantidade, preco_unitario}]
  p_desconto numeric default 0
)
returns void
language plpgsql
as $$
declare
  v_editor_id uuid := current_operador_id();
  v_status text;
  v_conciliado_em timestamptz;
  v_item jsonb;
  v_produto_id uuid;
  v_quantidade numeric;
  v_preco numeric;
  v_subtotal numeric(10, 2);
  v_total numeric(10, 2);
begin
  if not eh_admin() then
    raise exception 'Somente supervisor ou dono pode editar um pedido';
  end if;

  select status, conciliado_em into v_status, v_conciliado_em from vendas where id = p_venda_id;

  if v_status is null then
    raise exception 'Pedido não encontrado';
  end if;

  if v_status <> 'finalizada' then
    raise exception 'Pedido não está finalizado (status atual: %)', v_status;
  end if;

  if v_conciliado_em is not null then
    raise exception 'Pedido já conciliado - não pode editar itens/desconto depois da conciliação';
  end if;

  if jsonb_array_length(p_itens) = 0 then
    raise exception 'Pedido precisa ter ao menos 1 item';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_itens) item
    where not exists (select 1 from produtos p where p.id = (item->>'produto_id')::uuid)
  ) then
    raise exception 'Um ou mais produtos não encontrados';
  end if;

  for v_item in
    select jsonb_build_object('produto_id', produto_id, 'quantidade', quantidade)
    from venda_itens where venda_id = p_venda_id
  loop
    update produtos
    set estoque_atual = estoque_atual + (v_item->>'quantidade')::numeric,
        atualizado_em = now()
    where id = (v_item->>'produto_id')::uuid;
  end loop;

  delete from venda_itens where venda_id = p_venda_id;

  select coalesce(sum((item->>'quantidade')::numeric * (item->>'preco_unitario')::numeric), 0)
  into v_subtotal
  from jsonb_array_elements(p_itens) as item;

  v_total := greatest(v_subtotal - coalesce(p_desconto, 0), 0);

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_produto_id := (v_item->>'produto_id')::uuid;
    v_quantidade := (v_item->>'quantidade')::numeric;
    v_preco := (v_item->>'preco_unitario')::numeric;

    insert into venda_itens (venda_id, produto_id, quantidade, preco_unitario, subtotal)
    values (p_venda_id, v_produto_id, v_quantidade, v_preco, v_quantidade * v_preco);

    update produtos
    set estoque_atual = estoque_atual - v_quantidade,
        atualizado_em = now()
    where id = v_produto_id;
  end loop;

  update vendas
  set subtotal = v_subtotal,
      desconto = coalesce(p_desconto, 0),
      desconto_autorizado_por = current_operador_id(),
      total = v_total,
      editado_em = now(),
      editado_por = current_operador_id()
  where id = p_venda_id;
end;
$$;

-- conciliar_venda: registra a forma de pagamento real (pode ser dividida em
-- mais de uma) e marca o pedido como conciliado. So funciona uma vez por
-- pedido.
create or replace function conciliar_venda(
  p_venda_id uuid,
  p_pagamentos jsonb -- [{forma, valor}]
)
returns void
language plpgsql
as $$
declare
  v_status text;
  v_ja_conciliado timestamptz;
  v_total numeric(10, 2);
  v_total_pago numeric(10, 2);
  v_pagamento jsonb;
begin
  if not eh_admin() then
    raise exception 'Somente supervisor ou dono pode conciliar um pedido';
  end if;

  select status, conciliado_em, total into v_status, v_ja_conciliado, v_total
  from vendas where id = p_venda_id;

  if v_status is null then
    raise exception 'Pedido não encontrado';
  end if;

  if v_status <> 'finalizada' then
    raise exception 'Pedido não está finalizado (status atual: %)', v_status;
  end if;

  if v_ja_conciliado is not null then
    raise exception 'Pedido já conciliado';
  end if;

  if jsonb_array_length(p_pagamentos) = 0 then
    raise exception 'Informe ao menos uma forma de pagamento';
  end if;

  select coalesce(sum((pagamento->>'valor')::numeric), 0)
  into v_total_pago
  from jsonb_array_elements(p_pagamentos) as pagamento;

  if v_total_pago <> v_total then
    raise exception 'Soma dos pagamentos (%) difere do total do pedido (%)', v_total_pago, v_total;
  end if;

  for v_pagamento in select * from jsonb_array_elements(p_pagamentos)
  loop
    insert into venda_pagamentos (venda_id, forma, valor)
    values (p_venda_id, v_pagamento->>'forma', (v_pagamento->>'valor')::numeric);
  end loop;

  update vendas
  set conciliado_em = now(), conciliado_por = current_operador_id()
  where id = p_venda_id;
end;
$$;

-- cancelar_venda: so admin, sem janela de tempo.
create or replace function cancelar_venda(p_venda_id uuid)
returns void
language plpgsql
as $$
declare
  v_status text;
  v_item jsonb;
begin
  if not eh_admin() then
    raise exception 'Somente supervisor ou dono pode cancelar um pedido';
  end if;

  select status into v_status from vendas where id = p_venda_id;

  if v_status is null then
    raise exception 'Pedido não encontrado';
  end if;

  if v_status <> 'finalizada' then
    raise exception 'Pedido não está finalizado (status atual: %)', v_status;
  end if;

  update vendas
  set status = 'cancelada', cancelada_em = now(), cancelada_por = current_operador_id()
  where id = p_venda_id;

  for v_item in
    select jsonb_build_object('produto_id', produto_id, 'quantidade', quantidade)
    from venda_itens where venda_id = p_venda_id
  loop
    update produtos
    set estoque_atual = estoque_atual + (v_item->>'quantidade')::numeric,
        atualizado_em = now()
    where id = (v_item->>'produto_id')::uuid;
  end loop;
end;
$$;

-- =========================================================================
-- RLS: a Data API do Neon exige RLS habilitado em toda tabela acessada por
-- ela. Sem tenant aqui - so authenticated (qualquer operador logado) vs
-- eh_admin() pra contas a pagar (ver 0002).
-- =========================================================================

alter table operadores enable row level security;
alter table produtos enable row level security;
alter table clientes enable row level security;
alter table vendas enable row level security;
alter table venda_itens enable row level security;
alter table venda_pagamentos enable row level security;
alter table fiado_pagamentos enable row level security;

create policy "authenticated_all" on operadores for all to authenticated using (true) with check (true);
create policy "authenticated_all" on produtos for all to authenticated using (true) with check (true);
create policy "authenticated_all" on clientes for all to authenticated using (true) with check (true);
create policy "authenticated_all" on vendas for all to authenticated using (true) with check (true);
create policy "authenticated_all" on venda_itens for all to authenticated using (true) with check (true);
create policy "authenticated_all" on venda_pagamentos for all to authenticated using (true) with check (true);
create policy "authenticated_all" on fiado_pagamentos for all to authenticated using (true) with check (true);

-- Grants: a role authenticated (atribuida pela Data API a partir do JWT
-- validado) precisa de GRANT explicito alem do RLS - RLS so filtra linhas,
-- quem decide se a role chega a olhar a tabela/view/sequence e' o GRANT.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Default privileges: toda tabela/sequence criada nas proximas migrations
-- (ver 0002_contas_a_pagar.sql) ja nasce concedida pra authenticated, sem
-- precisar lembrar de repetir GRANT em cada arquivo novo.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
