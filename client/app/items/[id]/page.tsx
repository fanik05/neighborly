'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLoans } from '@/lib/useLoans';
import { reverseGeocode } from '@/lib/geo';
import type { Item } from '@/lib/types';
import type { Conversation } from '@/lib/types';
import LoanStatusPanel from '@/components/LoanStatusPanel';
import dynamic from 'next/dynamic';

const LocationMap = dynamic(() => import('@/components/LocationMap'), { ssr: false });

const TYPE_LABEL: Record<Item['listingType'], string> = {
  sale: 'For sale',
  loan: 'To borrow',
  free: 'Free',
};

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { borrowing, lending } = useLoans();
  // A compact signal of this user's loan statuses for this item; changes when they act.
  const loanSignal = [...borrowing, ...lending]
    .filter((l) => l.item.id === id)
    .map((l) => l.status)
    .join(',');
  const [item, setItem] = useState<Item | null>(null);
  const [active, setActive] = useState(0);
  const [error, setError] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => {
    api<Item>(`/items/${id}`)
      .then(setItem)
      .catch((err) => setError(err instanceof Error ? err.message : 'Not found'));
  }, [id, loanSignal]);

  // Fallback: resolve a name client-side for items saved before addresses were stored.
  useEffect(() => {
    if (!item || item.address || !item.location?.coordinates) return;
    const [lng, lat] = item.location.coordinates;
    reverseGeocode(lng, lat)
      .then(setPlaceName)
      .catch(() => setPlaceName(''));
  }, [item]);

  useEffect(() => {
    if (!mapOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMapOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mapOpen]);

  async function messageOwner() {
    try {
      const conv = await api<Conversation>('/conversations', {
        method: 'POST',
        body: JSON.stringify({ itemId: id }),
      });
      router.push(`/messages/${conv.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start conversation');
    }
  }

  async function onDelete() {
    if (!confirm('Delete this listing?')) return;
    try {
      await api(`/items/${id}`, { method: 'DELETE' });
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete');
    }
  }

  if (error) return <p className="py-16 text-center text-muted">{error}</p>;
  if (!item) return <p className="py-16 text-center text-muted">Loading…</p>;

  const isOwner = user && item.owner?.id === user.id;
  const cover = item.images[active]?.url;

  return (
    <div className="grid gap-8 md:grid-cols-2">
      {/* Gallery */}
      <div>
        <div className="aspect-square overflow-hidden rounded-tag border border-line bg-card">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt={item.title} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-muted">No photo</div>
          )}
        </div>
        {item.images.length > 1 && (
          <div className="mt-3 flex gap-2">
            {item.images.map((img, i) => (
              <button
                key={img.publicId}
                onClick={() => setActive(i)}
                className={`h-16 w-16 overflow-hidden rounded-lg border ${
                  i === active ? 'border-pine' : 'border-line'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Details */}
      <div>
        <div className="flex items-center gap-2">
          <span className="tag-tab bg-pine/15 text-pine">{TYPE_LABEL[item.listingType]}</span>
          {item.status !== 'available' && (
            <span className="tag-tab bg-ink/10 text-ink capitalize">{item.status}</span>
          )}
        </div>

        <h1 className="mt-3 text-3xl font-bold">{item.title}</h1>
        {item.listingType === 'sale' && item.price > 0 && (
          <p className="mt-1 font-display text-2xl font-bold text-pine">${item.price}</p>
        )}

        <p className="mt-4 whitespace-pre-wrap text-ink/90">{item.description || 'No description.'}</p>

        <div className="mt-6 rounded-tag border border-line bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Shared by</p>
          <p className="font-semibold">{item.owner?.name}</p>
          {item.owner?.neighborhood && <p className="text-sm text-muted">{item.owner.neighborhood}</p>}
        </div>

        {item.location?.coordinates && (
          <div className="mt-4 rounded-tag border border-line bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted">📍 Location</p>
            <p className="mt-0.5 font-semibold">{item.address || placeName || 'Looking up area…'}</p>
            <button
              type="button"
              onClick={() => setMapOpen(true)}
              className="mt-2 block w-full overflow-hidden rounded-tag border border-line"
              aria-label="Open larger map"
            >
              <LocationMap coords={item.location.coordinates} className="h-40 w-full" />
            </button>
          </div>
        )}

        {mapOpen && item.location?.coordinates && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
            onClick={() => setMapOpen(false)}
          >
            <div
              className="w-full max-w-2xl overflow-hidden rounded-tag border border-line bg-card shadow-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-line px-4 py-2">
                <p className="font-semibold">{item.address || placeName || 'Location'}</p>
                <button type="button" onClick={() => setMapOpen(false)} aria-label="Close" className="text-muted hover:text-ink">
                  ✕
                </button>
              </div>
              <LocationMap coords={item.location.coordinates} className="h-[60vh] w-full" zoom={15} />
              <div className="border-t border-line px-4 py-2 text-right">
                <a
                  href={`https://www.openstreetmap.org/?mlat=${item.location.coordinates[1]}&mlon=${item.location.coordinates[0]}#map=16/${item.location.coordinates[1]}/${item.location.coordinates[0]}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-pine hover:text-pine-dark"
                >
                  View on OpenStreetMap ↗
                </a>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {isOwner ? (
            <>
              <span className="self-center text-sm text-muted">This is your listing.</span>
              <button onClick={onDelete} className="btn-ghost">
                Delete
              </button>
            </>
          ) : user ? (
            <button onClick={messageOwner} className="btn-primary">
              Message {item.owner?.name?.split(' ')[0]}
            </button>
          ) : (
            <Link href="/login" className="btn-primary">
              Sign in to message
            </Link>
          )}
        </div>

        {item.listingType === 'loan' && <LoanStatusPanel item={item} />}
      </div>
    </div>
  );
}
