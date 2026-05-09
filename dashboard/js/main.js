document.addEventListener("DOMContentLoaded", () => {
    M.FormSelect.init(document.querySelectorAll("select:not(.browser-default)"));
    M.Modal.init(document.querySelectorAll(".modal"));

    initCitation();

    // Copy BibTeX button
    document.getElementById("copy-bibtex").addEventListener("click", (e) => {
        e.preventDefault();
        const text = document.getElementById("modal-bibtex-content").textContent;
        navigator.clipboard.writeText(text).then(() => {
            M.toast({ html: "BibTeX copied!", classes: "teal" });
        });
    });

    // ── Dark mode toggle (icon button) ──
    const darkToggle = document.getElementById("dark-mode-toggle");
    const isDark = localStorage.getItem("darkMode") === "true";
    if (isDark) document.body.classList.add("dark-mode");
    if (darkToggle) {
        const updateBtn = (dark) => {
            darkToggle.title = dark ? "Switch to light mode" : "Switch to dark mode";
            darkToggle.setAttribute("aria-label", darkToggle.title);
        };
        updateBtn(isDark);
        darkToggle.addEventListener("click", () => {
            const nowDark = document.body.classList.toggle("dark-mode");
            localStorage.setItem("darkMode", nowDark);
            updateBtn(nowDark);
            applyChartDefaults();
            Object.values(chartInstances).forEach((c) => c.update());
        });
    }

    // ── Back to top button ──
    const backToTop = document.getElementById("backToTop");
    window.addEventListener("scroll", () => {
        backToTop.style.display = window.scrollY > 400 ? "block" : "none";
    });
    backToTop.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    });

    // ── Mini-nav smooth scroll + active tracking ──
    const navLinks = document.querySelectorAll(".mini-nav-link");
    const sections = [...navLinks].map((l) => document.getElementById(l.dataset.section)).filter(Boolean);
    navLinks.forEach((link) => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const target = document.getElementById(link.dataset.section);
            if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    });
    const updateActiveNav = () => {
        const scrollY = window.scrollY + 120;
        let current = sections[0];
        sections.forEach((s) => { if (s.offsetTop <= scrollY) current = s; });
        navLinks.forEach((l) => {
            l.classList.toggle("active", l.dataset.section === current?.id);
        });
    };
    window.addEventListener("scroll", updateActiveNav);

    // ── Chart download (PNG / SVG dropdown) ──
    document.querySelectorAll(".chart-download-btn").forEach((btn) => {
        const menu = btn.nextElementSibling;
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            document.querySelectorAll(".chart-dl-menu.active").forEach((m) => { if (m !== menu) m.classList.remove("active"); });
            menu.classList.toggle("active");
        });
    });
    document.addEventListener("click", () => {
        document.querySelectorAll(".chart-dl-menu.active").forEach((m) => m.classList.remove("active"));
    });
    document.querySelectorAll(".chart-dl-png").forEach((btn) => {
        btn.addEventListener("click", () => {
            const canvas = document.getElementById(btn.dataset.canvas);
            if (!canvas) return;
            const link = document.createElement("a");
            link.download = btn.dataset.canvas + ".png";
            link.href = canvas.toDataURL("image/png");
            link.click();
        });
    });
    document.querySelectorAll(".chart-dl-svg").forEach((btn) => {
        btn.addEventListener("click", () => {
            const canvas = document.getElementById(btn.dataset.canvas);
            if (!canvas) return;
            const w = canvas.width, h = canvas.height;
            const img = canvas.toDataURL("image/png");
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
                `<image href="${img}" width="${w}" height="${h}"/></svg>`;
            const blob = new Blob([svg], { type: "image/svg+xml" });
            const link = document.createElement("a");
            link.download = btn.dataset.canvas + ".svg";
            link.href = URL.createObjectURL(blob);
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        });
    });

    // ── Keyboard shortcuts ──
    document.addEventListener("keydown", (e) => {
        // Ctrl+K → focus abstract search
        if ((e.ctrlKey || e.metaKey) && e.key === "k") {
            e.preventDefault();
            const input = document.getElementById("abstractSearch");
            if (input) input.focus();
        }
        // Escape → close dropdowns
        if (e.key === "Escape") {
            document.querySelectorAll(".col-filter-dropdown.active, .col-vis-dropdown.active").forEach((d) => d.classList.remove("active"));
        }
    });

    // ── Load data ──
    loadCSV((data, headers) => {
        // Store globally for cross-linking and related papers
        globalThis._allData = data;
        globalThis._allHeaders = headers;

        initExport(data, headers);
        initDataTable(data, headers);

        // Re-init Materialize selects (not browser-default ones)
        M.FormSelect.init(document.querySelectorAll("select:not(.browser-default)"));

        // Compute year range from data
        const allYears = data.map((r) => Math.floor(Number.parseFloat(r.YEAR))).filter((y) => !Number.isNaN(y));
        const minYear = Math.min(...allYears);
        const maxYear = Math.max(...allYears);

        let activeCorpus = "all";
        let activeYearRange = [minYear, maxYear];

        // ── Read state from URL hash ──
        const hashState = parseHash();
        if (hashState.corpus) activeCorpus = hashState.corpus;
        if (hashState.yearMin && hashState.yearMax) activeYearRange = [hashState.yearMin, hashState.yearMax];

        // Set corpus button from hash
        if (hashState.corpus) {
            document.querySelectorAll("#corpusToggle .corpus-btn").forEach((b) => {
                b.classList.toggle("active", b.dataset.corpus === activeCorpus);
            });
        }

        // Define refresh
        function refresh() {
            const filtered = applyFilters(data, activeCorpus, activeYearRange);
            updateStatsAnimated(filtered);
            updateSummaryStats(filtered);
            renderBubbleDashboard(filtered);
            renderInsightsChart(filtered, document.getElementById("graficoSelect").value);
            setTableFilters(activeCorpus, activeYearRange);
            updateHash(activeCorpus, activeYearRange, document.getElementById("graficoSelect").value);
        }

        // Init year slider — rangeMax must be strictly greater than rangeMin
        // to avoid noUiSlider locking up when all data falls in a single year.
        const sliderEl = document.getElementById("yearSlider");
        const rangeMin = minYear;
        const rangeMax = Math.max(maxYear, minYear + 1);
        noUiSlider.create(sliderEl, {
            start: activeYearRange,
            connect: true,
            step: 1,
            margin: 0,
            range: { min: rangeMin, max: rangeMax },
            format: {
                to: (v) => Math.round(v),
                from: Number,
            },
        });

        document.getElementById("yearMinLabel").textContent = activeYearRange[0];
        document.getElementById("yearMaxLabel").textContent = activeYearRange[1];

        // Year slider change
        sliderEl.noUiSlider.on("update", (values) => {
            activeYearRange = [values[0], values[1]];
            document.getElementById("yearMinLabel").textContent = values[0];
            document.getElementById("yearMaxLabel").textContent = values[1];
            refresh();
        });

        // Corpus toggle buttons
        const corpusBtns = document.querySelectorAll("#corpusToggle .corpus-btn");
        corpusBtns.forEach((btn) => {
            btn.addEventListener("click", () => {
                for (const b of corpusBtns) b.classList.remove("active");
                btn.classList.add("active");
                activeCorpus = btn.dataset.corpus;
                refresh();
            });
        });

        // Insights chart selector
        const chartSelect = document.getElementById("graficoSelect");
        if (hashState.chart) {
            chartSelect.value = hashState.chart;
            M.FormSelect.init(chartSelect);
        }
        chartSelect.addEventListener("change", (e) => {
            const filtered = applyFilters(data, activeCorpus, activeYearRange);
            renderInsightsChart(filtered, e.target.value);
            updateHash(activeCorpus, activeYearRange, e.target.value);
        });

        // ── Abstract full-text search ──
        const abstractInput = document.getElementById("abstractSearch");
        if (abstractInput) {
            let debounce = null;
            abstractInput.addEventListener("input", () => {
                clearTimeout(debounce);
                debounce = setTimeout(() => {
                    if (dataTableInstance) dataTableInstance.draw();
                }, 300);
            });
            $.fn.dataTable.ext.search.push((settings, searchData, index, rowData) => {
                if (settings.nTable.id !== "tabla") return true;
                const q = abstractInput.value.trim().toLowerCase();
                if (!q) return true;
                const fullText = rowData.join(" ").toLowerCase();
                return fullText.includes(q);
            });
        }

        // ── Column visibility toggle ──
        initColumnVisibility(headers);

        // ── Export filtered data ──
        initExportFiltered(data, headers);

        // ── Bulk BibTeX export ──
        initBulkBibtex(data, headers);

        // ── Reading list / bookmarks ──
        initReadingList(data, headers);

        // ── Table row click → open INFO modal ──
        initRowClick();

        // ── Card collapse ──
        initCardCollapse();

        // ── Table sort persistence ──
        initSortPersistence();

        // ── Active filter chips ──
        initActiveFilterChips(headers);

        // ── Sparklines ──
        renderSparklines(data);

        // ── Mobile card view ──
        initMobileCardView(headers);

        // ── Search highlighting ──
        initSearchHighlight();

        // ── Tooltip abstract preview ──
        initTitleTooltips(data, headers);

        // ── Hide loading, show content ──
        document.getElementById("main-content").style.display = "";
        const overlay = document.getElementById("loading-overlay");
        overlay.classList.add("hidden");
        setTimeout(() => overlay.remove(), 400);
    });
});

