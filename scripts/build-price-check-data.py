"""Rebuild the Price Check: Then & Now dataset from its public sources.

    python scripts/build-price-check-data.py

Writes frontend/src/utils/studio/price-check/data.ts. Every price in that file
comes from one of four published U.S. sources, and nothing is estimated:

* BLS Average Price Data (U.S. city average), read from FRED's CSV mirror of
  the official series. The annual figure is the mean of the twelve monthly
  averages, and a year missing any month is left out.
* EIA Annual Energy Review 2011, Table 5.24: annual average retail price of
  regular gasoline (leaded to 1975, unleaded from 1976).
* NATO (National Association of Theatre Owners, now Cinema United): annual
  average U.S. movie ticket price. Transcribed below; 1989 is left out because
  the association marks it as a break in method.
* USPS Historian, "Rates for Domestic Letters Since 1863" (September 2021):
  first-class postage for the first ounce. Transcribed below. A year counts
  only when one rate held for at least 350 days of it.

Prices are nominal (what people paid at the time), never adjusted for
inflation. Standard library only, so the script runs anywhere Python does.
"""

from __future__ import annotations

import csv
import datetime as dt
import html
import io
import re
import urllib.request
from pathlib import Path

FIRST_YEAR = 1950
LAST_YEAR = 2000

OUT = Path(__file__).resolve().parents[1] / "frontend/src/utils/studio/price-check/data.ts"

FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={id}"
EIA_TABLE = "https://www.eia.gov/totalenergy/data/annual/showtext.php?t=ptb0524"
NATO_URL = "https://www.natoonline.org/data/ticket-price/"
USPS_URL = "https://about.usps.com/who-we-are/postal-history/domestic-letter-rates-since-1863.pdf"

# key, family, BLS series, item phrase, answer unit, source title
BLS_SERIES = [
    ("white-bread", "bread", "APU0000702111", "a pound of white bread", "a pound", "Bread, white, pan, per lb."),
    ("eggs", "eggs", "APU0000708111", "a dozen large eggs", "a dozen", "Eggs, grade A, large, per doz."),
    ("milk-half-gallon", "milk", "APU0000709111", "a half-gallon of whole milk", "a half-gallon", "Milk, fresh, whole, fortified, per 1/2 gal."),
    ("milk-gallon", "milk", "APU0000709112", "a gallon of whole milk", "a gallon", "Milk, fresh, whole, fortified, per gal."),
    ("ground-coffee", "coffee", "APU0000717311", "a pound of ground coffee", "a pound", "Coffee, 100%, ground roast, all sizes, per lb."),
    ("ground-beef", "beef", "APU0000703112", "a pound of ground beef", "a pound", "Ground beef, 100% beef, per lb."),
    ("bananas", "bananas", "APU0000711211", "a pound of bananas", "a pound", "Bananas, per lb."),
    ("sugar", "sugar", "APU0000715211", "a pound of white sugar", "a pound", "Sugar, white, all sizes, per lb."),
    ("flour", "flour", "APU0000701111", "a pound of all-purpose flour", "a pound", "Flour, white, all purpose, per lb."),
    ("bacon", "bacon", "APU0000704111", "a pound of sliced bacon", "a pound", "Bacon, sliced, per lb."),
    ("whole-chicken", "chicken", "APU0000706111", "a pound of whole fresh chicken", "a pound", "Chicken, fresh, whole, per lb."),
    ("ice-cream", "ice-cream", "APU0000710411", "a half-gallon of ice cream", "a half-gallon", "Ice cream, prepackaged, bulk, regular, per 1/2 gal."),
    ("american-cheese", "cheese", "APU0000710211", "a pound of American cheese", "a pound", "American processed cheese, per lb."),
    ("apples", "apples", "APU0000711111", "a pound of Red Delicious apples", "a pound", "Apples, Red Delicious, per lb."),
    ("tomatoes", "tomatoes", "APU0000712311", "a pound of fresh tomatoes", "a pound", "Tomatoes, field grown, per lb."),
]

# NATO annual average ticket price, in cents. 1989 omitted (marked as a method break).
NATO_TICKETS = {
    1954: 49, 1958: 68, 1963: 86, 1967: 122, 1971: 165, 1974: 189, 1975: 203,
    1976: 213, 1977: 223, 1978: 234, 1979: 247, 1980: 269, 1981: 278, 1982: 294,
    1983: 315, 1984: 336, 1985: 355, 1986: 371, 1987: 391, 1988: 411, 1990: 422,
    1991: 421, 1992: 415, 1993: 414, 1994: 408, 1995: 435, 1996: 442, 1997: 459,
    1998: 469, 1999: 506, 2000: 539,
}

# USPS first-class letter rate, first ounce: (effective date, cents).
USPS_RATES = [
    (dt.date(1932, 7, 6), 3), (dt.date(1958, 8, 1), 4), (dt.date(1963, 1, 7), 5),
    (dt.date(1968, 1, 7), 6), (dt.date(1971, 5, 16), 8), (dt.date(1974, 3, 2), 10),
    (dt.date(1975, 12, 31), 13), (dt.date(1978, 5, 29), 15), (dt.date(1981, 3, 22), 18),
    (dt.date(1981, 11, 1), 20), (dt.date(1985, 2, 17), 22), (dt.date(1988, 4, 3), 25),
    (dt.date(1991, 2, 3), 29), (dt.date(1995, 1, 1), 32), (dt.date(1999, 1, 10), 33),
    (dt.date(2001, 1, 7), 34),
]
USPS_MIN_DAYS = 350


