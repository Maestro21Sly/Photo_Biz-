const state = {
  search: "",
  filter: "All",
  photographers: []
};

const cardGrid = document.getElementById("cardGrid");
const detailPanel = document.getElementById("detailPanel");
const searchInput = document.getElementById("searchInput");
const filtersEl = document.getElementById("filters");
const resultsCount = document.getElementById("resultsCount");
const emptyState = document.getElementById("emptyState");
const installButton = document.getElementById("installButton");

let deferredPrompt = null;

function formatSpecialties(items) {
  return items.map((item) => `<span class="tag">${item}</span>`).join("");
}

function getPricingSummary(photographer) {
  if (photographer.pricing?.summary) {
    return photographer.pricing.summary;
  }

  return photographer.startingPrice || "Contact for pricing";
}

function getContactLabel(photographer) {
  if (photographer.contact?.preferredMethod) {
    return photographer.contact.preferredMethod;
  }

  if (photographer.contact?.instagram && photographer.contact?.phone) {
    return "Instagram or phone";
  }

  if (photographer.contact?.instagram) {
    return "Instagram";
  }

  if (photographer.contact?.phone) {
    return "Phone";
  }

  return "Direct contact";
}

function renderContactActions(photographer) {
  const actions = [];

  if (photographer.contact?.instagram) {
    actions.push(`
      <a class="contact-link" href="${photographer.contact.instagram}" target="_blank" rel="noreferrer">
        Message on Instagram
      </a>
    `);
  }

  if (photographer.contact?.phone) {
    actions.push(`
      <a class="contact-link alt" href="${photographer.contact.phone}">
        Call photographer
      </a>
    `);
  }

  if (actions.length === 0) {
    actions.push(`<span class="meta-label">Contact details available on request</span>`);
  }

  return actions.join("");
}

function renderFilters() {
  const specialties = new Set(["All"]);
  state.photographers.forEach((photographer) => {
    photographer.specialties.forEach((specialty) => specialties.add(specialty));
  });

  filtersEl.innerHTML = [...specialties]
    .map(
      (label) => `
        <button class="chip ${state.filter === label ? "active" : ""}" type="button" data-filter="${label}">
          ${label}
        </button>
      `
    )
    .join("");
}

function getFilteredPhotographers() {
  const term = state.search.trim().toLowerCase();

  return state.photographers.filter((photographer) => {
    const matchesFilter =
      state.filter === "All" || photographer.specialties.includes(state.filter);
    const haystack = [
      photographer.name,
      photographer.campus,
      photographer.responseTime,
      getPricingSummary(photographer),
      photographer.pricing?.model || "",
      photographer.pricing?.notes || "",
      ...photographer.specialties
    ]
      .join(" ")
      .toLowerCase();
    const matchesSearch = term.length === 0 || haystack.includes(term);
    return matchesFilter && matchesSearch;
  });
}

function renderCards() {
  const photographers = getFilteredPhotographers();

  resultsCount.textContent = `${photographers.length} photographer${
    photographers.length === 1 ? "" : "s"
  } available`;

  emptyState.hidden = photographers.length !== 0;
  cardGrid.hidden = photographers.length === 0;

  cardGrid.innerHTML = photographers
    .map(
      (photographer) => `
        <article class="photographer-card">
          <div class="card-top">
            <div class="identity">
              <div class="avatar">${photographer.name
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)}</div>
              <h2>${photographer.name}</h2>
              <p>${photographer.campus}</p>
            </div>
            <span class="badge">${getPricingSummary(photographer)}</span>
          </div>

          <div class="card-meta">
            <div class="meta-row">
              <span class="meta-label">Best for</span>
              <span>${photographer.specialties[0]}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Response</span>
              <span>${photographer.responseTime}</span>
            </div>
          </div>

          <div class="specialties">
            ${formatSpecialties(photographer.specialties)}
          </div>

          <div class="card-actions">
            <button class="card-link" type="button" data-detail="${photographer.id}">
              View profile
            </button>
            <a class="contact-link alt" href="${photographer.contact.instagram}" target="_blank" rel="noreferrer">
              Instagram
            </a>
          </div>
        </article>
      `
    )
    .join("");
}

function renderDetail(id) {
  const photographer = state.photographers.find((item) => item.id === id);
  if (!photographer) {
    detailPanel.hidden = true;
    detailPanel.innerHTML = "";
    return;
  }

  detailPanel.hidden = false;
  detailPanel.innerHTML = `
    <div class="detail-header">
      <div class="detail-heading">
        <p class="eyebrow">Photographer profile</p>
        <h2>${photographer.name}</h2>
        <p>${photographer.campus}</p>
      </div>
      <button class="secondary-button" type="button" id="closeDetail">Close</button>
    </div>

    <p class="detail-copy">${photographer.bio}</p>

    <div class="specialties">
      ${formatSpecialties(photographer.specialties)}
    </div>

    <div class="detail-list">
      <div class="meta-row">
        <span class="meta-label">Pricing</span>
        <strong>${getPricingSummary(photographer)}</strong>
      </div>
      <div class="meta-row">
        <span class="meta-label">Expected response time</span>
        <strong>${photographer.responseTime}</strong>
      </div>
      <div class="meta-row">
        <span class="meta-label">Contact</span>
        <strong>${getContactLabel(photographer)}</strong>
      </div>
    </div>

    ${
      photographer.pricing?.notes
        ? `<p class="detail-copy"><strong>Pricing notes:</strong> ${photographer.pricing.notes}</p>`
        : ""
    }

    <div class="portfolio-links">
      ${photographer.portfolioLinks
        .map(
          (link) =>
            `<a class="secondary-button" href="${link.href}" target="_blank" rel="noreferrer">${link.label}</a>`
        )
        .join("")}
    </div>

    <div class="detail-actions">
      ${renderContactActions(photographer)}
    </div>
  `;

  detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });

  document.getElementById("closeDetail").addEventListener("click", () => {
    detailPanel.hidden = true;
    detailPanel.innerHTML = "";
  });
}

function attachEvents() {
  searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    renderCards();
  });

  filtersEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) {
      return;
    }

    state.filter = button.dataset.filter;
    renderFilters();
    renderCards();
  });

  cardGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-detail]");
    if (!button) {
      return;
    }

    renderDetail(button.dataset.detail);
  });
}

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    installButton.hidden = false;
  });

  installButton.addEventListener("click", async () => {
    if (!deferredPrompt) {
      return;
    }

    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installButton.hidden = true;
  });
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    await navigator.serviceWorker.register("/service-worker.js");
  }
}

function init() {
  state.photographers = window.photographers || [];
  renderFilters();
  renderCards();
  attachEvents();
  setupInstallPrompt();
  registerServiceWorker();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
