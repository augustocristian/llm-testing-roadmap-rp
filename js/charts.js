// Chart instance registry (keyed by canvas id)
const chartInstances = {};

function destroyChart(canvasId) {
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
        delete chartInstances[canvasId];
    }
    // Remove custom HTML legend if present
    const canvas = document.getElementById(canvasId);
    if (canvas) {
        const wrapper = canvas.parentElement;
        const legend = wrapper.querySelector(".venue-legend");
        if (legend) {
            legend.remove();
            wrapper.style.display = "";
        }
    }
}

function getCanvas(canvasId) {
    return document.getElementById(canvasId);
}

function generateColors(count, lightness = 65) {
    return Array.from({ length: count }, (_, i) => `hsl(${(i * 360) / count}, 70%, ${lightness}%)`);
}

// ── Bar chart ──
function renderBarChart(canvasId, labels, data, label, options = {}) {
    destroyChart(canvasId);
    const canvas = getCanvas(canvasId);
    chartInstances[canvasId] = new Chart(canvas, {
        type: "bar",
        data: {
            labels,
            datasets: [{ label, data, backgroundColor: generateColors(labels.length) }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { title: { display: true, text: "No. Articles" } } },
            onClick: (evt, elems) => {
                if (elems.length > 0) {
                    const idx = elems[0].index;
                    chartClickFilter(label, labels[idx]);
                }
            },
            ...options,
        },
    });
}

// ── LLM usage timeline heatmap (bar chart fallback) ──
function renderLLMHeatmap(canvasId, years, llms, counts) {
    destroyChart(canvasId);
    const colors = generateColors(llms.length);
    const datasets = llms.map((llm, i) => ({
        label: llm,
        data: years.map((y) => counts[llm]?.[y] || 0),
        backgroundColor: colors[i],
        borderColor: "white",
        borderWidth: 0.5,
    }));
    chartInstances[canvasId] = new Chart(getCanvas(canvasId), {
        type: "bar",
        data: { labels: years, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: "right", labels: { font: { size: 10 }, boxWidth: 12, padding: 5 } },
                tooltip: { mode: "nearest", intersect: true },
            },
            scales: {
                x: { stacked: true, title: { display: true, text: "Year" } },
                y: { stacked: true, beginAtZero: true, title: { display: true, text: "No. Papers" } },
            },
        },
    });
}

// ── Pie chart ──
function renderPieChart(canvasId, labels, data) {
    destroyChart(canvasId);
    chartInstances[canvasId] = new Chart(getCanvas(canvasId), {
        type: "pie",
        data: {
            labels,
            datasets: [{ data, backgroundColor: generateColors(labels.length) }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "right", labels: { font: { size: 11 } } } },
            onClick: (evt, elems) => {
                if (elems.length > 0) {
                    const idx = elems[0].index;
                    chartClickFilter("", labels[idx]);
                }
            },
        },
    });
}

// ── Line chart (for trends over time) ──
function renderLineChart(canvasId, labels, datasets, title) {
    destroyChart(canvasId);
    chartInstances[canvasId] = new Chart(getCanvas(canvasId), {
        type: "line",
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: "right", labels: { font: { size: 11 }, boxWidth: 14, padding: 8 } },
                tooltip: { mode: "index", intersect: false },
            },
            interaction: { mode: "nearest", axis: "x", intersect: false },
            scales: {
                x: { title: { display: true, text: "Year" } },
                y: { beginAtZero: true, title: { display: true, text: "No. Articles" } },
            },
        },
    });
}

// ── Cross-linking: scroll to table and apply filter ──
function chartClickFilter(field, value) {
    // Scroll to table section
    const tableSection = document.getElementById("section-table");
    if (tableSection) tableSection.scrollIntoView({ behavior: "smooth", block: "start" });
    // Apply filter via DataTable search
    if (typeof dataTableInstance !== "undefined" && dataTableInstance) {
        dataTableInstance.search(value).draw();
        // Flash the search box to indicate
        const searchInput = document.querySelector(".dataTables_filter input");
        if (searchInput) {
            searchInput.value = value;
            searchInput.style.background = "#e0f2f1";
            setTimeout(() => { searchInput.style.background = ""; }, 1200);
        }
    }
}

