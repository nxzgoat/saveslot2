# Saveslot

Plataforma de perfis gamers (React + TypeScript + Vite) com backend no Supabase (PostgreSQL, Auth, Storage, RLS). Projeto independente, inspirado no conceito do YourGamerProfile: biblioteca de jogos, horas, conquistas e links num perfil público.

> **Sobre a referência:** o site original bloqueia acesso automatizado, então o layout e as páginas daqui **não** foram copiados nem verificados contra ele. O escopo veio de descrições públicas (hub de troféus, conquistas e tempo de jogo; datas, notas e links no perfil).

## O que funciona

- Cadastro, login, logout, recuperação e troca de senha (Supabase Auth, validação no servidor).
- Perfil público em `/u/:usuario` com abas (visão geral, biblioteca, conquistas), estatísticas calculadas dos dados reais, banner e avatar.
- Busca por nome de usuário no banco, com estados de carregamento, erro e vazio.
- Painel `/configuracoes`: perfil, upload de avatar/banner, biblioteca de jogos (plataforma, status, horas, nota, favorito), links e privacidade.
- Segurança por RLS: ninguém edita dados de outro usuário; perfis privados e seções ocultas não são entregues pelo banco.
- Dados de demonstração fictícios (`supabase/seed.sql`), marcados com o selo "Demo".

## O que NÃO existe ainda

- Sincronização com PlayStation, Xbox e Nintendo (sem API oficial aberta). A Steam existe em `supabase/functions/sync-steam`, mas a conta conectada ainda não é verificada (falta login via Steam OpenID).
- Cadastro de conquistas pela interface (elas aparecem no perfil, mas hoje só entram via SQL/seed).
- Capas de jogos: sem fonte de imagens configurada, os jogos mostram uma capa gerada com as iniciais.
- Exclusão da própria conta e 2FA (o Supabase suporta, falta a interface).
- Testes automatizados. O código foi escrito sem poder executar `npm install`/`tsc` no ambiente de criação, então rode `npm run build` primeiro e corrija eventuais ajustes de tipos.

## Como rodar

1. `npm install`
2. Crie um projeto em https://supabase.com.
3. No **SQL Editor**, rode `supabase/schema.sql`. Depois, se quiser dados de teste, `supabase/seed.sql`.
4. Em **Authentication > URL Configuration**, adicione `http://localhost:5173` em Site URL e Redirect URLs (necessário para confirmação de e-mail e recuperação de senha).
5. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (Project Settings > API). Nunca use a chave `service_role` aqui.
6. `npm run dev` e abra http://localhost:5173

Para build de produção: `npm run build` (saída em `dist/`). Em hospedagem estática, configure o fallback de rotas para `index.html`.

## Estrutura

```
src/
  pages/         Home, SearchPage, ProfilePage, Settings, AuthPages, NotFound
  components/    Layout, ui (Avatar, Cover, ProfileCard, estados)
  lib/           supabase, api (acesso a dados), auth, toast, useAsync, types
  integrations/  contrato para provedores de plataformas (vazio)
supabase/        schema.sql (tabelas, RLS, storage), seed.sql (demo)
```

## Banco

`profiles`, `games`, `profile_games`, `achievements`, `profile_achievements`, `linked_accounts`, mais o bucket `media` (avatares e banners, até 2 MB, PNG/JPG/WebP). A privacidade fica em colunas do próprio perfil (`is_public`, `show_library`, `show_achievements`). Nomes de usuário são sempre minúsculos (`a-z`, `0-9`, `_`, 3 a 20 caracteres).

## Publicar no GitHub Pages

1. Envie o projeto para um repositório no GitHub (branch `main`).
2. Em **Settings > Secrets and variables > Actions**, crie `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (só a chave anon).
3. Em **Settings > Pages**, em Source, escolha **GitHub Actions**.
4. Em Supabase, **Authentication > URL Configuration**, ponha o endereço do Pages (ex.: `https://usuario.github.io/repositorio/`) em Site URL e Redirect URLs.
5. Cada push na `main` publica de novo (aba Actions).

## Conectar a Steam

1. Rode `supabase/002_conectar_steam.sql` no SQL Editor.
2. Crie uma chave em https://steamcommunity.com/dev/apikey (se pedir domínio, use o do seu site).
3. No Supabase, em Edge Functions, crie a função `sync-steam` com o conteúdo de `supabase/functions/sync-steam/index.ts` e, em Secrets, adicione `STEAM_API_KEY`.
4. No site, em Configurações > Contas conectadas, informe o link do perfil Steam (público).

## Camada social (feed, amigos, chat, grupos, reviews, troféus)

**Ordem no SQL Editor do Supabase:** `schema.sql`, `002_conectar_steam.sql`, `003_social.sql` e, para ter dados de teste, `seed.sql` e `seed_social.sql`. Depois publique de novo a função `sync-steam` (código atualizado, agora importa conquistas).

### Funciona de verdade (banco + regras no servidor)
- Amizades (enviar, aceitar, recusar, cancelar, remover), bloqueio, notificações com preferências, chat privado entre amigos com não lidas e tempo real (Supabase Realtime, com atualização periódica de reserva).
- Grupos públicos e privados: criar, entrar, pedir entrada, convidar, papéis (admin, moderador, membro), mural, chat, editar, remover membros, sair e encerrar.
- Feed (Para você, Amigos, Em alta), publicações com imagem, #hashtags e @menções, curtir, comentar, repostar, salvar, denunciar.
- Reviews (0,5 a 5 estrelas, spoiler oculto até revelar), página do jogo, busca de jogos com filtros.
- **Diário gamer:** conquistas, Platinas e reviews na mesma linha do tempo, com filtros e até 3 itens fixados.
- **Troféus do Saveslot:** Bronze acima de 40%, Prata de 15% a 40%, Ouro abaixo de 15% (faixas e pontos na tabela `app_config`). A Platina exige 100% das conquistas do jogo base e lista completa importada. Sem porcentagem da plataforma, usa a dos usuários do site (a partir de 5 donos do jogo); sem dados, vira Bronze marcado como "estimada". Todo troféu é identificado como classificação do site.
- Rankings global e entre amigos, tema escuro/claro, animação e som (gerado no navegador, com opção de silenciar) ao desbloquear.

### Dados simulados
- PlayStation, Xbox, Nintendo, Google Play Games, Epic e RetroAchievements usam um **adaptador de demonstração** (função `connect_demo_platform` no SQL), que cria jogos e conquistas fictícios marcados como simulados. Uma integração real exige as credenciais de cada plataforma e uma função no servidor por plataforma.
- Os perfis, jogos, grupos e posts de `seed.sql` e `seed_social.sql` são fictícios.

### Ainda não existe
- "Seguir" (a especificação marca como opcional), notificações de atividade geral de grupos, sincronização automática periódica (dá para agendar a função com pg_cron), tela para moderadores lerem denúncias (elas ficam na tabela `reports`), avatar de grupo, tela para editar `app_config`, verificação de dono da conta Steam (OpenID) e distinção de conquistas de DLC na Steam.
- Não há testes automatizados e o código não foi executado fora do ambiente de criação: revise o fluxo completo com duas contas reais.
