import { Link, useNavigate, useParams } from 'react-router-dom';
import PostCard from '../components/PostCard';
import { Empty, ErrorBox, Loading } from '../components/ui';
import { useAuth } from '../lib/auth';
import { getPost, hydratePosts } from '../lib/social';
import { useAsync } from '../lib/useAsync';

export default function PostPage() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const res = useAsync(async () => {
    const p = await getPost(id);
    return p ? (await hydratePosts([p], profile?.id ?? null))[0] : null;
  }, [id, profile?.id]);

  if (res.loading) return <Loading />;
  if (res.error) return <ErrorBox message={res.error} onRetry={res.reload} />;
  if (!res.data) return <Empty title="Publicação não encontrada">Ela foi apagada ou você não tem acesso. <Link to="/feed">Voltar ao feed</Link></Empty>;
  return (
    <div className="narrow">
      <PostCard post={res.data} meId={profile?.id ?? null} expanded onChange={() => navigate('/feed')} />
    </div>
  );
}
