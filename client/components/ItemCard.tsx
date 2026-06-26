import Link from 'next/link';
import type { Item } from '@/lib/types';

const TYPE_LABEL: Record<Item['listingType'], string> = {
  sale: 'For sale',
  loan: 'For loan',
  free: 'Free',
};
const TYPE_COLOR: Record<Item['listingType'], string> = {
  sale: 'text-marigold-dark',
  loan: 'text-pine',
  free: 'text-leaf',
};

export default function ItemCard({ item, distance }: { item: Item; distance?: string }) {
  const cover = item.images[0]?.url;

  return (
    <Link
      href={`/items/${item.id}`}
      className="lift group block overflow-hidden rounded-tag border border-line bg-card shadow-card"
    >
      <div className="relative aspect-4/3 w-full overflow-hidden bg-paper">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
          />
        ) : (
          <div className="grid h-full place-items-center font-mono text-xs uppercase tracking-wider text-muted">
            No photo
          </div>
        )}
        {/* distance as a map-label pill, pinned to the image */}
        {distance && (
          <span className="stamp absolute left-2 top-2 border-transparent bg-card/90 text-pine backdrop-blur">
            📍 {distance}
          </span>
        )}
      </div>

      <div className="space-y-1.5 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className={`tag-tab ${TYPE_COLOR[item.listingType]}`}>{TYPE_LABEL[item.listingType]}</span>
          {item.listingType === 'sale' && item.price > 0 && (
            <span className="font-mono text-sm font-bold text-ink">${item.price}</span>
          )}
        </div>
        <h3 className="line-clamp-1 font-display text-base font-semibold leading-tight">{item.title}</h3>
        <p className="line-clamp-1 text-xs text-muted">
          {item.owner?.neighborhood || item.owner?.name}
        </p>
      </div>
    </Link>
  );
}
