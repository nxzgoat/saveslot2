import { Link } from 'react-router-dom';
import { Empty } from '../components/ui';

export default function NotFound() {
  return (
    <>
      <Empty title="Página não encontrada">O endereço não existe ou foi movido.</Empty>
      <p style={{ textAlign: 'center' }}><Link className="btn" to="/">Voltar ao início</Link></p>
    </>
  );
}
