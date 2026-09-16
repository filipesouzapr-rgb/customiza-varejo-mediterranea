-- Cliente revendedor: por enquanto so pra identificacao/filtro no cadastro,
-- sem regra de preco ou negocio associada ainda.
alter table clientes add column eh_revendedor boolean not null default false;
