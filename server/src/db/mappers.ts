import type { UserDTO, ItemDTO, ItemOwner, GeoPoint, MessageDTO, LoanRequestDTO, LoanItemRef } from '@neighborly/shared';
import type { users, items, messages, loanRequests } from './schema.js';

type Point = { x: number; y: number };

/** PostGIS {x: lng, y: lat} → GeoJSON-style GeoPoint the client expects. */
export function toGeoPoint(loc: Point | null): GeoPoint | undefined {
  if (!loc) return undefined;
  return { type: 'Point', coordinates: [loc.x, loc.y] };
}

/** Public user shape — never includes passwordHash. */
export function toUserDTO(u: typeof users.$inferSelect): UserDTO {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatarUrl: u.avatarUrl,
    neighborhood: u.neighborhood,
    location: toGeoPoint(u.location),
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

export function toItemDTO(item: typeof items.$inferSelect, owner: ItemOwner): ItemDTO {
  return {
    id: item.id,
    owner,
    title: item.title,
    description: item.description,
    category: item.category,
    listingType: item.listingType,
    price: item.price,
    images: item.images,
    location: { type: 'Point', coordinates: [item.location.x, item.location.y] },
    address: item.address,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function toMessageDTO(m: typeof messages.$inferSelect): MessageDTO {
  return {
    id: m.id,
    conversation: m.conversationId,
    sender: m.senderId,
    text: m.text,
    read: m.read,
    createdAt: m.createdAt.toISOString(),
  };
}

type LoanItemRow = { id: string; title: string; images: { url: string }[]; listingType: LoanItemRef['listingType'] };

export function toLoanRequestDTO(
  loan: typeof loanRequests.$inferSelect,
  item: LoanItemRow,
  borrower: ItemOwner,
  lender: ItemOwner
): LoanRequestDTO {
  return {
    id: loan.id,
    item: { id: item.id, title: item.title, cover: item.images?.[0]?.url, listingType: item.listingType },
    borrower,
    lender,
    status: loan.status,
    startDate: loan.startDate?.toISOString(),
    dueDate: loan.dueDate?.toISOString(),
    createdAt: loan.createdAt.toISOString(),
  };
}
