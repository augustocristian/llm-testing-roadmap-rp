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

    loadCSV((data, headers) => {
        initExport(data, headers);
        initDataTable(data, headers);

        // Re-init Materialize selects (not browser-default ones)
        M.FormSelect.init(document.querySelectorAll("select:not(.browser-default)"));

        // Compute year range from data
        const allYears = data.map((r) => Math.floor(parseFloat(r.YEAR))).filter((y) => !isNaN(y));
        const minYear = Math.min(...allYears);
        const maxYear = Math.max(...allYears);

        let activeCorpus = "all";
        let activeYearRange = [minYear, maxYear];

        // Define refresh before slider creation (slider fires 'update' synchronously on create)
        function refresh() {
            const filtered = applyFilters(data, activeCorpus, activeYearRange);
            updateStats(filtered);
            renderBubbleDashboard(filtered);
            renderInsightsChart(filtered, document.getElementById("graficoSelect").value);
            setTableFilters(activeCorpus, activeYearRange);
        }

        // Init year slider
        const sliderEl = document.getElementById("yearSlider");
        noUiSlider.create(sliderEl, {
            start: [minYear, maxYear],
            connect: true,
            step: 1,
            range: { min: minYear, max: maxYear },
            format: {
                to: (v) => Math.round(v),
                from: (v) => Number(v),
            },
        });

        document.getElementById("yearMinLabel").textContent = minYear;
        document.getElementById("yearMaxLabel").textContent = maxYear;

        // Year slider change
        sliderEl.noUiSlider.on("update", (values) => {
            activeYearRange = [values[0], values[1]];
            document.getElementById("yearMinLabel").textContent = values[0];
            document.getElementById("yearMaxLabel").textContent = values[1];
            refresh();
        });

        // Corpus toggle buttons
        document.querySelectorAll("#corpusToggle .corpus-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("#corpusToggle .corpus-btn").forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");
                activeCorpus = btn.dataset.corpus;
                refresh();
            });
        });

        // Insights chart selector
        document.getElementById("graficoSelect").addEventListener("change", (e) => {
            const filtered = applyFilters(data, activeCorpus, activeYearRange);
            renderInsightsChart(filtered, e.target.value);
        });
    });
});
