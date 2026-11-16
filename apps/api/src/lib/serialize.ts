import type { Prisma } from "@prisma/client";

export const photographerInclude = {
  user: { select: { id: true, displayName: true, avatarUrl: true } },
  specialties: { include: { specialty: true } },
  media: { orderBy: { position: "asc" } },
} satisfies Prisma.PhotographerProfileInclude;

type PhotographerWithRelations = Prisma.PhotographerProfileGetPayload<{
  include: typeof photographerInclude;
}>;

/** Shapes a photographer profile into the stable JSON the app consumes. */
export function serializePhotographer(p: PhotographerWithRelations, opts?: { isFavorite?: boolean }) {
  return {
    id: p.id,
    userId: p.userId,
    name: p.user.displayName,
    avatarUrl: p.user.avatarUrl,
    campus: p.campus,
    headline: p.headline,
    bio: p.bio,
    responseTime: p.responseTime,
    pricing: {
      model: p.pricingModel,
      label: p.priceLabel,
      hourlyRate: p.hourlyRate,
      minimumHours: p.minimumHours,
      startingAt: p.startingAt,
      negotiable: p.negotiable,
      notes: p.pricingNotes,
    },
    instagram: p.instagram,
    portfolioUrl: p.portfolioUrl,
    location:
      p.latitude != null && p.longitude != null
        ? { latitude: p.latitude, longitude: p.longitude }
        : null,
    isVerified: p.isVerified,
    verificationStatus: p.verificationStatus,
    isPublished: p.isPublished,
    rating: { average: Number(p.ratingAvg.toFixed(2)), count: p.ratingCount },
    completedJobs: p.completedJobs,
    specialties: p.specialties.map((s) => s.specialty.name),
    media: p.media.map((m) => ({
      id: m.id,
      url: m.url,
      thumbnailUrl: m.thumbnailUrl,
      caption: m.caption,
      width: m.width,
      height: m.height,
    })),
    isFavorite: opts?.isFavorite ?? false,
    createdAt: p.createdAt,
  };
}
