import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import sharp from "sharp";
import type { Server } from "node:http";
import { startTestServer, stopTestServer } from "./helpers/server.js";
import { UPLOAD_DIR } from "../src/lib/objectStorage.js";
import { disconnectDb, prisma, resetDb } from "./helpers/db.js";
import { API, publishedPhotographer, signup, type TestUser } from "./helpers/factories.js";

let app: Server;

beforeAll(async () => {
  app = await startTestServer();
});

let photographer: TestUser;
let student: TestUser;

beforeEach(async () => {
  await resetDb();
  photographer = await publishedPhotographer(app);
  student = await signup(app);
});
afterAll(async () => {
  await stopTestServer(app);
  await disconnectDb();
});

const auth = (u: TestUser) => `Bearer ${u.accessToken}`;

/** A real raster image, built here so the test never depends on a checked-in binary. */
function makeImage(format: "png" | "jpeg" | "webp", size = 64): Promise<Buffer> {
  return sharp({
    create: { width: size, height: size, channels: 3, background: { r: 200, g: 40, b: 20 } },
  })
    .toFormat(format)
    .toBuffer();
}

/** A JPEG carrying EXIF, including a GPS block — what a phone upload actually looks like. */
function makeImageWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    // IFD3 is where libvips writes the GPS directory.
    .withExif({
      IFD0: { Copyright: "SnapCampus test", Software: "test" },
      IFD3: { GPSLatitudeRef: "N", GPSLongitudeRef: "W" },
    })
    .jpeg()
    .toBuffer();
}

const storedFile = (url: string) => path.join(UPLOAD_DIR, url.split("/").pop()!);

describe("avatar upload", () => {
  it("accepts a real image and re-encodes it to JPEG", async () => {
    const res = await request(app)
      .post(`${API}/media/avatar`)
      .set("Authorization", auth(student))
      .attach("file", await makeImage("png"), { filename: "me.png", contentType: "image/png" })
      .expect(201);

    expect(res.body.url).toMatch(/\/uploads\/[0-9a-f]{32}\.jpg$/);
    const stored = await sharp(storedFile(res.body.url)).metadata();
    expect(stored.format).toBe("jpeg");

    const user = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    expect(user.avatarUrl).toBe(res.body.url);
  });

  it("names the stored file from the detected type, not the uploaded filename", async () => {
    const res = await request(app)
      .post(`${API}/media/avatar`)
      .set("Authorization", auth(student))
      // A filename crafted to become a served script if it were ever trusted.
      .attach("file", await makeImage("png"), { filename: "../../evil.html", contentType: "image/png" })
      .expect(201);

    const key = res.body.url.split("/").pop();
    expect(key).toMatch(/^[0-9a-f]{32}\.jpg$/);
    expect(key).not.toContain("evil");
    expect(fs.existsSync(storedFile(res.body.url))).toBe(true);
  });

  it("strips EXIF, including GPS, from what it stores", async () => {
    const original = await sharp(await makeImageWithGps()).metadata();
    expect(original.exif).toBeDefined();

    const res = await request(app)
      .post(`${API}/media/avatar`)
      .set("Authorization", auth(student))
      .attach("file", await makeImageWithGps(), { filename: "phone.jpg", contentType: "image/jpeg" })
      .expect(201);

    const stored = await sharp(storedFile(res.body.url)).metadata();
    expect(stored.exif).toBeUndefined();
  });

  it("requires authentication", async () => {
    await request(app)
      .post(`${API}/media/avatar`)
      .attach("file", await makeImage("png"), { filename: "me.png", contentType: "image/png" })
      .expect(401);
  });
});

