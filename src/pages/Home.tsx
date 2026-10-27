import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Empty, ErrorBox, Loading, ProfileCard } from '../components/ui';
import { recentProfiles } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsync } from '../lib/useAsync';

export default function Home() {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const { session, profile } = useAuth();
  const recent = useAsync(recentProfiles, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/buscar?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <>
      <section className="hero">
        <h1>Todo o seu histórico de jogos em um perfil só.</h1>
        <p>Monte sua biblioteca, registre horas e conquistas, e mostre o que você joga para outros jogadores.</p>
        <form onSubmit={submit} role="search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite um nome de usuário" aria-label="Buscar jogador" />
          <button className="btn primary" type="submit">Buscar jogador</button>
        </form>
        <div className="actions">
          {session && profile ? (
            <>
              <Link className="btn" to={`/u/${profile.username}`}>Ver meu perfil</Link>
              <Link className="btn" to="/configuracoes">Editar perfil e jogos</Link>
            </>
          ) : (
            <>
              <Link className="btn primary" to="/cadastro">Criar meu perfil</Link>
              <Link className="btn" to="/entrar">Entrar</Link>
            </>
          )}
          <Link className="btn" to="/feed">Ver o feed</Link>
          <Link className="btn" to="/buscar">Explorar jogadores</Link>
        </div>
      </section>

      <section>
        <h2>Perfis recentes</h2>
        {recent.loading && <Loading />}
        {recent.error && <ErrorBox message={recent.error} onRetry={recent.reload} />}
        {recent.data && recent.data.length === 0 && (
          <Empty title="Nenhum perfil público ainda">Seja o primeiro: crie seu perfil ou rode o seed de demonstração.</Empty>
        )}
        {recent.data && recent.data.length > 0 && (
          <div className="grid">{recent.data.map((p) => <ProfileCard key={p.id} p={p} />)}</div>
        )}
      </section>
    </>
  );
}
