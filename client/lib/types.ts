// Client re-exports the shared API contract under the names the UI already uses.
// Single source of truth lives in @neighborly/shared so client/server can't drift.
export type { ListingType, ItemStatus, GeoPoint, ItemImage } from '@neighborly/shared';
export type { ItemDTO as Item, UserDTO as User, ItemOwner } from '@neighborly/shared';
