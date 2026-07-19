let bingoSize = 5;
const minSize = 3;
const maxSize = 10;
const cellState = [];
const selectedCells = new Set();
let primarySelection = null;
let dragAnchor = null;
let isSelecting = false;

const board = document.getElementById("bingo-board");
const sizeCount = document.getElementById("bingo-size-count");
const panel = document.getElementById("cell-panel");
const cellText = document.getElementById("cell-text");
const textColor = document.getElementById("text-color");
const cellColor = document.getElementById("cell-color");
const cellOpacity = document.getElementById("cell-opacity");
const imageOpacity = document.getElementById("image-opacity");
const borderColor = document.getElementById("border-color");
const borderWidth = document.getElementById("border-width");
const borderStyle = document.getElementById("border-style");
const formatButtons = [...document.querySelectorAll(".format-button")];

function defaultCell(index) {
    return { text: "", color: "#000000", background: "#ffffff", backgroundOpacity: 1, image: "", imageOpacity: 1, borderColor: "#000000", borderWidth: 1, borderStyle: "solid", formats: { bold: false, italic: false, strike: false, underline: false }, index };
}

function renderBingoBoard() {
    const needed = bingoSize * bingoSize;
    while (cellState.length < needed) cellState.push(defaultCell(cellState.length));
    cellState.length = needed;
    board.innerHTML = "";
    sizeCount.textContent = `${bingoSize} × ${bingoSize}`;
    board.style.gridTemplateColumns = `repeat(${bingoSize}, 1fr)`;
    board.style.gridTemplateRows = `repeat(${bingoSize}, 1fr)`;
    cellState.forEach((state, index) => {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = `bingo-cell${selectedCells.has(index) ? " selected" : ""}${primarySelection === index ? " editing" : ""}`;
        cell.style.color = state.color;
        cell.style.borderColor = state.borderColor;
        cell.style.borderWidth = `${state.borderWidth}px`;
        cell.style.borderStyle = state.borderStyle;
        const image = document.createElement("div");
        image.className = "cell-image";
        image.style.opacity = state.imageOpacity;
        if (state.image) image.style.backgroundImage = `url("${state.image}")`;
        const overlay = document.createElement("div");
        overlay.className = "cell-overlay";
        overlay.style.backgroundColor = state.background;
        overlay.style.opacity = state.backgroundOpacity;
        const selection = document.createElement("div");
        selection.className = "selection-frame";
        const text = document.createElement("span");
        text.textContent = state.text || String(index + 1);
        text.style.fontWeight = state.formats.bold ? "bold" : "normal";
        text.style.fontStyle = state.formats.italic ? "italic" : "normal";
        text.style.textDecoration = [state.formats.strike && "line-through", state.formats.underline && "underline"].filter(Boolean).join(" ") || "none";
        cell.append(image, overlay, selection, text);
        board.append(cell);
    });
}

function updatePanel() {
    const state = cellState[primarySelection];
    if (!state) return;
    const count = selectedCells.size;
    document.getElementById("selection-label").textContent = count > 1 ? `${count} cells selected` : "Cell editor";
    cellText.value = state.text;
    textColor.value = state.color;
    cellColor.value = state.background;
    cellOpacity.value = Math.round(state.backgroundOpacity * 100);
    imageOpacity.value = Math.round(state.imageOpacity * 100);
    borderColor.value = state.borderColor;
    borderWidth.value = state.borderWidth;
    borderStyle.value = state.borderStyle;
    document.getElementById("cell-opacity-value").value = `${cellOpacity.value}%`;
    document.getElementById("image-opacity-value").value = `${imageOpacity.value}%`;
    document.getElementById("border-width-value").value = `${borderWidth.value}px`;
    formatButtons.forEach(button => button.classList.toggle("active", state.formats[button.dataset.format]));
    panel.classList.add("active");
}

function selectRange(start, end) {
    const startRow = Math.floor(start / bingoSize), startCol = start % bingoSize;
    const endRow = Math.floor(end / bingoSize), endCol = end % bingoSize;
    selectedCells.clear();
    for (let row = Math.min(startRow, endRow); row <= Math.max(startRow, endRow); row++) for (let col = Math.min(startCol, endCol); col <= Math.max(startCol, endCol); col++) selectedCells.add(row * bingoSize + col);
    primarySelection = start;
    updatePanel();
    renderBingoBoard();
}

