import { convertSize } from "./size-utils.js";

const TELEGRAM_USERNAME = "alex_kim_chi";
const WHATSAPP_PHONE = "16463226000";

const dataNode = document.getElementById("product-data");
const product = JSON.parse(dataNode.textContent || "{}");

const state = {
  unit: "US",
  selected: null,
};

const el = {
  unitSwitch: document.getElementById("unit-switch"),
  sizesList: document.getElementById("sizes-list"),
  selectionSize: document.getElementById("selection-size"),
  selectionPrice: document.getElementById("selection-price"),
  ctaTelegram: document.getElementById("cta-telegram"),
  ctaWhatsapp: document.getElementById("cta-whatsapp"),
};

function formatPrice(value, currency = "USD") {
  const rounded = Math.round(value);
  if (currency === "USD") {
    return `$${rounded}`;
  }
  return `${rounded} ${currency}`;
}

function getCurrentPageUrl() {
  return window.location.href;
}

function buildInquiryText() {
  if (!state.selected) {
    return `Здравствуйте! Интересует модель ${product.name}.`;
  }

  const displaySize = convertSize(state.selected.size, state.unit);
  const price = formatPrice(state.selected.price, state.selected.currency);

  return [
    "Здравствуйте! Хочу заказать:",
    `${product.name}`,
    `Размер: ${displaySize} (${state.unit})`,
    `Цена: ${price}`,
    `Ссылка: ${getCurrentPageUrl()}`,
  ].join("\n");
}

function updateContactLinks() {
  const text = buildInquiryText();
  const encoded = encodeURIComponent(text);

  el.ctaTelegram.href = `https://t.me/${TELEGRAM_USERNAME}?text=${encoded}`;
  el.ctaWhatsapp.href = `https://wa.me/${WHATSAPP_PHONE}?text=${encoded}`;
}

function updateSelectionView() {
  if (!state.selected) {
    el.selectionSize.textContent = "—";
    el.selectionPrice.textContent = "—";
    updateContactLinks();
    return;
  }

  const label = convertSize(state.selected.size, state.unit);
  el.selectionSize.textContent = `${label} (${state.unit})`;
  el.selectionPrice.textContent = formatPrice(
    state.selected.price,
    state.selected.currency
  );

  updateContactLinks();
}

function renderSizes() {
  el.sizesList.innerHTML = "";

  if (!product.offers || product.offers.length === 0) {
    el.sizesList.textContent = "Нет доступных размеров.";
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const offer of product.offers) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "size-btn";

    if (
      state.selected &&
      state.selected.size === offer.size &&
      state.selected.price === offer.price
    ) {
      btn.classList.add("is-selected");
    }

    const sizeLabel = convertSize(offer.size, state.unit);
    btn.innerHTML = `
      <div class="size-main">${sizeLabel}</div>
      <div class="size-price">${formatPrice(offer.price, offer.currency)}</div>
    `;

    btn.addEventListener("click", () => {
      state.selected = offer;
      renderSizes();
      updateSelectionView();
    });

    fragment.appendChild(btn);
  }

  el.sizesList.appendChild(fragment);
}

function setUnit(unit) {
  state.unit = unit;
  for (const btn of el.unitSwitch.querySelectorAll(".unit-btn")) {
    btn.classList.toggle("is-active", btn.dataset.unit === unit);
  }
  renderSizes();
  updateSelectionView();
}

function pickDefaultSelection() {
  if (!product.offers || product.offers.length === 0) {
    return null;
  }

  let best = product.offers[0];
  for (const offer of product.offers) {
    if (offer.price < best.price) {
      best = offer;
    }
  }
  return best;
}

function bindEvents() {
  el.unitSwitch.addEventListener("click", (event) => {
    const target = event.target.closest("button[data-unit]");
    if (!target) {
      return;
    }
    setUnit(target.dataset.unit);
  });
}

function init() {
  bindEvents();
  state.selected = pickDefaultSelection();
  renderSizes();
  updateSelectionView();
}

init();
