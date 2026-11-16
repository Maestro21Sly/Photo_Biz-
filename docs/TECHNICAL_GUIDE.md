# SnapCampus Technical Guide

This file explains what we built, how the app flow works, what each file does, how to run it, and how the photographer intake automation now works.

## 1. What This Project Is

`SnapCampus` is a mobile-first Progressive Web App (PWA) for the first phase of your photography marketplace idea.

The goal of Phase 1 is intentionally small:

- let students discover photographers
- let them compare pricing and style quickly
- let them contact photographers directly

This version does **not** include:

- payments
- in-app booking
- messaging
- accounts
- scheduling
- a real backend or database

That matches the original strategy in `photography_marketplace_readme.md`: validate behavior before adding complexity.

## 2. Why We Built It As A Simple PWA First

We chose a PWA instead of a native app because it is:

- faster to build
- faster to test
- installable on a phone home screen
- good enough for discovery and outbound contact

Technically, this project is a static frontend:

- HTML for structure
- CSS for styling
- JavaScript for interactivity
- Web manifest for installability
- Service worker for caching/offline behavior

There is still no backend yet. The app data is generated into a JavaScript file.

## 3. High-Level User Flow

The product flow is:

1. A student opens the app.
2. They land on a mobile-first homepage with a CTA.
3. They search by keyword or filter by specialty.
4. They browse photographer cards showing:
   - name
   - campus area
   - pricing summary
   - response time
5. They tap `View profile`.
6. They see more detail:
   - bio
   - specialties
   - pricing summary
   - pricing notes
   - portfolio links
   - contact actions
7. They leave the app to contact the photographer directly.

That is the entire Phase 1 behavior: discovery, clarity, and direct connection.

## 4. Admin / Supply Flow

There is also a separate operator flow for you as the marketplace owner:

1. You send photographers one standard intake form or outreach message.
2. Their responses go into a spreadsheet.
3. You export that spreadsheet as CSV.
4. You run an importer command.
5. The importer rebuilds `data/photographers.js`.
6. The app shows the updated profiles automatically.

This is the first version of automation for onboarding photographers without hand-editing each listing.

## 5. Project Structure

Current files:

```text
Photography_Biz/
├── FORM_AUTOMATION_GUIDE.md
├── OUTREACH_TEMPLATE.md
├── TECHNICAL_GUIDE.md
├── app.js
├── index.html
├── manifest.webmanifest
├── package.json
├── photography_marketplace_readme.md
├── service-worker.js
├── styles.css
├── assets/
│   └── icon.svg
├── data/
│   ├── photographers-template.csv
│   └── photographers.js
└── scripts/
    ├── dev-server.mjs
    ├── import-photographers.mjs
    └── serve.py
```

## 6. File-By-File Explanation

### `index.html`

This is the main page of the app.

It contains:

- metadata in the `<head>`
- the PWA manifest link
- the stylesheet link
- the visible UI structure
- the script tags for loading data and logic

Important sections:

- Hero section
  - introduces the product
  - contains the main CTA
  - contains the install button for supported browsers
- Controls section
  - search input
  - specialty filter area
- Card grid
  - where photographer cards are rendered
- Detail panel
  - hidden initially
  - shown when a profile is opened

Why this matters:

- HTML defines the app shell
- JavaScript injects the data-driven content into that shell

### `styles.css`

This file handles the visual design.

Main design choices:

- mobile-first layout
- app-like cards and rounded surfaces
- bold but warm color system
- responsive layout for larger screens
- strong touch targets for mobile use

Technical ideas used:

- CSS variables in `:root`
- media queries
- gradients and layered backgrounds
- reusable utility-like component classes

### `data/photographers.js`

This is the current app data file.

It sets:

```js
window.photographers = [ ... ]
```

Each photographer object now includes both simple and structured pricing data.

Typical fields:

- `id`
- `name`
- `campus`
- `responseTime`
- `startingPrice`
- `pricing`
- `specialties`
- `portfolioLinks`
- `contact`
- `bio`

Important note:

- this file is now meant to be **generated**
- the preferred workflow is to rebuild it from CSV using the importer script

### `data/photographers-template.csv`

This is the spreadsheet-friendly source template.

This is the shape you should use when collecting structured photographer data.

Important columns:

- `name`
- `campus`
- `responseTime`
- `specialties`
- `instagram`
- `portfolio`
- `phone`
- `preferredContact`
- `pricingModel`
- `priceLabel`
- `hourlyRate`
- `minimumHours`
- `startingAt`
- `negotiable`
- `pricingNotes`
- `bio`