// ── Animated stat counters ──
function animateValue(el, newVal) {
    const current = Number.parseInt(el.textContent) || 0;
    if (current === newVal) return;
    const diff = newVal - current;
    const steps = Math.min(Math.abs(diff), 20);
    const stepTime = Math.max(15, 300 / steps);
    let step = 0;
    const timer = setInterval(() => {
        step++;
        el.textContent = Math.round(current + (diff * step) / steps);
        if (step >= steps) {
            el.textContent = newVal;
            clearInterval(timer);
        }
    }, stepTime);
}

function updateStatsAnimated(data) {
    let j = 0, c = 0, a = 0;
    data.forEach((r) => {
        const t = (r["PUBLICATION TYPE"] || "").trim();
        if (t === "Journal") j++;
        else if (t === "Conference") c++;
        else if (t === "arXiv") a++;
    });
    animateValue(document.getElementById("stat-total"), data.length);
    animateValue(document.getElementById("stat-journals"), j);
    animateValue(document.getElementById("stat-conferences"), c);
    animateValue(document.getElementById("stat-arxiv"), a);
}

// ── Summary statistics ──
function updateSummaryStats(data) {
    // Avg papers/year
    const years = {};
    data.forEach((r) => { if (r.YEAR) years[r.YEAR] = (years[r.YEAR] || 0) + 1; });
    const yearKeys = Object.keys(years);
    const avg = yearKeys.length > 0 ? (data.length / yearKeys.length).toFixed(1) : "-";
    document.getElementById("summary-avg-year").textContent = avg;

    // Peak year
    let peakYear = "-", peakCount = 0;
    for (const [y, cnt] of Object.entries(years)) {
        if (cnt > peakCount) { peakCount = cnt; peakYear = y; }
    }
    document.getElementById("summary-peak-year").textContent = peakYear + " (" + peakCount + ")";

    // Top conference and top journal
    const confCounts = {}, jourCounts = {};
    data.forEach((r) => {
        const v = (r["PUBLISHED INTO"] || "").trim();
        if (v.startsWith("C:")) { const k = v.replace(/^C:\s*/, ""); confCounts[k] = (confCounts[k] || 0) + 1; }
        else if (v.startsWith("J:")) { const k = v.replace(/^J:\s*/, ""); jourCounts[k] = (jourCounts[k] || 0) + 1; }
    });
    const topConf = Object.entries(confCounts).sort((a, b) => b[1] - a[1])[0];
    const topJour = Object.entries(jourCounts).sort((a, b) => b[1] - a[1])[0];
    document.getElementById("summary-top-conf").textContent = topConf ? topConf[0] : "-";
    document.getElementById("summary-top-jour").textContent = topJour ? topJour[0] : "-";

    // Most used LLM
    const llmCounts = countField(data, "LLMs USED", ",", ["n/s", "none"]);
    const topLLM = Object.entries(llmCounts).sort((a, b) => b[1] - a[1])[0];
    document.getElementById("summary-top-llm").textContent = topLLM ? topLLM[0] : "-";

    // Top trend
    const trendCounts = countField(data, "TREND");
    const topTrend = Object.entries(trendCounts).sort((a, b) => b[1] - a[1])[0];
    document.getElementById("summary-top-trend").textContent = topTrend ? topTrend[0] : "-";

    // Top benchmark
    const bmkCounts = countField(data, "BENCHMARK", ",", ["none", "no bmk-ds", "other", "custom"]);
    const topBmk = Object.entries(bmkCounts).sort((a, b) => b[1] - a[1])[0];
    document.getElementById("summary-top-benchmark").textContent = topBmk ? topBmk[0] : "-";
}

