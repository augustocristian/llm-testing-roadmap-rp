const CSV_PATH = "data/Papers.csv";

function loadCSV(callback) {
    Papa.parse(CSV_PATH, {
        download: true,
        header: true,
        delimiter: ";",
        skipEmptyLines: true,
        complete: ({ data, meta }) => {
            data = data.filter((row) => row.ID?.trim());
            callback(data, meta.fields);
        },
    });
}

// ── Utilities ──

function filterByCorpus(data, corpus) {
    if (corpus === "initial") return data.filter((r) => r.ID?.startsWith("P"));
    if (corpus === "validation") return data.filter((r) => r.ID?.startsWith("V"));
    return data;
}

function filterByYear(data, minYear, maxYear) {
    return data.filter((r) => {
        const y = parseFloat(r.YEAR);
        return !isNaN(y) && y >= minYear && y <= maxYear;
    });
}

function applyFilters(data, corpus, yearRange) {
    let filtered = filterByCorpus(data, corpus);
    if (yearRange) filtered = filterByYear(filtered, yearRange[0], yearRange[1]);
    return filtered;
}

function countField(data, field, splitChar = ",", exclude = []) {
    const counts = {};
    data.forEach((r) => {
        const val = r[field];
        if (!val || exclude.includes(val.trim().toLowerCase())) return;
        val.split(splitChar).map((s) => s.trim()).filter(Boolean).forEach((v) => {
            counts[v] = (counts[v] || 0) + 1;
        });
    });
    return counts;
}

// ── Stats bar ──

function updateStats(data) {
    document.getElementById("stat-total").textContent = data.length;
    let j = 0, c = 0, a = 0;
    data.forEach((r) => {
        const t = (r["PUBLICATION TYPE"] || "").trim();
        if (t === "Journal") j++;
        else if (t === "Conference") c++;
        else if (t === "arXiv") a++;
    });
    document.getElementById("stat-journals").textContent = j;
    document.getElementById("stat-conferences").textContent = c;
    document.getElementById("stat-arxiv").textContent = a;
}

// ── Bubble chart: Classification Dimensions by Research Trend ──

function renderBubbleDashboard(data) {
    const DIMS = [
        { col: "APPROACH", name: "Approach", vals: ["Tool/Approach", "Agent"], color: "rgba(99,102,241,0.82)", band: "rgba(99,102,241,0.06)" },
        { col: "SCOPE", name: "Scope", vals: ["Functional", "Non-Functional"], color: "rgba(20,184,166,0.82)", band: "rgba(20,184,166,0.06)" },
        { col: "LLM ITERACTION", name: "LLM Interaction", vals: ["Pure Prompting", "Hybrid Prompting"], color: "rgba(59,130,246,0.82)", band: "rgba(59,130,246,0.06)" },
        { col: "CONTEXTUAL INFO", name: "Contextual Info", vals: ["Alone", "Fine-Tune", "RAG"], color: "rgba(245,158,11,0.82)", band: "rgba(245,158,11,0.06)" },
        { col: "FOCUS", name: "Focus", vals: ["Code/Proccedure", "Data", "Optimization"], color: "rgba(236,72,153,0.82)", band: "rgba(236,72,153,0.06)" },
    ];

    const TREND_ORDER = [
        "Unit Test Generation", "High-Level Test Gen", "Oracle Generation",
        "Reflections", "Test Augmentation or Improvement", "Test Configuration",
    ];
    const yLabels = [...TREND_ORDER].reverse();

    // Build x-axis slots with gaps between dimension groups
    const xSlots = [];
    const xGroups = [];
    let xPos = 0;
    const GAP = 1;
    DIMS.forEach((dim, di) => {
        const startPos = xPos;
        dim.vals.forEach((val) => {
            xSlots.push({ pos: xPos, label: val, dimIdx: di });
            xPos++;
        });
        xGroups.push({ label: dim.name, startPos, endPos: xPos - 1, color: dim.color, band: dim.band });
        if (di < DIMS.length - 1) xPos += GAP;
    });
    const maxXPos = xPos - 1;

    // Count (trend, dim_name, val) intersections
    const counts = {};
    data.forEach((r) => {
        const trendRaw = (r.TREND || "").trim();
        if (!trendRaw) return;
        const trends = trendRaw.split(",").map((s) => s.trim()).filter((t) => TREND_ORDER.includes(t));
        trends.forEach((trend) => {
            DIMS.forEach((dim) => {
                const colVal = (r[dim.col] || "").trim();
                if (!colVal) return;
                colVal.split(",").map((s) => s.trim()).filter(Boolean).forEach((v) => {
                    if (dim.vals.includes(v)) {
                        const key = `${trend}|${dim.name}|${v}`;
                        counts[key] = (counts[key] || 0) + 1;
                    }
                });
            });
        });
    });

    const maxCount = Math.max(1, ...Object.values(counts));

    // One dataset per dimension (for colored legend)
    const datasets = DIMS.map((dim, di) => {
        const points = [];
        dim.vals.forEach((val) => {
            const slot = xSlots.find((s) => s.dimIdx === di && s.label === val);
            yLabels.forEach((trend, yi) => {
                const c = counts[`${trend}|${dim.name}|${val}`] || 0;
                if (c > 0) {
                    points.push({
                        x: slot.pos,
                        y: yi,
                        r: Math.max(4, Math.sqrt(c / maxCount) * 22),
                        count: c,
                    });
                }
            });
        });
        return {
            label: dim.name,
            data: points,
            backgroundColor: dim.color,
            borderColor: "white",
            borderWidth: 1.5,
        };
    });

    renderBubbleChart("chart-bubble", { datasets, xSlots, xGroups, yLabels, maxX: maxXPos });
}

