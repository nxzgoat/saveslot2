-- DADOS DE DEMONSTRAÇÃO: perfis, jogos e números FICTÍCIOS (is_demo = true).
-- Não representam jogadores reais. Rode depois de schema.sql.
insert into public.profiles (id, username, display_name, bio, is_demo) values
 ('00000000-0000-0000-0000-0000000000a1','demo_nyx','Nyx (demo)','Perfil de demonstração. Gosto de aventuras longas e de zerar tudo.',true),
 ('00000000-0000-0000-0000-0000000000a2','demo_orion','Orion (demo)','Perfil de demonstração. Corridas e jogos de tiro.',true),
 ('00000000-0000-0000-0000-0000000000a3','demo_kiko','Kiko (demo)','Perfil de demonstração. Indies e jogos de puzzle.',true);

insert into public.games (id, title, is_demo) values
 ('00000000-0000-0000-0000-0000000000b1','Neon Harbor',true),
 ('00000000-0000-0000-0000-0000000000b2','Ashfall Kingdoms',true),
 ('00000000-0000-0000-0000-0000000000b3','Orbital Drift',true),
 ('00000000-0000-0000-0000-0000000000b4','Hollow Pines',true),
 ('00000000-0000-0000-0000-0000000000b5','Tidebreaker',true),
 ('00000000-0000-0000-0000-0000000000b6','Pixel Parish',true);

insert into public.profile_games (profile_id, game_id, platform, status, hours, rating, is_favorite, last_played_at) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b2','pc','completed',86.5,9,true,'2026-09-12'),
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b4','playstation','playing',22.0,8,true,'2026-10-20'),
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1','steam','backlog',0,null,false,null),
 ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000b3','xbox','completed',41.0,8,true,'2026-08-30'),
 ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000b5','xbox','dropped',6.5,4,false,'2026-05-02'),
 ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000b6','nintendo','completed',18.0,10,true,'2026-10-01'),
 ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000b1','steam','playing',9.5,7,false,'2026-10-22');

insert into public.achievements (id, game_id, title, description) values
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b2','Coroa de Cinzas','Conclua a campanha principal.'),
 ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000b2','Cartógrafo','Descubra todas as regiões do mapa.'),
 ('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000b3','Volta perfeita','Termine uma volta sem tocar nas bordas.'),
 ('00000000-0000-0000-0000-0000000000c4','00000000-0000-0000-0000-0000000000b6','Sacristão','Resolva todos os puzzles da igreja.');

insert into public.profile_achievements (profile_id, achievement_id, unlocked_at) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','2026-09-12'),
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c2','2026-08-20'),
 ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c3','2026-08-11'),
 ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000c4','2026-10-01');

insert into public.linked_accounts (profile_id, platform, username, url) values
 ('00000000-0000-0000-0000-0000000000a1','discord','nyx_demo',null),
 ('00000000-0000-0000-0000-0000000000a3','twitch','kiko_demo','https://example.com/kiko-demo');
