import { PrismaClient, PricingModel } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "password12345";

// Stable, varied placeholder imagery so the feed looks real in dev.
const img = (seed: string) => `https://picsum.photos/seed/${seed}/900/1100`;

interface SeedPhotographer {
  email: string;
  name: string;
  campus: string;
  headline: string;
  bio: string;
  responseTime: string;
  pricingModel: PricingModel;
  priceLabel: string;
  hourlyRate?: number;
  minimumHours?: number;
  startingAt?: number;
  negotiable: boolean;
  pricingNotes: string;
  instagram?: string;
  isVerified: boolean;
  ratingAvg: number;
  ratingCount: number;
  completedJobs: number;
  specialties: string[];
  gallery: string[];
  lat: number;
  lng: number;
}

const PHOTOGRAPHERS: SeedPhotographer[] = [
  {
    email: "maya@snapcampus.app",
    name: "Maya Benson",
    campus: "North Campus",
    headline: "Warm, bright graduation & portrait photography",
    bio: "Portrait photographer known for graduation shoots with quick turnaround and easy posing guidance. I make people who hate photos love their photos.",
    responseTime: "Usually replies within 2 hours",
    pricingModel: PricingModel.HOURLY,
    priceLabel: "$140/hr",
    hourlyRate: 140,
    minimumHours: 1,
    negotiable: true,
    pricingNotes: "Open to custom graduation packages depending on group size and location.",
    instagram: "https://instagram.com/maya.frames",
    isVerified: true,
    ratingAvg: 4.9,
    ratingCount: 38,
    completedJobs: 52,
    specialties: ["Graduation", "Portraits", "Couples"],
    gallery: ["maya1", "maya2", "maya3", "maya4", "maya5", "maya6"],
    lat: 36.0048,
    lng: -78.942,
  },
  {
    email: "cam@snapcampus.app",
    name: "Cam Ortiz",
    campus: "South Quad",
    headline: "Documentary-style event & club coverage",
    bio: "Fast-moving campus event photographer with a documentary style that works well for club launches, showcases, and speaker nights.",
    responseTime: "Usually replies same day",
    pricingModel: PricingModel.PACKAGE,
    priceLabel: "Starting at $110",
    startingAt: 110,
    negotiable: false,
    pricingNotes: "Most event coverage is quoted after hearing the event length and expected crowd size.",
    instagram: "https://instagram.com/camshoots",
    isVerified: true,
    ratingAvg: 4.7,
    ratingCount: 24,
    completedJobs: 31,
    specialties: ["Events", "Student Orgs", "Headshots"],
    gallery: ["cam1", "cam2", "cam3", "cam4", "cam5"],
    lat: 35.9975,
    lng: -78.941,
  },
  {
    email: "ade@snapcampus.app",
    name: "Adeola Bright",
    campus: "West Village",
    headline: "Editorial fashion & creative portraits",
    bio: "Editorial and creative portrait photographer. I love bold color, movement, and building a concept with you before the shoot.",
    responseTime: "Usually replies within a day",
    pricingModel: PricingModel.PACKAGE,
    priceLabel: "Starting at $200",
    startingAt: 200,
    negotiable: true,
    pricingNotes: "Packages include a styling call and 15 edited photos. Add-ons available.",
    instagram: "https://instagram.com/adebright",
    isVerified: false,
    ratingAvg: 4.8,
    ratingCount: 17,
    completedJobs: 19,
    specialties: ["Fashion", "Portraits", "Creative"],
    gallery: ["ade1", "ade2", "ade3", "ade4", "ade5", "ade6"],
    lat: 36.003,
    lng: -78.946,
  },
  {
    email: "jin@snapcampus.app",
    name: "Jin Park",
    campus: "East Campus",
    headline: "Clean professional headshots, fast",
    bio: "LinkedIn-ready headshots with consistent lighting and same-week delivery. Great for recruiting season and student orgs.",
    responseTime: "Usually replies within 4 hours",
    pricingModel: PricingModel.HOURLY,
    priceLabel: "$90/hr, negotiable",
    hourlyRate: 90,
    minimumHours: 1,
    negotiable: true,
    pricingNotes: "Group rates for clubs and teams. Retouching included.",
    instagram: "https://instagram.com/jinp.shots",
    isVerified: true,
    ratingAvg: 4.6,
    ratingCount: 41,
    completedJobs: 60,
    specialties: ["Headshots", "Professional", "Student Orgs"],
    gallery: ["jin1", "jin2", "jin3", "jin4"],
    lat: 36.006,
    lng: -78.912,
  },
  {
    email: "noor@snapcampus.app",
    name: "Noor Haddad",
    campus: "North Campus",
    headline: "Candid couples & engagement sessions",
    bio: "Romantic, candid couples photography around campus landmarks and golden-hour spots. Relaxed direction, real moments.",
    responseTime: "Usually replies same day",
    pricingModel: PricingModel.CUSTOM,
    priceLabel: "Custom quote",
    negotiable: true,
    pricingNotes: "Every session is tailored — tell me your vibe and location ideas.",
    instagram: "https://instagram.com/noorhaddadphoto",
    isVerified: false,
    ratingAvg: 5.0,
    ratingCount: 9,
    completedJobs: 11,
    specialties: ["Couples", "Engagement", "Portraits"],
    gallery: ["noor1", "noor2", "noor3", "noor4", "noor5"],
    lat: 36.005,
    lng: -78.94,
  },
  {
    email: "theo@snapcampus.app",
    name: "Theo Marsh",
    campus: "South Quad",
    headline: "Sports & action photography",
    bio: "Intramural games, club sports, and dance showcases. I freeze the moment that everyone remembers.",
    responseTime: "Usually replies within a day",
    pricingModel: PricingModel.PACKAGE,
    priceLabel: "Starting at $150",
    startingAt: 150,
    negotiable: false,
    pricingNotes: "Half-day and full-day event rates available.",
    instagram: "https://instagram.com/theomarshmedia",
    isVerified: true,
    ratingAvg: 4.5,
    ratingCount: 28,
    completedJobs: 34,
    specialties: ["Sports", "Events", "Action"],
    gallery: ["theo1", "theo2", "theo3", "theo4", "theo5", "theo6"],
    lat: 35.998,
    lng: -78.9395,
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // Demo student account.
  await prisma.user.upsert({
    where: { email: "student@snapcampus.app" },
    update: {},
    create: {
      email: "student@snapcampus.app",
      passwordHash,
      displayName: "Jordan Lee",
      role: "STUDENT",
      avatarUrl: img("student-jordan"),
    },
  });

  for (const p of PHOTOGRAPHERS) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: {
        email: p.email,
        passwordHash,
        displayName: p.name,
        role: "PHOTOGRAPHER",
        avatarUrl: img(`${p.email}-avatar`),
      },
    });

    const profile = await prisma.photographerProfile.upsert({
      where: { userId: user.id },
      update: {
        latitude: p.lat,
        longitude: p.lng,
        isVerified: p.isVerified,
        verificationStatus: p.isVerified ? "VERIFIED" : "NONE",
      },
      create: {
        userId: user.id,
        campus: p.campus,
        headline: p.headline,
        bio: p.bio,
        responseTime: p.responseTime,
        pricingModel: p.pricingModel,
        priceLabel: p.priceLabel,
        hourlyRate: p.hourlyRate ?? null,
        minimumHours: p.minimumHours ?? null,
        startingAt: p.startingAt ?? null,
        negotiable: p.negotiable,
        pricingNotes: p.pricingNotes,
        instagram: p.instagram ?? null,
        latitude: p.lat,
        longitude: p.lng,
        isVerified: p.isVerified,
        verificationStatus: p.isVerified ? "VERIFIED" : "NONE",
        isPublished: true,
        ratingAvg: p.ratingAvg,
        ratingCount: p.ratingCount,
        completedJobs: p.completedJobs,
      },
    });

    for (const name of p.specialties) {
      const specialty = await prisma.specialty.upsert({
        where: { name },
        update: {},
        create: { name },
      });
      await prisma.photographerSpecialty.upsert({
        where: { photographerId_specialtyId: { photographerId: profile.id, specialtyId: specialty.id } },
        update: {},
        create: { photographerId: profile.id, specialtyId: specialty.id },
      });
    }

    // Reset + reseed gallery so re-running stays idempotent.
    await prisma.portfolioMedia.deleteMany({ where: { photographerId: profile.id } });
    await prisma.portfolioMedia.createMany({
      data: p.gallery.map((seed, index) => ({
        photographerId: profile.id,
        url: img(seed),
        caption: "",
        position: index,
      })),
    });
  }

  console.log(`Seeded ${PHOTOGRAPHERS.length} photographers + 1 student.`);
  console.log(`Demo logins use password: ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
