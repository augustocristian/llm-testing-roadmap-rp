let dataTableInstance = null;
let dataTableHeaders = null;
let currentCorpus = "all";
let currentYearRange = null;

const MULTI_VALUE_COLS = new Set([
    "TREND", "LLM ITERACTION", "CONTEXTUAL INFO", "APPROACH", "SCOPE",
    "BENCHMARK", "LLMs USED", "EVALUATION METRIC", "TOOL", "TYPE OF CONTRIBUTION", "FOCUS",
]);

const NO_FILTER_COLS = new Set(["TITLE", "ABSTRACT", "BIBTEX"]);

const CHIP_COLORS = {
    "TREND":                null,
    "LLM ITERACTION":       null,
    "CONTEXTUAL INFO":      null,
    "APPROACH":             null,
    "SCOPE":                null,
    "FOCUS":                null,
    "BENCHMARK":            { bg: "#eceff1", fg: "#37474f" },
    "LLMs USED":            { bg: "#e0f7fa", fg: "#00695c" },
    "EVALUATION METRIC":    { bg: "#f3e5f5", fg: "#6a1b9a" },
    "TOOL":                 { bg: "#efebe9", fg: "#4e342e" },
    "TYPE OF CONTRIBUTION": null,
    "PUBLICATION TYPE":     null,
    "YEAR":                 null,
    "PUBLISHED INTO":       null,
};

