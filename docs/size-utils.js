const SIZE_RE = /^\s*(\d+(?:\.\d+)?)\s*([A-Za-z ]*)\s*$/;

// StockX sizing references (US -> EU/CM), aggregated from StockX men/women charts.
const MEN_TABLE = [
  [3.5, 35.5, 21.6],
  [4, 36, 22.0],
  [4.5, 36.5, 22.4],
  [5, 37.5, 22.9],
  [5.5, 38, 23.3],
  [6, 38.5, 23.7],
  [6.5, 39, 24.1],
  [7, 40, 24.5],
  [7.5, 40.5, 25.0],
  [8, 41, 25.4],
  [8.5, 42, 25.8],
  [9, 42.5, 26.2],
  [9.5, 43, 26.7],
  [10, 44, 27.1],
  [10.5, 44.5, 27.5],
  [11, 45, 27.9],
  [11.5, 45.5, 28.3],
  [12, 46, 28.8],
  [12.5, 47, 29.2],
  [13, 47.5, 29.6],
  [13.5, 48, 30.0],
  [14, 48.5, 30.5],
  [15, 49.5, 31.3],
  [16, 50.5, 32.3],
  [17, 51.5, 33.0],
  [18, 52.5, 33.9],
];

const WOMEN_TABLE = [
  [5, 35.5, 22.0],
  [5.5, 36, 22.4],
  [6, 36.5, 22.9],
  [6.5, 37.5, 23.3],
  [7, 38, 23.7],
  [7.5, 38.5, 24.1],
  [8, 39, 24.5],
  [8.5, 40, 25.0],
  [9, 40.5, 25.4],
  [9.5, 41, 25.8],
  [10, 42, 26.2],
  [10.5, 42.5, 26.7],
  [11, 43, 27.1],
  [11.5, 44, 27.5],
  [12, 44.5, 27.9],
];

const EU_CM_TABLE = MEN_TABLE.map(([, eu, cm]) => [eu, cm]).sort(
  (a, b) => a[0] - b[0]
);

function normalizeSuffix(suffix) {
  return (suffix || "").trim().toLowerCase().replace(/\s+/g, "");
}

function classifySuffix(suffix) {
  if (suffix === "w") {
    return "women";
  }
  if (suffix === "y") {
    return "youth";
  }
  if (suffix === "wide") {
    return "wide";
  }
  return "regular";
}

export function parseSize(rawSize) {
  const raw = String(rawSize || "").trim();
  const m = raw.match(SIZE_RE);
  if (!m) {
    return { raw, valid: false, num: null, suffix: "" };
  }
  return {
    raw,
    valid: true,
    num: Number(m[1]),
    suffix: normalizeSuffix(m[2]),
  };
}

function isEuLike(parsed) {
  return parsed.valid && parsed.num >= 30 && parsed.suffix === "";
}

function formatRu(value) {
  const rounded = Math.round(value * 2) / 2;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatCm(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}.0` : rounded.toFixed(1);
}

function interpolate(x, points) {
  if (points.length === 0) {
    return null;
  }
  if (points.length === 1) {
    return points[0][1];
  }

  if (x <= points[0][0]) {
    const [x1, y1] = points[0];
    const [x2, y2] = points[1];
    const slope = (y2 - y1) / (x2 - x1);
    return y1 + (x - x1) * slope;
  }

  const last = points.length - 1;
  if (x >= points[last][0]) {
    const [x1, y1] = points[last - 1];
    const [x2, y2] = points[last];
    const slope = (y2 - y1) / (x2 - x1);
    return y2 + (x - x2) * slope;
  }

  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    if (x >= x1 && x <= x2) {
      const t = (x - x1) / (x2 - x1);
      return y1 + (y2 - y1) * t;
    }
  }

  return null;
}

function getSizingRecord(us, suffixClass) {
  const table = suffixClass === "women" ? WOMEN_TABLE : MEN_TABLE;

  for (const [size, eu, cm] of table) {
    if (size === us) {
      return { eu, cm };
    }
  }

  const eu = interpolate(
    us,
    table.map(([size, value]) => [size, value])
  );
  const cm = interpolate(
    us,
    table.map(([size, , value]) => [size, value])
  );

  if (eu == null || cm == null) {
    return null;
  }
  return { eu, cm };
}

function appendSuffix(label, suffixClass) {
  if (suffixClass === "wide") {
    return `${label} Wide`;
  }
  if (suffixClass === "youth") {
    return `${label} Y`;
  }
  return label;
}

export function convertSize(rawSize, unit) {
  const parsed = parseSize(rawSize);
  if (!parsed.valid) {
    return rawSize;
  }

  if (unit === "US") {
    return parsed.raw;
  }

  if (isEuLike(parsed)) {
    if (unit === "RU") {
      return formatRu(parsed.num);
    }
    if (unit === "CM") {
      const cm = interpolate(parsed.num, EU_CM_TABLE);
      return cm == null ? parsed.raw : formatCm(cm);
    }
  }

  const suffixClass = classifySuffix(parsed.suffix);
  const sizing = getSizingRecord(parsed.num, suffixClass);

  if (!sizing) {
    return parsed.raw;
  }

  if (unit === "RU") {
    return appendSuffix(formatRu(sizing.eu), suffixClass);
  }

  if (unit === "CM") {
    return appendSuffix(formatCm(sizing.cm), suffixClass);
  }

  return parsed.raw;
}

export function normalizeForSearch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
