const cards = [
    {
        id: 1,
        title: "Bingo",
        fandom: "Marvel",
        cover: "cover.avif"
    },
    {
        id: 2,
        title: "Bingo",
        fandom: "Harry Potter",
        cover: "cover.avif"
    },
    {
        id: 3,
        title: "Bingo",
        fandom: "Star Wars",
        cover: "cover.avif"
    },
    {
        id: 4,
        title: "Bingo",
        fandom: "Anime",
        cover: "cover.avif"
    },
    {
        id: 5,
        title: "Bingo",
        fandom: "Minecraft",
        cover: "cover.avif"
    },
    {
        id: 6,
        title: "Bingo",
        fandom: "K-pop",
        cover: "cover.avif"
    },
    {
        id: 7,
        title: "Bingo",
        fandom: "Genshin",
        cover: "cover.avif"
    },
    {
        id: 8,
        title: "Bingo",
        fandom: "Stranger Things",
        cover: "cover.avif"
    },
    {
        id: 9,
        title: "Bingo",
        fandom: "Taylor Swift",
        cover: "cover.avif"
    },
    {
        id: 10,
        title: "Bingo",
        fandom: "Percy Jackson",
        cover: "cover.avif"
    },
    {
        id: 11,
        title: "Bingo",
        fandom: "Disney",
        cover: "cover.avif"
    },
    {
        id: 12,
        title: "Bingo",
        fandom: "Wednesday",
        cover: "cover.avif"
    }
];

const cardsGrid = document.getElementById("cards-grid");

cards.forEach(card => {
    cardsGrid.innerHTML += `
        <div class="card">
            <a href="playbingo.html?id=${card.id}" class="card-link">
                <div class="card-header">
                    <span>${card.title}</span>
                </div>

                <img src="${card.cover}" alt="cover image">

                <div class="cover-tag">
                    <h4><b>${card.fandom}</b></h4>
                </div>
            </a>

            <div class="card-actions">
                <button class="card-btn">
                    <i class="fa-regular fa-heart"></i>
                </button>

                <button class="card-btn">
                    <i class="fa-regular fa-comment"></i>
                </button>
            </div>
        </div>
    `;
});