// ── Insights chart (selectable) ──

function renderInsightsChart(data, chartKey) {
    const cid = "grafica";
    const canvasEl = document.getElementById(cid);
    const htmlDiv = document.getElementById("grafica-html");
    const isHtmlChart = ["wordcloud", "coauthors", "trend_matrix"].includes(chartKey);

    // Destroy first — destroyChart may reset canvasWrapper display for venue charts
    destroyChart(cid);

    // Set visibility AFTER destroy so we always get the correct final state
    if (canvasEl) {
        canvasEl.style.display = "";
        canvasEl.parentElement.style.display = isHtmlChart ? "none" : "";
    }
    if (htmlDiv) {
        htmlDiv.style.display = isHtmlChart ? "" : "none";
        htmlDiv.innerHTML = "";
    }

    switch (chartKey) {
        case "ano": {
            const years = [...new Set(data.map((r) => r.YEAR).filter(Boolean))].sort();

            // Classify each row by venue
            const venues = {};
            const venueType = {};
            data.forEach((r) => {
                if (!r.YEAR) return;
                const pubType = (r["PUBLICATION TYPE"] || "").trim();
                const pubInto = (r["PUBLISHED INTO"] || "").trim();
                let venue, vtype;
                if (pubType === "arXiv") {
                    venue = "arXiv";
                    vtype = "arxiv";
                } else if (pubInto.startsWith("C:")) {
                    venue = pubInto.replace(/^C:\s*/, "");
                    vtype = "conf";
                } else if (pubInto.startsWith("J:")) {
                    venue = pubInto.replace(/^J:\s*/, "");
                    vtype = "jour";
                } else {
                    venue = pubInto || pubType || "Other";
                    vtype = "conf";
                }
                venueType[venue] = vtype;
                venues[venue] ??= {};
                venues[venue][r.YEAR] = (venues[venue][r.YEAR] || 0) + 1;
            });

            const total = (v) => Object.values(venues[v]).reduce((s, n) => s + n, 0);
            const confAll = Object.keys(venues).filter((v) => venueType[v] === "conf").sort((a, b) => total(b) - total(a));
            const jourAll = Object.keys(venues).filter((v) => venueType[v] === "jour").sort((a, b) => total(b) - total(a));
            const arxivVenues = Object.keys(venues).filter((v) => venueType[v] === "arxiv");

            // Group conferences beyond top 14 into "Other Conf."
            const TOP_CONF = 14, TOP_JOUR = 7;
            const confVenues = confAll.slice(0, TOP_CONF);
            if (confAll.length > TOP_CONF) {
                venues["Other Conf."] = {};
                confAll.slice(TOP_CONF).forEach((v) => {
                    years.forEach((y) => { venues["Other Conf."][y] = (venues["Other Conf."][y] || 0) + (venues[v][y] || 0); });
                });
                confVenues.unshift("Other Conf.");
                venueType["Other Conf."] = "conf";
            }
            // Group journals beyond top 7 into "Other Jour."
            const jourVenues = jourAll.slice(0, TOP_JOUR);
            if (jourAll.length > TOP_JOUR) {
                venues["Other Jour."] = {};
                jourAll.slice(TOP_JOUR).forEach((v) => {
                    years.forEach((y) => { venues["Other Jour."][y] = (venues["Other Jour."][y] || 0) + (venues[v][y] || 0); });
                });
                jourVenues.unshift("Other Jour.");
                venueType["Other Jour."] = "jour";
            }
            const stackOrder = [...confVenues, ...jourVenues, ...arxivVenues];

            const CONF_PAL = ["#115740", "#046A38", "#00843D", "#00B140", "#6CC24A", "#A4D65E", "#C8DFA4", "#2E7D32", "#4CAF50", "#66BB6A", "#81C784", "#A5D6A7", "#C8E6C9", "#388E3C"];
            const JOUR_PAL = ["#00205B", "#0032A0", "#003DA5", "#00A3E0", "#41B6E6", "#71C5E8", "#A8D5E8"];
            const colorMap = {};
            confVenues.forEach((v, i) => { colorMap[v] = CONF_PAL[i % CONF_PAL.length]; });
            jourVenues.forEach((v, i) => { colorMap[v] = JOUR_PAL[i % JOUR_PAL.length]; });
            arxivVenues.forEach((v) => { colorMap[v] = "#E56A54"; });

            const datasets = stackOrder.map((venue) => ({
                label: venue,
                data: years.map((y) => venues[venue][y] || 0),
                backgroundColor: colorMap[venue],
                borderColor: "white",
                borderWidth: 0.6,
            }));
            const venueGroups = [
                { title: "Conferences", count: confVenues.length },
                { title: "Journals", count: jourVenues.length },
                { title: "Preprints", count: arxivVenues.length },
            ];
            renderVenueChart(cid, years, datasets, venueGroups);
            break;
        }
        case "trend_time": {
            const ttYears = [...new Set(data.map((r) => r.YEAR).filter(Boolean))].sort();
            const TREND_ORDER_TT = [
                "Unit Test Generation", "High-Level Test Gen", "Oracle Generation",
                "Reflections", "Test Augmentation or Improvement", "Test Configuration",
            ];
            const TREND_PAL = ["#0d47a1", "#1b5e20", "#e65100", "#ad1457", "#4527a0", "#006064"];
            const ttCounts = {};
            TREND_ORDER_TT.forEach((t) => { ttCounts[t] = {}; });
            data.forEach((r) => {
                if (!r.YEAR || !r.TREND) return;
                r.TREND.split(",").map((s) => s.trim()).filter((t) => TREND_ORDER_TT.includes(t)).forEach((t) => {
                    ttCounts[t][r.YEAR] = (ttCounts[t][r.YEAR] || 0) + 1;
                });
            });
            const ttDatasets = TREND_ORDER_TT.map((trend, i) => ({
                label: trend,
                data: ttYears.map((y) => ttCounts[trend][y] || 0),
                borderColor: TREND_PAL[i],
                backgroundColor: TREND_PAL[i] + "33",
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6,
            }));
            renderLineChart(cid, ttYears, ttDatasets, "Trends over Time");
            break;
        }
        case "llmsused":
            renderBarFromCount(cid, data, "LLMs USED", "LLMs Used", ["n/s", "none"]);
            break;
        case "benchmarks":
            renderBarFromCount(cid, data, "BENCHMARK", "Benchmarks", ["none", "no bmk-ds"]);
            break;
        case "metrics":
            renderBarFromCount(cid, data, "EVALUATION METRIC", "Metrics", ["none", "no eval."]);
            break;
        case "tools":
            renderBarFromCount(cid, data, "TOOL", "Tools", ["-", "none", "n/s"]);
            break;
        case "llm_timeline": {
            const ltYears = [...new Set(data.map((r) => r.YEAR).filter(Boolean))].sort();
            const ltCounts = {};
            data.forEach((r) => {
                if (!r.YEAR || !r["LLMs USED"]) return;
                r["LLMs USED"].split(",").map((s) => s.trim()).filter((v) => v && !["n/s", "none"].includes(v.toLowerCase())).forEach((llm) => {
                    ltCounts[llm] ??= {};
                    ltCounts[llm][r.YEAR] = (ltCounts[llm][r.YEAR] || 0) + 1;
                });
            });
            const ltTotals = Object.entries(ltCounts).map(([llm, yc]) => [llm, Object.values(yc).reduce((a, b) => a + b, 0)]);
            ltTotals.sort((a, b) => b[1] - a[1]);
            const topLLMs = ltTotals.slice(0, 15).map(([l]) => l);
            renderLLMHeatmap(cid, ltYears, topLLMs, ltCounts);
            break;
        }
        case "contribution":
            renderPieFromCount(cid, data, "TYPE OF CONTRIBUTION");
            break;
        case "database":
            renderPieFromCount(cid, data, "DATABASE");
            break;
        case "conferences": {
            const cc = {};
            data.forEach((r) => {
                const v = (r["PUBLISHED INTO"] || "").trim();
                if (v.startsWith("C:")) { const k = v.replace(/^C:\s*/, ""); cc[k] = (cc[k] || 0) + 1; }
            });
            const ccSorted = Object.entries(cc).sort((a, b) => b[1] - a[1]);
            const ccTop = ccSorted.slice(0, 14);
            const ccOthers = ccSorted.slice(14).reduce((s, e) => s + e[1], 0);
            if (ccOthers > 0) ccTop.push(["Others", ccOthers]);
            renderPieChart(cid, ccTop.map(([k]) => k), ccTop.map(([, v]) => v));
            break;
        }
        case "journals": {
            const jc = {};
            data.forEach((r) => {
                const v = (r["PUBLISHED INTO"] || "").trim();
                if (v.startsWith("J:")) { const k = v.replace(/^J:\s*/, ""); jc[k] = (jc[k] || 0) + 1; }
            });
            const jcSorted = Object.entries(jc).sort((a, b) => b[1] - a[1]);
            const jcTop = jcSorted.slice(0, 7);
            const jcOthers = jcSorted.slice(7).reduce((s, e) => s + e[1], 0);
            if (jcOthers > 0) jcTop.push(["Others", jcOthers]);
            renderPieChart(cid, jcTop.map(([k]) => k), jcTop.map(([, v]) => v));
            break;
        }
        case "wordcloud": {
            renderWordCloud(data);
            break;
        }
        case "coauthors": {
            renderCoauthorTable(data);
            break;
        }
        case "trend_matrix": {
            renderTrendMatrix(data);
            break;
        }
    }
}

