let bingoSize = 5;

const minSize = 3;
const maxSize = 10;

const board = document.getElementById("bingo-board");
const sizeCount = document.getElementById("bingo-size-count");
const plusButton = document.getElementById("plus-size");
const minusButton = document.getElementById("minus-size");

function renderBingoBoard() {
    board.innerHTML = "";

    sizeCount.textContent = `${bingoSize} × ${bingoSize}`;

    board.style.gridTemplateColumns = `repeat(${bingoSize}, 1fr)`;
    board.style.gridTemplateRows = `repeat(${bingoSize}, 1fr)`;

    const totalCells = bingoSize * bingoSize;

    for (let i = 1; i <= totalCells; i++) {
        const cell = document.createElement("div");
        cell.className = "bingo-cell";
        cell.textContent = i;

        board.appendChild(cell);
    }
}

plusButton.addEventListener("click", () => {
    if (bingoSize < maxSize) {
        bingoSize++;
        renderBingoBoard();
    }
});

minusButton.addEventListener("click", () => {
    if (bingoSize > minSize) {
        bingoSize--;
        renderBingoBoard();
    }
});

renderBingoBoard();

const uploadBgBtn = document.getElementById("upload-bg-btn");
const backgroundUpload = document.getElementById("background-upload");
const bingoBoard = document.getElementById("bingo-board");

uploadBgBtn.addEventListener("click", () => {
    backgroundUpload.click();
});

backgroundUpload.addEventListener("change", () => {
    const file = backgroundUpload.files[0];

    if (!file) return;

    const imageUrl = URL.createObjectURL(file);

    bingoBoard.style.backgroundImage = `url("${imageUrl}")`;
    bingoBoard.style.backgroundSize = "cover";
    bingoBoard.style.backgroundPosition = "center";
    bingoBoard.style.backgroundRepeat = "no-repeat";
});
