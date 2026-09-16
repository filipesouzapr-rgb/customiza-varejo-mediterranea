-- Cadastra a empresa (tenant) da Mediterranea neste projeto multi-tenant
-- (customiza-varejo-core) e fecha o NOT NULL de empresa_id nas tabelas
-- alteradas pela 0005_multitenant.sql.
--
-- Sem backfill aqui: neste projeto todas as tabelas com empresa_id ainda
-- estao vazias (schema recem-aplicado), entao da pra ir direto pro NOT
-- NULL sem UPDATE antes. Se este arquivo for reaproveitado num projeto
-- com dados existentes, rode o backfill (UPDATE ... SET empresa_id = ...)
-- antes dos ALTER COLUMN abaixo.

insert into empresas (id, nome, slug) values
  ('a7fae577-9108-41c7-bac1-824eb444dae1', 'Mediterrânea', 'mediterranea');

alter table operadores alter column empresa_id set not null;
alter table produtos alter column empresa_id set not null;
alter table clientes alter column empresa_id set not null;
alter table caixa_sessoes alter column empresa_id set not null;
alter table caixa_movimentos alter column empresa_id set not null;
alter table vendas alter column empresa_id set not null;
alter table fiado_pagamentos alter column empresa_id set not null;
