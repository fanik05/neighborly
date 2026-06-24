'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getBrowserLocation, reverseGeocode } from '@/lib/geo';
import type { Item, ListingType } from '@/lib/types';
import ImageUploader from '@/components/ImageUploader';

const TYPES: { key: ListingType; label: string; hint: string }[] = [
  { key: 'loan', label: 'Lend', hint: 'Neighbors borrow & return it' },
  { key: 'sale', label: 'Sell', hint: 'Hand it off for a price' },
  { key: 'free', label: 'Give', hint: 'Free to a good home' },
];

export default function SellPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [listingType, setListingType] = useState<ListingType>('loan');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('tools');
  const [price, setPrice] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [address, setAddress] = useState('');
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  async function useMyLocation() {
    setError('');
    setLocating(true);
    try {
      const c = await getBrowserLocation();
      setCoords(c);
      // Resolve a friendly place name; coordinates still work if this fails.
      try {
        setAddress(await reverseGeocode(c[0], c[1]));
      } catch {
        setAddress('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Location unavailable');
    } finally {
      setLocating(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!coords) {
      setError('Add your location so neighbors can find this nearby.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('title', title);
      form.set('description', description);
      form.set('category', category);
      form.set('listingType', listingType);
      if (listingType === 'sale') form.set('price', price || '0');
      form.set('lng', String(coords[0]));
      form.set('lat', String(coords[1]));
      form.set('address', address);
      files.forEach((f) => form.append('images', f));

      const item = await api<Item>('/items', { method: 'POST', body: form });
      router.push(`/items/${item.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create listing');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) return <p className="py-16 text-center text-muted">Loading…</p>;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-3xl font-bold">List an item</h1>
      <p className="mt-1 text-muted">Share a tool or good with your street.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-5">
        {error && <p className="rounded-tag bg-marigold/15 px-3 py-2 text-sm text-marigold-dark">{error}</p>}

        <div className="grid grid-cols-3 gap-2">
          {TYPES.map((t) => (
            <button
              type="button"
              key={t.key}
              onClick={() => setListingType(t.key)}
              className={`rounded-tag border p-3 text-left transition-colors ${
                listingType === t.key ? 'border-pine bg-pine/5' : 'border-line bg-card hover:border-pine'
              }`}
            >
              <span className="block font-display font-bold">{t.label}</span>
              <span className="text-xs text-muted">{t.hint}</span>
            </button>
          ))}
        </div>

        <div>
          <label className="label">Title</label>
          <input
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Cordless drill, barely used"
            required
          />
        </div>

        <div>
          <label className="label">Description</label>
          <textarea
            className="field min-h-24"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Condition, pickup details, how long you can lend it…"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Category</label>
            <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="tools">Tools</option>
              <option value="outdoors">Outdoors & garden</option>
              <option value="kitchen">Kitchen</option>
              <option value="electronics">Electronics</option>
              <option value="kids">Kids</option>
              <option value="general">General</option>
            </select>
          </div>
          {listingType === 'sale' && (
            <div>
              <label className="label">Price ($)</label>
              <input
                className="field"
                type="number"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="40"
              />
            </div>
          )}
        </div>

        <div>
          <label className="label">Photos</label>
          <ImageUploader onChange={setFiles} />
        </div>

        <div>
          <label className="label">Location</label>
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="btn-ghost w-full"
          >
            {locating
              ? '📍 Getting your location…'
              : coords
                ? '📍 Location set — tap to update'
                : '📍 Use my current location'}
          </button>
          {coords && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-pine">
              <span>✓</span>
              <span>
                {address
                  ? `Pinned in ${address}`
                  : `Pinned at ${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`}
              </span>
            </p>
          )}
          {!coords && !locating && (
            <p className="mt-2 text-xs text-muted">
              Your browser will ask permission to share your location.
            </p>
          )}
        </div>

        <button className="btn-primary w-full" disabled={busy}>
          {busy ? 'Posting…' : 'Post listing'}
        </button>
      </form>
    </div>
  );
}
