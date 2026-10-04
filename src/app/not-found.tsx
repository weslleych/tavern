import Link from 'next/link';
import { Brand } from '../components/ui/brand';
export default function NotFound() {
  return (
    <main className="error-page">
      <Brand />
      <h1>A path less traveled.</h1>
      <p>This page doesn’t exist. Your adventure starts at the tavern.</p>
      <Link className="button primary" href="/">
        Back to the tavern
      </Link>
    </main>
  );
}