def fetch(url: str, attempts: int = 4) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "curl/8.0 price-check-data"})
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=90) as res:
                return res.read().decode("utf-8", errors="replace")
        except OSError:
            if attempt == attempts - 1:
                raise
    raise AssertionError("unreachable")


def cents(dollars: float) -> int:
    # Half-up, not Python's banker's rounding: 0.625 prints as 63¢ like a shop would.
    return int(dollars * 100 + 0.5 + 1e-9)


def bls_annual(series_id: str) -> dict[int, int]:
    months: dict[int, list[float]] = {}
    for row in csv.DictReader(io.StringIO(fetch(FRED_CSV.format(id=series_id)))):
        value = row.get(series_id, "").strip()
        if not value or value == ".":
            continue
        year = int(row["observation_date"][:4])
        months.setdefault(year, []).append(float(value))
    return {
        year: cents(sum(values) / 12)
        for year, values in months.items()
        if len(values) == 12 and FIRST_YEAR <= year <= LAST_YEAR
    }


def eia_gasoline() -> tuple[dict[int, int], dict[int, int]]:
    """Leaded regular (to 1975) and unleaded regular (from 1976), nominal $/gal."""
    leaded: dict[int, int] = {}
    unleaded: dict[int, int] = {}
    for row in re.findall(r"<tr.*?</tr>", fetch(EIA_TABLE), re.S):
        cells = [
            re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]*>", "", c))).strip()
            for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)
        ]
        if not cells or not re.fullmatch(r"(19|20)\d\d", cells[0]):
            continue
        year = int(cells[0])
        # Columns: year | leaded nominal | leaded real | unleaded nominal | ...
        # A leading "R" (revised) or footnote digit is not part of the price.
        def price(cell: str) -> float | None:
            match = re.search(r"(\d*\.\d+)$", cell)
            return float(match.group(1)) if match else None

        lead, unlead = price(cells[1]), price(cells[3])
        if FIRST_YEAR <= year <= 1975 and lead:
            leaded[year] = cents(lead)
        if 1976 <= year <= LAST_YEAR and unlead:
            unleaded[year] = cents(unlead)
    return leaded, unleaded


def usps_stamps() -> dict[int, int]:
    out: dict[int, int] = {}
    for year in range(FIRST_YEAR, LAST_YEAR + 1):
        days: dict[int, int] = {}
        day = dt.date(year, 1, 1)
        while day.year == year:
            rate = [c for start, c in USPS_RATES if start <= day][-1]
            days[rate] = days.get(rate, 0) + 1
            day += dt.timedelta(days=1)
        rate, held = max(days.items(), key=lambda kv: kv[1])
        if held >= USPS_MIN_DAYS:
            out[year] = rate
    return out


def series_block(
    key: str,
    family: str,
    item: str,
    unit: str,
    basis: str,
    source: str,
    prices: dict[int, int],
) -> str:
    body = ", ".join(f"{year}: {c}" for year, c in sorted(prices.items()))
    return (
        "  {\n"
        f"    key: '{key}',\n"
        f"    family: '{family}',\n"
        f"    item: '{item}',\n"
        f"    unit: '{unit}',\n"
        f"    basis: '{basis}',\n"
        f"    source: '{source}',\n"
        f"    cents: {{ {body} }},\n"
        "  },\n"
    )


def main() -> None:
    blocks: list[str] = []
    leaded, unleaded = eia_gasoline()
    blocks.append(series_block(
        "gasoline-regular", "gasoline", "a gallon of regular gasoline", "a gallon", "average",
        "EIA Annual Energy Review, Table 5.24 (leaded regular, annual average)", leaded,
    ))
    blocks.append(series_block(
        "gasoline-unleaded", "gasoline", "a gallon of regular unleaded gasoline", "a gallon", "average",
        "EIA Annual Energy Review, Table 5.24 (unleaded regular, annual average)", unleaded,
    ))
    blocks.append(series_block(
        "movie-ticket", "movie", "a movie ticket", "a ticket", "average",
        "NATO annual average U.S. ticket price", NATO_TICKETS,
    ))
    blocks.append(series_block(
        "first-class-stamp", "stamp", "a first-class stamp", "a stamp", "official",
        "USPS Historian, Rates for Domestic Letters Since 1863", usps_stamps(),
    ))
    for key, family, series_id, item, unit, title in BLS_SERIES:
        prices = bls_annual(series_id)
        if not prices:
            raise SystemExit(f"No complete years for {series_id}")
        blocks.append(series_block(
            key, family, item, unit, "average",
            f"BLS Average Price Data {series_id}: {title}", prices,
        ))

    OUT.write_text(
        "/* eslint-disable */\n"
        "// GENERATED by scripts/build-price-check-data.py — do not edit by hand.\n"
        f"// Sources: FRED/BLS, {EIA_TABLE}, {NATO_URL}, {USPS_URL}\n"
        f"// Built {dt.date.today().isoformat()}. U.S. prices in nominal cents, {FIRST_YEAR}–{LAST_YEAR}.\n\n"
        "import type { PriceSeries } from './content'\n\n"
        "export const PRICE_SERIES: readonly PriceSeries[] = [\n"
        + "".join(blocks)
        + "]\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUT} ({len(blocks)} series)")


if __name__ == "__main__":
    main()
