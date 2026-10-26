import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { Loading } from './components/ui';
import { useAuth } from './lib/auth';
import { Forgot, Login, Reset, Signup } from './pages/AuthPages';
import Feed from './pages/Feed';
import Friends from './pages/Friends';
import GamePage from './pages/GamePage';
import GamesPage from './pages/GamesPage';
import GroupPage from './pages/GroupPage';
import Groups from './pages/Groups';
import Home from './pages/Home';
import Messages from './pages/Messages';
import Notifications from './pages/Notifications';
import PostPage from './pages/PostPage';
import Ranking from './pages/Ranking';
import NotFound from './pages/NotFound';
import ProfilePage from './pages/ProfilePage';
import SearchPage from './pages/SearchPage';
import Settings from './pages/Settings';
import type { ReactNode } from 'react';

function Protected({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <Loading />;
  return session ? <>{children}</> : <Navigate to="/entrar" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="buscar" element={<SearchPage />} />
        <Route path="feed" element={<Feed />} />
        <Route path="post/:id" element={<PostPage />} />
        <Route path="jogos" element={<GamesPage />} />
        <Route path="jogo/:id" element={<GamePage />} />
        <Route path="grupos" element={<Groups />} />
        <Route path="grupo/:id" element={<GroupPage />} />
        <Route path="ranking" element={<Ranking />} />
        <Route path="amigos" element={<Protected><Friends /></Protected>} />
        <Route path="mensagens" element={<Protected><Messages /></Protected>} />
        <Route path="mensagens/:username" element={<Protected><Messages /></Protected>} />
        <Route path="notificacoes" element={<Protected><Notifications /></Protected>} />
        <Route path="u/:username" element={<ProfilePage />} />
        <Route path="entrar" element={<Login />} />
        <Route path="cadastro" element={<Signup />} />
        <Route path="recuperar-senha" element={<Forgot />} />
        <Route path="redefinir-senha" element={<Reset />} />
        <Route path="configuracoes" element={<Protected><Settings /></Protected>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