// ── Word cloud (HTML-based) ──
function renderWordCloud(data) {
    const htmlDiv = document.getElementById("grafica-html");

    const STOP = new Set(["the","a","an","of","in","to","and","for","is","are","was","were","be","been",
        "with","that","this","on","by","from","as","at","or","not","it","we","our","can","has","have",
        "which","their","its","such","these","than","also","but","more","into","each","using","used",
        "based","between","both","other","about","all","over","may","one","two","new","they","when",
        "how","do","does","did","no","if","will","would","could","should","most","only","then","them",
        "where","what","who","so","up","out","some","through","while","after","before","i","ii","e","g",
        "et","al","ie","eg","vs","per","via"]);
    const words = {};
    data.forEach((r) => {
        const text = (r.ABSTRACT || "") + " " + (r.TITLE || "");
        text.toLowerCase().replace(/[^a-z]/g, " ").split(/\s+/).forEach((w) => {
            if (w.length > 2 && !STOP.has(w)) words[w] = (words[w] || 0) + 1;
        });
    });
    const sorted = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 120);
    const maxF = sorted[0]?.[1] || 1;
    const colors = ["#00796b","#0d47a1","#ad1457","#e65100","#4527a0","#1b5e20","#006064","#bf360c","#283593","#c62828"];

    let html = '<div style="text-align:center;padding:20px;line-height:2.2;">';
    sorted.forEach(([word, count], i) => {
        const size = Math.max(11, Math.round((count / maxF) * 48));
        const color = colors[i % colors.length];
        const opacity = 0.5 + 0.5 * (count / maxF);
        html += `<span class="wc-word" style="font-size:${size}px;color:${color};opacity:${opacity};font-weight:${size > 24 ? 700 : 400};" title="${word}: ${count}">${word}</span> `;
    });
    html += "</div>";
    htmlDiv.innerHTML = html;
}

