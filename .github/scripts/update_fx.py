"""Обновление курса USD -> RUB для карточек каталога.

Пишет `docs/fx.json`, который читает `docs/product.js`. Запускается по расписанию
из `.github/workflows/update-fx.yml`, так что курс на сайте не старше суток и при
этом не зависит от стороннего API в момент открытия страницы покупателем.

Источник — ЦБ РФ. Официальный эндпоинт отдаёт XML в windows-1251 с запятой в
качестве десятичного разделителя; если он недоступен с раннера, берётся
JSON-зеркало с теми же данными.
"""

from __future__ import annotations

import datetime
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
OUTPUT_FILE = ROOT / "docs" / "fx.json"

TIMEOUT_SECONDS = 30
USER_AGENT = "sneakers-catalog-fx/1.0"
CBR_XML_URL = "https://www.cbr.ru/scripts/XML_daily.asp"
CBR_JSON_URL = "https://www.cbr-xml-daily.ru/daily_json.js"

# Отсекает мусор вместо курса, если источник вдруг отдаст неожиданный формат.
MIN_PLAUSIBLE_RATE = 1.0
MAX_PLAUSIBLE_RATE = 10_000.0


def fetch_bytes(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        return response.read()


def from_cbr_xml() -> tuple[float, str]:
    root = ET.fromstring(fetch_bytes(CBR_XML_URL).decode("windows-1251"))
    rate_date = datetime.datetime.strptime(root.attrib["Date"], "%d.%m.%Y").date()

    for valute in root.findall("Valute"):
        if valute.findtext("CharCode") != "USD":
            continue
        value = float((valute.findtext("Value") or "").replace(",", "."))
        nominal = float((valute.findtext("Nominal") or "1").replace(",", "."))
        if nominal <= 0:
            raise ValueError("Некорректный Nominal в ответе ЦБ РФ.")
        return value / nominal, rate_date.isoformat()

    raise ValueError("USD не найден в ответе ЦБ РФ.")


def from_cbr_json() -> tuple[float, str]:
    payload = json.loads(fetch_bytes(CBR_JSON_URL).decode("utf-8"))
    usd = payload["Valute"]["USD"]
    nominal = float(usd["Nominal"])
    if nominal <= 0:
        raise ValueError("Некорректный Nominal в JSON-зеркале ЦБ РФ.")
    return float(usd["Value"]) / nominal, str(payload["Date"])[:10]


def resolve_rate() -> tuple[float, str, str]:
    errors: list[str] = []

    for label, source in (("cbr.ru", from_cbr_xml), ("cbr-xml-daily.ru", from_cbr_json)):
        try:
            rate, rate_date = source()
        except Exception as exc:
            errors.append(f"{label}: {exc}")
            print(f"WARN источник {label} недоступен: {exc}", flush=True)
            continue

        if not (MIN_PLAUSIBLE_RATE < rate < MAX_PLAUSIBLE_RATE):
            errors.append(f"{label}: неправдоподобный курс {rate}")
            print(f"WARN источник {label} отдал курс вне допустимых границ: {rate}", flush=True)
            continue

        return round(rate, 4), rate_date, label

    raise RuntimeError("Не удалось получить курс ни из одного источника:\n  " + "\n  ".join(errors))


def read_existing() -> dict:
    if not OUTPUT_FILE.exists():
        return {}
    try:
        return json.loads(OUTPUT_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def main() -> None:
    rate, rate_date, source = resolve_rate()
    existing = read_existing()

    # Файл переписывается только при реальном изменении, иначе воркфлоу плодил бы
    # ежедневные пустые коммиты с одним лишь обновлённым fetchedAt.
    if existing.get("rate") == rate and existing.get("rateDate") == rate_date:
        print(f"Курс не изменился: {rate} RUB/USD на {rate_date} — файл не переписан.")
        return

    payload = {
        "base": "USD",
        "quote": "RUB",
        "rate": rate,
        "rateDate": rate_date,
        "source": "ЦБ РФ",
        "sourceHost": source,
        "fetchedAt": datetime.datetime.now(datetime.UTC).isoformat(),
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Записан курс {rate} RUB/USD на {rate_date} (источник: {source}) -> {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
