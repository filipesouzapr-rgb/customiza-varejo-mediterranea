-- Precos especificos por cliente "passador" (clientes.eh_revendedor =
-- true). O preco padrao do produto nunca muda - isso e' so uma tabela de
-- excecoes por cliente; produto sem preco especifico usa o padrao.

create table cliente_precos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) default empresa_do_usuario_atual(),
  cliente_id uuid not null references clientes (id),
  produto_id uuid not null references produtos (id),
  preco numeric(10, 2) not null check (preco >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (cliente_id, produto_id)
);

create index cliente_precos_cliente_idx on cliente_precos (cliente_id);

-- Sem "Automatically expose new tables" - GRANT explicito obrigatorio.
grant select, insert, update, delete on cliente_precos to authenticated;

alter table cliente_precos enable row level security;

create policy "isolado por empresa" on cliente_precos for all
  using (empresa_id = empresa_do_usuario_atual())
  with check (empresa_id = empresa_do_usuario_atual());

-- Copia (upsert) os precos de um passador pra outro - nunca apaga preco
-- que o destino ja tinha e nao existe na origem.
create or replace function copiar_precos_passador(p_cliente_origem_id uuid, p_cliente_destino_id uuid)
returns void
language plpgsql
as $$
declare
  v_empresa_id uuid;
begin
  v_empresa_id := empresa_do_usuario_atual();

  if not exists (select 1 from clientes where id = p_cliente_origem_id and empresa_id = v_empresa_id) then
    raise exception 'Cliente de origem nao encontrado';
  end if;
  if not exists (select 1 from clientes where id = p_cliente_destino_id and empresa_id = v_empresa_id) then
    raise exception 'Cliente de destino nao encontrado';
  end if;

  insert into cliente_precos (empresa_id, cliente_id, produto_id, preco)
  select v_empresa_id, p_cliente_destino_id, produto_id, preco
  from cliente_precos
  where cliente_id = p_cliente_origem_id
  on conflict (cliente_id, produto_id) do update set preco = excluded.preco, atualizado_em = now();
end;
$$;

-- Aplica X% de desconto sobre o preco PADRAO (nao sobre o preco atual do
-- passador, pra nao compor descontos repetidos), pros produtos informados.
create or replace function aplicar_desconto_passador(
  p_cliente_id uuid,
  p_percentual numeric,
  p_produto_ids uuid[]
)
returns void
language plpgsql
as $$
declare
  v_empresa_id uuid;
begin
  v_empresa_id := empresa_do_usuario_atual();

  if not exists (select 1 from clientes where id = p_cliente_id and empresa_id = v_empresa_id) then
    raise exception 'Cliente nao encontrado';
  end if;

  insert into cliente_precos (empresa_id, cliente_id, produto_id, preco)
  select v_empresa_id, p_cliente_id, p.id, round(p.preco * (1 - p_percentual / 100.0), 2)
  from produtos p
  where p.id = any(p_produto_ids) and p.empresa_id = v_empresa_id
  on conflict (cliente_id, produto_id) do update set preco = excluded.preco, atualizado_em = now();
end;
$$;

-- finalizar_venda: resolve o preco do passador quando aplicavel. Corpo
-- copiado de 0018_estoque_movimentacoes.sql - unica mudanca de logica e'
-- a resolucao de preco (padrao x cliente_precos) e o subtotal passar a
-- ser acumulado dentro do mesmo loop que grava venda_itens (fonte unica,
-- sem risco de o total ficar diferente da soma dos itens gravados).
create or replace function finalizar_venda(
  p_operador_id uuid,
  p_cliente_id uuid,
  p_itens jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_empresa_id uuid;
  v_venda_id uuid;
  v_subtotal numeric(10, 2) := 0;
  v_item jsonb;
  v_produto_id uuid;
  v_quantidade numeric(10, 3);
  v_preco numeric(10, 2);
  v_preco_especial numeric(10, 2);
  v_produto_sem_estoque text;
  v_cliente_passador boolean;
begin
  v_empresa_id := empresa_do_usuario_atual();
  if v_empresa_id is null then
    raise exception 'Operador sem empresa associada';
  end if;

  if p_cliente_id is null then
    raise exception 'Venda exige um cliente vinculado';
  end if;

  select eh_revendedor into v_cliente_passador
  from clientes where id = p_cliente_id and empresa_id = v_empresa_id;

  if v_cliente_passador is null then
    raise exception 'Cliente nao encontrado para esta empresa';
  end if;

  if jsonb_array_length(p_itens) = 0 then
    raise exception 'Venda sem itens';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_itens) item
    where not exists (
      select 1 from produtos p
      where p.id = (item->>'produto_id')::uuid and p.empresa_id = v_empresa_id
    )
  ) then
    raise exception 'Um ou mais produtos nao pertencem a esta empresa';
  end if;

  select p.nome into v_produto_sem_estoque
  from (
    select (item->>'produto_id')::uuid as produto_id, sum((item->>'quantidade')::numeric) as qtd_total
    from jsonb_array_elements(p_itens) item
    group by produto_id
  ) agregado
  join produtos p on p.id = agregado.produto_id
  where p.estoque_atual < agregado.qtd_total
  limit 1;

  if v_produto_sem_estoque is not null then
    raise exception 'Quantidade indisponivel para "%" - confira o estoque atual', v_produto_sem_estoque;
  end if;

  insert into vendas (
    empresa_id, operador_id, cliente_id, status,
    subtotal, desconto, total, finalizada_em
  )
  values (
    v_empresa_id, p_operador_id, p_cliente_id, 'finalizada',
    0, 0, 0, now()
  )
  returning id into v_venda_id;

  perform set_config('app.estoque_tipo', 'venda', true);
  perform set_config('app.estoque_venda_id', v_venda_id::text, true);

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_produto_id := (v_item->>'produto_id')::uuid;
    v_quantidade := (v_item->>'quantidade')::numeric;

    select preco into v_preco from produtos where id = v_produto_id;

    if v_cliente_passador then
      select preco into v_preco_especial
      from cliente_precos where cliente_id = p_cliente_id and produto_id = v_produto_id;
      if v_preco_especial is not null then
        v_preco := v_preco_especial;
      end if;
    end if;

    insert into venda_itens (venda_id, produto_id, quantidade, preco_unitario, subtotal)
    values (v_venda_id, v_produto_id, v_quantidade, v_preco, v_quantidade * v_preco);

    v_subtotal := v_subtotal + v_quantidade * v_preco;

    update produtos
    set estoque_atual = estoque_atual - v_quantidade,
        atualizado_em = now()
    where id = v_produto_id;
  end loop;

  update vendas set subtotal = v_subtotal, total = v_subtotal where id = v_venda_id;

  return v_venda_id;
end;
$$;