function showAbstract(title, authors, venue, abstract, url, trends, conf, year) {
    document.getElementById("modal-abstract-title").textContent = title;
    document.getElementById("modal-abstract-authors").textContent = authors;
    const venueEl = document.getElementById("modal-abstract-venue");
    const confUrl = (typeof _confUrls === "object" && _confUrls && conf && year) ? _confUrls[conf + " " + year] : null;
    if (confUrl) {
        venueEl.innerHTML = `<a href="${confUrl}" target="_blank" rel="noopener" style="color:#00796b;text-decoration:underline;">${venue}</a>`;
    } else {
        venueEl.textContent = venue;
    }
    document.getElementById("modal-abstract-content").textContent = abstract;
    const linkBtn = document.getElementById("modal-abstract-link");
    if (url) {
        linkBtn.href = url;
        linkBtn.style.display = "";
    } else {
        linkBtn.style.display = "none";
    }
    // Related papers
    const relatedDiv = document.getElementById("modal-related-papers");
    const relatedList = document.getElementById("modal-related-list");
    relatedList.innerHTML = "";
    if (window._allData && trends) {
        const paperTrends = trends.split(",").map((s) => s.trim()).filter(Boolean);
        if (paperTrends.length > 0) {
            const related = window._allData
                .filter((r) => {
                    if ((r.TITLE || "").trim() === title.trim()) return false;
                    const rTrends = (r.TREND || "").split(",").map((s) => s.trim());
                    return paperTrends.some((t) => rTrends.includes(t));
                })
                .slice(0, 8);
            if (related.length > 0) {
                related.forEach((r) => {
                    const li = document.createElement("li");
                    const bibtex = r.BIBTEX || "";
                    const paperUrl = (bibtex.match(/url\s*=\s*[{"]([^}"]+)[}"]/i) || [])[1] || "";
                    const rTitle = r.TITLE || "";
                    const sharedTrends = (r.TREND || "").split(",").map((s) => s.trim())
                        .filter((t) => paperTrends.includes(t));
                    if (paperUrl) {
                        li.innerHTML = `<a href="${paperUrl}" target="_blank" style="color:#00796b;">${rTitle}</a>`;
                    } else {
                        li.textContent = rTitle;
                    }
                    sharedTrends.forEach((t) => {
                        const chip = document.createElement("span");
                        chip.className = "related-chip";
                        chip.textContent = t;
                        li.appendChild(chip);
                    });
                    relatedList.appendChild(li);
                });
                relatedDiv.style.display = "";
            } else {
                relatedDiv.style.display = "none";
            }
        } else {
            relatedDiv.style.display = "none";
        }
    } else {
        relatedDiv.style.display = "none";
    }
    M.Modal.getInstance(document.getElementById("modal-abstract")).open();
}

function showAbstractFromAttr(el) {
    const attr = (name) => decodeURIComponent(el.getAttribute("data-" + name) || "");
    showAbstract(attr("title"), attr("authors"), attr("venue"), attr("abstract"), attr("url"), attr("trends"), attr("conf"), attr("year"));
}

let _lastBibtexBlobUrl = null;
function showBibtex(bibtex) {
    document.getElementById("modal-bibtex-content").textContent = bibtex;
    const dlBtn = document.getElementById("download-bibtex-modal");
    if (_lastBibtexBlobUrl) URL.revokeObjectURL(_lastBibtexBlobUrl);
    _lastBibtexBlobUrl = URL.createObjectURL(new Blob([bibtex], { type: "text/plain" }));
    dlBtn.href = _lastBibtexBlobUrl;
    M.Modal.getInstance(document.getElementById("modal-bibtex")).open();
}

function showBibtexFromAttr(el) {
    showBibtex(decodeURIComponent(el.getAttribute("data-bibtex") || ""));
}

const PUB_TYPE_COLORS = {
    "Journal":    { bg: "#bbdefb", fg: "#0d47a1" },
    "Conference": { bg: "#c8e6c9", fg: "#1b5e20" },
    "arXiv":      { bg: "#ffcdd2", fg: "#b71c1c" },
};
const INTERACTION_COLORS = {
    "Pure Prompting":   { bg: "#e3f2fd", fg: "#1565c0" },
    "Hybrid Prompting": { bg: "#1565c0", fg: "#fff" },
};
const CONTEXT_COLORS = {
    "None":               { bg: "#eceff1", fg: "#546e7a" },
    "RAG":                { bg: "#fff3e0", fg: "#e65100" },
    "Fine-Tuning":        { bg: "#fce4ec", fg: "#ad1457" },
};
const APPROACH_COLORS = {
    "Tool/Framework": { bg: "#ede7f6", fg: "#4527a0" },
    "Agent":         { bg: "#4527a0", fg: "#fff" },
};
const SCOPE_COLORS = {
    "Functional":     { bg: "#e0f7fa", fg: "#006064" },
    "Non-Functional": { bg: "#fff8e1", fg: "#f57f17" },
};
const CONTRIBUTION_COLORS = {
    "Survey":         { bg: "#e3f2fd", fg: "#0d47a1" },
    "New Method/Tool":{ bg: "#e8f5e9", fg: "#1b5e20" },
    "Evaluation":     { bg: "#fff3e0", fg: "#e65100" },
};
const FOCUS_COLORS = {
    "Code/Procedure": { bg: "#e8eaf6", fg: "#283593" },
    "Data":            { bg: "#fff9c4", fg: "#f57f17" },
    "Optimization":    { bg: "#e8f5e9", fg: "#2e7d32" },
};
const TREND_COLORS = {
    "Unit Test Generation":             { bg: "#e3f2fd", fg: "#0d47a1" },
    "High-Level Test Gen":              { bg: "#e8f5e9", fg: "#1b5e20" },
    "Oracle Derivation":                { bg: "#fff3e0", fg: "#e65100" },
    "Reflections":                      { bg: "#fce4ec", fg: "#ad1457" },
    "Test Augmentation or Improvement": { bg: "#ede7f6", fg: "#4527a0" },
    "Test Configuration or Execution":  { bg: "#e0f7fa", fg: "#006064" },
};
const YEAR_COLORS = {
    "2020": { bg: "#fce4ec", fg: "#ad1457" },
    "2021": { bg: "#fff3e0", fg: "#e65100" },
    "2022": { bg: "#fff9c4", fg: "#f57f17" },
    "2023": { bg: "#e8f5e9", fg: "#1b5e20" },
    "2024": { bg: "#e3f2fd", fg: "#0d47a1" },
    "2025": { bg: "#ede7f6", fg: "#4527a0" },
    "2026": { bg: "#e0f7fa", fg: "#006064" },
};
const VENUE_COLORS = {
    // ── Core SE conferences ──
    "ICSE":              { bg: "#e3f2fd", fg: "#0d47a1" },
    "FSE":               { bg: "#e8f5e9", fg: "#1b5e20" },
    "ISSTA":             { bg: "#fff3e0", fg: "#e65100" },
    "ASE":               { bg: "#fce4ec", fg: "#ad1457" },
    "ICST":              { bg: "#ede7f6", fg: "#4527a0" },
    "AST":               { bg: "#e0f7fa", fg: "#006064" },
    "ISSRE":             { bg: "#fff9c4", fg: "#f57f17" },
    "SANER":             { bg: "#f3e5f5", fg: "#6a1b9a" },
    "SIGSOFT":           { bg: "#e8eaf6", fg: "#283593" },
    "EASE":              { bg: "#efebe9", fg: "#4e342e" },
    "ICTSS":             { bg: "#e0f2f1", fg: "#004d40" },
    "ICCMT":             { bg: "#fbe9e7", fg: "#bf360c" },
    "ICDDS":             { bg: "#f1f8e9", fg: "#33691e" },
    "A-TEST":            { bg: "#e1f5fe", fg: "#01579b" },
    "AITEST":            { bg: "#fff8e1", fg: "#ff6f00" },
    "QRS":               { bg: "#fce4ec", fg: "#880e4f" },
    "QUATIC":            { bg: "#e8eaf6", fg: "#1a237e" },
    "RE":                { bg: "#f9fbe7", fg: "#827717" },
    "ICSME":             { bg: "#fff8e1", fg: "#f57f17" },
    "ICoDSE":            { bg: "#e0f2f1", fg: "#00695c" },
    "DSA":               { bg: "#e8eaf6", fg: "#1a237e" },
    "ICCS":              { bg: "#e3f2fd", fg: "#0277bd" },
    "COMPSAC":           { bg: "#e3f2fd", fg: "#1565c0" },
    "FORGE":             { bg: "#e0f7fa", fg: "#00838f" },
    "Internetware":      { bg: "#e0f2f1", fg: "#00796b" },
    "AIware":            { bg: "#e8eaf6", fg: "#283593" },
    // ── Security conferences ──
    "TrustCom":          { bg: "#ffebee", fg: "#c62828" },
    "APESEC":            { bg: "#fce4ec", fg: "#880e4f" },
    "USENIX Security":   { bg: "#ffebee", fg: "#b71c1c" },
    "PST":               { bg: "#ffebee", fg: "#880e4f" },
    // ── AI / ML / NLP conferences ──
    "GECCO":             { bg: "#ede7f6", fg: "#6a1b9a" },
    "NAACL":             { bg: "#f3e5f5", fg: "#7b1fa2" },
    "LREC-COLING":       { bg: "#e8eaf6", fg: "#3949ab" },
    "CVPR":              { bg: "#e8eaf6", fg: "#283593" },
    "MLCAD":             { bg: "#ede7f6", fg: "#4527a0" },
    "ICCAD":             { bg: "#e3f2fd", fg: "#1a237e" },
    "IWANN":             { bg: "#ede7f6", fg: "#512da8" },
    "FLLM":              { bg: "#f3e5f5", fg: "#6a1b9a" },
    "Cyber-AI":          { bg: "#e8eaf6", fg: "#283593" },
    // ── HCI / UI conferences ──
    "UIST":              { bg: "#fce4ec", fg: "#ad1457" },
    "IUI":               { bg: "#fff3e0", fg: "#e65100" },
    "ICMI":              { bg: "#fff3e0", fg: "#bf360c" },
    // ── Systems / distributed / IoT ──
    "ICDCS":             { bg: "#e3f2fd", fg: "#0288d1" },
    "IROS":              { bg: "#e0f2f1", fg: "#004d40" },
    "IoT":               { bg: "#e0f2f1", fg: "#006064" },
    "ICWS":              { bg: "#e3f2fd", fg: "#01579b" },
    "MESA":              { bg: "#e8eaf6", fg: "#3f51b5" },
    "DSC":               { bg: "#e3f2fd", fg: "#0d47a1" },
    "DTPI":              { bg: "#e8eaf6", fg: "#3f51b5" },
    "CSR":               { bg: "#e3f2fd", fg: "#0288d1" },
    "ICWIHI":            { bg: "#e3f2fd", fg: "#1565c0" },
    "INMIC":             { bg: "#e3f2fd", fg: "#0277bd" },
    // ── Biomedical / signal processing ──
    "CISP-BMEI":         { bg: "#e8f5e9", fg: "#2e7d32" },
    "ISMSIT":            { bg: "#e8eaf6", fg: "#3f51b5" },
    // ── General / regional conferences ──
    "UBMK":              { bg: "#f3e5f5", fg: "#7b1fa2" },
    "NISS":              { bg: "#e8eaf6", fg: "#455a64" },
    "ICECCME":           { bg: "#e3f2fd", fg: "#1565c0" },
    "ASYU":              { bg: "#ede7f6", fg: "#512da8" },
    "SBQS":              { bg: "#e8f5e9", fg: "#388e3c" },
    "ICIIBMS":           { bg: "#e3f2fd", fg: "#0288d1" },
    "GCAT":              { bg: "#f9fbe7", fg: "#558b2f" },
    "ICEBE":             { bg: "#e8eaf6", fg: "#1565c0" },
    "ICIC":              { bg: "#e3f2fd", fg: "#0277bd" },
    "FASeG":             { bg: "#f1f8e9", fg: "#558b2f" },
    "ISCTech":           { bg: "#e0f2f1", fg: "#00897b" },
    "ComManTel":         { bg: "#e3f2fd", fg: "#1976d2" },
    "JCSSE":             { bg: "#e3f2fd", fg: "#0288d1" },
    "ICoCICs":           { bg: "#e0f2f1", fg: "#00796b" },
    "ITMS":              { bg: "#e8eaf6", fg: "#3f51b5" },
    "SITA":              { bg: "#e3f2fd", fg: "#1565c0" },
    "ISWA":              { bg: "#e8f5e9", fg: "#2e7d32" },
    "CSAE":              { bg: "#e3f2fd", fg: "#0288d1" },
    "ICSSS":             { bg: "#e3f2fd", fg: "#0d47a1" },
    "STA":               { bg: "#e8f5e9", fg: "#2e7d32" },
    "ICACCP":            { bg: "#e3f2fd", fg: "#1565c0" },
    "R10-HTC":           { bg: "#e8f5e9", fg: "#2e7d32" },
    "ICRITO":            { bg: "#e3f2fd", fg: "#0277bd" },
    "ICTIS":             { bg: "#e3f2fd", fg: "#0288d1" },
    // ── Journals ──
    "TSE":               { bg: "#e3f2fd", fg: "#1565c0" },
    "TOSEM":             { bg: "#e8f5e9", fg: "#2e7d32" },
    "IST":               { bg: "#fff3e0", fg: "#ef6c00" },
    "JSS":               { bg: "#ede7f6", fg: "#6a1b9a" },
    "Emp. Soft. Eng.":   { bg: "#fce4ec", fg: "#c62828" },
    "IEEE Access":       { bg: "#e0f7fa", fg: "#00695c" },
    "IEEE Soft.":        { bg: "#e1f5fe", fg: "#0277bd" },
    "IEEE Software":     { bg: "#e1f5fe", fg: "#0277bd" },
    "IEEE Comp.":        { bg: "#e3f2fd", fg: "#0d47a1" },
    "IEEE Vehic. Tec. Mag.": { bg: "#e3f2fd", fg: "#1565c0" },
    "ACM Soft. Eng.":    { bg: "#f3e5f5", fg: "#7b1fa2" },
    "Proc. ACM Softw. Eng": { bg: "#e8eaf6", fg: "#303f9f" },
    "Aut. Soft. Eng.":   { bg: "#fff8e1", fg: "#f9a825" },
    "Com. ACM":          { bg: "#efebe9", fg: "#3e2723" },
    "CACM":              { bg: "#efebe9", fg: "#3e2723" },
    "Comp. Std. and Int.": { bg: "#f1f8e9", fg: "#558b2f" },
    "FGCS":              { bg: "#e0f2f1", fg: "#004d40" },
    "Sci. Reports.":     { bg: "#f9fbe7", fg: "#558b2f" },
    "CJA":               { bg: "#e3f2fd", fg: "#0277bd" },
    "Auto. Innovation":  { bg: "#e0f2f1", fg: "#00796b" },
    "T-ITS":             { bg: "#e8f5e9", fg: "#2e7d32" },
    "Proc. Comp. Sci.":  { bg: "#e8eaf6", fg: "#303f9f" },
    // ── Preprints / catch-all ──
    "arXiv":             { bg: "#ffcdd2", fg: "#b71c1c" },
    "Other":             { bg: "#eceff1", fg: "#37474f" },
};

const PER_VALUE_MAPS = {
    "PUBLICATION TYPE": PUB_TYPE_COLORS,
    "TREND":            TREND_COLORS,
    "LLM ITERACTION":   INTERACTION_COLORS,
    "CONTEXTUAL INFO":  CONTEXT_COLORS,
    "APPROACH":         APPROACH_COLORS,
    "SCOPE":            SCOPE_COLORS,
    "FOCUS":            FOCUS_COLORS,
    "TYPE OF CONTRIBUTION": CONTRIBUTION_COLORS,
    "YEAR":             YEAR_COLORS,
    "PUBLISHED INTO":   VENUE_COLORS,
};

function chipHtml(val, colName, url) {
    const valMap = PER_VALUE_MAPS[colName];
    const c = valMap
        ? (valMap[val] || { bg: "#eceff1", fg: "#546e7a" })
        : (CHIP_COLORS[colName] || { bg: "#e8f5e9", fg: "#2e7d32" });
    const chip = `<span class="table-chip" style="background:${c.bg};color:${c.fg}">${val}</span>`;
    if (url) return `<a href="${url}" target="_blank" rel="noopener" style="text-decoration:none">${chip}</a>`;
    return chip;
}

// ── Column filter state ──
const columnFilters = {}; // colIdx → Set of checked values

function initDataTable(data, headers) {
    dataTableHeaders = headers;

    const hiddenSet = new Set(["KEY", "DATABASE"]);
    const visibleHeaders = headers.filter((h) => !hiddenSet.has(h));

    // Convert YEAR to integer strings
    data.forEach((r) => {
        if (r.YEAR) r.YEAR = String(Math.floor(parseFloat(r.YEAR)));
    });

    const idIdx = visibleHeaders.indexOf("ID");
    const yearIdx = visibleHeaders.indexOf("YEAR");

    // Custom search: corpus + year range + column filters
    $.fn.dataTable.ext.search.push((settings, rowData) => {
        if (settings.nTable.id !== "tabla") return true;
        const id = rowData[idIdx] || "";
        if (currentCorpus === "initial" && !id.startsWith("P")) return false;
        if (currentCorpus === "validation" && !id.startsWith("V")) return false;
        if (currentYearRange) {
            const y = parseFloat(rowData[yearIdx]);
            if (isNaN(y) || y < currentYearRange[0] || y > currentYearRange[1]) return false;
        }
        // Column filters (multi-select)
        for (const [ci, selected] of Object.entries(columnFilters)) {
            if (!selected || selected.size === 0) continue;
            const cellVal = rowData[ci] || "";
            const colName = visibleHeaders[ci];
            if (MULTI_VALUE_COLS.has(colName)) {
                const vals = cellVal.split(",").map((v) => v.trim()).filter(Boolean);
                if (!vals.some((v) => selected.has(v))) return false;
            } else {
                let clean = cellVal.trim();
                if (colName === "PUBLISHED INTO") clean = clean.replace(/^[CJ]:\s*/, "");
                if (!selected.has(clean)) return false;
            }
        }
        return true;
    });

    // Chip column defs
    const allChipCols = [...MULTI_VALUE_COLS, "PUBLICATION TYPE", "YEAR", "PUBLISHED INTO"];
    const MAX_VISIBLE_CHIPS = 2;
    const chipDefs = allChipCols
        .filter((col) => visibleHeaders.includes(col))
        .map((col) => ({
            targets: visibleHeaders.indexOf(col),
            render: (cellData, type, row) => {
                if (type !== "display" || !cellData) return cellData || "";
                let raw = cellData;
                const isVenue = col === "PUBLISHED INTO";
                if (isVenue) raw = raw.replace(/^[CJ]:\s*/, "");
                const vals = raw.split(",").map((v) => v.trim()).filter(Boolean);
                const makeChip = (v) => {
                    let url = null;
                    if (isVenue && cellData.startsWith("C:") && typeof _confUrls === "object" && _confUrls) {
                        const year = row[yearIdx] || "";
                        url = _confUrls[v + " " + year] || null;
                    }
                    return chipHtml(v, col, url);
                };
                if (vals.length <= MAX_VISIBLE_CHIPS) {
                    return vals.map(makeChip).join(" ");
                }
                const visible = vals.slice(0, MAX_VISIBLE_CHIPS).map(makeChip).join(" ");
                const extra = vals.slice(MAX_VISIBLE_CHIPS).map(makeChip).join(" ");
                const remaining = vals.length - MAX_VISIBLE_CHIPS;
                return `<span class="chip-wrap">${visible}<span class="chip-extra"> ${extra}</span>` +
                    `<span class="chip-more" onclick="this.parentElement.classList.toggle('expanded')">+${remaining}</span></span>`;
            },
        }));

    dataTableInstance = $("#tabla").DataTable({
        data: data.map((row) => visibleHeaders.map((h) => row[h] || "")),
        columns: visibleHeaders.map((h) => ({ title: h.replace(/_/g, " ") })),
        pageLength: 25,
        columnDefs: [
            ...chipDefs,
            {
                targets: visibleHeaders.indexOf("TITLE"),
                className: "dt-title",
                render: (cellData, type, row) => {
                    if (type !== "display") return cellData;
                    const bibtex = row[visibleHeaders.indexOf("BIBTEX")] || "";
                    const url = bibtex.match(/url\s*=\s*[{"]([^}"]+)[}"]/i)?.[1];
                    const rl = window._readingList || new Set();
                    const starred = rl.has(cellData) ? "starred" : "";
                    const starChar = starred ? "\u2605" : "\u2606";
                    const star = `<button class="star-btn ${starred}" data-title="${cellData.replace(/"/g, '&quot;')}" title="Add to reading list">${starChar}</button> `;
                    const link = url ? `<a href="${url}" target="_blank">${cellData}</a>` : cellData;
                    return star + link;
                },
            },
            {
                targets: visibleHeaders.indexOf("BIBTEX"),
                orderable: false,
                render: (cellData, type) => {
                    if (type !== "display" || !cellData) return cellData || "";
                    const encoded = encodeURIComponent(cellData);
                    return `<a class="green-btn" href="#modal-bibtex" data-bibtex="${encoded}" onclick="showBibtexFromAttr(this)">BibTeX</a>`;
                },
            },
            {
                targets: visibleHeaders.indexOf("ABSTRACT"),
                orderable: false,
                render: (cellData, type, row) => {
                    if (type !== "display" || !cellData) return cellData || "";
                    const bibtex = row[visibleHeaders.indexOf("BIBTEX")] || "";
                    const authMatch = bibtex.match(/author\s*=\s*[{"]([^}"]+)[}"]/i);
                    const authors = authMatch ? authMatch[1].replace(/\s+/g, " ").trim() : "";
                    const pubRaw = (row[visibleHeaders.indexOf("PUBLISHED INTO")] || "").trim();
                    const acronym = pubRaw.replace(/^[CJ]:\s*/, "");
                    const pubType = (row[visibleHeaders.indexOf("PUBLICATION TYPE")] || "").trim();
                    let venue = acronym;
                    if (pubType === "arXiv") {
                        venue = "arXiv";
                    } else {
                        const btMatch = bibtex.match(/booktitle\s*=\s*[{"]([^}"]+)[}"]/i);
                        const jnMatch = bibtex.match(/journal\s*=\s*[{"]([^}"]+)[}"]/i);
                        const longName = btMatch ? btMatch[1].trim() : (jnMatch ? jnMatch[1].trim() : "");
                        if (longName) venue = longName + " (" + acronym + ")";
                    }
                    const urlMatch = bibtex.match(/url\s*=\s*[{"]([^}"]+)[}"]/i);
                    const paperUrl = urlMatch ? urlMatch[1].trim() : "";
                    const trends = row[visibleHeaders.indexOf("TREND")] || "";
                    const year = row[yearIdx] || "";
                    return `<a class="green-btn" href="#modal-abstract"
                        data-title="${encodeURIComponent(row[visibleHeaders.indexOf("TITLE")] || "")}"
                        data-authors="${encodeURIComponent(authors)}"
                        data-venue="${encodeURIComponent(venue)}"
                        data-conf="${encodeURIComponent(acronym)}"
                        data-year="${encodeURIComponent(year)}"
                        data-url="${encodeURIComponent(paperUrl)}"
                        data-trends="${encodeURIComponent(trends)}"
                        data-abstract="${encodeURIComponent(cellData)}"
                        onclick="showAbstractFromAttr(this)">INFO</a>`;
                },
            },
        ],
        initComplete: function () {
            const api = this.api();

            // Build filter dropdowns in each header
            api.columns().every(function () {
                const column = this;
                const colIdx = column.index();
                const colName = visibleHeaders[colIdx];
                const header = $(column.header());

                if (NO_FILTER_COLS.has(colName)) return;

                // Collect unique values
                const uniqueVals = new Set();
                column.data().each(function (val) {
                    if (!val) return;
                    if (MULTI_VALUE_COLS.has(colName)) {
                        val.split(",").forEach((v) => {
                            const t = v.trim();
                            if (t) uniqueVals.add(t);
                        });
                    } else if (colName === "PUBLISHED INTO") {
                        uniqueVals.add(val.replace(/^[CJ]:\s*/, "").trim());
                    } else {
                        uniqueVals.add(val.trim());
                    }
                });

                if (uniqueVals.size === 0) return;

                const sorted = [...uniqueVals].sort();

                // Build dropdown HTML
                const wrapper = $('<div class="col-filter-wrap"></div>');
                const btn = $('<span class="col-filter-btn" title="Filter">&#9660;</span>');
                const dropdown = $('<div class="col-filter-dropdown"></div>');

                const controls = $('<div class="col-filter-controls"></div>');
                const selectAll = $('<a href="#" class="col-filter-action">All</a>');
                const clearAll = $('<a href="#" class="col-filter-action">None</a>');
                controls.append(selectAll, clearAll);
                dropdown.append(controls);

                // Add search box for columns with many values
                if (sorted.length > 6) {
                    const search = $('<input type="text" class="col-filter-search" placeholder="Search...">');
                    dropdown.append(search);
                    search.on("input", function () {
                        const q = this.value.toLowerCase();
                        list.find(".col-filter-item").each(function () {
                            const text = $(this).find("span").text().toLowerCase();
                            $(this).toggle(text.includes(q));
                        });
                    });
                }

                const list = $('<div class="col-filter-list"></div>');
                sorted.forEach((val) => {
                    const label = $(`<label class="col-filter-item"><input type="checkbox" checked value="${val.replace(/"/g, "&quot;")}"><span>${val}</span></label>`);
                    list.append(label);
                });
                dropdown.append(list);

                wrapper.append(btn, dropdown);
                header.append(wrapper);

                // Toggle dropdown — use fixed positioning so it escapes the
                // responsive-table overflow container on narrow viewports.
                btn.on("click", function (e) {
                    e.stopPropagation();
                    $(".col-filter-dropdown.active").not(dropdown).removeClass("active");

                    if (!dropdown.hasClass("active")) {
                        const rect = btn[0].getBoundingClientRect();
                        const dropW = 220;
                        let left = rect.left;
                        if (left + dropW > window.innerWidth - 8) {
                            left = rect.right - dropW;
                        }
                        dropdown.css({
                            position: "fixed",
                            top:  rect.bottom + 2,
                            left: Math.max(4, left),
                            width: dropW,
                        });
                    }
                    dropdown.toggleClass("active");
                });

                // Prevent sorting when clicking inside dropdown
                dropdown.on("click", function (e) {
                    e.stopPropagation();
                });

                // Select All / None
                selectAll.on("click", function (e) {
                    e.preventDefault();
                    list.find("input[type=checkbox]").prop("checked", true).first().trigger("change");
                });
                clearAll.on("click", function (e) {
                    e.preventDefault();
                    list.find("input[type=checkbox]").prop("checked", false).first().trigger("change");
                });

                // On checkbox change, update filter
                list.on("change", "input[type=checkbox]", function () {
                    const checked = [];
                    list.find("input[type=checkbox]:checked").each(function () {
                        checked.push($(this).val());
                    });
                    const allChecked = checked.length === sorted.length;
                    if (allChecked || checked.length === 0) {
                        delete columnFilters[colIdx];
                        btn.removeClass("col-filter-active");
                    } else {
                        columnFilters[colIdx] = new Set(checked);
                        btn.addClass("col-filter-active");
                    }
                    updateFilterBadge();
                    dataTableInstance.draw();
                });
            });
        },
    });

    // Close dropdowns when clicking outside
    $(document).on("click", function () {
        $(".col-filter-dropdown.active").removeClass("active");
    });

    function updateFilterBadge() {
        const count = Object.keys(columnFilters).length;
        const btn = document.getElementById("toggleFilters");
        const isVisible = document.getElementById("tabla").classList.contains("filters-visible");
        const arrow = isVisible ? "&#9650;" : "&#9660;";
        btn.innerHTML = count > 0 ? `${arrow} Filters <span class="filter-badge">${count}</span>` : `${arrow} Filters`;
    }

    // Toggle filters visibility
    document.getElementById("toggleFilters").addEventListener("click", () => {
        const table = document.getElementById("tabla");
        const visible = table.classList.toggle("filters-visible");
        if (!visible) {
            // Clear all active filters when hiding
            Object.keys(columnFilters).forEach((k) => delete columnFilters[k]);
            $(".col-filter-btn").removeClass("col-filter-active");
            $(".col-filter-list input[type=checkbox]").prop("checked", true);
            $(".col-filter-dropdown.active").removeClass("active");
            dataTableInstance.draw();
        }
        updateFilterBadge();
    });

    // Page length select
    document.getElementById("pageLengthSelect").addEventListener("change", (e) => {
        dataTableInstance.page.len(Number(e.target.value)).draw();
    });
}

function setTableFilters(corpus, yearRange) {
    currentCorpus = corpus;
    currentYearRange = yearRange;
    if (dataTableInstance) dataTableInstance.draw();
}
