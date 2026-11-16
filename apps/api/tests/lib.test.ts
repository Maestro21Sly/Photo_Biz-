import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { normalizeIp } from "../src/middleware/ratelimit.js";
import { InvalidImageError, processImage } from "../src/lib/images.js";
import { UPLOAD_DIR, deleteByUrl, newKey, putObject } from "../src/lib/objectStorage.js";
import { passwordUsesEmail } from "../src/lib/password.js";
import { externalUrlSchema, optionalExternalUrlSchema } from "../src/lib/urls.js";

describe("object storage keys", () => {
  it("mints an opaque key from the detected extension", () => {
    expect(newKey("jpg")).toMatch(/^[0-9a-f]{32}\.jpg$/);
    expect(newKey(".png")).toMatch(/^[0-9a-f]{32}\.png$/);
  });

  it("strips anything an extension shouldn't contain", () => {
    expect(newKey("../../etc/passwd")).toMatch(/^[0-9a-f]{32}\.etcpasswd$/);
    expect(newKey("")).toMatch(/^[0-9a-f]{32}\.bin$/);
  });

  it("refuses to write an object under a key it didn't mint", async () => {
    await expect(putObject("../escape.jpg", Buffer.from("x"), "image/jpeg")).rejects.toThrow(
      /unrecognised object key/i
    );
    await expect(putObject("/etc/passwd", Buffer.from("x"), "image/jpeg")).rejects.toThrow();
  });

  it("ignores a delete for a url whose last segment isn't one of our keys", async () => {
    const sentinel = path.join(UPLOAD_DIR, "keep-me.txt");
    fs.writeFileSync(sentinel, "still here");
    try {
      await deleteByUrl("http://localhost:4000/uploads/keep-me.txt");
      expect(fs.existsSync(sentinel)).toBe(true);
    } finally {
      fs.rmSync(sentinel, { force: true });
    }
  });

  it("round-trips a real key", async () => {
    const key = newKey("jpg");
    const url = await putObject(key, Buffer.from("bytes"), "image/jpeg");
    expect(fs.existsSync(path.join(UPLOAD_DIR, key))).toBe(true);
    await deleteByUrl(url);
    expect(fs.existsSync(path.join(UPLOAD_DIR, key))).toBe(false);
  });
});

describe("image processing", () => {
  const solid = (width: number, height: number, format: "png" | "jpeg" = "png") =>
    sharp({ create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } } })
      .toFormat(format)
      .toBuffer();

  it("re-encodes to JPEG and caps the long edge", async () => {
    const out = await processImage(await solid(3000, 1500));
    expect(out.contentType).toBe("image/jpeg");
    expect(out.ext).toBe("jpg");
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(1600);

    const meta = await sharp(out.full).metadata();
    expect(meta.format).toBe("jpeg");
  });

  it("produces a square thumbnail", async () => {
    const out = await processImage(await solid(1200, 400));
    const thumb = await sharp(out.thumb).metadata();
    expect(thumb.width).toBe(400);
    expect(thumb.height).toBe(400);
  });

  it("does not enlarge a small image", async () => {
    const out = await processImage(await solid(120, 90));
    expect(out.width).toBe(120);
    expect(out.height).toBe(90);
  });

  it("rejects a buffer that isn't an image", async () => {
    await expect(processImage(Buffer.from("definitely not an image"))).rejects.toBeInstanceOf(
      InvalidImageError
    );
    await expect(processImage(Buffer.alloc(0))).rejects.toBeInstanceOf(InvalidImageError);
  });

  it("rejects SVG, which is a document librsvg would follow references from", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    await expect(processImage(svg)).rejects.toThrow(/Unsupported image format: svg/);
  });

  it("rejects a decompression bomb instead of allocating for it", async () => {
    // Flat colour compresses to a handful of KB but decodes to hundreds of MB;
    // the 50 MP cap is what keeps this from being a free out-of-memory kill.
    const png = (side: number) =>
      sharp({ create: { width: side, height: side, channels: 3, background: { r: 0, g: 0, b: 0 } } })
        .png({ compressionLevel: 9 })
        .toBuffer();

    // 36 MP — large but legitimate (a high-end camera), so still accepted.
    await expect(processImage(await png(6000))).resolves.toBeDefined();

    // 81 MP — over the cap, refused before the pixels are allocated.
    const overCap = await png(9000);
    expect(overCap.byteLength).toBeLessThan(1_000_000);
    await expect(processImage(overCap)).rejects.toBeInstanceOf(InvalidImageError);
  }, 60_000);
});

describe("external url policy", () => {
  it.each([
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "file:///etc/passwd",
    "intent://scan#Intent;scheme=zxing;end",
    "//example.test/protocol-relative",
    "example.test",
    "",
  ])("rejects %s", (value) => {
    expect(externalUrlSchema.safeParse(value).success).toBe(false);
  });

  it.each(["http://example.test", "https://instagram.com/someone", "https://a.test/path?q=1#frag"])(
    "accepts %s",
    (value) => {
      expect(externalUrlSchema.safeParse(value).success).toBe(true);
    }
  );

  it("normalizes the app's empty-string 'clear this field' to null", () => {
    expect(optionalExternalUrlSchema.parse("")).toBeNull();
    expect(optionalExternalUrlSchema.parse(null)).toBeNull();
    expect(optionalExternalUrlSchema.parse(undefined)).toBeUndefined();
  });
});

describe("rate-limit client keys", () => {
  it("uses an IPv4 address as-is", () => {
    expect(normalizeIp("203.0.113.5")).toBe("203.0.113.5");
  });

  it("keys IPv4-mapped IPv6 on the embedded IPv4", () => {
    expect(normalizeIp("::ffff:203.0.113.5")).toBe("203.0.113.5");
  });

  it("collapses IPv6 to its /64 so one host can't rotate the low bits", () => {
    const prefix = normalizeIp("2001:db8:1234:5678:aaaa:bbbb:cccc:dddd");
    expect(normalizeIp("2001:db8:1234:5678:0000:0000:0000:0001")).toBe(prefix);
    expect(normalizeIp("2001:db8:1234:5678::9999")).toBe(prefix);
    // A genuinely different allocation still gets its own bucket.
    expect(normalizeIp("2001:db8:1234:9999::1")).not.toBe(prefix);
  });

  it("handles compressed forms and zone ids", () => {
    expect(normalizeIp("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(normalizeIp("fe80::1%en0")).toBe("fe80:0:0:0::/64");
  });

  it("never returns an empty key", () => {
    expect(normalizeIp(undefined)).toBe("unknown");
  });
});

describe("password/email similarity", () => {
  it("flags a password built from the email local part", () => {
    expect(passwordUsesEmail("marcusbrown99", "marcusbrown@campus.test")).toBe(true);
    expect(passwordUsesEmail("XxMARCUSBROWNxX", "marcusbrown@campus.test")).toBe(true);
  });

  it("ignores very short local parts, which would flag almost anything", () => {
    expect(passwordUsesEmail("about-time-1", "abc@campus.test")).toBe(false);
  });

  it("allows an unrelated password", () => {
    expect(passwordUsesEmail("Corr3ct-Horse-9", "marcusbrown@campus.test")).toBe(false);
  });
});
