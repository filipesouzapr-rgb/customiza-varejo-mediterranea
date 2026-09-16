-- Fase 4: modulo de Contas a Pagar, multi-tenant (empresa_id + RLS), acesso
-- restrito a supervisor/dono (nem RLS nem a app deixam operador ver isso).

-- =========================================================================
-- 1. CADASTROS DE APOIO
-- =========================================================================

create table fornecedores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) default empresa_do_usuario_atual(),
  nome text not null,
  cpf_cnpj text,
  telefone text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table grupos_despesa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) default empresa_do_usuario_atual(),
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (empresa_id, nome)
);

-- =========================================================================
-- 2. REGRAS DE RECORRENCIA E LANCAMENTOS
-- =========================================================================

create table contas_pagar_regras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) default empresa_do_usuario_atual(),
  fornecedor_id uuid references fornecedores (id),
  grupo_id uuid not null references grupos_despesa (id),
  descricao text not null,
  valor numeric(10, 2) not null check (valor >= 0),
  desconto numeric(10, 2) not null default 0 check (desconto >= 0),
  periodicidade text not null check (periodicidade in ('semanal', 'quinzenal', 'mensal')),
  -- semanal/quinzenal usam dia_semana (0=domingo..6=sabado); mensal usa
  -- dia_mes (1-31, com clamp pro ultimo dia em meses mais curtos).
  dia_semana smallint check (dia_semana between 0 and 6),
  dia_mes smallint check (dia_mes between 1 and 31),
  data_inicio date not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  check (
    (periodicidade in ('semanal', 'quinzenal') and dia_semana is not null and dia_mes is null)
    or
    (periodicidade = 'mensal' and dia_mes is not null and dia_semana is null)
  )
);

create table contas_pagar (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) default empresa_do_usuario_atual(),
  fornecedor_id uuid references fornecedores (id),
  grupo_id uuid not null references grupos_despesa (id),
  descricao text not null,
  valor numeric(10, 2) not null check (valor >= 0),
  desconto numeric(10, 2) not null default 0 check (desconto >= 0),
  data_vencimento date not null,
  data_pagamento date,
  forma_pagamento text check (forma_pagamento in ('dinheiro', 'cartao_debito', 'cartao_credito', 'pix', 'transferencia', 'boleto')),
  status text not null default 'nao_conciliado' check (status in ('nao_conciliado', 'conciliado')),
  -- regra que originou este lancamento (null = avulso). Editar "so esta
  -- conta" mexe direto nesta linha; editar "a regra toda" passa pela
  -- funcao editar_regra_contas_pagar abaixo, que propaga pras ocorrencias
  -- futuras ainda nao conciliadas.
  regra_id uuid references contas_pagar_regras (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- evita gerar a mesma ocorrencia (regra + vencimento) duas vezes.
create unique index contas_pagar_regra_vencimento_key
  on contas_pagar (regra_id, data_vencimento)
  where regra_id is not null;

-- Sem "Automatically expose new tables" (ver 0005_multitenant.sql) -
-- GRANT explicito obrigatorio pra toda tabela nova.
grant select, insert, update, delete on fornecedores to authenticated;
grant select, insert, update, delete on grupos_despesa to authenticated;
grant select, insert, update, delete on contas_pagar_regras to authenticated;
grant select, insert, update, delete on contas_pagar to authenticated;

-- =========================================================================
-- 3. RLS: isolado por empresa E restrito a supervisor/dono (o operador nao
-- deve enxergar nada deste modulo, nem via chamada direta a API).
-- =========================================================================

create or replace function eh_admin_do_usuario_atual()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from operadores where id = auth.uid() and papel in ('supervisor', 'dono')
  )
$$;

alter table fornecedores enable row level security;
alter table grupos_despesa enable row level security;
alter table contas_pagar_regras enable row level security;
alter table contas_pagar enable row level security;

create policy "admin da empresa" on fornecedores for all
  using (empresa_id = empresa_do_usuario_atual() and eh_admin_do_usuario_atual())
  with check (empresa_id = empresa_do_usuario_atual() and eh_admin_do_usuario_atual());

create policy "admin da empresa" on grupos_despesa for all
  using (empresa_id = empresa_do_usuario_atual() and eh_admin_do_usuario_atual())
  with check (empresa_id = empresa_do_usuario_atual() and eh_admin_do_usuario_atual());

create policy "admin da empresa" on contas_pagar_regras for all
  using (empresa_id = empresa_do_usuario_atual() and eh_admin_do_usuario_atual())
  with check (empresa_id = empresa_do_usuario_atual() and eh_admin_do_usuario_atual());

create policy "admin da empresa" on contas_pagar for all
  using (empresa_id = empresa_do_usuario_atual() and eh_admin_do_usuario_atual())
  with check (empresa_id = empresa_do_usuario_atual() and eh_admin_do_usuario_atual());

-- =========================================================================
-- 4. GERACAO DE OCORRENCIAS FUTURAS (horizonte de 90 dias)
-- =========================================================================
-- Chamada pelo app (a) toda vez que uma regra e criada/editada, e (b) toda
-- vez que a tela de Contas a Pagar abre - sem cron, adequado pro volume de
-- uso (poucos admins abrindo a tela periodicamente).

create or replace function gerar_ocorrencias_contas_pagar()
returns void
language plpgsql
as $$
declare
  v_empresa_id uuid;
  v_horizonte date := current_date + 90;
  v_regra record;
  v_data date;
  v_ancora date;
  v_k_min int;
  v_k_max int;
  v_k int;
  v_mes date;
  v_ultimo_dia int;
  v_dia int;
