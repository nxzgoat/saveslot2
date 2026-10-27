import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loading } from '../components/ui';
import { errMsg, normalizeUsername, usernameTaken, USERNAME_RE } from '../lib/api';
import { useAuth } from '../lib/auth';
import { siteUrl, supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="form">
      <div className="card">
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) return setError(err.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : err.message);
    toast('Login feito.');
    navigate('/');
  };

  return (
    <Shell title="Entrar">
      <form onSubmit={submit}>
        <label htmlFor="email">E-mail</label>
        <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <label htmlFor="pw">Senha</label>
        <input id="pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        {error && <p className="err" role="alert">{error}</p>}
        <p><button className="btn primary" disabled={busy}>{busy ? 'Entrando...' : 'Entrar'}</button></p>
        <p className="muted"><Link to="/recuperar-senha">Esqueci minha senha</Link> · <Link to="/cadastro">Criar perfil</Link></p>
      </form>
    </Shell>
  );
}

export function Signup() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const u = normalizeUsername(username);
    if (!USERNAME_RE.test(u)) return setError('Use de 3 a 20 caracteres: letras, números e _.');
    if (password.length < 8) return setError('A senha precisa ter pelo menos 8 caracteres.');
    setBusy(true);
    try {
      if (await usernameTaken(u)) throw new Error('Esse nome de usuário já está em uso.');
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { username: u }, emailRedirectTo: siteUrl },
      });
      if (err) throw new Error(err.message.includes('Database error') ? 'Nome de usuário indisponível.' : err.message);
      if (data.session) navigate('/configuracoes');
      else setSent(true);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Shell title="Confirme seu e-mail">
        <p>Enviamos um link para <strong>{email}</strong>. Abra-o para ativar a conta e depois <Link to="/entrar">entre</Link>.</p>
      </Shell>
    );
  }

  return (
    <Shell title="Criar perfil">
      <form onSubmit={submit}>
        <label htmlFor="user">Nome de usuário</label>
        <input id="user" required value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="ex.: nyx_player" />
        <label htmlFor="email">E-mail</label>
        <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <label htmlFor="pw">Senha (mínimo 8 caracteres)</label>
        <input id="pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        {error && <p className="err" role="alert">{error}</p>}
        <p><button className="btn primary" disabled={busy}>{busy ? 'Criando...' : 'Criar perfil'}</button></p>
        <p className="muted">Já tem conta? <Link to="/entrar">Entrar</Link></p>
      </form>
    </Shell>
  );
}

export function Forgot() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${siteUrl}redefinir-senha` });
    setBusy(false);
    if (err) setError(err.message);
    else setDone(true);
  };

  return (
    <Shell title="Recuperar senha">
      {done ? (
        <p>Se esse e-mail tiver uma conta, você vai receber um link para criar uma nova senha.</p>
      ) : (
        <form onSubmit={submit}>
          <label htmlFor="email">E-mail da conta</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <p className="err" role="alert">{error}</p>}
          <p><button className="btn primary" disabled={busy}>{busy ? 'Enviando...' : 'Enviar link'}</button></p>
        </form>
      )}
    </Shell>
  );
}

export function Reset() {
  const { session, loading } = useAuth();
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  if (loading) return <Loading />;
  if (!session) {
    return (
      <Shell title="Link inválido ou expirado">
        <p><Link to="/recuperar-senha">Peça um novo link</Link> para redefinir a senha.</p>
      </Shell>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return setError('A senha precisa ter pelo menos 8 caracteres.');
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (err) return setError(err.message);
    toast('Senha atualizada.');
    navigate('/');
  };

  return (
    <Shell title="Nova senha">
      <form onSubmit={submit}>
        <label htmlFor="pw">Nova senha</label>
        <input id="pw" type="password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        {error && <p className="err" role="alert">{error}</p>}
        <p><button className="btn primary" disabled={busy}>{busy ? 'Salvando...' : 'Salvar senha'}</button></p>
      </form>
    </Shell>
  );
}
