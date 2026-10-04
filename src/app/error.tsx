'use client';
import Link from 'next/link';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>The trail hit a snag.</h1>
      <p>Try loading the table again. Your saved map is still on the server.</p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
      <Link href="/">Back to the tavern</Link>
    </main>
  );
}
