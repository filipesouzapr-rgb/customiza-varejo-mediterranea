-- Cancela uma venda dentro da janela legal (30 min da finalizacao),
-- estornando o estoque. Pagamentos e itens ficam registrados para
-- auditoria; o fechamento de caixa ignora vendas canceladas.
create or replace function cancelar_venda(
  p_venda_id uuid,
  p_cancelado_por uuid
)
returns void
language plpgsql
as $$
declare
  v_status text;
  v_finalizada_em timestamptz;
  v_item jsonb;
begin
  select status, finalizada_em into v_status, v_finalizada_em
  from vendas where id = p_venda_id;

  if v_status is null then
    raise exception 'Venda nao encontrada';
  end if;

  if v_status <> 'finalizada' then
    raise exception 'Venda nao esta finalizada (status atual: %)', v_status;
  end if;

  if now() - v_finalizada_em > interval '30 minutes' then
    raise exception 'Fora da janela de cancelamento (30 minutos)';
  end if;

  update vendas
  set status = 'cancelada', cancelada_em = now(), cancelada_por = p_cancelado_por
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