describe("upload content validation", () => {
  it("rejects a non-image body wearing an image Content-Type", async () => {
    await request(app)
      .post(`${API}/media/avatar`)
      .set("Authorization", auth(student))
      .attach("file", Buffer.from("<?php system($_GET['c']); ?>"), {
        filename: "shell.png",
        contentType: "image/png",
      })
      .expect(400);
  });

  it("rejects an SVG even though it is technically an image", async () => {
    const svg = Buffer.from(
      `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>` +
        `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><text>&xxe;</text></svg>`
    );
    await request(app)
      .post(`${API}/media/avatar`)
      .set("Authorization", auth(student))
      .attach("file", svg, { filename: "logo.svg", contentType: "image/svg+xml" })
      .expect(400);
  });

  it("rejects a file whose Content-Type isn't an image at all", async () => {
    await request(app)
      .post(`${API}/media/avatar`)
      .set("Authorization", auth(student))
      .attach("file", Buffer.from("plain text"), { filename: "notes.txt", contentType: "text/plain" })
      .expect(400);
  });

  it("rejects a file over the size limit with 413", async () => {
    await request(app)
      .post(`${API}/media/avatar`)
      .set("Authorization", auth(student))
      .attach("file", Buffer.alloc(16 * 1024 * 1024, 0x41), {
        filename: "huge.jpg",
        contentType: "image/jpeg",
      })
      .expect(413);
  });

  it("400s when no file is attached", async () => {
    await request(app).post(`${API}/media/avatar`).set("Authorization", auth(student)).expect(400);
  });

  it("accepts a genuine image regardless of a mismatched Content-Type", async () => {
    // Real WebP bytes announced as a JPEG: the magic bytes decide.
    await request(app)
      .post(`${API}/media/avatar`)
      .set("Authorization", auth(student))
      .attach("file", await makeImage("webp"), { filename: "a.jpg", contentType: "image/jpeg" })
      .expect(201);
  });
});

describe("portfolio (photographer only)", () => {
  const uploadPortfolio = async (user: TestUser, caption = "Quad at dusk") =>
    request(app)
      .post(`${API}/media/portfolio`)
      .set("Authorization", auth(user))
      .field("caption", caption)
      .attach("file", await makeImage("jpeg"), { filename: "shot.jpg", contentType: "image/jpeg" });

  it("stores a full image and a thumbnail against the caller's own profile", async () => {
    const res = await uploadPortfolio(photographer);
    expect(res.status).toBe(201);

    const media = await prisma.portfolioMedia.findFirstOrThrow();
    expect(media.photographerId).toBe(photographer.profileId);
    expect(media.caption).toBe("Quad at dusk");
    expect(media.thumbnailUrl).toBeTruthy();
    expect(media.url).not.toBe(media.thumbnailUrl);
  });

  it("denies students", async () => {
    const res = await uploadPortfolio(student);
    expect(res.status).toBe(403);
    expect(await prisma.portfolioMedia.count()).toBe(0);
  });

  it("won't let a photographer delete someone else's image", async () => {
    await uploadPortfolio(photographer);
    const media = await prisma.portfolioMedia.findFirstOrThrow();
    const other = await publishedPhotographer(app);

    await request(app)
      .delete(`${API}/media/portfolio/${media.id}`)
      .set("Authorization", auth(other))
      .expect(404);
    expect(await prisma.portfolioMedia.count()).toBe(1);

    await request(app)
      .delete(`${API}/media/portfolio/${media.id}`)
      .set("Authorization", auth(photographer))
      .expect(204);
    expect(await prisma.portfolioMedia.count()).toBe(0);
  });

  it("purges the stored files when an image is deleted", async () => {
    await uploadPortfolio(photographer);
    const media = await prisma.portfolioMedia.findFirstOrThrow();
    expect(fs.existsSync(storedFile(media.url))).toBe(true);

    await request(app)
      .delete(`${API}/media/portfolio/${media.id}`)
      .set("Authorization", auth(photographer))
      .expect(204);
    expect(fs.existsSync(storedFile(media.url))).toBe(false);
  });

  it("reorders only the caller's own gallery", async () => {
    await uploadPortfolio(photographer, "one");
    await uploadPortfolio(photographer, "two");
    const other = await publishedPhotographer(app);
    await uploadPortfolio(other, "theirs");

    const mine = await prisma.portfolioMedia.findMany({
      where: { photographerId: photographer.profileId },
      orderBy: { position: "asc" },
    });
    const theirs = await prisma.portfolioMedia.findFirstOrThrow({
      where: { photographerId: other.profileId },
    });

    await request(app)
      .put(`${API}/media/portfolio/order`)
      .set("Authorization", auth(photographer))
      .send({ order: [mine[1]!.id, mine[0]!.id, theirs.id] })
      .expect(204);

    expect((await prisma.portfolioMedia.findUniqueOrThrow({ where: { id: mine[1]!.id } })).position).toBe(0);
    // The foreign id was silently ignored rather than reordered.
    expect((await prisma.portfolioMedia.findUniqueOrThrow({ where: { id: theirs.id } })).position).toBe(0);
  });

  it("caps how many ids a reorder can carry", async () => {
    await request(app)
      .put(`${API}/media/portfolio/order`)
      .set("Authorization", auth(photographer))
      .send({ order: Array.from({ length: 40 }, (_, i) => `id-${i}`) })
      .expect(400);
  });
});
