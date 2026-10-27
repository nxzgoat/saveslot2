-- Correções: busca de capas reais para jogos já importados. Rode DEPOIS de 004_catalogo_real.sql.
alter table public.games add column if not exists igdb_checked_at timestamptz;