// ── Column visibility ──
function initColumnVisibility(headers) {
    const btn = document.getElementById("colVisBtn");
    const dropdown = document.getElementById("colVisDropdown");
    if (!btn || !dropdown || !dataTableInstance) return;

    const hiddenSet = new Set(["KEY", "DATABASE"]);
    const columns = dataTableInstance.columns().indexes().toArray();
    const visHeaders = headers.filter((h) => !hiddenSet.has(h));

    columns.forEach((ci) => {
        const name = visHeaders[ci] || "Col " + ci;
        const label = document.createElement("label");
        label.className = "col-vis-item";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = dataTableInstance.column(ci).visible();
        const span = document.createElement("span");
        span.textContent = name;
        label.appendChild(cb);
        label.appendChild(span);
        dropdown.appendChild(label);
        cb.addEventListener("change", () => {
            dataTableInstance.column(ci).visible(cb.checked);
        });
    });

    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdown.classList.toggle("active");
    });
    document.addEventListener("click", () => dropdown.classList.remove("active"));
    dropdown.addEventListener("click", (e) => e.stopPropagation());
}

// ── Export filtered data ──
function initExportFiltered(data, headers) {
    const btn = document.getElementById("exportFiltered");
    if (!btn || !dataTableInstance) return;

    btn.addEventListener("click", () => {
        const filteredIdxs = dataTableInstance.rows({ search: "applied" }).indexes().toArray();
        const visHeaders = dataTableInstance.columns().header().toArray().map((th) => th.textContent.trim());
        const visCols = dataTableInstance.columns().indexes().toArray().filter((ci) => dataTableInstance.column(ci).visible());

        const headerRow = visCols.map((ci) => visHeaders[ci]);
        const rows = filteredIdxs.map((ri) => {
            const rowData = dataTableInstance.row(ri).data();
            return visCols.map((ci) => {
                const val = rowData[ci] || "";
                const tmp = document.createElement("div");
                tmp.innerHTML = val;
                return tmp.textContent || tmp.innerText || "";
            });
        });

        const csvContent = [headerRow, ...rows]
            .map((r) => r.map((c) => '"' + String(c).replaceAll('"', '""') + '"').join(","))
            .join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "articlecorpus_filtered.csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
}

// ── Table row click → open INFO modal ──
function initRowClick() {
    if (!dataTableInstance) return;
    $("#tabla tbody").on("click", "tr", function (e) {
        // Don't trigger if clicking a link/button
        if (e.target.closest("a, button, .chip-more")) return;
        const infoBtn = this.querySelector(".green-btn[data-abstract]");
        if (infoBtn) showAbstractFromAttr(infoBtn);
    });
    // Add cursor pointer to rows
    const style = document.createElement("style");
    style.textContent = "#tabla tbody tr { cursor: pointer; }";
    document.head.appendChild(style);
}

// ── Shareable URL hash ──
function updateHash(corpus, yearRange, chart) {
    const params = new URLSearchParams();
    if (corpus && corpus !== "all") params.set("corpus", corpus);
    if (yearRange) {
        params.set("ymin", yearRange[0]);
        params.set("ymax", yearRange[1]);
    }
    if (chart && chart !== "ano") params.set("chart", chart);
    const hash = params.toString();
    history.replaceState(null, "", hash ? "#" + hash : location.pathname);
}

function parseHash() {
    const result = {};
    if (!location.hash || location.hash.length < 2) return result;
    const params = new URLSearchParams(location.hash.substring(1));
    if (params.get("corpus")) result.corpus = params.get("corpus");
    if (params.get("ymin")) result.yearMin = Number(params.get("ymin"));
    if (params.get("ymax")) result.yearMax = Number(params.get("ymax"));
    if (params.get("chart")) result.chart = params.get("chart");
    return result;
}

// ── Card collapse ──
function initCardCollapse() {
    document.querySelectorAll(".card-collapse-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const collapsible = btn.closest(".card-content").querySelector(".card-collapsible");
            if (!collapsible) return;
            const isCollapsed = collapsible.classList.toggle("collapsed");
            btn.classList.toggle("collapsed", isCollapsed);
            btn.title = isCollapsed ? "Expand" : "Collapse";
        });
    });
}

