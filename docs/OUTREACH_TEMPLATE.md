# Photographer Outreach Template

Use this message to recruit photographers for the first version of SnapCampus.

## Short DM Version

```text
Hey, I’m building a campus app that helps students find photographers faster instead of asking around in group chats.

I’d love to feature you in the first version if you’re interested. It would include your name, specialties, starting price, portfolio links, and direct contact info so students can reach out to you directly.

If you want to be included, just send back:

Name:
Campus area:
Specialties:
Starting price:
Instagram:
Portfolio:
Preferred contact:
Typical response time:
Short bio:
```

## Slightly More Polished Version

```text
Hey, I’m building a small campus photography discovery app so students can find photographers more easily and compare pricing, style, and contact info in one place.

I’m inviting a small group of photographers for the first version, and I’d love to include you if you’re interested.

To add your profile, just reply with:

Name:
Campus area:
Specialties:
Starting price:
Instagram:
Portfolio link:
Preferred contact method:
Typical response time:
Short bio (1 to 2 sentences):

The app is mainly meant to help students discover photographers and contact them directly.
```

## Best Workflow

Instead of manually formatting every reply yourself:

1. Send the message above.
2. Paste each reply into a spreadsheet.
3. Export the spreadsheet as CSV.
4. Run the importer script in this project to convert the CSV into `data/photographers.js`.

That gives you a repeatable system instead of manually editing JavaScript every time.
