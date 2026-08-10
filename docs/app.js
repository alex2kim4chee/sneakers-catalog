import { convertSize, normalizeForSearch } from "./size-utils.js";

const DATA_URL = "./data/products.json";
// Размер порции подобран так, чтобы первый экран заполнялся с запасом
// на широком мониторе, но страница не вырастала на сотни экранов.
const PAGE_SIZE = 60;

const state = {
  products: [],
  unit: "US",
  query: "",
  brand: "all",
  size: "",
  priceMin: "",
  priceMax: "",
  sort: "default",
  filtered: [],
  rendered: 0,
};

const el = {
  search: document.getElementById("search"),
  brand: document.getElementById("brand"),
  size: document.getElementById("size"),
  priceMin: document.getElementById("price-min"),
  priceMax: document.getElementById("price-max"),
  sort: document.getElementById("sort"),
  unitSwitch: document.getElementById("unit-switch"),
  catalog: document.getElementById("catalog"),
  stats: document.getElementById("stats"),
  reset: document.getElementById("reset"),
  empty: document.getElementById("empty"),
  openContact: document.getElementById("open-contact"),
  closeContact: document.getElementById("close-contact"),
  contactDialog: document.getElementById("contact-dialog"),
  sentinel: null,
};

// rootMargin даёт фору: следующая порция готовится до того, как покупатель
// доскроллит до конца, поэтому подгрузка не бросается в глаза.
const observer = new IntersectionObserver(
  (entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      appendBatch();
    }
  },
  { rootMargin: "600px 0px" }
);

function createSentinel() {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "load-more";
  node.hidden = true;
  // Клик — запасной путь: если наблюдатель почему-то не сработает, покупатель
  // всё равно сможет открыть следующую порцию.
  node.addEventListener("click", () => appendBatch());
  el.catalog.insertAdjacentElement("afterend", node);
  return node;
}

// Наблюдатель — основной механизм, но полагаться только на него нельзя:
// в части окружений он не срабатывает. Прокрутка страхует его напрямую.
function sentinelIsNear() {
  if (!el.sentinel || el.sentinel.hidden) {
    return false;
  }
  return el.sentinel.getBoundingClientRect().top <= window.innerHeight + 600;
}

function maybeLoadMore() {
  let guard = 0;
  while (sentinelIsNear() && state.rendered < state.filtered.length && guard < 5) {
    appendBatch();
    guard += 1;
  }
}

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

function sortProducts(products) {
  const sorted = [...products];

  if (state.sort === "price-asc") {
    sorted.sort((a, b) => a.priceMin - b.priceMin || a.priceMax - b.priceMax);
    return sorted;
  }

  if (state.sort === "price-desc") {
    sorted.sort((a, b) => b.priceMin - a.priceMin || b.priceMax - a.priceMax);
    return sorted;
  }

  sorted.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return sorted;
}

function buildCard(product, indexInBatch) {
  const card = document.createElement("article");
  card.className = "card";
  card.style.animationDelay = `${Math.min(indexInBatch * 16, 220)}ms`;

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
      <a class="btn btn-primary card-link" href="./p/${product.slug}.html">ВЫБРАТЬ РАЗМЕР</a>
    </div>
  `;

  return card;
}

// Рисуем каталог порциями. Раньше в DOM попадали все карточки сразу: страница
// вырастала на сотни экранов, и браузер начинал грузить сотни картинок далеко
// за пределами вьюпорта, хотя `loading="lazy"` формально стоял.
function appendBatch() {
  if (state.rendered >= state.filtered.length) {
    return;
  }

  const batch = state.filtered.slice(state.rendered, state.rendered + PAGE_SIZE);
  const frag = document.createDocumentFragment();
  batch.forEach((product, index) => frag.appendChild(buildCard(product, index)));

  el.catalog.appendChild(frag);
  state.rendered += batch.length;
  updateSentinel();
}

function updateSentinel() {
  const more = state.filtered.length - state.rendered;
  if (more <= 0) {
    el.sentinel.hidden = true;
    observer.unobserve(el.sentinel);
    return;
  }

  el.sentinel.hidden = false;
  el.sentinel.textContent = `Показать ещё — осталось ${more}`;
  observer.observe(el.sentinel);
}

function renderCatalog() {
  state.filtered = sortProducts(state.products.filter(productMatches));
  state.rendered = 0;
  el.catalog.innerHTML = "";

  el.stats.textContent = `Показано ${state.filtered.length} из ${state.products.length}`;

  if (state.filtered.length === 0) {
    el.empty.classList.remove("hidden");
    el.sentinel.hidden = true;
    return;
  }

  el.empty.classList.add("hidden");
  appendBatch();
  maybeLoadMore();
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

  el.sort.addEventListener("change", (event) => {
    state.sort = event.target.value;
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
    state.sort = "default";
    state.unit = "US";

    el.search.value = "";
    el.brand.value = "all";
    el.size.value = "";
    el.priceMin.value = "";
    el.priceMax.value = "";
    el.sort.value = "default";

    setUnit("US");
  });
}

function bindContactDialog() {
  if (!el.openContact || !el.contactDialog || !el.closeContact) {
    return;
  }

  el.openContact.addEventListener("click", () => {
    el.contactDialog.showModal();
  });

  el.closeContact.addEventListener("click", () => {
    el.contactDialog.close();
  });

  el.contactDialog.addEventListener("click", (event) => {
    const rect = el.contactDialog.getBoundingClientRect();
    const clickedInside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;

    if (!clickedInside) {
      el.contactDialog.close();
    }
  });
}

async function init() {
  el.sentinel = createSentinel();
  window.addEventListener("scroll", maybeLoadMore, { passive: true });
  window.addEventListener("resize", maybeLoadMore, { passive: true });
  bindEvents();
  bindContactDialog();

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