This is the easiest bridge between:

- Google Forms / Google Sheets
- exported CSV
- app data

### `app.js`

This is the main frontend logic.

It controls:

- app state
- search
- filters
- card rendering
- detail rendering
- install prompt behavior
- service worker registration

#### `state`

At the top:

```js
const state = {
  search: "",
  filter: "All",
  photographers: []
};
```

This stores the current client-side app state in memory.

#### DOM references

These connect JavaScript to HTML elements:

```js
const cardGrid = document.getElementById("cardGrid");
const detailPanel = document.getElementById("detailPanel");
...
```

#### Pricing helpers

The app now uses helper functions to support more realistic pricing.

Examples:

- `getPricingSummary(photographer)`
  - decides what pricing label to show on the card and detail view
- `getContactLabel(photographer)`
  - decides whether to display Instagram, phone, or a preferred method
- `renderContactActions(photographer)`
  - builds the correct contact buttons

This matters because photographers often charge:

- per hour
- by package
- with negotiable/custom pricing

So the UI should not assume one flat model.

#### `renderFilters()`

This function:

- scans all photographers
- collects all specialties
- renders a filter chip for each one

#### `getFilteredPhotographers()`

This is the main filtering logic.

It:

- reads the search term
- checks the active specialty filter
- builds a searchable text string
- matches across name, campus, pricing, pricing notes, and specialties

#### `renderCards()`

This:

- gets the filtered photographers
- updates the result count
- handles the empty state
- renders each photographer card

Each card is data-driven. If the imported data changes, the UI changes automatically.

#### `renderDetail(id)`

This:

- finds a photographer by `id`
- builds the detail panel
- shows richer pricing details
- shows pricing notes when available
- shows portfolio and contact actions

#### `attachEvents()`

This attaches user event listeners for:

- typing into search
- clicking filter chips
- opening a profile

#### `setupInstallPrompt()`

This handles the browser's `beforeinstallprompt` event so the app can be installed as a PWA when supported.

#### `registerServiceWorker()`

This registers `service-worker.js`.

#### `init()`

This is the startup function.

It:

1. loads `window.photographers` into state
2. renders filters
3. renders cards
4. attaches events
5. enables install behavior
6. registers the service worker

### `manifest.webmanifest`

This tells the browser how the app should behave when installed.

Important fields:

- `name`
- `short_name`
- `start_url`
- `display: "standalone"`
- `background_color`
- `theme_color`
- `icons`

Without this file, the app would not behave like an installable PWA.

### `service-worker.js`

This file handles simple caching.

It:

- defines a cache name
- pre-caches core assets
- removes old caches on activation
- serves cached assets when available

This helps with:

- repeat load speed
- basic offline support
- more app-like behavior

### `assets/icon.svg`

This is the PWA icon used by the manifest.

### `scripts/serve.py`

This is the original Python local server.

It still works, but it is now secondary because Node is installed.

### `scripts/dev-server.mjs`

This is the preferred local dev server now.

It:

- uses Node's built-in `http` module
- serves files from the current project folder
- sets simple content types
- disables caching during development
- can fall back to the next open port if one is already in use

This means if `8000` is busy, it can try `8001`, `8002`, and so on.

### `scripts/import-photographers.mjs`

This is the key automation script for onboarding photographers.

It:

1. reads a CSV file
2. parses the rows
3. converts each row into the app's photographer object structure
4. normalizes pricing fields
5. generates `data/photographers.js`

Important transformations:

- creates a slug-like `id` from the photographer name
- splits `specialties` on `|`
- builds `portfolioLinks`
- converts phone into `tel:...`
- creates a pricing summary from:
  - pricing model
  - hourly rate
  - starting package price
  - negotiable flag
  - price label override

This is what makes the intake flow semi-automated instead of fully manual.

### `OUTREACH_TEMPLATE.md`

This contains copy you can send photographers directly if you want to recruit them by DM instead of only using a form.

### `FORM_AUTOMATION_GUIDE.md`

This explains the recommended intake system:

- build a Google Form
- send the form link
- collect responses in Google Sheets
- export CSV
- import into the app

### `package.json`

This defines project metadata and npm scripts.

Current scripts:

```json
"scripts": {
  "import:photographers": "node scripts/import-photographers.mjs",
  "dev": "node scripts/dev-server.mjs",
  "start": "node scripts/dev-server.mjs"
}
```

