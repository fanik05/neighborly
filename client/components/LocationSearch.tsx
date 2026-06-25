'use client';

import { useState } from 'react';
import { searchPlaces, type PlaceResult } from '@/lib/geo';

type Status = 'idle' | 'searching' | 'results' | 'empty' | 'error';

/**
 * Type-and-submit place search. Turns a typed query into a single picked place,
 * reported via onSelect. Owns only its own input/results/status state.
 */
export default function LocationSearch({
  onSelect,
  placeholder = 'Search an address or place',
}: {
  onSelect: (place: PlaceResult) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [status, setStatus] = useState<Status>('idle');

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setStatus('searching');
    try {
      const places = await searchPlaces(q);
      setResults(places);
      setStatus(places.length ? 'results' : 'empty');
    } catch {
      setResults([]);
      setStatus('error');
    }
  }

  function pick(place: PlaceResult) {
    onSelect(place);
    setResults([]);
    setStatus('idle');
    setQuery(place.label);
  }

  return (
    <div>
      <form onSubmit={onSearch} className="flex gap-2">
        <input
          className="field"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label="Search for a place"
        />
        <button type="submit" className="btn-ghost shrink-0" disabled={status === 'searching'}>
          {status === 'searching' ? 'Searching…' : 'Search'}
        </button>
      </form>

      {status === 'results' && (
        <ul className="mt-2 overflow-hidden rounded-tag border border-line bg-card">
          {results.map((place, i) => (
            <li key={`${place.label}-${i}`}>
              <button
                type="button"
                onClick={() => pick(place)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-paper"
              >
                📍 {place.label || 'Unnamed place'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {status === 'empty' && <p className="mt-2 text-xs text-muted">No places found.</p>}
      {status === 'error' && (
        <p className="mt-2 text-xs text-marigold-dark">Couldn't search, try again.</p>
      )}
    </div>
  );
}
