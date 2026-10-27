import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { errMsg, uploadMedia } from '../lib/api';
import { useAuth } from '../lib/auth';
import { createPost } from '../lib/social';
import { useToast } from '../lib/toast';

export default function Composer({ groupId = null, onPosted }: { groupId?: string | null; onPosted: () => void }) {
  const { profile, session } = useAuth();
  const toast = useToast();
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  if (!profile || !session) {
    return <div className="card"><p className="muted"><Link to="/entrar">Entre</Link> ou <Link to="/cadastro">crie um perfil</Link> para publicar.</p></div>;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() && !file) return;
    setBusy(true);
    try {
      const image = file ? await uploadMedia(session.user.id, 'post', file) : null;
      await createPost({ author_id: profile.id, body: text.trim() || null, image_url: image, group_id: groupId });
      setText('');
      setFile(null);
      toast('Publicado.');
      onPosted();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit} style={{ marginBottom: 16 }}>
      <label htmlFor="composer" style={{ marginTop: 0 }}>O que você está jogando? Use #hashtags e @menções.</label>
      <textarea id="composer" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
      <div className="actions" style={{ marginTop: 8, alignItems: 'center' }}>
        <label className="btn" style={{ margin: 0, cursor: 'pointer' }}>
          {file ? `Imagem: ${file.name.slice(0, 20)}` : 'Adicionar imagem'}
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button className="btn primary" disabled={busy || (!text.trim() && !file)}>{busy ? 'Publicando...' : 'Publicar'}</button>
      </div>
    </form>
  );
}