// ── Author co-occurrence table ──
function renderCoauthorTable(data) {
    const htmlDiv = document.getElementById("grafica-html");

    const pairs = {};
    data.forEach((r) => {
        const bibtex = r.BIBTEX || "";
        const authMatch = bibtex.match(/author\s*=\s*[{"]([^}"]+)[}"]/i);
        if (!authMatch) return;
        const authors = authMatch[1].split(" and ").map((a) => a.trim().replace(/\s+/g, " ")).filter(Boolean);
        for (let i = 0; i < authors.length; i++) {
            for (let j = i + 1; j < authors.length; j++) {
                const pair = [authors[i], authors[j]].sort().join(" & ");
                pairs[pair] = (pairs[pair] || 0) + 1;
            }
        }
    });
    const sorted = Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 30);
    const maxP = sorted[0]?.[1] || 1;

    let html = '<table class="coauthor-table"><thead><tr><th>Author Pair</th><th>Co-authored Papers</th></tr></thead><tbody>';
    sorted.forEach(([pair, count]) => {
        const w = Math.round((count / maxP) * 200);
        html += `<tr><td>${pair}</td><td><span class="coauthor-bar" style="width:${w}px;"></span>${count}</td></tr>`;
    });
    html += "</tbody></table>";
    htmlDiv.innerHTML = html;
}