begin
  v_empresa_id := empresa_do_usuario_atual();
  if v_empresa_id is null or not eh_admin_do_usuario_atual() then
    raise exception 'Somente supervisor ou dono pode gerar ocorrencias de contas a pagar';
  end if;

  for v_regra in
    select * from contas_pagar_regras
    where empresa_id = v_empresa_id and ativo = true
  loop
    if v_regra.periodicidade = 'semanal' then
      v_data := greatest(v_regra.data_inicio, current_date);
      v_data := v_data + ((v_regra.dia_semana - extract(dow from v_data)::int + 7) % 7);

      while v_data <= v_horizonte loop
        insert into contas_pagar (
          empresa_id, fornecedor_id, grupo_id, descricao, valor, desconto,
          data_vencimento, status, regra_id
        )
        values (
          v_empresa_id, v_regra.fornecedor_id, v_regra.grupo_id, v_regra.descricao,
          v_regra.valor, v_regra.desconto, v_data, 'nao_conciliado', v_regra.id
        )
        on conflict (regra_id, data_vencimento) where regra_id is not null do nothing;

        v_data := v_data + 7;
      end loop;

    elsif v_regra.periodicidade = 'quinzenal' then
      v_ancora := v_regra.data_inicio
        + ((v_regra.dia_semana - extract(dow from v_regra.data_inicio)::int + 7) % 7);
      v_k_min := greatest(ceil((greatest(v_ancora, current_date) - v_ancora)::numeric / 14), 0);
      v_k_max := floor((v_horizonte - v_ancora)::numeric / 14);

      for v_k in v_k_min..v_k_max loop
        v_data := v_ancora + (v_k * 14);
        if v_data >= current_date then
          insert into contas_pagar (
            empresa_id, fornecedor_id, grupo_id, descricao, valor, desconto,
            data_vencimento, status, regra_id
          )
          values (
            v_empresa_id, v_regra.fornecedor_id, v_regra.grupo_id, v_regra.descricao,
            v_regra.valor, v_regra.desconto, v_data, 'nao_conciliado', v_regra.id
          )
          on conflict (regra_id, data_vencimento) where regra_id is not null do nothing;
        end if;
      end loop;

    elsif v_regra.periodicidade = 'mensal' then
      v_mes := date_trunc('month', greatest(v_regra.data_inicio, current_date))::date;

      while v_mes <= v_horizonte loop
        v_ultimo_dia := extract(day from ((v_mes + interval '1 month - 1 day')))::int;
        v_dia := least(v_regra.dia_mes, v_ultimo_dia);
        v_data := (v_mes + (v_dia - 1))::date;

        if v_data >= greatest(v_regra.data_inicio, current_date) and v_data <= v_horizonte then
          insert into contas_pagar (
            empresa_id, fornecedor_id, grupo_id, descricao, valor, desconto,
            data_vencimento, status, regra_id
          )
          values (
            v_empresa_id, v_regra.fornecedor_id, v_regra.grupo_id, v_regra.descricao,
            v_regra.valor, v_regra.desconto, v_data, 'nao_conciliado', v_regra.id
          )
          on conflict (regra_id, data_vencimento) where regra_id is not null do nothing;
        end if;

        v_mes := (v_mes + interval '1 month')::date;
      end loop;
    end if;
  end loop;
end;
$$;

-- =========================================================================
-- 5. EDITAR REGRA COMPLETA (propaga pras ocorrencias futuras ainda nao
-- conciliadas - "editar so esta conta" e' um UPDATE direto em contas_pagar,
-- sem precisar de funcao).
-- =========================================================================

create or replace function editar_regra_contas_pagar(
  p_regra_id uuid,
  p_fornecedor_id uuid,
  p_grupo_id uuid,
  p_descricao text,
  p_valor numeric,
  p_desconto numeric,
  p_periodicidade text,
  p_dia_semana smallint,
  p_dia_mes smallint,
  p_data_inicio date,
  p_ativo boolean
)
returns void
language plpgsql
as $$
declare
  v_empresa_id uuid;
begin
  v_empresa_id := empresa_do_usuario_atual();
  if v_empresa_id is null or not eh_admin_do_usuario_atual() then
    raise exception 'Somente supervisor ou dono pode editar uma regra de contas a pagar';
  end if;

  if not exists (select 1 from contas_pagar_regras where id = p_regra_id and empresa_id = v_empresa_id) then
    raise exception 'Regra nao encontrada';
  end if;

  update contas_pagar_regras
  set fornecedor_id = p_fornecedor_id,
      grupo_id = p_grupo_id,
      descricao = p_descricao,
      valor = p_valor,
      desconto = p_desconto,
      periodicidade = p_periodicidade,
      dia_semana = p_dia_semana,
      dia_mes = p_dia_mes,
      data_inicio = p_data_inicio,
      ativo = p_ativo
  where id = p_regra_id;

  -- propaga descricao/valor/fornecedor/grupo/desconto pras ocorrencias
  -- futuras ainda nao conciliadas - nunca mexe em conta ja conciliada
  -- (historico) nem muda a data de vencimento de ocorrencia ja gerada.
  update contas_pagar
  set fornecedor_id = p_fornecedor_id,
      grupo_id = p_grupo_id,
      descricao = p_descricao,
      valor = p_valor,
      desconto = p_desconto,
      atualizado_em = now()
  where regra_id = p_regra_id
    and status = 'nao_conciliado'
    and data_vencimento >= current_date;
end;
$$;
