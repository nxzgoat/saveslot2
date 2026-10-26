import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { myConversations, unreadNotifications } from '../lib/social';
import { configured } from '../lib/supabase';
import { applyTheme, getTheme, type Theme } from '../lib/theme';
import { Avatar } from './ui';

export default function Layout() {
  const { profile, session, signOut } = useAuth();
  const [q, setQ] = useState('');
  const [theme, setTheme] = useState<Theme>(getTheme());
  const [badges, setBadges] = useState({ messages: 0, notifications: 0 });
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!profile) {
      setBadges({ messages: 0, notifications: 0 });
      return;
    }
    let alive = true;
    const load = () =>
      Promise.all([myConversations(), unreadNotifications(profile.id)])
        .then(([c, n]) => alive && setBadges({ messages: c.reduce((s, x) => s + Number(x.unread), 0), notifications: n }))
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [profile?.id, location.pathname]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/buscar?q=${encodeURIComponent(q.trim())}`);
  };
  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  return (
    <>
      <a href="#conteudo" className="skip">Pular para o conteúdo</a>
      <header className="top">
        <Link to="/" className="logo">Saveslot</Link>
        <form onSubmit={onSearch} role="search" className="top-search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" aria-label="Buscar" />
        </form>
        <nav aria-label="Principal">
          <NavLink to="/feed">Feed</NavLink>
          <NavLink to="/jogos">Jogos</NavLink>
          <NavLink to="/grupos">Grupos</NavLink>
          <NavLink to="/ranking">Ranking</NavLink>
          {session && profile ? (
            <>
              <NavLink to="/mensagens">Mensagens{badges.messages > 0 && <span className="count">{badges.messages}</span>}</NavLink>
              <NavLink to="/notificacoes">Avisos{badges.notifications > 0 && <span className="count">{badges.notifications}</span>}</NavLink>
              <NavLink to="/amigos">Amigos</NavLink>
              <NavLink to={`/u/${profile.username}`} className="me">
                <Avatar name={profile.display_name || profile.username} url={profile.avatar_url} size={26} /> Perfil
              </NavLink>
              <NavLink to="/configuracoes">Configurações</NavLink>
              <button className="link" onClick={() => void signOut()}>Sair</button>
            </>
          ) : (
            <>
              <NavLink to="/entrar">Entrar</NavLink>
              <Link to="/cadastro" className="btn primary">Criar perfil</Link>
            </>
          )}
          <button className="link" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}>{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</button>
        </nav>
      </header>
      {!configured && (
        <div className="notice">
          Supabase não configurado. Copie <code>.env.example</code> para <code>.env</code> e preencha as variáveis (veja o README).
        </div>
      )}
      <main className="page" id="conteudo">
        <Outlet />
      </main>
      <footer className="foot muted">Saveslot é um projeto independente. Os troféus são do Saveslot e não são troféus oficiais das plataformas.</footer>
    </>
  );
}