// ── Trend co-occurrence matrix (HTML-based) ──
function renderTrendMatrix(data) {
    const htmlDiv = document.getElementById("grafica-html");

    const TRENDS = [
        "Unit Test Generation", "High-Level Test Gen", "Oracle Generation",
        "Reflections", "Test Augmentation or Improvement", "Test Configuration",
    ];

    // Build co-occurrence matrix
    const matrix = {};
    TRENDS.forEach((a) => { matrix[a] = {}; TRENDS.forEach((b) => { matrix[a][b] = 0; }); });

    data.forEach((r) => {
        const trends = (r.TREND || "").split(",").map((s) => s.trim()).filter((t) => TRENDS.includes(t));
        // Count single occurrences on diagonal
        trends.forEach((t) => { matrix[t][t]++; });
        // Count co-occurrences
        for (let i = 0; i < trends.length; i++) {
            for (let j = i + 1; j < trends.length; j++) {
                matrix[trends[i]][trends[j]]++;
                matrix[trends[j]][trends[i]]++;
            }
        }
    });

    const maxOff = Math.max(1, ...TRENDS.flatMap((a) => TRENDS.map((b) => a === b ? 0 : matrix[a][b])));

    const SHORT = {
        "Unit Test Generation": "Unit Test",
        "High-Level Test Gen": "HL Test",
        "Oracle Generation": "Oracle",
        "Reflections": "Reflections",
        "Test Augmentation or Improvement": "Augmentation",
        "Test Configuration": "Config",
    };

    let html = '<div style="overflow-x:auto;padding:10px;"><table class="coauthor-table" style="min-width:500px;">';
    html += "<thead><tr><th></th>";
    TRENDS.forEach((t) => { html += `<th style="text-align:center;font-size:0.72rem;writing-mode:vertical-rl;transform:rotate(180deg);height:90px;">${SHORT[t]}</th>`; });
    html += "</tr></thead><tbody>";

    TRENDS.forEach((row) => {
        html += `<tr><td style="font-weight:600;font-size:0.78rem;white-space:nowrap;">${SHORT[row]}</td>`;
        TRENDS.forEach((col) => {
            const val = matrix[row][col];
            if (row === col) {
                html += `<td style="text-align:center;background:#e0f2f1;font-weight:700;color:#00695c;">${val}</td>`;
            } else {
                const intensity = val / maxOff;
                const bg = `rgba(0,121,107,${(intensity * 0.7 + 0.05).toFixed(2)})`;
                const fg = intensity > 0.4 ? "#fff" : "#333";
                html += `<td style="text-align:center;background:${bg};color:${fg};font-size:0.82rem;">${val || ""}</td>`;
            }
        });
        html += "</tr>";
    });
    html += "</tbody></table></div>";
    htmlDiv.innerHTML = html;
}

function renderBarFromCount(cid, data, field, label, exclude = []) {
    const c = countField(data, field, ",", exclude);
    const sorted = Object.entries(c).sort((a, b) => b[1] - a[1]);
    renderBarChart(cid, sorted.map(([k]) => k), sorted.map(([, v]) => v), label);
}

function renderPieFromCount(cid, data, field) {
    const c = countField(data, field);
    renderPieChart(cid, Object.keys(c), Object.values(c));
}
