-- Controle de estoque: ate agora finalizar_venda/editar_venda_admin/
-- reativar_venda deduziam estoque sem checar se havia saldo suficiente -
-- achamos um produto real ja em -1 por causa disso. Fecha em 3 camadas:
-- 1) validacao no frontend (rapida, boa UX)
-- 2) checagem explicita nas funcoes abaixo, com mensagem clara, ANTES de
--    aplicar qualquer UPDATE (all-or-nothing - nao deixa a venda pela
--    metade se faltar estoque no meio do processamento)
-- 3) constraint no banco como ultimo backstop, caso 1 e 2 falhem por algum
--    bug futuro

-- Zera qualquer estoque ja negativo (achado: "Panela diamond marrom" em
-- -1) antes de travar com a constraint, senao ela nem aplica.
update produtos set estoque_atual = 0 where estoque_atual < 0;

alter table produtos
  add constraint estoque_atual_nao_negativo check (estoque_atual >= 0);

-- finalizar_venda: pre-checa estoque agregado por produto (cobre o caso de
-- o mesmo produto aparecer mais de uma vez em p_itens) antes de inserir
-- qualquer coisa.
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
  v_subtotal numeric(10, 2);
  v_item jsonb;
  v_produto_id uuid;
  v_quantidade numeric(10, 3);
  v_preco numeric(10, 2);
  v_produto_sem_estoque text;