// ── Venue stacked bar (year × conference/journal/arXiv) ──
function renderVenueChart(canvasId, years, datasets, venueGroups) {
    destroyChart(canvasId);

    // Build grouped HTML legend container
    const canvas = getCanvas(canvasId);
    const wrapper = canvas.parentElement;
    let legendEl = wrapper.querySelector(".venue-legend");
    if (!legendEl) {
        legendEl = document.createElement("div");
        legendEl.className = "venue-legend";
        wrapper.style.display = "flex";
        wrapper.style.alignItems = "flex-start";
        wrapper.appendChild(legendEl);
    }

    chartInstances[canvasId] = new Chart(canvas, {
        type: "bar",
        data: { labels: years, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { mode: "nearest", intersect: true },
            },
            scales: {
                x: { stacked: true },
                y: { stacked: true, beginAtZero: true, title: { display: true, text: "No. Articles" } },
            },
        },
        plugins: [{
            id: "barTotals",
            afterDatasetsDraw: (chart) => {
                const ctx = chart.ctx;
                const meta0 = chart.getDatasetMeta(0);
                if (!meta0.data.length) return;
                ctx.save();
                ctx.font = "bold 11px sans-serif";
                ctx.fillStyle = "#333";
                ctx.textAlign = "center";
                ctx.textBaseline = "bottom";
                for (let i = 0; i < meta0.data.length; i++) {
                    let total = 0;
                    let topY = chart.chartArea.bottom;
                    chart.data.datasets.forEach((ds, di) => {
                        total += ds.data[i] || 0;
                        const el = chart.getDatasetMeta(di).data[i];
                        if (el && el.y < topY) topY = el.y;
                    });
                    if (total > 0) ctx.fillText(total, meta0.data[i].x, topY - 4);
                }
                ctx.restore();
            },
        }],
    });

    // Render grouped legend
    let html = "";
    let idx = 0;
    (venueGroups || []).forEach((group) => {
        if (group.count === 0) return;
        html += `<div style="font-weight:bold;font-size:11px;margin:6px 0 2px;color:#333;">${group.title}</div>`;
        for (let i = 0; i < group.count; i++) {
            const ds = datasets[idx + i];
            html += `<div style="display:flex;align-items:center;gap:4px;font-size:10px;padding:1px 0;cursor:pointer;" data-dsi="${idx + i}">` +
                `<span style="display:inline-block;width:12px;height:12px;background:${ds.backgroundColor};border-radius:2px;flex-shrink:0;"></span>` +
                `<span>${ds.label}</span></div>`;
        }
        idx += group.count;
    });
    legendEl.innerHTML = html;
    legendEl.style.cssText = "min-width:130px;max-height:400px;overflow-y:auto;padding-left:10px;";

    // Click to toggle dataset visibility
    legendEl.querySelectorAll("[data-dsi]").forEach((el) => {
        el.addEventListener("click", () => {
            const di = parseInt(el.dataset.dsi);
            const meta = chartInstances[canvasId].getDatasetMeta(di);
            meta.hidden = !meta.hidden;
            el.style.opacity = meta.hidden ? "0.35" : "1";
            chartInstances[canvasId].update();
        });
    });
}

