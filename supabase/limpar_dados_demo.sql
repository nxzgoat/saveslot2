-- OPCIONAL e DESTRUTIVO: apaga só os dados de demonstração (perfis, jogos, grupos e posts fictícios).
-- Contas e dados reais não são tocados. Rode uma vez se quiser o site só com jogos reais.
delete from public.groups where created_by in (select id from public.profiles where is_demo);
delete from public.profiles where is_demo;           -- apaga em cascata amizades, posts, reviews e conquistas deles
delete from public.games where is_demo;               -- apaga em cascata bibliotecas e conquistas desses jogos
delete from public.linked_accounts where is_demo;