function indexAtPoint(clientX, clientY) {
    const rect = board.getBoundingClientRect();
    const col = Math.max(0, Math.min(bingoSize - 1, Math.floor((clientX - rect.left) / (rect.width / bingoSize))));
    const row = Math.max(0, Math.min(bingoSize - 1, Math.floor((clientY - rect.top) / (rect.height / bingoSize))));
    return row * bingoSize + col;
}

function applyToSelected(callback) { selectedCells.forEach(index => callback(cellState[index])); renderBingoBoard(); }
function closeCellPanel() { selectedCells.clear(); primarySelection = null; panel.classList.remove("active"); renderBingoBoard(); }

document.getElementById("plus-size").addEventListener("click", () => { if (bingoSize < maxSize) { bingoSize++; selectedCells.clear(); primarySelection = null; panel.classList.remove("active"); renderBingoBoard(); } });
document.getElementById("minus-size").addEventListener("click", () => { if (bingoSize > minSize) { bingoSize--; selectedCells.clear(); primarySelection = null; panel.classList.remove("active"); renderBingoBoard(); } });
document.getElementById("close-panel").addEventListener("click", closeCellPanel);
board.addEventListener("pointerdown", event => { if (!event.target.closest(".bingo-cell")) return; event.preventDefault(); dragAnchor = indexAtPoint(event.clientX, event.clientY); isSelecting = true; board.setPointerCapture(event.pointerId); selectRange(dragAnchor, dragAnchor); });
board.addEventListener("pointermove", event => { if (isSelecting) selectRange(dragAnchor, indexAtPoint(event.clientX, event.clientY)); });
board.addEventListener("pointerup", () => { isSelecting = false; dragAnchor = null; });
document.addEventListener("pointerdown", event => { if (panel.classList.contains("active") && !event.target.closest(".cell-panel, .bingo-cell")) closeCellPanel(); });
cellText.addEventListener("input", () => { if (primarySelection !== null) applyToSelected(state => state.text = cellText.value); });
textColor.addEventListener("input", () => { if (primarySelection !== null) applyToSelected(state => state.color = textColor.value); });
cellColor.addEventListener("input", () => { if (primarySelection !== null) applyToSelected(state => state.background = cellColor.value); });
cellOpacity.addEventListener("input", () => { document.getElementById("cell-opacity-value").value = `${cellOpacity.value}%`; if (primarySelection !== null) applyToSelected(state => state.backgroundOpacity = cellOpacity.value / 100); });
imageOpacity.addEventListener("input", () => { document.getElementById("image-opacity-value").value = `${imageOpacity.value}%`; if (primarySelection !== null) applyToSelected(state => state.imageOpacity = imageOpacity.value / 100); });
borderColor.addEventListener("input", () => { if (primarySelection !== null) applyToSelected(state => state.borderColor = borderColor.value); });
borderWidth.addEventListener("input", () => { document.getElementById("border-width-value").value = `${borderWidth.value}px`; if (primarySelection !== null) applyToSelected(state => state.borderWidth = borderWidth.value); });
borderStyle.addEventListener("change", () => {
    if (primarySelection === null) return;
    const nextWidth = borderStyle.value === "dotted" ? Math.max(3, Number(borderWidth.value)) : Number(borderWidth.value);
    borderWidth.value = nextWidth;
    document.getElementById("border-width-value").value = `${nextWidth}px`;
    applyToSelected(state => { state.borderStyle = borderStyle.value; state.borderWidth = nextWidth; });
});
formatButtons.forEach(button => button.addEventListener("click", () => { if (primarySelection !== null) { const format = button.dataset.format; const shouldEnable = !cellState[primarySelection].formats[format]; applyToSelected(state => state.formats[format] = shouldEnable); button.classList.toggle("active", shouldEnable); } }));