// ── Bubble chart (trends × classification dimensions) ──
// bubbleData: { datasets, xSlots: {pos,label,dimIdx}[], xGroups: {label,startPos,endPos,color,band}[], yLabels: string[], maxX: number }
function renderBubbleChart(canvasId, bubbleData) {
    destroyChart(canvasId);

    const { datasets, xSlots, xGroups, yLabels, maxX } = bubbleData;

    chartInstances[canvasId] = new Chart(getCanvas(canvasId), {
        type: "bubble",
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const d = ctx.raw;
                            const slot = xSlots.find((s) => Math.abs(s.pos - d.x) < 0.01);
                            const valLabel = slot ? slot.label : "";
                            return `${yLabels[d.y]}: ${valLabel} (${d.count} articles)`;
                        },
                    },
                },
            },
            layout: {
                padding: { top: 28 },
            },
            scales: {
                x: {
                    type: "linear",
                    min: -0.8,
                    max: maxX + 0.8,
                    afterBuildTicks: (axis) => {
                        axis.ticks = xSlots.map((s) => ({ value: s.pos }));
                    },
                    ticks: {
                        autoSkip: false,
                        maxRotation: 50,
                        minRotation: 50,
                        font: { size: 10 },
                        callback: (val) => {
                            const slot = xSlots.find((s) => Math.abs(s.pos - val) < 0.01);
                            return slot ? slot.label : "";
                        },
                    },
                    grid: { display: false },
                },
                y: {
                    type: "linear",
                    min: -0.7,
                    max: yLabels.length - 0.3,
                    ticks: {
                        stepSize: 1,
                        font: { size: 11 },
                        callback: (val) => yLabels[val] || "",
                    },
                    grid: { color: "rgba(0,0,0,0.06)", lineWidth: 0.8 },
                },
            },
        },
        plugins: [
            { id: "dimBands", beforeDraw: (chart) => drawDimBands(chart, xGroups) },
            { id: "dimDividers", beforeDraw: (chart) => drawDimDividers(chart, xGroups) },
            { id: "groupHeaders", afterDraw: (chart) => drawGroupHeaders(chart, xGroups) },
            { id: "bubbleLabels", afterDatasetsDraw: (chart) => drawBubbleLabels(chart) },
        ],
    });
}

// Draw light colored background bands for each dimension group
function drawDimBands(chart, xGroups) {
    const { ctx, chartArea: { top, bottom }, scales: { x: xScale } } = chart;
    ctx.save();
    xGroups.forEach((g) => {
        const x0 = xScale.getPixelForValue(g.startPos - 0.5);
        const x1 = xScale.getPixelForValue(g.endPos + 0.5);
        ctx.fillStyle = g.band;
        ctx.fillRect(x0, top, x1 - x0, bottom - top);
    });
    ctx.restore();
}

// Draw dotted divider lines between dimension groups
function drawDimDividers(chart, xGroups) {
    const { ctx, chartArea: { top, bottom }, scales: { x: xScale } } = chart;
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "#CBD5E1";
    ctx.lineWidth = 1;
    for (let i = 0; i < xGroups.length - 1; i++) {
        const mid = (xGroups[i].endPos + xGroups[i + 1].startPos) / 2;
        const px = xScale.getPixelForValue(mid);
        ctx.beginPath();
        ctx.moveTo(px, top);
        ctx.lineTo(px, bottom);
        ctx.stroke();
    }
    ctx.restore();
}

// Draw dimension group header labels above the chart
function drawGroupHeaders(chart, xGroups) {
    const { ctx, chartArea: { top }, scales: { x: xScale } } = chart;
    ctx.save();
    ctx.textAlign = "center";
    xGroups.forEach((g) => {
        const xMid = (xScale.getPixelForValue(g.startPos) + xScale.getPixelForValue(g.endPos)) / 2;
        ctx.font = "bold 12px sans-serif";
        ctx.fillStyle = g.color.replace(/[\d.]+\)$/, "1)");
        ctx.fillText(g.label, xMid, top - 10);
    });
    ctx.restore();
}

// Draw count numbers inside bubbles
function drawBubbleLabels(chart) {
    const ctx = chart.ctx;
    ctx.save();
    ctx.font = "bold 10px sans-serif";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        meta.data.forEach((el, i) => {
            const count = ds.data[i].count;
            if (count && el.options.radius >= 10) {
                ctx.fillText(count, el.x, el.y);
            }
        });
    });
    ctx.restore();
}

