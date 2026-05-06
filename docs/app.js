import { convertSize, normalizeForSearch } from "./size-utils.js";

const DATA_URL = "./data/products.json";

const state = {
  products: [],
  unit: "US",
  query: "",
  brand: "all",
  size: "",
  priceMin: "",
  priceMax: "",
};

const el = {
  search: document.getElementById("search"),
  brand: document.getElementById("brand"),
  size: document.getElementById("size"),
  priceMin: document.getElementById("price-min"),
  priceMax: document.getElementById("price-max"),
  unitSwitch: document.getElementById("unit-switch"),
  catalog: document.getElementById("catalog"),
  stats: document.getElementById("stats"),
  reset: document.getElementById("reset"),
  empty: document.getElementById("empty"),
};

function formatPrice(value) {
  return `$${Math.round(value)}`;
}

function renderBrandOptions(products) {
  const brands = [...new Set(products.map((p) => p.brand))].sort((a, b) =>
    a.localeCompare(b, "ru")
  );

  const frag = document.createDocumentFragment();
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = "Все бренды";
  frag.appendChild(all);

  for (const brand of brands) {
    const option = document.createElement("option");
    option.value = brand;
    option.textContent = brand;
    frag.appendChild(option);
  }

  el.brand.innerHTML = "";
  el.brand.appendChild(frag);
}

function productMatches(product) {
  const query = normalizeForSearch(state.query);
  if (query) {
    const haystack = normalizeForSearch(`${product.name} ${product.brand}`);
    if (!haystack.includes(query)) {
      return false;
    }
  }

  if (state.brand !== "all" && product.brand !== state.brand) {
    return false;
  }

  if (state.priceMin !== "" && product.priceMax < Number(state.priceMin)) {
    return false;
  }

  if (state.priceMax !== "" && product.priceMin > Number(state.priceMax)) {
    return false;
  }

  const sizeNeedle = normalizeForSearch(state.size);
  if (sizeNeedle) {
    const hasSize = product.offers.some((offer) => {
      const sizeLabel = normalizeForSearch(convertSize(offer.size, state.unit));
      return sizeLabel.includes(sizeNeedle);
    });

    if (!hasSize) {
      return false;
    }
  }

  return true;
}

function renderCatalog() {
  const filtered = state.products.filter(productMatches);
  el.catalog.innerHTML = "";

  el.stats.textContent = `Показано ${filtered.length} из ${state.products.length}`;

  if (filtered.length === 0) {
    el.empty.classList.remove("hidden");
    return;
  }

  el.empty.classList.add("hidden");

  const frag = document.createDocumentFragment();

  filtered.forEach((product, index) => {
    const card = document.createElement("article");
    card.className = "card";
    card.style.animationDelay = `${Math.min(index * 16, 220)}ms`;

    const sizesPreview = product.offers
      .slice(0, 4)
      .map((o) => convertSize(o.size, state.unit))
      .join(", ");

    card.innerHTML = `
      <div class="card-image-wrap">
        <img class="card-image" src="${product.imageUrl}" alt="${product.name}" loading="lazy">
      </div>
      <div class="card-body">
        <p class="card-brand">${product.brand}</p>
        <h3 class="card-name">${product.name}</h3>
        <p class="card-meta">Цена: <strong>${formatPrice(product.priceMin)}</strong> — ${formatPrice(product.priceMax)}</p>
        <p class="card-sizes">Размеры (${state.unit}): ${sizesPreview}${product.offers.length > 4 ? "…" : ""}</p>
        <a class="btn btn-primary card-link" href="./p/${product.slug}.html">Открыть карточку</a>
      </div>
    `;

    frag.appendChild(card);
  });

  el.catalog.appendChild(frag);
}

function setUnit(unit) {
  state.unit = unit;
  for (const btn of el.unitSwitch.querySelectorAll(".unit-btn")) {
    btn.classList.toggle("is-active", btn.dataset.unit === unit);
  }
  renderCatalog();
}

function bindEvents() {
  el.search.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderCatalog();
  });

  el.brand.addEventListener("change", (event) => {
    state.brand = event.target.value;
    renderCatalog();
  });

  el.size.addEventListener("input", (event) => {
    state.size = event.target.value;
    renderCatalog();
  });

  el.priceMin.addEventListener("input", (event) => {
    state.priceMin = event.target.value;
    renderCatalog();
  });

  el.priceMax.addEventListener("input", (event) => {
    state.priceMax = event.target.value;
    renderCatalog();
  });

  el.unitSwitch.addEventListener("click", (event) => {
    const target = event.target.closest("button[data-unit]");
    if (!target) {
      return;
    }
    setUnit(target.dataset.unit);
  });

  el.reset.addEventListener("click", () => {
    state.query = "";
    state.brand = "all";
    state.size = "";
    state.priceMin = "";
    state.priceMax = "";
    state.unit = "US";

    el.search.value = "";
    el.brand.value = "all";
    el.size.value = "";
    el.priceMin.value = "";
    el.priceMax.value = "";

    setUnit("US");
  });
}

async function init() {
  bindEvents();

  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Ошибка загрузки данных: ${response.status}`);
    }

    const payload = await response.json();
    state.products = payload.products || [];

    renderBrandOptions(state.products);
    renderCatalog();
  } catch (error) {
    el.stats.textContent = "Не удалось загрузить каталог. Проверь data/products.json.";
    el.catalog.innerHTML = "";
    el.empty.classList.add("hidden");
    console.error(error);
  }
}

init();
