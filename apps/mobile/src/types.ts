export type Role = "STUDENT" | "PHOTOGRAPHER" | "ADMIN";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  displayName: string;
  avatarUrl: string | null;
  emailVerified?: boolean;
  photographerProfileId?: string | null;
  profilePublished?: boolean | null;
}

export interface PortfolioImage {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  caption: string;
  width: number | null;
  height: number | null;
}

export interface Photographer {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  campus: string;
  headline: string;
  bio: string;
  responseTime: string;
  pricing: {
    model: "HOURLY" | "PACKAGE" | "CUSTOM";
    label: string;
    hourlyRate: number | null;
    minimumHours: number | null;
    startingAt: number | null;
    negotiable: boolean;
    notes: string;
  };
  instagram: string | null;
  portfolioUrl: string | null;
  location: { latitude: number; longitude: number } | null;
  isVerified: boolean;
  verificationStatus: "NONE" | "PENDING" | "VERIFIED" | "REJECTED";
  isPublished: boolean;
  rating: { average: number; count: number };
  completedJobs: number;
  specialties: string[];
  media: PortfolioImage[];
  isFavorite: boolean;
  distanceKm?: number | null;
  createdAt: string;
}

export interface Review {
  id: string;
  rating: number;
  body: string;
  author: string;
  authorAvatar: string | null;
  createdAt: string;
}

export type PhotographerDetail = Photographer & { reviews: Review[] };

export type BookingStatus =
  | "REQUESTED"
  | "ACCEPTED"
  | "DECLINED"
  | "COMPLETED"
  | "CANCELLED";

export interface Booking {
  id: string;
  status: BookingStatus;
  eventType: string;
  eventDate: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  durationHours: number | null;
  message: string;
  quotedPrice: number | null;
  createdAt: string;
  role: "client" | "photographer";
  client?: { name: string; avatarUrl: string | null };
  photographer?: { id: string; name: string; avatarUrl: string | null };
  threadId?: string | null;
  reviewed?: boolean;
}

export interface ThreadSummary {
  id: string;
  photographerId: string;
  other: { name: string; avatarUrl: string | null };
  lastMessage: { body: string; createdAt: string } | null;
  unread: number;
  lastMessageAt: string;
}

export interface ChatMessage {
  id: string;
  body: string;
  senderId: string;
  mine: boolean;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}