begin
  v_empresa_id := empresa_do_usuario_atual();
  if v_empresa_id is null then
    raise exception 'Operador sem empresa associada';
  end if;

  if p_cliente_id is null then
    raise exception 'Venda exige um cliente vinculado';
  end if;

  if not exists (
    select 1 from clientes where id = p_cliente_id and empresa_id = v_empresa_id
  ) then
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

  select coalesce(sum(p.preco * (item->>'quantidade')::numeric), 0)
  into v_subtotal
  from jsonb_array_elements(p_itens) as item
  join produtos p on p.id = (item->>'produto_id')::uuid;

  insert into vendas (
    empresa_id, operador_id, cliente_id, status,
    subtotal, desconto, total, finalizada_em
  )
  values (
    v_empresa_id, p_operador_id, p_cliente_id, 'finalizada',
    v_subtotal, 0, v_subtotal, now()
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

-- editar_venda_admin: mesmo pre-check, feito depois de devolver o estoque
-- dos itens antigos (nesse ponto estoque_atual ja reflete "como se essa
-- venda nao existisse") e antes de inserir/deduzir os itens novos.
create or replace function editar_venda_admin(
  p_venda_id uuid,
  p_itens jsonb, -- [{produto_id, quantidade, preco_unitario}]
  p_desconto numeric default 0,
  p_finalizada_em timestamptz default null
)
returns void
language plpgsql
as $$
declare
  v_empresa_id uuid;
  v_editor_id uuid;
  v_editor_papel text;
  v_venda_empresa_id uuid;
  v_status text;
  v_total_antigo numeric(10, 2);
  v_item jsonb;
  v_produto_id uuid;
  v_quantidade numeric;
  v_preco numeric;
  v_subtotal numeric(10, 2);
  v_total numeric(10, 2);
  v_pagamento record;
  v_novo_valor numeric(10, 2);
  v_soma_ja_ajustada numeric(10, 2) := 0;
  v_qtd_pagamentos int;
  v_i int := 0;
  v_produto_sem_estoque text;
begin
  v_editor_id := auth.uid();
  v_empresa_id := empresa_do_usuario_atual();

  select papel into v_editor_papel from operadores where id = v_editor_id;
  if v_editor_papel is null or v_editor_papel not in ('supervisor', 'dono') then
    raise exception 'Somente supervisor ou dono pode editar um pedido';
  end if;

  select empresa_id, status, total
  into v_venda_empresa_id, v_status, v_total_antigo
  from vendas where id = p_venda_id;

  if v_venda_empresa_id is null or v_venda_empresa_id is distinct from v_empresa_id then
    raise exception 'Pedido nao encontrado';
  end if;

  if v_status <> 'finalizada' then
    raise exception 'Pedido nao esta finalizado (status atual: %)', v_status;
  end if;

  if jsonb_array_length(p_itens) = 0 then
    raise exception 'Pedido precisa ter ao menos 1 item';
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

  -- reverte estoque dos itens atuais antes de trocar pelos novos
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
      desconto_autorizado_por = v_editor_id,
      total = v_total,
      finalizada_em = coalesce(p_finalizada_em, finalizada_em),
      editado_em = now(),
      editado_por = v_editor_id
  where id = p_venda_id;

  -- reescala proporcionalmente os pagamentos ja registrados (se o pedido ja
  -- estava conciliado) pra continuarem somando o novo total. Ajusta o
  -- ultimo pagamento pra absorver o resto do arredondamento.
  select count(*) into v_qtd_pagamentos from venda_pagamentos where venda_id = p_venda_id;

  if v_qtd_pagamentos > 0 then
    for v_pagamento in
      select id, valor from venda_pagamentos where venda_id = p_venda_id order by id
    loop
      v_i := v_i + 1;
      if v_i = v_qtd_pagamentos then
        v_novo_valor := v_total - v_soma_ja_ajustada;
      elsif v_total_antigo > 0 then
        v_novo_valor := round(v_pagamento.valor / v_total_antigo * v_total, 2);
      else
        v_novo_valor := round(v_total / v_qtd_pagamentos, 2);
      end if;

      update venda_pagamentos set valor = greatest(v_novo_valor, 0) where id = v_pagamento.id;
      v_soma_ja_ajustada := v_soma_ja_ajustada + greatest(v_novo_valor, 0);
    end loop;
  end if;
end;
$$;

-- reativar_venda: pre-checa estoque antes de deduzir de novo (pode ter sido
-- vendido a outro cliente entre o cancelamento e a reativacao).
create or replace function reativar_venda(p_venda_id uuid)
returns void
language plpgsql
as $$
declare
  v_empresa_id uuid;
  v_reativado_por uuid;
  v_papel text;
  v_status text;
  v_venda_empresa_id uuid;
  v_item jsonb;
  v_produto_sem_estoque text;
begin
  v_reativado_por := auth.uid();
  v_empresa_id := empresa_do_usuario_atual();

  select papel into v_papel from operadores where id = v_reativado_por;
  if v_papel is null or v_papel not in ('supervisor', 'dono') then
    raise exception 'Somente supervisor ou dono pode reativar um pedido';
  end if;

  select status, empresa_id into v_status, v_venda_empresa_id from vendas where id = p_venda_id;

  if v_status is null or v_venda_empresa_id is distinct from v_empresa_id then
    raise exception 'Pedido nao encontrado';
  end if;

  if v_status <> 'cancelada' then
    raise exception 'Pedido nao esta cancelado (status atual: %)', v_status;
  end if;

  select p.nome into v_produto_sem_estoque
  from (
    select produto_id, sum(quantidade) as qtd_total
    from venda_itens where venda_id = p_venda_id
    group by produto_id
  ) agregado
  join produtos p on p.id = agregado.produto_id
  where p.estoque_atual < agregado.qtd_total
  limit 1;

  if v_produto_sem_estoque is not null then
    raise exception 'Nao e possivel reativar - estoque insuficiente de "%" (pode ter sido vendido a outro cliente)', v_produto_sem_estoque;
  end if;

  for v_item in
    select jsonb_build_object('produto_id', produto_id, 'quantidade', quantidade)
    from venda_itens where venda_id = p_venda_id
  loop
    update produtos
    set estoque_atual = estoque_atual - (v_item->>'quantidade')::numeric,
        atualizado_em = now()
    where id = (v_item->>'produto_id')::uuid;
  end loop;

  update vendas
  set status = 'finalizada', cancelada_em = null, cancelada_por = null
  where id = p_venda_id;
end;
$$;
