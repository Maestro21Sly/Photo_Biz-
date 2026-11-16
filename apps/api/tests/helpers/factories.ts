import request from "supertest";
import type { Server } from "node:http";
import { prisma } from "../../src/db.js";

export const API = "/api/v1";

// Satisfies the password policy without being in the common-password list.
export const GOOD_PASSWORD = "Corr3ct-Horse-9";

let counter = 0;
export const uniqueEmail = (prefix = "user") => `${prefix}${++counter}.${Date.now()}@campus.test`;

export interface TestUser {
  id: string;
  email: string;
  password: string;
  role: "STUDENT" | "PHOTOGRAPHER" | "ADMIN";
  accessToken: string;
  refreshToken: string;
  /** Present for photographers: their PhotographerProfile id. */
  profileId?: string;
}

interface SignupOptions {
  role?: "STUDENT" | "PHOTOGRAPHER";
  email?: string;
  password?: string;
  displayName?: string;
}

/** Signs a user up through the real HTTP surface so tests exercise the same path users do. */
export async function signup(app: Server, opts: SignupOptions = {}): Promise<TestUser> {
  const email = opts.email ?? uniqueEmail(opts.role === "PHOTOGRAPHER" ? "shooter" : "student");
  const password = opts.password ?? GOOD_PASSWORD;
  const res = await request(app)
    .post(`${API}/auth/signup`)
    .send({
      email,
      password,
      displayName: opts.displayName ?? "Test Person",
      role: opts.role ?? "STUDENT",
      acceptedTerms: true,
    })
    .expect(201);

  const profile =
    opts.role === "PHOTOGRAPHER"
      ? await prisma.photographerProfile.findUnique({ where: { userId: res.body.user.id } })
      : null;

  return {
    id: res.body.user.id,
    email,
    password,
    role: res.body.user.role,
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    profileId: profile?.id,
  };
}

/** A photographer whose profile is published, so they're bookable/searchable. */
export async function publishedPhotographer(
  app: Server,
  overrides: Parameters<typeof prisma.photographerProfile.update>[0]["data"] = {}
): Promise<TestUser> {
  const user = await signup(app, { role: "PHOTOGRAPHER" });
  await prisma.photographerProfile.update({
    where: { id: user.profileId! },
    data: { campus: "State University", isPublished: true, ...overrides },
  });
  return user;
}

/** Promotes a user to ADMIN and returns a token that carries the new role. */
export async function makeAdmin(app: Server, user: TestUser): Promise<TestUser> {
  await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  const res = await request(app)
    .post(`${API}/auth/login`)
    .send({ email: user.email, password: user.password })
    .expect(200);
  return { ...user, role: "ADMIN", accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
}

/** Books `photographer` as `client` and returns the created booking id. */
export async function createBooking(
  app: Server,
  client: TestUser,
  photographer: TestUser,
  overrides: Record<string, unknown> = {}
): Promise<string> {
  const res = await request(app)
    .post(`${API}/bookings`)
    .set("Authorization", `Bearer ${client.accessToken}`)
    .send({
      photographerId: photographer.profileId,
      eventType: "Graduation portraits",
      eventDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      location: "Main quad",
      durationHours: 2,
      message: "Looking forward to it",
      ...overrides,
    })
    .expect(201);
  return res.body.id;
}

/** Drives a booking to COMPLETED through the real transitions (REQUESTED → ACCEPTED → COMPLETED). */
export async function completeBooking(
  app: Server,
  client: TestUser,
  photographer: TestUser
): Promise<string> {
  const bookingId = await createBooking(app, client, photographer);
  await request(app)
    .patch(`${API}/bookings/${bookingId}/status`)
    .set("Authorization", `Bearer ${photographer.accessToken}`)
    .send({ status: "ACCEPTED" })
    .expect(200);
  await request(app)
    .patch(`${API}/bookings/${bookingId}/status`)
    .set("Authorization", `Bearer ${photographer.accessToken}`)
    .send({ status: "COMPLETED" })
    .expect(200);
  return bookingId;
}
