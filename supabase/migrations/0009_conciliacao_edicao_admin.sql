-- Fase 3: conciliacao e edicao de pedido pelo admin (supervisor/dono), na
-- tela Fiado. Toda venda nasce pendente de conciliacao (Fase 2); aqui
-- entram as funcoes que o admin usa pra corrigir o pedido e decidir a
-- forma de pagamento real.
--
-- As tres funcoes abaixo checam o papel de quem chama olhando auth.uid()
-- diretamente (nao um parametro p_algo_por vindo do cliente) - unica forma
-- de autenticacao agora e' a sessao logada, entao nao faz sentido mais
-- confiar em id mandado pelo app (diferente da epoca do SupervisorModal,
-- em que um segundo login era digitado no meio da sessao do operador).

-- editar_venda_admin: so em pedidos AINDA NAO conciliados (evita ter que
-- reconciliar venda_pagamentos com split de forma - ver decisao no plano).
create or replace function editar_venda_admin(
  p_venda_id uuid,
  p_itens jsonb, -- [{produto_id, quantidade, preco_unitario}]
  p_desconto numeric default 0
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
  v_conciliado_em timestamptz;
  v_item jsonb;
  v_produto_id uuid;
  v_quantidade numeric;
  v_preco numeric;
  v_subtotal numeric(10, 2);
  v_total numeric(10, 2);
begin
  v_editor_id := auth.uid();
  v_empresa_id := empresa_do_usuario_atual();

  select papel into v_editor_papel from operadores where id = v_editor_id;
  if v_editor_papel is null or v_editor_papel not in ('supervisor', 'dono') then
    raise exception 'Somente supervisor ou dono pode editar um pedido';
  end if;

  select empresa_id, status, conciliado_em
  into v_venda_empresa_id, v_status, v_conciliado_em
  from vendas where id = p_venda_id;

  if v_venda_empresa_id is null or v_venda_empresa_id is distinct from v_empresa_id then
    raise exception 'Pedido nao encontrado';
  end if;

  if v_status <> 'finalizada' then
    raise exception 'Pedido nao esta finalizado (status atual: %)', v_status;
  end if;

  if v_conciliado_em is not null then
    raise exception 'Pedido ja conciliado - nao pode editar itens/desconto depois da conciliacao';
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
      editado_em = now(),
      editado_por = v_editor_id
  where id = p_venda_id;
end;
$$;

-- conciliar_venda: registra a forma de pagamento real (pode ser dividida em
-- mais de uma) e marca o pedido como conciliado. So funciona uma vez por
-- pedido (nao ha "reconciliar").
create or replace function conciliar_venda(
  p_venda_id uuid,
  p_pagamentos jsonb -- [{forma, valor}]
)
returns void
language plpgsql
as $$
declare
  v_empresa_id uuid;
  v_conciliado_por uuid;
  v_papel text;
  v_venda_empresa_id uuid;
  v_status text;
  v_ja_conciliado timestamptz;
  v_total numeric(10, 2);
  v_total_pago numeric(10, 2);
  v_pagamento jsonb;
begin
  v_conciliado_por := auth.uid();
  v_empresa_id := empresa_do_usuario_atual();

  select papel into v_papel from operadores where id = v_conciliado_por;
  if v_papel is null or v_papel not in ('supervisor', 'dono') then
    raise exception 'Somente supervisor ou dono pode conciliar um pedido';
  end if;

  select empresa_id, status, conciliado_em, total
  into v_venda_empresa_id, v_status, v_ja_conciliado, v_total
  from vendas where id = p_venda_id;

  if v_venda_empresa_id is null or v_venda_empresa_id is distinct from v_empresa_id then
    raise exception 'Pedido nao encontrado';
  end if;

  if v_status <> 'finalizada' then
    raise exception 'Pedido nao esta finalizado (status atual: %)', v_status;
  end if;

  if v_ja_conciliado is not null then
    raise exception 'Pedido ja conciliado';
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
  set conciliado_em = now(), conciliado_por = v_conciliado_por
  where id = p_venda_id;
end;
$$;

-- cancelar_venda: agora so' admin chama (nunca mais o operador), sem janela
-- de tempo (a versao anterior, com p_cancelado_por vindo do app e limite de
-- 30 minutos, e' substituida por esta).
drop function if exists cancelar_venda(uuid, uuid);

create or replace function cancelar_venda(p_venda_id uuid)
returns void
language plpgsql
as $$
declare
  v_empresa_id uuid;
  v_cancelado_por uuid;
  v_papel text;
  v_status text;
  v_venda_empresa_id uuid;
  v_item jsonb;
begin
  v_cancelado_por := auth.uid();
  v_empresa_id := empresa_do_usuario_atual();

  select papel into v_papel from operadores where id = v_cancelado_por;
  if v_papel is null or v_papel not in ('supervisor', 'dono') then
    raise exception 'Somente supervisor ou dono pode cancelar um pedido';
  end if;

  select status, empresa_id into v_status, v_venda_empresa_id from vendas where id = p_venda_id;

  if v_status is null or v_venda_empresa_id is distinct from v_empresa_id then
    raise exception 'Pedido nao encontrado';
  end if;

  if v_status <> 'finalizada' then
    raise exception 'Pedido nao esta finalizado (status atual: %)', v_status;
  end if;

  update vendas
  set status = 'cancelada', cancelada_em = now(), cancelada_por = v_cancelado_por
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