function readImage(input, callback) { const file = input.files[0]; if (file) { const reader = new FileReader(); reader.addEventListener("load", () => callback(reader.result)); reader.readAsDataURL(file); } }
document.getElementById("upload-bg-btn").addEventListener("click", () => document.getElementById("background-upload").click());
document.getElementById("background-upload").addEventListener("change", event => readImage(event.target, image => board.style.backgroundImage = `url("${image}")`));
document.getElementById("cell-image").addEventListener("change", event => readImage(event.target, image => { if (primarySelection !== null) applyToSelected(state => state.image = image); }));

const editorStep = document.getElementById("editor-step");
const detailsStep = document.getElementById("details-step");
document.getElementById("finish-creating").addEventListener("click", () => { selectedCells.clear(); primarySelection = null; panel.classList.remove("active"); renderBingoBoard(); editorStep.classList.add("is-hidden"); detailsStep.classList.remove("is-hidden"); window.scrollTo({ top: 0, behavior: "smooth" }); });
document.getElementById("back-to-editor").addEventListener("click", () => { detailsStep.classList.add("is-hidden"); editorStep.classList.remove("is-hidden"); });

const tagSearch = document.getElementById("tag-search");
const suggestions = document.getElementById("tag-suggestions");
const selectedTags = document.getElementById("selected-tags");
const tagOptions = ["games", "movies", "music", "books", "anime", "genshin impact", "friends", "travel", "school", "memes"];
const tags = [];
function showTags() { const query = tagSearch.value.trim().toLowerCase(); const matches = tagOptions.filter(tag => tag.includes(query) && !tags.includes(tag)).slice(0, 5); suggestions.innerHTML = ""; if (!query) { suggestions.classList.add("is-hidden"); return; } [...matches, ...(matches.length || tags.includes(query) ? [] : [query])].forEach(tag => { const button = document.createElement("button"); button.type = "button"; button.textContent = `Add “${tag}”`; button.addEventListener("click", () => addTag(tag)); suggestions.append(button); }); suggestions.classList.toggle("is-hidden", !suggestions.children.length); }
function addTag(tag) { const normalized = tag.trim().toLowerCase(); if (!normalized || tags.includes(normalized) || tags.length >= 15) return; tags.push(normalized); const chip = document.createElement("span"); chip.className = "tag-chip"; chip.append(normalized); const remove = document.createElement("button"); remove.type = "button"; remove.setAttribute("aria-label", `Remove ${normalized}`); remove.textContent = "×"; remove.addEventListener("click", () => { tags.splice(tags.indexOf(normalized), 1); chip.remove(); }); chip.append(remove); selectedTags.append(chip); tagSearch.value = ""; showTags(); }
tagSearch.addEventListener("input", showTags); tagSearch.addEventListener("focus", showTags); tagSearch.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); addTag(tagSearch.value); } });
document.addEventListener("click", event => { if (!event.target.closest(".tag-search-wrap")) suggestions.classList.add("is-hidden"); });

document.getElementById("cover-upload").addEventListener("change", event => readImage(event.target, image => { const preview = document.getElementById("cover-preview"); preview.style.backgroundImage = `url("${image}")`; preview.classList.add("has-cover"); }));
const message = document.getElementById("form-message");
function validateAndMessage(action) { const title = document.getElementById("bingo-title").value.trim(); if (!title) { message.textContent = "Add a title before continuing."; document.getElementById("bingo-title").focus(); return false; } message.textContent = action; return true; }
document.getElementById("create-bingo").addEventListener("click", () => validateAndMessage("Your bingo is ready to publish."));
document.getElementById("save-draft").addEventListener("click", () => { const title = document.getElementById("bingo-title").value.trim() || "Untitled bingo"; localStorage.setItem("not-enough-bingo-draft", JSON.stringify({ title, tags, bingoSize, cellState })); message.textContent = "Saved to drafts in this browser."; });
const downloadButton = document.getElementById("download-button"); const downloadMenu = document.getElementById("download-menu");
downloadButton.addEventListener("click", () => downloadMenu.classList.toggle("is-hidden"));
downloadMenu.addEventListener("click", event => { const format = event.target.dataset.format; if (!format) return; if (validateAndMessage(`Download as ${format.toUpperCase()} is prepared.`)) downloadMenu.classList.add("is-hidden"); });

renderBingoBoard();