That means you can run:

```bash
npm run dev
npm start
npm run import:photographers
```

## 7. Exact Run Commands

### Run the app locally

```bash
cd /Users/johannesarizie/Desktop/Cook/Photography_Biz
npm run dev
```

Then open:

```text
http://127.0.0.1:8000
```

If `8000` is taken, the dev server may move to `8001` or another nearby port.

### Import photographer data from the default CSV

```bash
cd /Users/johannesarizie/Desktop/Cook/Photography_Biz
npm run import:photographers
```

This uses:

```text
data/photographers-template.csv
```

### Import photographer data from a custom CSV

```bash
cd /Users/johannesarizie/Desktop/Cook/Photography_Biz
npm run import:photographers -- data/your-photographers.csv
```

### Optional Python server

```bash
cd /Users/johannesarizie/Desktop/Cook/Photography_Biz
python3 scripts/serve.py
```

## 8. How Data Flows Through The App

The frontend runtime flow is:

1. Browser requests `index.html`
2. `index.html` loads `styles.css`
3. `index.html` loads `data/photographers.js`
4. `data/photographers.js` defines `window.photographers`
5. `index.html` loads `app.js`
6. `app.js` runs `init()`
7. `init()` copies data into app state
8. filters are rendered
9. cards are rendered
10. user interacts with search or filters
11. state changes
12. cards re-render
13. user opens a profile
14. detail view renders
15. user clicks an external contact action

This is a classic frontend loop:

- data -> state -> render -> user event -> state update -> re-render

## 9. How The Intake Automation Flow Works

The intake automation flow is:

1. You create a Google Form using the fields in `FORM_AUTOMATION_GUIDE.md`.
2. Photographers fill out the form.
3. Responses land in Google Sheets.
4. You export the sheet as CSV.
5. You run the importer command.
6. `scripts/import-photographers.mjs` converts the CSV into `data/photographers.js`.
7. The app uses the generated data immediately on next load.

This is not a live backend sync yet, but it removes most of the manual formatting work.

## 10. What Node/npm Changes

Now that Node and npm are installed:

- you can use standard npm scripts
- you can run the app with `npm run dev`
- you can run the importer with `npm run import:photographers`
- you can add tooling later if the project grows

Your installed versions are:

- `node v24.14.1`
- `npm 11.11.0`

That is enough for the current version of this project.

## 11. What Else Needs To Be Done Right Now

For local development, almost nothing else is required.

You do **not** need `npm install` right now because there are no package dependencies yet.

The biggest remaining work is product and operations work:

- create the real Google Form
- collect real photographer responses
- export the CSV
- import the real data
- test the app with real users

## 12. What You Probably Want To Do Next

The most valuable next steps are:

### Build the real intake form

Use the fields in `FORM_AUTOMATION_GUIDE.md`.

### Collect real photographer responses

This is what turns the prototype into a real marketplace directory.

### Import the real CSV

Once real data exists, run the importer and the app becomes much more meaningful.

### Decide on hosting

Because the app is static, it can be deployed easily to:

- Vercel
- Netlify
- GitHub Pages
- Cloudflare Pages

### Add lightweight analytics

Good early metrics:

- profile views
- contact clicks
- filter usage

### Add a real admin flow later if needed

Future upgrades could include:

- direct Google Sheets sync
- Airtable or Supabase integration
- an admin dashboard
- a live CMS-style editing flow

## 13. When You Might Want A Framework

You do **not** need React yet.

A framework may make sense later if:

- the UI becomes larger
- you add multiple pages
- you need more complex state
- you build admin tools
- you connect to a real backend

For now, plain HTML/CSS/JS is still a good fit because it is:

- faster to understand
- easier to debug
- lighter to maintain
- enough for this stage

## 14. Summary

The current system is intentionally simple but more structured than before:

- `index.html` defines the shell
- `styles.css` defines the design
- `app.js` renders the interactive UI
- `data/photographers.js` is generated app data
- `data/photographers-template.csv` is the structured import source
- `scripts/import-photographers.mjs` automates data conversion
- `scripts/dev-server.mjs` runs the app locally
- `manifest.webmanifest` and `service-worker.js` make it a PWA

So the practical answer now is:

- for development: run `npm run dev`
- for photographer onboarding: use a form, export CSV, run `npm run import:photographers`
- for product progress: collect real photographer submissions and test usage
