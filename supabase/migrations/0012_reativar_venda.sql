-- reativar_venda: desfaz um cancelamento (volta pra 'finalizada'), so
-- supervisor/dono, sem janela de tempo (mesma regra de cancelar_venda).
-- Inverso exato de cancelar_venda: cancelar_venda devolve o estoque dos
-- itens; reativar_venda deduz de novo (a venda "volta a valer"). Nao mexe
-- em conciliado_em/venda_pagamentos - cancelar_venda nunca tocou neles, a
-- conciliacao (se existia) continua do jeito que estava.
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
