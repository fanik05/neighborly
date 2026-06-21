import Link from 'next/link';
import type { Item } from '@/lib/types';

const TYPE_STYLES: Record<Item['listingType'], { label: string; cls: string }> = {
  sale: { label: 'For sale', cls: 'bg-marigold/20 text-marigold-dark' },
  loan: { label: 'To borrow', cls: 'bg-pine/15 text-pine' },
  free: { label: 'Free', cls: 'bg-ink/10 text-ink' },
};

export default function ItemCard({ item, distance }: { item: Item; distance?: string }) {
  const type = TYPE_STYLES[item.listingType];
  const cover = item.images[0]?.url;

  return (
    <Link
      href={`/items/${item.id}`}
      className="group relative block overflow-hidden rounded-tag border border-line bg-white shadow-card transition-transform hover:-translate-y-0.5"
    >
      {/* punched-hole detail, like a real tag */}
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
          <div className="grid h-full place-items-center text-muted">No photo</div>
        )}
      </div>

      <div className="space-y-1.5 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className={`tag-tab ${type.cls}`}>{type.label}</span>
          {item.listingType === 'sale' && item.price > 0 && (
            <span className="font-display text-lg font-bold">${item.price}</span>
          )}
        </div>
        <h3 className="line-clamp-1 text-base font-semibold">{item.title}</h3>
        <div className="flex items-center justify-between text-xs text-muted">
          <span className="line-clamp-1">{item.owner?.neighborhood || item.owner?.name}</span>
          {distance && <span className="shrink-0">📍 {distance}</span>}
        </div>
      </div>
    </Link>
  );
}
