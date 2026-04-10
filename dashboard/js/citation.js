function formatBibTeX(data) {
    if (!data) return "";
    const authors = data.authors.map((a) => `${a.family}, ${a.given}`).join(" and ");
    return `@article{Augusto2026,
  author    = {${authors}},
  title     = {${data.title}},
  journal   = {${data.journal}},
  year      = {${data.year}},
  volume    = {${data.volume}},
  number    = {${data.issue}},
  pages     = {${data.pages}},
  publisher = {${data.publisher}},
  doi       = {${data.doi}}
}`;
}

function formatCitationAPA(data) {
    if (!data) return "";
    const authors = data.authors
        .map((a) => `${a.family}, ${a.given[0]}.`)
        .join(", ")
        .replace(/, ([^,]*)$/, ", & $1");
    return `${authors} (${data.year}). ${data.title}. <i>${data.journal}</i>, ${data.volume}(${data.issue}), ${data.pages}. ${data.publisher}. https://doi.org/${data.doi}`;
}

function initCitation() {
    const citationModalElem = document.getElementById("modal-citation");
    const citationModal = M.Modal.init(citationModalElem);

    const bibtexBtn = document.getElementById("download-bibtex");
    const showCitationBtn = document.getElementById("show-citation");
    const copyCitationBtn = document.getElementById("copy-citation");
    const citationContent = document.getElementById("citation-content");

    let citationData = null;

    fetch("CITATION.cff")
        .then((res) => {
            if (!res.ok) throw new Error(res.status);
            return res.text();
        })
        .then((text) => {
            const cff = jsyaml.load(text);
            const pc = cff["preferred-citation"];
            citationData = {
                authors: pc.authors.map((a) => ({
                    given: a["given-names"],
                    family: a["family-names"],
                    orcid: a.orcid || null,
                })),
                title: pc.title,
                journal: pc.journal?.name || "",
                year: pc.year,
                volume: pc.journal?.volume || "",
                issue: pc.journal?.issue || "",
                pages: pc.journal?.pages ? `${pc.journal.pages.start}-${pc.journal.pages.end}` : "",
                publisher: pc.journal?.publisher || "",
                doi: pc.doi || "",
                url: cff.url || "",
            };
        })
        .catch((err) => console.error("Error loading CITATION.cff:", err));

    bibtexBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (!citationData) return alert("Citation not loaded yet.");
        const bibtexStr = formatBibTeX(citationData);
        const blob = new Blob([bibtexStr], { type: "text/x-bibtex" });
        const url = URL.createObjectURL(blob);
        const tmpLink = document.createElement("a");
        tmpLink.href = url;
        tmpLink.download = "Augusto2026.bib";
        document.body.appendChild(tmpLink);
        tmpLink.click();
        tmpLink.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    showCitationBtn.addEventListener("click", () => {
        if (!citationData) return alert("Citation not loaded yet.");
        citationContent.innerHTML = formatCitationAPA(citationData);
        citationModal.open();
    });

    copyCitationBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (!citationData) return alert("Citation not loaded yet.");
        const text = citationContent.innerText || "";
        navigator.clipboard.writeText(text).then(() => M.toast({ html: "Citation copied!" }));
    });
}
