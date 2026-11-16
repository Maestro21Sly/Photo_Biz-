import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const inputArg = process.argv[2] || "data/photographers-template.csv";
const inputPath = resolve(process.cwd(), inputArg);
const outputPath = resolve(process.cwd(), "data/photographers.js");

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeString(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }

      row.push(current);
      current = "";

      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows;
}

function buildPhotographers(records) {
  return records.map((record) => {
    const specialties = (record.specialties || "")
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean);

    const portfolioLinks = [];

    if (record.instagram) {
      portfolioLinks.push({ label: "Instagram", href: record.instagram.trim() });
    }

    if (record.portfolio) {
      portfolioLinks.push({ label: "Portfolio", href: record.portfolio.trim() });
    }

    const pricingModel = (record.pricingModel || "").trim().toLowerCase();
    const hourlyRate = (record.hourlyRate || "").trim();
    const minimumHours = (record.minimumHours || "").trim();
    const startingAt = (record.startingAt || "").trim();
    const negotiable = (record.negotiable || "").trim().toLowerCase();
    const pricingNotes = (record.pricingNotes || "").trim();

    let pricingSummary = (record.priceLabel || "").trim();

    if (!pricingSummary) {
      if (pricingModel === "hourly" && hourlyRate) {
        pricingSummary = `$${hourlyRate}/hr`;
        if (minimumHours) {
          pricingSummary += `, ${minimumHours} hr min`;
        }
      } else if (pricingModel === "package" && startingAt) {
        pricingSummary = `Starting at $${startingAt}`;
      } else if (pricingModel === "custom") {
        pricingSummary = "Custom quote";
      } else {
        pricingSummary = "Contact for pricing";
      }

      if (negotiable === "yes" || negotiable === "true") {
        pricingSummary += " • negotiable";
      }
    }

    return {
      id: slugify(record.name || "photographer"),
      name: record.name?.trim() || "",
      campus: record.campus?.trim() || "",
      responseTime: record.responseTime?.trim() || "",
      startingPrice: pricingSummary,
      pricing: {
        model: pricingModel || "custom",
        summary: pricingSummary,
        hourlyRate,
        minimumHours,
        startingAt,
        negotiable: negotiable === "yes" || negotiable === "true",
        notes: pricingNotes
      },
      specialties,
      portfolioLinks,
      contact: {
        instagram: record.instagram?.trim() || "",
        phone: record.phone ? `tel:${record.phone.trim()}` : "",
        preferredMethod: record.preferredContact?.trim() || ""
      },
      bio: record.bio?.trim() || ""
    };
  });
}

function serializePhotographers(photographers) {
  const lines = ["window.photographers = ["];

  photographers.forEach((photographer, index) => {
    lines.push("  {");
    lines.push(`    id: "${escapeString(photographer.id)}",`);
    lines.push(`    name: "${escapeString(photographer.name)}",`);
    lines.push(`    campus: "${escapeString(photographer.campus)}",`);
    lines.push(`    responseTime: "${escapeString(photographer.responseTime)}",`);
    lines.push(`    startingPrice: "${escapeString(photographer.startingPrice)}",`);
    lines.push("    pricing: {");
    lines.push(`      model: "${escapeString(photographer.pricing.model)}",`);
    lines.push(`      summary: "${escapeString(photographer.pricing.summary)}",`);
    lines.push(`      hourlyRate: "${escapeString(photographer.pricing.hourlyRate)}",`);
    lines.push(`      minimumHours: "${escapeString(photographer.pricing.minimumHours)}",`);
    lines.push(`      startingAt: "${escapeString(photographer.pricing.startingAt)}",`);
    lines.push(`      negotiable: ${photographer.pricing.negotiable},`);
    lines.push(`      notes: "${escapeString(photographer.pricing.notes)}"`);
    lines.push("    },");
    lines.push(
      `    specialties: [${photographer.specialties
        .map((item) => `"${escapeString(item)}"`)
        .join(", ")}],`
    );
    lines.push("    portfolioLinks: [");
    photographer.portfolioLinks.forEach((link, linkIndex) => {
      const comma = linkIndex === photographer.portfolioLinks.length - 1 ? "" : ",";
      lines.push(
        `      { label: "${escapeString(link.label)}", href: "${escapeString(link.href)}" }${comma}`
      );
    });
    lines.push("    ],");
    lines.push("    contact: {");
    lines.push(`      instagram: "${escapeString(photographer.contact.instagram)}",`);
    lines.push(`      phone: "${escapeString(photographer.contact.phone)}",`);
    lines.push(`      preferredMethod: "${escapeString(photographer.contact.preferredMethod)}"`);
    lines.push("    },");
    lines.push(`    bio: "${escapeString(photographer.bio)}"`);
    lines.push(index === photographers.length - 1 ? "  }" : "  },");
  });

  lines.push("];");
  lines.push("");
  return lines.join("\n");
}

const csvText = readFileSync(inputPath, "utf8");
const rows = parseCsv(csvText);

if (rows.length < 2) {
  throw new Error(`CSV file ${basename(inputPath)} must contain a header row and at least one data row.`);
}

const [headers, ...dataRows] = rows;
const records = dataRows.map((row) =>
  Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]))
);

const photographers = buildPhotographers(records);
const output = serializePhotographers(photographers);

writeFileSync(outputPath, output, "utf8");

console.log(`Imported ${photographers.length} photographers from ${basename(inputPath)}.`);
console.log(`Updated ${outputPath}.`);
