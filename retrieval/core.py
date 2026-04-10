# -*- coding: utf-8 -*-
import os
import requests
import csv
import time
import re
import unicodedata
from collections import Counter

# ─────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────

YOUR_EMAIL = "augustocristian@uniovi.es"

DATE_FROM = "2025-04-01"
DATE_TO   = "2026-03-19"

# Keywords that disqualify a paper when found in its Keywords field.
EXCLUDE_KEYWORDS = [
    "test (biology)",
]

BIBTEX_DELAY = 0.5  # seconds between CrossRef requests

TEST_QUERY = (
    "test OR tests OR testing OR tested OR testcase OR testcases OR tester"
)

LLM_QUERY = (
    "LLM OR LLMs "
    "OR \"large language model\" OR \"large language models\" "
    "OR \"generative AI\" OR \"generative artificial intelligence\" "
    "OR GPT OR Claude OR Gemini OR PanGu OR Codex OR Codestral "
    "OR DeepSeek OR Qwen OR StarCoder OR Llama"
)

# ─────────────────────────────────────────────
# PUBLISHER CLASSIFICATION BY DOI PREFIX
# ─────────────────────────────────────────────

DOI_RULES = [
    ("IEEE",     ["10.1109/"]),
    ("ACM",      ["10.1145/"]),
    ("Springer", ["10.1007/", "10.1038/", "10.1186/"]),
    ("Elsevier", ["10.1016/"]),
]

SOURCE_PRIORITY = {
    "IEEE":     1,
    "ACM":      2,
    "Springer": 3,
    "Elsevier": 4,
}

def classify_paper(doi: str, source_url: str) -> str | None:
    doi_lower = (doi or "").lower().strip()
    if doi_lower.startswith("https://doi.org/"):
        doi_lower = doi_lower[len("https://doi.org/"):]
    for label, prefixes in DOI_RULES:
        for prefix in prefixes:
            if doi_lower.startswith(prefix):
                return label
    if "arxiv.org" in (source_url or "").lower():
        return "ArXiv"
    return None

# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def reconstruct_abstract(inverted_index):
    if not inverted_index:
        return ""
    word_index = []
    for word, positions in inverted_index.items():
        for pos in positions:
            word_index.append((pos, word))
    word_index.sort()
    return " ".join(word for _, word in word_index)


def build_filter_conditions(test_query: str, llm_query: str) -> str:
    f = "title_and_abstract.search"
    return f"{f}:{test_query},{f}:{llm_query}"


# ─────────────────────────────────────────────
# BIBTEX RETRIEVAL via DOI content negotiation
# ─────────────────────────────────────────────

def normalise_doi(doi: str) -> str:
    doi = (doi or "").strip()
    for prefix in ("https://doi.org/", "http://doi.org/", "doi:"):
        if doi.lower().startswith(prefix):
            doi = doi[len(prefix):]
            break
    return doi


def fetch_bibtex(doi: str) -> str:
    bare = normalise_doi(doi)
    if not bare:
        return ""
    url = f"https://doi.org/{bare}"
    headers = {
        "Accept":     "application/x-bibtex",
        "User-Agent": f"research-fetcher/1.0 (mailto:{YOUR_EMAIL})",
    }
    try:
        resp = requests.get(url, headers=headers, timeout=20, allow_redirects=True)
        if resp.status_code == 200 and resp.text.strip().startswith("@"):
            return resp.text.strip()
    except requests.RequestException:
        pass
    return ""


def fetch_all_bibtex(papers: list[dict]) -> None:
    total = len(papers)
    hits  = 0
    print(f"\n Fetching BibTeX via DOI content negotiation for {total} papers...")
    for i, paper in enumerate(papers, start=1):
        doi = paper.get("DOI", "")
        if doi:
            bib = fetch_bibtex(doi)
            paper["BibTeX"] = bib
            if bib:
                hits += 1
        else:
            paper["BibTeX"] = ""

        if i % 50 == 0 or i == total:
            print(f"  {i}/{total} processed — {hits} BibTeX entries retrieved so far")

        time.sleep(BIBTEX_DELAY)

    print(f" BibTeX retrieval complete: {hits}/{total} entries found")


# ─────────────────────────────────────────────
# KEYWORD FILTER (on OpenAlex keywords field)
# ─────────────────────────────────────────────

def _build_pattern(query: str) -> re.Pattern:
    terms    = [t.strip().strip('"') for t in re.split(r'\bOR\b', query) if t.strip()]
    combined = "|".join(r"\b" + re.escape(t) + r"\b" for t in terms if t)
    return re.compile(combined, re.IGNORECASE)

