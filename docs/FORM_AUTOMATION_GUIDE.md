# Form Automation Guide

This is the cleanest version of the workflow you described:

1. You send photographers one form link.
2. They submit their details themselves.
3. Responses land in a spreadsheet automatically.
4. You export the responses as CSV.
5. The importer script converts that CSV into the app data file.
6. The app updates from the imported data.

## Recommended Setup

Use:

- Google Form for intake
- Google Sheets for collecting responses
- this project importer for converting the data into app format

This gives you a low-friction process without needing a backend yet.

## Suggested Form Questions

These are the fields I recommend putting into the form.

### Identity

- Full name
- Campus area / neighborhood
- Short bio

### Photography type

- Specialties
  Example answer format: `Graduation, Portraits, Couples`

### Pricing

- Pricing model
  Options:
  - Hourly
  - Package-based
  - Custom quote

- Display price label
  Example:
  - `$150/hr`
  - `Starting at $200`
  - `Custom quote`
  - `$120/hr, negotiable`

- Hourly rate
  Optional

- Minimum hours
  Optional

- Starting package price
  Optional

- Is your pricing negotiable?
  Options:
  - Yes
  - No

- Pricing notes
  Example:
  `Open to custom graduation packages depending on group size and location.`

### Portfolio and contact

- Instagram link
- Portfolio link
- Phone number
- Preferred contact method
  Options:
  - Instagram
  - Phone
  - Either

### Responsiveness

- Typical response time
  Example:
  - Within 1 hour
  - Same day
  - Within 24 hours

## How To Map Form Responses Into The CSV

Your CSV should use these exact headers:

```text
name,campus,responseTime,specialties,instagram,portfolio,phone,preferredContact,pricingModel,priceLabel,hourlyRate,minimumHours,startingAt,negotiable,pricingNotes,bio
```

This project already includes a starter file with those columns:

`data/photographers-template.csv`

## Recommended Real Workflow

### Option 1: Easiest

1. Create a Google Form with the fields above.
2. Link it to Google Sheets.
3. Clean up the spreadsheet column names to match the expected CSV headers.
4. Download the sheet as CSV.
5. Put the CSV into the project folder.
6. Run:

```bash
npm run import:photographers -- data/your-file.csv
```

If you do not pass a file path, it uses:

```text
data/photographers-template.csv
```

### Option 2: Semi-automated weekly workflow

1. Keep one master Google Sheet.
2. Export it as CSV whenever new responses come in.
3. Replace the CSV file in the project.
4. Run the importer.
5. Run the app.

This is usually enough for an early marketplace.

## Why This Is Better Than Free-Form DMs

Using a form solves several problems:

- every photographer gives data in the same structure
- pricing can be hourly, package-based, or negotiable
- you do not have to manually reword each response
- importing becomes predictable
- the app can display cleaner listings

## What Is Already Automated

The importer now understands richer pricing structures:

- hourly
- package-based
- custom quote
- negotiable pricing
- pricing notes
- preferred contact method

So once the CSV is in the right shape, the transformation into app data is automated.

## What Is Not Yet Fully Automated

The one manual step still left is exporting the spreadsheet CSV and running the importer.

That is still much better than hand-editing listings, but if you want true end-to-end automation later, the next step would be:

- connect Google Sheets API directly
- or move submissions into Airtable/Supabase
- or build a small admin dashboard

## Best Recommendation For Right Now

For this phase, I recommend:

- use Google Form
- standardize answers with dropdowns where possible
- export CSV
- run the importer

That gives you a very practical and low-maintenance system without overbuilding.
