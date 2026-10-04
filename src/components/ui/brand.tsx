import Link from 'next/link';
import { Castle } from 'lucide-react';

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link className={`brand ${small ? 'brand-small' : ''}`} href="/" aria-label="Tavern home">
      <span className="brand-mark">
        <Castle size={small ? 19 : 23} strokeWidth={1.8} />
      </span>
      <span>
        Tavern<span className="brand-period">.</span>
      </span>
    </Link>
  );
}