_TEST_PATTERN    = _build_pattern(TEST_QUERY)
_EXCLUDE_PATTERN = (
    re.compile("|".join(re.escape(kw) for kw in EXCLUDE_KEYWORDS), re.IGNORECASE)
    if EXCLUDE_KEYWORDS else None
)

def matches_keyword_filter(paper: dict) -> bool:
    keywords = paper.get("Keywords") or ""
    if _EXCLUDE_PATTERN and _EXCLUDE_PATTERN.search(keywords):
        return False
    return bool(_TEST_PATTERN.search(keywords))


def apply_keyword_filter(papers: list[dict]) -> list[dict]:
    before      = len(papers)
    no_keywords = sum(1 for p in papers if not (p.get("Keywords") or "").strip())
    kept        = [p for p in papers if matches_keyword_filter(p)]
    print(f" Keyword filter (keywords) removed {before - len(kept)} papers "
          f"({len(kept)} remaining) — TEST_QUERY terms required")
    print(f"   [{no_keywords}/{before} papers had empty OpenAlex keywords]")
    return kept


# ─────────────────────────────────────────────
# DEDUPLICATION
# ─────────────────────────────────────────────

FUZZY_THRESHOLD = 0.85

def normalize_title(title):
    if not title:
        return ""
    nfkd    = unicodedata.normalize("NFKD", title)
    ascii_t = "".join(c for c in nfkd if not unicodedata.combining(c))
    cleaned = re.sub(r"[^a-z0-9\s]", "", ascii_t.lower())
    return re.sub(r"\s+", " ", cleaned).strip()

def title_similarity(t1, t2):
    def bigrams(text):
        words = text.split()
        return set(zip(words, words[1:])) if len(words) > 1 else set(words)
    b1, b2 = bigrams(t1), bigrams(t2)
    if not b1 and not b2: return 1.0
    if not b1 or  not b2: return 0.0
    return len(b1 & b2) / len(b1 | b2)

def deduplicate(papers):
    doi_index, title_index, kept = {}, {}, []

    def preferred(a, b):
        pa = SOURCE_PRIORITY.get(a["Database"].split(",")[0], 99)
        pb = SOURCE_PRIORITY.get(b["Database"].split(",")[0], 99)
        return a if pa <= pb else b

    def merge_db(winner, loser):
        existing = winner["Database"].split(",")
        for db in loser["Database"].split(","):
            if db not in existing:
                winner["Database"] += "," + db

    for paper in papers:
        doi        = (paper.get("DOI") or "").strip().lower()
        norm_title = normalize_title(paper.get("Title") or "")
        matched    = None

        if doi and doi in doi_index:
            matched = doi_index[doi]
        if matched is None and norm_title and norm_title in title_index:
            matched = title_index[norm_title]
        if matched is None and norm_title:
            for idx, existing in enumerate(kept):
                e_norm = normalize_title(existing.get("Title") or "")
                if title_similarity(norm_title, e_norm) >= FUZZY_THRESHOLD:
                    matched = idx
                    break

        if matched is not None:
            winner = preferred(kept[matched], paper)
            loser  = paper if winner is kept[matched] else kept[matched]
            merge_db(winner, loser)
            kept[matched] = winner
            if doi:        doi_index[doi]        = matched
            if norm_title: title_index[norm_title] = matched
        else:
            idx = len(kept)
            kept.append(paper)
            if doi:        doi_index[doi]        = idx
            if norm_title: title_index[norm_title] = idx

    return kept

# ─────────────────────────────────────────────
# FETCH from OpenAlex
# ─────────────────────────────────────────────

def _parse_paper(paper: dict) -> dict | None:
    loc        = paper.get("primary_location") or {}
    src        = loc.get("source") or {}
    doi        = paper.get("doi") or ""
    source_url = src.get("homepage_url") or src.get("url") or ""

    database = classify_paper(doi, source_url)
    if database is None:
        return None

    keywords = ", ".join(
        kw.get("display_name") or kw.get("keyword", "")
        for kw in (paper.get("keywords") or [])
        if kw.get("display_name") or kw.get("keyword")
    )
    authors = ", ".join(
        a["author"]["display_name"]
        for a in paper.get("authorships", [])
        if a.get("author")
    )
    return {
        "Title":           paper.get("display_name"),
        "Authors":         authors,
        "Year":            paper.get("publication_year"),
        "PublicationDate": paper.get("publication_date"),
        "Source":          src.get("display_name", ""),
        "Database":        database,
        "DOI":             doi,
        "Keywords":        keywords,
        "Abstract":        reconstruct_abstract(paper.get("abstract_inverted_index")),
        "OpenAlexID":      paper.get("id"),
        "BibTeX":          "",
    }


