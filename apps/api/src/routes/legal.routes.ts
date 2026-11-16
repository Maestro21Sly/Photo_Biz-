import { Router } from "express";

export const legalRouter = Router();

const page = (title: string, body: string) => `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SnapCampus — ${title}</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:720px;margin:0 auto;padding:32px 20px;color:#17130F;line-height:1.6;background:#FBFAF7}
  h1{color:#FF5A36} h2{margin-top:28px} a{color:#FF5A36} .muted{color:#6E665C}
</style></head><body>
<h1>SnapCampus</h1><h2>${title}</h2>${body}
<p class="muted" style="margin-top:40px;font-size:13px">Last updated: 2026. Questions? <a href="mailto:support@snapcampus.app">support@snapcampus.app</a></p>
</body></html>`;

legalRouter.get("/terms", (_req, res) => {
  res.type("html").send(
    page(
      "Terms of Service",
      `<p class="muted">These terms govern your use of SnapCampus, a marketplace connecting students with photographers.</p>
      <h2>Using SnapCampus</h2><p>You must be 16+ and provide accurate information. You're responsible for activity on your account and for treating other users respectfully.</p>
      <h2>Bookings</h2><p>SnapCampus helps students discover and request bookings from photographers. Any agreement, payment, and the shoot itself are between the student and the photographer. We are not a party to that agreement.</p>
      <h2>Content & conduct</h2><p>Don't upload content you don't own or that is unlawful, harassing, or harmful. We may remove content and suspend accounts that violate these terms. Report problems in-app or to support.</p>
      <h2>Disclaimer</h2><p>The service is provided "as is" without warranties. We are not liable for interactions, bookings, or content created by users.</p>
      <h2>Changes</h2><p>We may update these terms; continued use means acceptance.</p>`
    )
  );
});

legalRouter.get("/privacy", (_req, res) => {
  res.type("html").send(
    page(
      "Privacy Policy",
      `<p class="muted">This explains what we collect and how we use it.</p>
      <h2>What we collect</h2><p>Account info (name, email, optional phone), photographer profile details and portfolio photos you upload, booking details (including a location pin you choose), messages you send, and reviews you write.</p>
      <h2>How we use it</h2><p>To operate the marketplace: show profiles, enable search and discovery, deliver bookings, messages, reviews, and notifications, and keep the platform safe.</p>
      <h2>Sharing</h2><p>Your public profile, portfolio, and reviews are visible to other users. We don't sell your personal data. We use service providers (hosting, storage, email, push) only to run the service.</p>
      <h2>Your rights</h2><p>You can edit your profile, change your password, and permanently delete your account and associated data from Settings at any time.</p>
      <h2>Security</h2><p>Passwords are hashed; access uses short-lived tokens. Uploaded images are re-encoded to remove embedded metadata such as GPS.</p>`
    )
  );
});
