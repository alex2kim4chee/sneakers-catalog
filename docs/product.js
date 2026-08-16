import { convertSize } from "./size-utils.js";

// Заказ оформляется через бота, а не в личном чате: он сам знает цену,
// себестоимость и наличие по offer.id и не доверяет тому, что пришло со страницы.
const BOT_USERNAME = "usdirect_bot";
const CATALOG_ID = "kicks";
const FX_URL = "../fx.json";

const dataNode = document.getElementById("product-data");
const product = JSON.parse(dataNode.textContent || "{}");

const state = {
  unit: "US",
  selected: null,
  fx: null,
  fxStatus: "loading",
};

const el = {
  unitSwitch: document.getElementById("unit-switch"),
  sizesList: document.getElementById("sizes-list"),
  selectionSize: document.getElementById("selection-size"),
  selectionPrice: document.getElementById("selection-price"),
  selectionPriceRub: document.getElementById("selection-price-rub"),
  fxNote: document.getElementById("fx-note"),
  ctaOrder: document.getElementById("cta-order"),
};

function formatPrice(value, currency = "USD") {
  const rounded = Math.round(value);
  if (currency === "USD") {
    return `$${rounded}`;
  }
  return `${rounded} ${currency}`;
}

function formatRub(value) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function formatRate(rate) {
  return rate.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatRateDate(isoDate) {
  const parts = String(isoDate || "").split("-");
  if (parts.length !== 3) {
    return "";
  }
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

// Курс применим только к долларовым ценам — другую валюту молча пересчитывать нельзя.
function rubPrice(offer) {
  if (!state.fx || !offer || offer.currency !== "USD") {
    return null;
  }
  return offer.price * state.fx.rate;
}

function describeRate() {
  const date = formatRateDate(state.fx.rateDate);
  const suffix = date ? ` на ${date}` : "";
  return `по курсу ЦБ ${formatRate(state.fx.rate)} ₽/$${suffix}`;
}

// Payload вида p_kicks_4821 — бот сам подтягивает товар, цену и наличие
// из своего кэша по catalogId+offerId, ничего кроме id со страницы не передаётся.
function updateContactLinks() {
  if (!state.selected) {
    el.ctaOrder.href = `https://t.me/${BOT_USERNAME}`;
    return;
  }

  el.ctaOrder.href = `https://t.me/${BOT_USERNAME}?start=p_${CATALOG_ID}_${state.selected.id}`;
}

function updateRubView() {
  const rub = rubPrice(state.selected);

  if (rub !== null) {
    el.selectionPriceRub.textContent = formatRub(rub);
    el.fxNote.textContent = `${describeRate()}, ориентировочно`;
    return;
  }

  el.selectionPriceRub.textContent = "—";
  if (state.fxStatus === "loading") {
    el.fxNote.textContent = "курс загружается…";
  } else if (state.fxStatus === "failed") {
    el.fxNote.textContent = "курс недоступен";
  } else {
    el.fxNote.textContent = "";
  }
}

function updateSelectionView() {
  if (!state.selected) {
    el.selectionSize.textContent = "—";
    el.selectionPrice.textContent = "—";
    updateRubView();
    updateContactLinks();
    return;
  }

  const label = convertSize(state.selected.size, state.unit);
  el.selectionSize.textContent = `${label} (${state.unit})`;
  el.selectionPrice.textContent = formatPrice(
    state.selected.price,
    state.selected.currency
  );

  updateRubView();
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

    if (state.selected && state.selected.id === offer.id) {
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

// `fx.json` обновляется отдельным ежедневным воркфлоу, поэтому лежит на своём же
// домене: сторонний API в момент открытия страницы не дёргается.
async function loadFxRate() {
  try {
    const response = await fetch(FX_URL, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`Не удалось загрузить курс: ${response.status}`);
    }

    const payload = await response.json();
    const rate = Number(payload.rate);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`Некорректный курс в ${FX_URL}: ${payload.rate}`);
    }

    state.fx = { rate, rateDate: String(payload.rateDate || "") };
    state.fxStatus = "ready";
  } catch (error) {
    state.fx = null;
    state.fxStatus = "failed";
    console.error(error);
  }

  updateSelectionView();
}

function init() {
  bindEvents();
  state.selected = pickDefaultSelection();
  renderSizes();
  updateSelectionView();
  // Без await: карточка отрисовывается сразу, рублёвая строка догружается следом.
  loadFxRate();
}

init();