// ── Table sort persistence ──
function initSortPersistence() {
    if (!dataTableInstance) return;
    const saved = localStorage.getItem("tableSortOrder");
    if (saved) {
        try {
            const [col, dir] = JSON.parse(saved);
            dataTableInstance.order([col, dir]).draw();
        } catch { /* ignore parse errors */ }
    }
    dataTableInstance.on("order.dt", function () {
        const order = dataTableInstance.order();
        if (order.length) localStorage.setItem("tableSortOrder", JSON.stringify(order[0]));
    });
}

// ── Active filter chips ──
function initActiveFilterChips(headers) {
    if (!dataTableInstance) return;
    const container = document.getElementById("activeFilterChips");
    if (!container) return;

    const hiddenSet = new Set(["KEY", "DATABASE"]);
    const visHeaders = headers.filter((h) => !hiddenSet.has(h));

    function renderChips() {
        container.innerHTML = "";
        let hasChips = false;

        // Column filters
        for (const [ci, selected] of Object.entries(columnFilters)) {
            if (!selected || selected.size === 0) continue;
            const colName = visHeaders[ci];
            selected.forEach((val) => {
                hasChips = true;
                const chip = document.createElement("span");
                chip.className = "active-filter-chip";
                chip.innerHTML = `<b>${colName}:</b> ${val} <span class="chip-remove" data-col="${ci}" data-val="${val}">&times;</span>`;
                container.appendChild(chip);
            });
        }

        // Global search
        const searchVal = dataTableInstance.search();
        if (searchVal) {
            hasChips = true;
            const chip = document.createElement("span");
            chip.className = "active-filter-chip";
            chip.innerHTML = `<b>Search:</b> ${searchVal} <span class="chip-remove" data-type="search">&times;</span>`;
            container.appendChild(chip);
        }

        // Abstract search
        const absInput = document.getElementById("abstractSearch");
        if (absInput?.value.trim()) {
            hasChips = true;
            const chip = document.createElement("span");
            chip.className = "active-filter-chip";
            chip.innerHTML = `<b>Abstract:</b> ${absInput.value.trim()} <span class="chip-remove" data-type="abstract">&times;</span>`;
            container.appendChild(chip);
        }

        container.style.display = hasChips ? "" : "none";
    }

    container.addEventListener("click", (e) => {
        const remove = e.target.closest(".chip-remove");
        if (!remove) return;
        const type = remove.dataset.type;
        if (type === "search") {
            dataTableInstance.search("").draw();
            const searchInput = document.querySelector(".dataTables_filter input");
            if (searchInput) searchInput.value = "";
        } else if (type === "abstract") {
            const absInput = document.getElementById("abstractSearch");
            if (absInput) absInput.value = "";
            dataTableInstance.draw();
        } else {
            const ci = remove.dataset.col;
            const val = remove.dataset.val;
            if (columnFilters[ci]) {
                columnFilters[ci].delete(val);
                if (columnFilters[ci].size === 0) delete columnFilters[ci];
                // Update checkbox UI
                const escaped = val.replaceAll('"', '\\"');
                $(`.col-filter-list input[value="${escaped}"]`).prop("checked", false);
            }
            dataTableInstance.draw();
        }
        renderChips();
    });

    dataTableInstance.on("draw.dt", renderChips);
    renderChips();
}

