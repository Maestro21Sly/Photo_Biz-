import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "./api";
import type {
  AppNotification,
  Booking,
  ChatMessage,
  Photographer,
  PhotographerDetail,
  ThreadSummary,
} from "../types";

interface FeedPage {
  items: Photographer[];
  nextCursor: string | null;
}

interface Page {
  items: Photographer[];
  nextCursor: string | null;
}

export interface FeedFilters {
  q?: string;
  specialty?: string;
  sort?: "top" | "new" | "price" | "near";
  lat?: number;
  lng?: number;
  radiusKm?: number;
  maxPrice?: number;
  minRating?: number;
}

export function usePhotographers(filters: FeedFilters) {
  return useInfiniteQuery({
    queryKey: ["photographers", filters],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (filters.q) params.set("q", filters.q);
      if (filters.specialty && filters.specialty !== "All") params.set("specialty", filters.specialty);
      if (filters.sort) params.set("sort", filters.sort);
      if (filters.lat != null && filters.lng != null) {
        params.set("lat", String(filters.lat));
        params.set("lng", String(filters.lng));
      }
      if (filters.radiusKm != null) params.set("radiusKm", String(filters.radiusKm));
      if (filters.maxPrice != null) params.set("maxPrice", String(filters.maxPrice));
      if (filters.minRating != null) params.set("minRating", String(filters.minRating));
      if (pageParam) params.set("cursor", pageParam);
      return api<Page>(`/photographers?${params.toString()}`, { auth: true });
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useSpecialties() {
  return useQuery({
    queryKey: ["specialties"],
    queryFn: () => api<{ items: string[] }>("/photographers/specialties", { auth: false }),
    staleTime: 1000 * 60 * 10,
  });
}

export function usePhotographer(id: string) {
  return useQuery({
    queryKey: ["photographer", id],
    queryFn: () => api<PhotographerDetail>(`/photographers/${id}`),
    enabled: Boolean(id),
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, next }: { id: string; next: boolean }) =>
      api(`/favorites/${id}`, { method: next ? "PUT" : "DELETE" }),
    // Optimistic: the heart flips instantly in every cached feed, on the
    // detail screen, AND in the Saved tab. Waiting on a round-trip to redraw a
    // heart is the single most noticeable bit of lag in an app like this.
    onMutate: async ({ id, next }) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: ["photographers"] }),
        qc.cancelQueries({ queryKey: ["favorites"] }),
      ]);
      const snapshots = [
        ...qc.getQueriesData({ queryKey: ["photographers"] }),
        ...qc.getQueriesData({ queryKey: ["photographer", id] }),
        ...qc.getQueriesData({ queryKey: ["favorites"] }),
      ];

      qc.setQueriesData<{ pages: FeedPage[]; pageParams: unknown[] }>(
        { queryKey: ["photographers"] },
        (data) =>
          data
            ? {
                ...data,
                pages: data.pages.map((p) => ({
                  ...p,
                  items: p.items.map((it) => (it.id === id ? { ...it, isFavorite: next } : it)),
                })),
              }
            : data
      );
      qc.setQueryData<PhotographerDetail>(["photographer", id], (d) =>
        d ? { ...d, isFavorite: next } : d
      );

      // Un-saving from the Saved tab should drop the row immediately. Re-saving
      // can't synthesise the full record, so that case waits for the refetch.
      qc.setQueryData<{ items: Photographer[] }>(["favorites"], (d) => {
        if (!d) return d;
        if (!next) return { items: d.items.filter((p) => p.id !== id) };
        return { items: d.items.map((p) => (p.id === id ? { ...p, isFavorite: true } : p)) };
      });

      return { snapshots };
    },
    onError: (_e, _vars, ctx) => {
      ctx?.snapshots?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["photographers"] });
      qc.invalidateQueries({ queryKey: ["favorites"] });
    },
  });
}

export function useFavorites() {
  return useQuery({
    queryKey: ["favorites"],
    queryFn: () => api<{ items: Photographer[] }>("/favorites"),
  });
}

export function useBookings() {
  return useQuery({
    queryKey: ["bookings"],
    queryFn: () => api<{ items: Booking[] }>("/bookings"),
  });
}

export function useThreads() {
  return useQuery({
    queryKey: ["threads"],
    queryFn: () => api<{ items: ThreadSummary[] }>("/threads"),
  });
}

/** Total unread messages across every conversation — drives the Messages tab badge. */
export function useThreadUnreadCount(): number {
  const { data } = useThreads();
  return data?.items.reduce((sum, t) => sum + t.unread, 0) ?? 0;
}

export function useMessages(threadId: string) {
  return useQuery({
    queryKey: ["messages", threadId],
    queryFn: () => api<{ items: ChatMessage[] }>(`/threads/${threadId}/messages`),
    enabled: Boolean(threadId),
  });
}

export function useBooking(id: string) {
  return useQuery({
    queryKey: ["booking", id],
    queryFn: () => api<Booking>(`/bookings/${id}`),
    enabled: Boolean(id),
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ items: AppNotification[]; unread: number }>("/notifications"),
    refetchInterval: 30000,
  });
}

export function useUnreadCount() {
  const { data } = useNotifications();
  return data?.unread ?? 0;
}

export function useCreateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { photographerId: string; bookingId: string; rating: number; body?: string }) =>
      api("/reviews", { method: "POST", body: input }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["photographer", vars.photographerId] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["booking"] });
    },
  });
}

export function useReport() {
  return useMutation({
    mutationFn: (input: { targetUserId: string; reason: string; note?: string; threadId?: string }) =>
      api("/reports", { method: "POST", body: input }),
  });
}

export function useBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, next }: { userId: string; next: boolean }) =>
      api(`/blocks/${userId}`, { method: next ? "PUT" : "DELETE" }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["photographers"] });
      qc.invalidateQueries({ queryKey: ["blocks"] });
    },
  });
}
