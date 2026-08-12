const DATA_URL = "./data/shipping.json";
const MAX_SUGGESTIONS = 8;

// Выше 3 кг тарифной сетки нет. Продлеваем её шагом 0.5 кг по последней
// разнице (между 2.5 и 3 кг) и помечаем результат как ориентировочный.
const EXTRA_STEP_KG = 0.5;

const state = {
  data: null,
  city: null,
  mode: "door",
  weight: 1,
};

const el = {
  city: document.getElementById("city"),
  suggestions: document.getElementById("suggestions"),
  weight: document.getElementById("weight"),
  modeSwitch: document.getElementById("mode-switch"),
  result: document.getElementById("result"),
  status: document.getElementById("status"),
};

function formatRub(value) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

function priceFor(zone, mode, weightKg) {
  const table = state.data.tariffs[String(zone)]?.[mode];
  if (!table) {
    return null;
  }

  const steps = state.data.steps;
  const last = steps.length - 1;

  // Цена берётся по первой ступени, которая не меньше веса посылки.
  for (let i = 0; i < steps.length; i += 1) {
    if (weightKg <= steps[i]) {
      return { price: table[i], exact: true };
    }
  }

  const perStep = table[last] - table[last - 1];
  const extraSteps = Math.ceil((weightKg - steps[last]) / EXTRA_STEP_KG);
  return { price: table[last] + extraSteps * perStep, exact: false };
}

function renderSuggestions(query) {
  el.suggestions.innerHTML = "";
  const needle = normalize(query);

  if (needle.length < 2) {
    el.suggestions.hidden = true;
    return;
  }

  const starts = [];
  const contains = [];
  for (const row of state.data.cities) {
    const name = normalize(row[0]);
    if (name.startsWith(needle)) {
      starts.push(row);
    } else if (name.includes(needle)) {
      contains.push(row);
    }
    if (starts.length >= MAX_SUGGESTIONS) {
      break;
    }
  }

  const found = [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
  if (found.length === 0) {
    el.suggestions.hidden = true;
    return;
  }

  const frag = document.createDocumentFragment();
  for (const row of found) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "suggestion";
    const name = document.createElement("span");
    name.className = "suggestion-city";
    name.textContent = row[0];
    const region = document.createElement("span");
    region.className = "suggestion-region";
    region.textContent = row[1];
    item.append(name, region);
    item.addEventListener("click", () => selectCity(row));
    frag.appendChild(item);
  }

  el.suggestions.appendChild(frag);
  el.suggestions.hidden = false;
}

function selectCity(row) {
  state.city = row;
  el.city.value = row[0];
  el.suggestions.hidden = true;
  render();
}

function setMessage(text, kind = "hint") {
  el.result.innerHTML = "";
  const p = document.createElement("p");
  p.className = `result-message result-message--${kind}`;
  p.textContent = text;
  el.result.appendChild(p);
}

function render() {
  if (!state.data) {
    return;
  }

  if (!state.city) {
    const typed = el.city.value.trim();
    // Подсказки уже отрисованы к этому моменту: если список пуст, город
    // действительно не найден, и молчать об этом нельзя.
    if (typed.length >= 2 && el.suggestions.hidden) {
      setMessage(
        `Город «${typed}» не найден в списке СДЭК. Проверьте написание или ` +
          "напишите нам — уточним возможность доставки.",
        "blocked"
      );
      return;
    }
    setMessage("Начните вводить город — например, «Москва» или «Ново».");
    return;
  }

  const [city, region, zone] = state.city;

  if (zone === 0) {
    setMessage(
      `${city} (${region}): доставка из США в этот город недоступна. ` +
        "Напишите нам — подскажем варианты.",
      "blocked"
    );
    return;
  }

  const weight = Number(state.weight);
  if (!Number.isFinite(weight) || weight <= 0) {
    setMessage("Укажите вес посылки в килограммах.");
    return;
  }

  const result = priceFor(zone, state.mode, weight);
  if (!result) {
    setMessage("Не удалось подобрать тариф. Напишите нам, посчитаем вручную.", "blocked");
    return;
  }

  el.result.innerHTML = "";

  const sum = document.createElement("p");
  sum.className = "result-sum";
  sum.textContent = formatRub(result.price);

  const meta = document.createElement("p");
  meta.className = "result-meta";
  meta.textContent =
    `${city}, ${region} · зона ${zone} · ` +
    `${state.mode === "door" ? "до двери" : "до пункта выдачи"} · ` +
    `${weight.toLocaleString("ru-RU")} кг`;

  el.result.append(sum, meta);

  if (!result.exact) {
    const note = document.createElement("p");
    note.className = "result-note";
    note.textContent =
      "Свыше 3 кг тарифная сетка не опубликована — сумма посчитана по тренду " +
      "и является ориентировочной. Точную стоимость подтвердим при заказе.";
    el.result.appendChild(note);
  }
}

function bindEvents() {
  el.city.addEventListener("input", (event) => {
    state.city = null;
    renderSuggestions(event.target.value);
    render();
  });

  el.city.addEventListener("blur", () => {
    // Даём клику по подсказке отработать раньше, чем список скроется.
    setTimeout(() => {
      el.suggestions.hidden = true;
    }, 150);
  });

  el.weight.addEventListener("input", (event) => {
    state.weight = event.target.value;
    render();
  });

  el.modeSwitch.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (!button) {
      return;
    }
    state.mode = button.dataset.mode;
    for (const b of el.modeSwitch.querySelectorAll(".unit-btn")) {
      b.classList.toggle("is-active", b.dataset.mode === state.mode);
    }
    render();
  });
}

async function init() {
  bindEvents();

  try {
    const response = await fetch(DATA_URL, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`Ошибка загрузки тарифов: ${response.status}`);
    }
    state.data = await response.json();
    el.status.textContent =
      `Тарифы СДЭК (авиа) · ${state.data.cities.length} городов · ` +
      `обновлено ${state.data.generatedAt.slice(0, 10).split("-").reverse().join(".")}`;
    render();
  } catch (error) {
    el.status.textContent = "Не удалось загрузить тарифы.";
    setMessage("Тарифы временно недоступны. Напишите нам — посчитаем вручную.", "blocked");
    console.error(error);
  }
}

init();
