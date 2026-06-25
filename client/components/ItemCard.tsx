import Link from 'next/link';
import type { Item } from '@/lib/types';

const TYPE_LABEL: Record<Item['listingType'], string> = {
  sale: 'For sale',
  loan: 'For loan',
  free: 'Free',
};

export default function ItemCard({ item, distance }: { item: Item; distance?: string }) {
  const cover = item.images[0]?.url;
  const typeLabel = TYPE_LABEL[item.listingType];

  return (
    <Link
      href={`/items/${item.id}`}
      className="group relative block overflow-hidden rounded-tag border border-line bg-card shadow-card transition-transform hover:-translate-y-0.5"
    >
      {/* binder punch-hole — a real checkout card */}
      <span className="absolute left-3 top-3 z-10 h-2.5 w-2.5 rounded-full bg-paper ring-2 ring-line" />

      <div className="aspect-4/3 w-full overflow-hidden bg-paper">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center font-mono text-xs uppercase tracking-wider text-muted">
            No photo
          </div>
        )}
      </div>

      {/* checkout-card footer — catalog data, with a stamped distance */}
      <div className="space-y-2 border-t border-dashed border-line p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="tag-tab text-pine">{typeLabel}</span>
          {item.listingType === 'sale' && item.price > 0 && (
            <span className="font-mono text-sm font-medium text-ink">${item.price}</span>
          )}
        </div>
        <h3 className="line-clamp-1 font-display text-base font-bold leading-tight">{item.title}</h3>
        <div className="flex items-center justify-between gap-2">
          <span className="line-clamp-1 text-xs text-muted">
            {item.owner?.neighborhood || item.owner?.name}
          </span>
          {distance && <span className="stamp shrink-0 text-stamp">{distance}</span>}
        </div>
      </div>
    </Link>
  );
}
