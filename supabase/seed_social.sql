-- DADOS DE DEMONSTRAÇÃO sociais (FICTÍCIOS). Rode depois de seed.sql e 003_social.sql.
update public.games set achievements_complete = true,
  description = 'Jogo fictício de demonstração: reinos em ruínas e uma campanha longa.' where id = '00000000-0000-0000-0000-0000000000b2';
update public.games set achievements_complete = true,
  description = 'Jogo fictício de demonstração: puzzles dentro de uma igreja pixelada.' where id = '00000000-0000-0000-0000-0000000000b6';
update public.games set description = 'Jogo fictício de demonstração: corridas orbitais.' where id = '00000000-0000-0000-0000-0000000000b3';
update public.games set description = 'Jogo fictício de demonstração: cooperativo em uma cidade portuária neon.' where id = '00000000-0000-0000-0000-0000000000b1';

update public.achievements set platform = 'pc', global_percent = 12.5 where id = '00000000-0000-0000-0000-0000000000c1';
update public.achievements set platform = 'pc', global_percent = 48.0 where id = '00000000-0000-0000-0000-0000000000c2';
update public.achievements set platform = 'xbox', global_percent = 22.0 where id = '00000000-0000-0000-0000-0000000000c3';
update public.achievements set platform = 'nintendo', global_percent = 9.3 where id = '00000000-0000-0000-0000-0000000000c4';
insert into public.achievements (id, game_id, title, description, platform, global_percent) values
 ('00000000-0000-0000-0000-0000000000c5','00000000-0000-0000-0000-0000000000b2','Chama eterna','Acenda todas as tochas do reino.','pc',31.0)
on conflict do nothing;
insert into public.profile_achievements (profile_id, achievement_id, unlocked_at) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c5','2026-09-02')
on conflict do nothing;

insert into public.friendships (requester_id, addressee_id, status) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a3','accepted'),
 ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a3','pending')
on conflict do nothing;

insert into public.reviews (id, game_id, profile_id, rating, body, platform, hours, has_spoiler) values
 ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000a1',4.5,'Campanha longa e cheia de segredos (review de demonstração).','pc',86.5,false),
 ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000b6','00000000-0000-0000-0000-0000000000a3',5,'No final, o sacristão era o culpado o tempo todo (review de demonstração, com spoiler).','nintendo',18,true),
 ('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-0000000000a2',3.5,'Boa sensação de velocidade, mas poucas pistas (review de demonstração).','xbox',41,false)
on conflict do nothing;

insert into public.groups (id, name, description, visibility, created_by) values
 ('00000000-0000-0000-0000-0000000000e1','Caçadores de Platina (demo)','Grupo de demonstração para quem gosta de zerar tudo.','public','00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-0000000000e2','Clube dos Indies (demo)','Grupo privado de demonstração. Peça para entrar.','private','00000000-0000-0000-0000-0000000000a3')
on conflict do nothing;
insert into public.group_members (group_id, profile_id, role) values
 ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000a1','admin'),
 ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000a2','member'),
 ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000a3','admin')
on conflict do nothing;

insert into public.posts (id, author_id, kind, body, group_id, game_id, achievement_id, review_id, platform) values
 ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a1','text','Bem-vindos ao feed de demonstração! #saveslot #demo',null,null,null,null,null),
 ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000a1','platinum','Platina conquistada (demonstração) #platina','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000b2',null,null,'pc'),
 ('00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000a3','review','Meu review favorito (demonstração).',null,'00000000-0000-0000-0000-0000000000b6',null,'00000000-0000-0000-0000-0000000000f2','nintendo'),
 ('00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000a2','achievement','Volta perfeita, finalmente! (demonstração)',null,'00000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-0000000000c3',null,'xbox')
on conflict do nothing;

insert into public.group_messages (group_id, sender_id, body) values
 ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000a1','Mensagem de demonstração no chat do grupo.');