def fetch_openalex_pages():
    search_conditions = build_filter_conditions(TEST_QUERY, LLM_QUERY)
    combined_filter   = (
        f"from_publication_date:{DATE_FROM},"
        f"to_publication_date:{DATE_TO},"
        f"concepts.id:C41008148,"
        f"{search_conditions}"
    )
    url = "https://api.openalex.org/works"
    base_params = {
        "filter":   combined_filter,
        "select":   ("id,display_name,authorships,abstract_inverted_index,"
                     "primary_location,publication_year,publication_date,doi,keywords"),
        "per-page": 200,
        "mailto":   YOUR_EMAIL,
        "cursor":   "*",
    }

    print(f"Fetching from OpenAlex ({DATE_FROM} → {DATE_TO})...")

    collected, page = [], 1
    while True:
        try:
            response = requests.get(url, params=base_params, timeout=30)
            response.raise_for_status()
            data = response.json()
        except requests.RequestException as e:
            print(f" [ERROR] OpenAlex page {page}: {e}")
            break

        results = data.get("results", [])
        if not results:
            break

        for raw in results:
            parsed = _parse_paper(raw)
            if parsed:
                collected.append(parsed)

        total = data.get("meta", {}).get("count", "?")
        print(f" Page {page:>3} — received {len(results):>3}, "
              f"kept {len(collected):>4} so far (total matching query: {total})")

        next_cursor = data.get("meta", {}).get("next_cursor")
        if not next_cursor:
            break
        base_params["cursor"] = next_cursor
        page += 1
        time.sleep(0.5)

    return collected

# ─────────────────────────────────────────────
# CSV OUTPUT
# ─────────────────────────────────────────────

FIELDNAMES = [
    "Title", "Authors", "Year", "PublicationDate",
    "Source", "Database", "DOI", "Keywords", "Abstract", "OpenAlexID",
]
BIBTEX_FIELDNAMES = FIELDNAMES + ["BibTeX"]

def _write_csv(papers: list[dict], fieldnames: list[str], path: str) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore", delimiter=";")
        writer.writeheader()
        writer.writerows(papers)

# ─────────────────────────────────────────────
# PIPELINE
# ─────────────────────────────────────────────

RAW_FILE      = "data/validation_articles_raw.csv"
DEDUP_FILE    = "data/validation_articles_dedup.csv"
FILTERED_FILE = "data/validation_articles_filtered.csv"
FINAL_FILE    = "data/validation_articles_final.csv"

def main():
    os.makedirs("data", exist_ok=True)

    # Step 1: Fetch from OpenAlex (cached after first run)
    if os.path.exists(RAW_FILE):
        print(f"\n Found existing raw data: {RAW_FILE} — skipping OpenAlex fetch.")
        with open(RAW_FILE, newline="", encoding="utf-8") as f:
            papers = list(csv.DictReader(f, delimiter=";"))
        print(f" Loaded {len(papers)} papers from cache.")
    else:
        papers = fetch_openalex_pages()
        with open(RAW_FILE, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDNAMES, extrasaction="ignore", delimiter=";")
            writer.writeheader()
            writer.writerows(papers)
        print(f"\n Raw records : {len(papers)} — saved to {RAW_FILE}")

    # Step 2: Deduplication
    print("\n Running deduplication (DOI → exact title → fuzzy title)...")
    papers = deduplicate(papers)
    print(f" Unique papers after dedup : {len(papers)}")
    _write_csv(papers, FIELDNAMES, DEDUP_FILE)
    print(f" Saved to: {DEDUP_FILE}")

    # Step 3: Keyword filter
    papers = apply_keyword_filter(papers)
    _write_csv(papers, FIELDNAMES, FILTERED_FILE)
    print(f" Saved to: {FILTERED_FILE}")

    # Step 4: BibTeX enrichment
    fetch_all_bibtex(papers)
    _write_csv(papers, BIBTEX_FIELDNAMES, FINAL_FILE)
    print(f" Saved to: {FINAL_FILE}")

    # Summary
    print(f"\n Done! Pipeline outputs:")
    print(f"  1. {RAW_FILE:<45} raw fetch")
    print(f"  2. {DEDUP_FILE:<45} after deduplication ({len(papers)} papers)")
    print(f"  3. {FILTERED_FILE:<45} after keyword filter")
    print(f"  4. {FINAL_FILE:<45} with BibTeX")

    breakdown = Counter(db for p in papers for db in p["Database"].split(","))
    print("\nPapers by database:")
    for db, count in sorted(breakdown.items(), key=lambda x: SOURCE_PRIORITY.get(x[0], 99)):
        print(f"  {db:12s}: {count}")


if __name__ == "__main__":
    main()
