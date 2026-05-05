const CSV_PATH = "data/articlecorpus.csv";

const TREND_ORDER = [
    "Unit Test Generation", "High-Level Test Gen", "Oracle Derivation",
    "Reflections", "Test Augmentation or Improvement", "Test Configuration or Execution",
];
const TREND_SHORT = {
    "Unit Test Generation":             "Unit Test Gen",
    "High-Level Test Gen":              "HL Test Gen",
    "Oracle Derivation":                "Oracle Deriv.",
    "Reflections":                      "Reflections",
    "Test Augmentation or Improvement": "Test Aug.",
    "Test Configuration or Execution":  "Test Config./Exec.",
};
const TREND_COLORS_MAP = {
    "Unit Test Generation":             "#0d47a1",
    "High-Level Test Gen":              "#1b5e20",
    "Oracle Derivation":                "#e65100",
    "Reflections":                      "#ad1457",
    "Test Augmentation or Improvement": "#4527a0",
    "Test Configuration or Execution":  "#006064",
};

function loadCSV(callback) {
    Papa.parse(CSV_PATH, {
        download: true,
        header: true,
        delimiter: ";",
        skipEmptyLines: true,
        complete: ({ data, meta }) => {
            data = data.filter((row) => row.ID?.trim());
            // Load conference URLs before initializing the table so chips have links
            loadConfUrls().catch(() => {}).finally(() => {
                callback(data, meta.fields);
            });
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
        { col: "APPROACH", name: "Approach", vals: ["Tool/Framework", "Agent"], color: "rgba(99,102,241,0.82)", band: "rgba(99,102,241,0.06)" },
        { col: "SCOPE", name: "Scope", vals: ["Functional", "Non-Functional"], color: "rgba(20,184,166,0.82)", band: "rgba(20,184,166,0.06)" },
        { col: "LLM ITERACTION", name: "LLM Interaction", vals: ["Pure Prompting", "Hybrid Prompting"], color: "rgba(59,130,246,0.82)", band: "rgba(59,130,246,0.06)" },
        { col: "CONTEXTUAL INFO", name: "Domain Specific Knowledge", vals: ["None", "Fine-Tuning", "RAG"], color: "rgba(245,158,11,0.82)", band: "rgba(245,158,11,0.06)" },
        { col: "FOCUS", name: "Focus", vals: ["Code/Procedure", "Data", "Optimization"], color: "rgba(236,72,153,0.82)", band: "rgba(236,72,153,0.06)" },
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
    const isHtmlChart = ["wordcloud", "coauthors", "trend_matrix", "conf_map"].includes(chartKey);

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
            const TREND_ORDER_TT = TREND_ORDER;
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
        case "conf_map": {
            renderConferenceMap(data);
            break;
        }

        // ── Cross-dimensional analysis ──

        case "llm_trend": {
            const llmMap = {};
            data.forEach((r) => {
                if (!r.TREND || !r["LLMs USED"]) return;
                const trends = r.TREND.split(",").map((s) => s.trim()).filter((t) => TREND_ORDER.includes(t));
                const llms = r["LLMs USED"].split(",").map((s) => s.trim())
                    .filter((v) => v && !["n/s", "none"].includes(v.toLowerCase()));
                trends.forEach((t) => llms.forEach((l) => {
                    llmMap[l] = llmMap[l] || {};
                    llmMap[l][t] = (llmMap[l][t] || 0) + 1;
                }));
            });
            const llmTotals = Object.entries(llmMap)
                .map(([l, tc]) => [l, Object.values(tc).reduce((a, b) => a + b, 0)])
                .sort((a, b) => b[1] - a[1]);
            const topLLMs = llmTotals.slice(0, 15).map(([l]) => l);
            const tShort = TREND_ORDER.map((t) => TREND_SHORT[t]);
            renderCrossHeatmap(cid, topLLMs, tShort,
                (row, col) => { const t = TREND_ORDER[tShort.indexOf(col)]; return llmMap[row]?.[t] || 0; },
                "Testing Trend", "LLM");
            break;
        }

        case "bench_trend": {
            const bMap = {};
            data.forEach((r) => {
                if (!r.TREND || !r.BENCHMARK) return;
                const trends = r.TREND.split(",").map((s) => s.trim()).filter((t) => TREND_ORDER.includes(t));
                const benches = r.BENCHMARK.split(",").map((s) => s.trim())
                    .filter((v) => v && !["none", "no bmk-ds", "n/s", "no bmk"].includes(v.toLowerCase()));
                trends.forEach((t) => benches.forEach((b) => {
                    bMap[b] = bMap[b] || {};
                    bMap[b][t] = (bMap[b][t] || 0) + 1;
                }));
            });
            const bTotals = Object.entries(bMap)
                .map(([b, tc]) => [b, Object.values(tc).reduce((a, v) => a + v, 0)])
                .sort((a, b) => b[1] - a[1]);
            const topBenches = bTotals.slice(0, 18).map(([b]) => b);
            const tShortB = TREND_ORDER.map((t) => TREND_SHORT[t]);
            renderCrossHeatmap(cid, topBenches, tShortB,
                (row, col) => { const t = TREND_ORDER[tShortB.indexOf(col)]; return bMap[row]?.[t] || 0; },
                "Testing Trend", "Benchmark", [13, 71, 161]);
            break;
        }

        case "metric_trend": {
            const mMap = {};
            data.forEach((r) => {
                if (!r.TREND || !r["EVALUATION METRIC"]) return;
                const trends = r.TREND.split(",").map((s) => s.trim()).filter((t) => TREND_ORDER.includes(t));
                const metrics = r["EVALUATION METRIC"].split(",").map((s) => s.trim())
                    .filter((v) => v && !["none", "no eval.", "n/s"].includes(v.toLowerCase()));
                trends.forEach((t) => metrics.forEach((m) => {
                    mMap[m] = mMap[m] || {};
                    mMap[m][t] = (mMap[m][t] || 0) + 1;
                }));
            });
            const mTotals = Object.entries(mMap)
                .map(([m, tc]) => [m, Object.values(tc).reduce((a, v) => a + v, 0)])
                .sort((a, b) => b[1] - a[1]);
            const topMetrics = mTotals.slice(0, 18).map(([m]) => m);
            const tShortM = TREND_ORDER.map((t) => TREND_SHORT[t]);
            renderCrossHeatmap(cid, topMetrics, tShortM,
                (row, col) => { const t = TREND_ORDER[tShortM.indexOf(col)]; return mMap[row]?.[t] || 0; },
                "Testing Trend", "Evaluation Metric", [74, 20, 140]);
            break;
        }

        case "gap_matrix": {
            const gMap = {};
            const FOCUS_VALS = ["Code/Procedure", "Data", "Optimization"];
            TREND_ORDER.forEach((t) => { gMap[t] = {}; FOCUS_VALS.forEach((f) => { gMap[t][f] = 0; }); });
            data.forEach((r) => {
                if (!r.TREND || !r.FOCUS) return;
                const trends = r.TREND.split(",").map((s) => s.trim()).filter((t) => TREND_ORDER.includes(t));
                const focuses = r.FOCUS.split(",").map((s) => s.trim()).filter((f) => FOCUS_VALS.includes(f));
                trends.forEach((t) => focuses.forEach((f) => { gMap[t][f] = (gMap[t][f] || 0) + 1; }));
            });
            renderCrossHeatmap(cid, TREND_ORDER, FOCUS_VALS,
                (row, col) => gMap[row]?.[col] || 0,
                "Focus Area", "Testing Trend", [183, 28, 28]);
            break;
        }

        case "dsk_trend": {
            const dMap = {};
            const DSK_VALS = ["None", "Fine-Tuning", "RAG"];
            DSK_VALS.forEach((d) => { dMap[d] = {}; });
            data.forEach((r) => {
                if (!r.TREND || !r["CONTEXTUAL INFO"]) return;
                const trends = r.TREND.split(",").map((s) => s.trim()).filter((t) => TREND_ORDER.includes(t));
                const dsks = r["CONTEXTUAL INFO"].split(",").map((s) => s.trim()).filter((d) => DSK_VALS.includes(d));
                trends.forEach((t) => dsks.forEach((d) => {
                    dMap[d][t] = (dMap[d][t] || 0) + 1;
                }));
            });
            const tShortD = TREND_ORDER.map((t) => TREND_SHORT[t]);
            renderCrossHeatmap(cid, DSK_VALS, tShortD,
                (row, col) => { const t = TREND_ORDER[tShortD.indexOf(col)]; return dMap[row]?.[t] || 0; },
                "Testing Trend", "Domain Knowledge", [230, 81, 0]);
            break;
        }

        case "contrib_time": {
            const ctYears = [...new Set(data.map((r) => r.YEAR).filter(Boolean))].sort();
            const CONTRIB_VALS = ["Survey", "New Method/Tool", "Evaluation"];
            const CONTRIB_COLORS = ["#1565c0", "#2e7d32", "#e65100"];
            const ctCounts = {};
            CONTRIB_VALS.forEach((c) => { ctCounts[c] = {}; });
            data.forEach((r) => {
                if (!r.YEAR || !r["TYPE OF CONTRIBUTION"]) return;
                const vals = r["TYPE OF CONTRIBUTION"].split(",").map((s) => s.trim())
                    .filter((v) => CONTRIB_VALS.includes(v));
                vals.forEach((v) => { ctCounts[v][r.YEAR] = (ctCounts[v][r.YEAR] || 0) + 1; });
            });
            const ctDatasets = CONTRIB_VALS.map((v, i) => ({
                label: v,
                data: ctYears.map((y) => ctCounts[v][y] || 0),
                borderColor: CONTRIB_COLORS[i],
                backgroundColor: CONTRIB_COLORS[i] + "55",
                fill: true,
                tension: 0.3,
                pointRadius: 4,
            }));
            renderStackedAreaChart(cid, ctYears, ctDatasets, "No. Articles");
            break;
        }

        case "sankey": {
            const SANKEY_TRENDS = TREND_ORDER.filter((t) => t !== "Reflections");
            const SANKEY_DIMS = [
                { col: "TREND",           vals: SANKEY_TRENDS },
                { col: "APPROACH",        vals: ["Tool/Framework", "Agent"] },
                { col: "SCOPE",           vals: ["Functional", "Non-Functional"] },
                { col: "LLM ITERACTION",  vals: ["Pure Prompting", "Hybrid Prompting"] },
                { col: "CONTEXTUAL INFO", vals: ["None", "Fine-Tuning", "RAG"] },
                { col: "FOCUS",           vals: ["Code/Procedure", "Data", "Optimization"] },
            ];
            const flowMaps = SANKEY_DIMS.slice(0, -1).map(() => ({}));
            data.forEach((r) => {
                const dimVals = SANKEY_DIMS.map((d) =>
                    (r[d.col] || "").split(",").map((s) => s.trim()).filter((v) => d.vals.includes(v))
                );
                for (let i = 0; i < SANKEY_DIMS.length - 1; i++) {
                    dimVals[i].forEach((from) => {
                        dimVals[i + 1].forEach((to) => {
                            const k = from + "|||" + to;
                            flowMaps[i][k] = (flowMaps[i][k] || 0) + 1;
                        });
                    });
                }
            });
            const links = flowMaps.flatMap((fMap) =>
                Object.entries(fMap).map(([k, flow]) => { const [from, to] = k.split("|||"); return { from, to, flow }; })
            );
            // Colors matched to the Plotly reference
            const NODE_COLORS = {
                "Unit Test Generation":              "#6366f1",
                "High-Level Test Gen":               "#f59e0b",
                "Oracle Derivation":                 "#10b981",
                "Test Augmentation or Improvement":  "#ef4444",
                "Test Configuration or Execution":   "#8b5cf6",
                "Tool/Framework":                     "#0ea5e9",
                "Agent":                             "#f97316",
                "Functional":                        "#14b8a6",
                "Non-Functional":                    "#ec4899",
                "Pure Prompting":                    "#3b82f6",
                "Hybrid Prompting":                  "#84cc16",
                "None":                              "#cbd5e1",
                "Fine-Tuning":                       "#94a3b8",
                "RAG":                               "#06b6d4",
                "Code/Procedure":                    "#64748b",
                "Data":                              "#a78bfa",
                "Optimization":                      "#10b981",
            };
            const NODE_LABELS = {
                "Unit Test Generation":              "Unit Test Gen",
                "High-Level Test Gen":               "HL Test Gen",
                "Oracle Derivation":                 "Oracle Deriv.",
                "Test Augmentation or Improvement":  "Test Aug.",
                "Test Configuration or Execution":   "Test Config./Exec.",
                "Tool/Framework":                     "Tool/Framework",
                "Code/Procedure":                    "Code/Procedure",
            };
            renderSankeyChart(cid, links, NODE_COLORS, NODE_LABELS);
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

    const TRENDS = TREND_ORDER;

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
        "Oracle Derivation": "Oracle",
        "Reflections": "Reflections",
        "Test Augmentation or Improvement": "Augmentation",
        "Test Configuration or Execution": "Config./Exec.",
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

// ── Conference URLs (shared across charts) ──
let _confUrls = null;

function loadConfUrls() {
    if (_confUrls) return Promise.resolve(_confUrls);
    return fetch("dashboard/data/conference_urls.json")
        .then((r) => r.json())
        .then((urls) => { _confUrls = urls; return urls; });
}

function confLink(name, year, urls) {
    const key = year ? name + " " + year : name;
    const url = urls ? urls[key] : null;
    if (url) return `<a href="${url}" target="_blank" rel="noopener" style="font-weight:600">${name}</a>`;
    return `<b>${name}</b>`;
}

// ── Conference Map (Leaflet) ──
let _confCoords = null;
let _confMapInstance = null;

function renderConferenceMap(data) {
    const htmlDiv = document.getElementById("grafica-html");

    function build(coords, urls) {
        // Extract address from BibTeX for each conference paper
        const addrRegex = /address\s*=\s*\{([^}]+)\}/i;
        const locations = {};
        data.forEach((r) => {
            const pub = (r["PUBLISHED INTO"] || "").trim();
            if (!pub.startsWith("C:")) return;
            const conf = pub.replace(/^C:\s*/, "");
            const bib = r.BIBTEX || "";
            const m = bib.match(addrRegex);
            if (!m) return;
            const addr = m[1].trim();
            const c = coords[addr];
            if (!c) return;
            const key = c.lat + "," + c.lng;
            if (!locations[key]) locations[key] = { lat: c.lat, lng: c.lng, papers: [], confs: new Set() };
            locations[key].papers.push({ title: r.TITLE || r.ID, conf, year: r.YEAR });
            locations[key].confs.add(conf);
        });

        // Build map container
        htmlDiv.innerHTML = '<div id="conf-map" style="height:100%;min-height:400px;width:100%;border-radius:8px;"></div>';

        if (_confMapInstance) { _confMapInstance.remove(); _confMapInstance = null; }
        const map = L.map("conf-map").setView([20, 0], 2);
        _confMapInstance = map;
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 18,
        }).addTo(map);

        const maxPapers = Math.max(1, ...Object.values(locations).map((l) => l.papers.length));

        Object.values(locations).forEach((loc) => {
            const radius = 8 + (loc.papers.length / maxPapers) * 22;
            const confs = [...loc.confs].sort().map((c) => confLink(c, null, urls)).join(", ");
            const paperList = loc.papers
                .sort((a, b) => (a.year || "").localeCompare(b.year || ""))
                .map((p) => `<li>${confLink(p.conf, p.year, urls)} (${p.year}) — ${p.title}</li>`)
                .join("");
            const popup = `<div style="max-height:200px;overflow:auto;">${confs} — ${loc.papers.length} paper(s)<ul style="margin:4px 0 0 16px;padding:0;font-size:0.85rem;">${paperList}</ul></div>`;
            L.circleMarker([loc.lat, loc.lng], {
                radius,
                fillColor: "#00695c",
                color: "#004d40",
                weight: 1,
                fillOpacity: 0.7,
            }).addTo(map).bindPopup(popup);
        });

        // Fix Leaflet rendering in hidden containers
        setTimeout(() => map.invalidateSize(), 200);
    }

    Promise.all([
        _confCoords ? Promise.resolve(_confCoords) : fetch("dashboard/data/conference_coords.json").then((r) => r.json()).then((c) => { _confCoords = c; return c; }),
        loadConfUrls().catch(() => null),
    ]).then(([coords, urls]) => build(coords, urls))
      .catch((err) => { htmlDiv.innerHTML = '<p class="red-text">Could not load conference data: ' + err.message + '</p>'; });
}
