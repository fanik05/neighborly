/**
 * @neighborly/shared — the API contract shared by client and server.
 *
 * These describe JSON-serialized shapes crossing the wire (dates are ISO strings).
 * Types only: nothing here emits runtime code, so both sides use `import type`
 * and neither needs to build this package.
 */

export type ListingType = 'sale' | 'loan' | 'free';
export type ItemStatus = 'available' | 'borrowed' | 'sold';
export type LoanStatus = 'pending' | 'approved' | 'declined' | 'returned';

/** GeoJSON point — coordinates are ALWAYS [longitude, latitude]. */
export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface ItemImage {
  url: string;
  publicId: string;
}

/** Public user shape (never includes passwordHash). */
export interface UserDTO {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  neighborhood?: string;
  location?: GeoPoint;
  createdAt?: string;
  updatedAt?: string;
}

/** Owner as embedded on an item (populated subset). */
export type ItemOwner = Pick<UserDTO, 'id' | 'name' | 'avatarUrl' | 'neighborhood'>;

export interface ItemDTO {
  id: string;
  owner: ItemOwner;
  title: string;
  description: string;
  category: string;
  listingType: ListingType;
  price: number;
  images: ItemImage[];
  location: GeoPoint;
  /** Human-readable place name (reverse-geocoded), e.g. "Williamsburg, Brooklyn". */
  address: string;
  status: ItemStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MessageDTO {
  id: string;
  conversation: string;
  sender: string;
  text: string;
  read: boolean;
  createdAt: string;
}

export interface ConversationDTO {
  id: string;
  participants: ItemOwner[];
  item?: string;
  lastMessage: string;
  updatedAt: string;
}

export interface LoanRequestDTO {
  id: string;
  item: string;
  borrower: string;
  lender: string;
  status: LoanStatus;
  startDate?: string;
  dueDate?: string;
  createdAt: string;
}

/* ---- Auth payloads ---- */
export interface AuthResponse {
  user: UserDTO;
  token: string;
}
export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}
export interface LoginPayload {
  email: string;
  password: string;
}

/** Standard error envelope returned by the API on failure. */
export interface ApiError {
  error: string;
}