// ── Bulk BibTeX export ──
function initBulkBibtex(data, headers) {
    const btn = document.getElementById("exportBibtex");
    if (!btn || !dataTableInstance) return;
    const hiddenSet = new Set(["KEY", "DATABASE"]);
    const visHeaders = headers.filter((h) => !hiddenSet.has(h));
    const bibIdx = visHeaders.indexOf("BIBTEX");

    btn.addEventListener("click", () => {
        const rows = dataTableInstance.rows({ search: "applied" }).data().toArray();
        const bibtexAll = rows.map((r) => r[bibIdx] || "").filter(Boolean).join("\n\n");
        if (!bibtexAll) { M.toast({ html: "No BibTeX entries found", classes: "red" }); return; }
        const blob = new Blob([bibtexAll], { type: "text/plain;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "articlecorpus_filtered.bib";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        M.toast({ html: `Exported ${rows.length} BibTeX entries`, classes: "teal" });
    });
}

// ── Reading list / bookmarks ──
function initReadingList(data, headers) {
    const RL_KEY = "readingList";
    const hiddenSet = new Set(["KEY", "DATABASE"]);
    const visHeaders = headers.filter((h) => !hiddenSet.has(h));
    const titleIdx = visHeaders.indexOf("TITLE");

    let readingList = new Set(JSON.parse(localStorage.getItem(RL_KEY) || "[]"));

    function save() {
        localStorage.setItem(RL_KEY, JSON.stringify([...readingList]));
        updateBadge();
    }

    function updateBadge() {
        const badge = document.getElementById("readingListCount");
        if (badge) {
            badge.textContent = readingList.size;
            badge.style.display = readingList.size > 0 ? "" : "none";
        }
    }

    // Update star states after draw
    function updateStars() {
        document.querySelectorAll("#tabla .star-btn").forEach((btn) => {
            btn.classList.toggle("starred", readingList.has(btn.dataset.title));
            btn.textContent = readingList.has(btn.dataset.title) ? "\u2605" : "\u2606";
        });
    }

    // Add star column
    if (dataTableInstance) {
        // Add star as first column via columnDefs createdCell
        dataTableInstance.on("draw.dt", updateStars);
    }

    // Delegate star click
    $("#tabla tbody").on("click", ".star-btn", function (e) {
        e.stopPropagation();
        const title = this.dataset.title;
        if (readingList.has(title)) readingList.delete(title);
        else readingList.add(title);
        save();
        updateStars();
    });

    // Show reading list button
    const showBtn = document.getElementById("showReadingList");
    let rlFilterActive = false;
    if (showBtn) {
        showBtn.addEventListener("click", () => {
            rlFilterActive = !rlFilterActive;
            showBtn.classList.toggle("active-rl", rlFilterActive);
            dataTableInstance.draw();
        });
    }

    // Custom filter for reading list
    $.fn.dataTable.ext.search.push((settings, searchData) => {
        if (settings.nTable.id !== "tabla") return true;
        if (!rlFilterActive) return true;
        const title = searchData[titleIdx] || "";
        return readingList.has(title.trim());
    });

    updateBadge();

    // Expose for title tooltip render
    globalThis._readingList = readingList;
    globalThis._readingListSave = save;
}

// ── Sparklines ──
function renderSparklines(data) {
    const years = {};
    data.forEach((r) => { if (r.YEAR) years[r.YEAR] = (years[r.YEAR] || 0) + 1; });
    const sorted = Object.entries(years).sort((a, b) => a[0].localeCompare(b[0]));
    if (sorted.length < 2) return;

    const vals = sorted.map(([, c]) => c);
    const max = Math.max(...vals);

    function drawSparkline(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = "#00796b";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        vals.forEach((v, i) => {
            const x = (i / (vals.length - 1)) * w;
            const y = h - (v / max) * (h - 4) - 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Dot for max
        const maxIdx = vals.indexOf(max);
        const mx = (maxIdx / (vals.length - 1)) * w;
        const my = h - (h - 4) - 2;
        ctx.fillStyle = "#e65100";
        ctx.beginPath();
        ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }

    drawSparkline("spark-avg-year");
    drawSparkline("spark-peak-year");
}

// ── Mobile card view ──
function initMobileCardView(headers) {
    if (window.innerWidth > 600) return;
    const hiddenSet = new Set(["KEY", "DATABASE"]);
    const visHeaders = headers.filter((h) => !hiddenSet.has(h));
    const wrapper = document.querySelector(".dataTables_wrapper");
    if (wrapper) wrapper.classList.add("mobile-card-view");

    if (dataTableInstance) {
        dataTableInstance.on("draw.dt", () => {
            document.querySelectorAll("#tabla tbody td").forEach((td) => {
                const ci = td.cellIndex;
                if (ci >= 0 && ci < visHeaders.length) {
                    td.dataset.label = visHeaders[ci];
                }
            });
        });
    }
}

// ── Search highlighting (outer scope so linter sees it as a named function) ──
function highlightCells() {
    document.querySelectorAll("#tabla .search-highlight").forEach((el) => {
        const parent = el.parentNode;
        parent.replaceChild(document.createTextNode(el.textContent), el);
        parent.normalize();
    });

    const query = dataTableInstance.search().toLowerCase();
    const absQuery = (document.getElementById("abstractSearch")?.value || "").trim().toLowerCase();
    const combined = query || absQuery;
    if (!combined) return;

    document.querySelectorAll("#tabla tbody td").forEach((td) => {
        if (td.querySelector("a.green-btn, .star-btn, .title-tooltip")) return;
        const targets = td.querySelectorAll(".table-chip");
        const nodes = targets.length > 0 ? [...targets] : [td];

        nodes.forEach((node) => {
            if (node !== td && node.querySelector?.("a, button")) return;
            const html = node.innerHTML;
            const lower = html.toLowerCase();
            const idx = lower.indexOf(combined);
            if (idx === -1) return;
            const before = html.substring(0, idx);
            if ((before.match(/</g) || []).length !== (before.match(/>/g) || []).length) return;
            node.innerHTML = html.substring(0, idx) +
                '<span class="search-highlight">' + html.substring(idx, idx + combined.length) + "</span>" +
                html.substring(idx + combined.length);
        });
    });
}

function initSearchHighlight() {
    if (!dataTableInstance) return;
    dataTableInstance.on("draw.dt", highlightCells);
}

// ── Tooltip abstract preview ──
function initTitleTooltips(data, headers) {
    if (!dataTableInstance) return;

    // Build a map of title → abstract directly from data keys
    const abstractMap = {};
    data.forEach((r) => {
        if (r.TITLE && r.ABSTRACT) abstractMap[r.TITLE.trim()] = r.ABSTRACT.trim();
    });

    document.getElementById("tabla").addEventListener("mouseover", (e) => {
        const td = e.target.closest("td.dt-title");
        if (!td || td.querySelector(".title-tooltip")) return;

        const link = td.querySelector("a[href]");
        const titleText = (link ? link.textContent : td.textContent).trim();
        const abstract = abstractMap[titleText];
        if (!abstract) return;

        const preview = abstract.length > 200 ? abstract.substring(0, 200) + "..." : abstract;
        const tooltip = document.createElement("div");
        tooltip.className = "title-tooltip";
        tooltip.textContent = preview;
        td.appendChild(tooltip);
    });

    document.getElementById("tabla").addEventListener("mouseout", (e) => {
        const td = e.target.closest("td.dt-title");
        if (!td) return;
        td.querySelector(".title-tooltip")?.remove();
    });
}
