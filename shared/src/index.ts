/**
 * @neighborly/shared — the API contract shared by client and server.
 *
 * These describe JSON-serialized shapes crossing the wire (dates are ISO strings).
 * Types only: nothing here emits runtime code, so both sides use `import type`
 * and neither needs to build this package.
 */

export type ListingType = 'sale' | 'loan' | 'free';
export type ItemStatus = 'available' | 'borrowed' | 'sold';
export type LoanStatus = 'pending' | 'approved' | 'declined' | 'active' | 'returned';

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

/** Compact item reference shown on a conversation row. */
export interface ConversationItemRef {
  id: string;
  title: string;
  cover?: string;
}

export interface ConversationDTO {
  id: string;
  /** The other participant (never the caller). */
  otherParticipant: ItemOwner;
  /** The listing this thread is about; absent if the item was deleted. */
  item?: ConversationItemRef;
  lastMessage: string;
  /** Messages addressed to the caller that they haven't read yet. */
  unreadCount: number;
  updatedAt: string;
}

/* ---- Socket.io payloads (shared by client and server) ---- */
/** client → server */
export interface MessageSend {
  conversationId: string;
  text: string;
}
export interface TypingClient {
  conversationId: string;
  isTyping: boolean;
}
export interface ReadClient {
  conversationId: string;
}
/** server → client */
export interface MessageNew {
  message: MessageDTO;
}
export interface InboxMessageEvent {
  conversationId: string;
  message: MessageDTO;
}
export interface TypingEvent {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}
export interface ReadEvent {
  conversationId: string;
  readerId: string;
}
export interface PresenceEvent {
  userId: string;
  online: boolean;
}

export interface LoanItemRef {
  id: string;
  title: string;
  cover?: string;
  listingType: ListingType;
}

export interface LoanRequestDTO {
  id: string;
  item: LoanItemRef;
  borrower: ItemOwner;
  lender: ItemOwner;
  status: LoanStatus;
  startDate?: string;
  dueDate?: string;
  createdAt: string;
}

export interface CreateLoanPayload {
  itemId: string;
  startDate: string;
  dueDate: string;
}

export interface LoanAction {
  action: 'approve' | 'decline' | 'pickup' | 'return';
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
