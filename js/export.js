let globalDataArray = null;
let globalHeaders = null;

function initExport(data, headers) {
    globalDataArray = data;
    globalHeaders = headers;

    // CSV download
    fetch(CSV_PATH)
        .then((res) => res.text())
        .then((text) => {
            document.getElementById("download-csv").href =
                "data:text/csv;charset=utf-8," + encodeURIComponent(text);
        });

    // JSON download
    const jsonUrl = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    );
    document.getElementById("download-json").href = jsonUrl;

    // XLSX download (lazy-loads library)
    document.getElementById("download-xlsx").addEventListener("click", (e) => {
        e.preventDefault();
        if (!window.XLSX) {
            const script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
            script.onload = () => exportToXLSX();
            document.body.appendChild(script);
        } else {
            exportToXLSX();
        }
    });
}

function exportToXLSX() {
    const ws = XLSX.utils.json_to_sheet(globalDataArray, { header: globalHeaders });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Papers");
    XLSX.writeFile(wb, "Papers.xlsx");
}
