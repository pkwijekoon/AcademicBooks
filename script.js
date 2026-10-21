
/* =========================================
   ACADEMICBOOKS - PDF READER
========================================= */

import {
    getDocument,
    GlobalWorkerOptions
} from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.54/pdf.min.mjs";

GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.54/pdf.worker.min.mjs";


/* =========================================
   GLOBAL VARIABLES
========================================= */

let pageFlip = null;
let currentPDF = null;
let currentBookId = null;
let isZoomed = false;
let openRequest = 0;


/* =========================================
   ELEMENTS
========================================= */

const viewer = document.getElementById("viewer");
const viewerStage = document.getElementById("viewer-stage");
const pageNumber = document.getElementById("page-number");
const zoomButton = document.getElementById("zoom-button");
const closeButton = document.getElementById("close-button");


/* =========================================
   FIND A BOOK
========================================= */

function findBook(bookId) {
    return Array.from(
        document.querySelectorAll(".book-card")
    ).find(function(card) {
        return card.dataset.bookId === bookId;
    });
}


/* =========================================
   UNIQUE BOOK URL
========================================= */

function updateBookURL(bookId) {
    const newHash = bookId
        ? "#book=" + encodeURIComponent(bookId)
        : "";

    if (window.location.hash !== newHash) {
        history.pushState(
            { bookId: bookId },
            "",
            window.location.pathname +
                window.location.search +
                newHash
        );
    }
}


function getBookIdFromURL() {
    const match = window.location.hash.match(
        /^#book=(.+)$/
    );

    if (!match) {
        return null;
    }

    try {
        return decodeURIComponent(match[1]);
    } catch (error) {
        return null;
    }
}


/* =========================================
   CLEAN UP AN EXISTING FLIPBOOK
========================================= */

function destroyFlipbook() {
    if (!pageFlip) {
        return;
    }

    const oldContainer =
        document.getElementById("book-container");

    const parent =
        oldContainer ? oldContainer.parentElement : null;

    pageFlip.destroy();
    pageFlip = null;

    /*
     * PageFlip.destroy() removes its container
     * element. Create a replacement so another
     * book can be opened later.
     */

    if (parent) {
        const replacement =
            document.createElement("div");

        replacement.id = "book-container";
        replacement.className = "book-container";

        parent.appendChild(replacement);
    }
}


/* =========================================
   RESET ZOOM
========================================= */

function resetZoom() {
    isZoomed = false;

    viewerStage.classList.remove("zoomed");

    zoomButton.textContent = "ZOOM +";
    zoomButton.setAttribute("aria-pressed", "false");
}


/* =========================================
   OPEN A BOOK
========================================= */

async function openBook(bookId, options = {}) {
    const requestId = ++openRequest;

    const book = findBook(bookId);

    if (!book) {
        pageNumber.textContent = "Book not found.";
        return;
    }

    const pdfPath = book.dataset.pdf;

    if (!pdfPath) {
        pageNumber.textContent = "PDF path is missing.";
        return;
    }

    /*
     * Show the reader and set its unique URL.
     */

    viewer.classList.remove("hidden");
    viewer.setAttribute("aria-hidden", "false");

    currentBookId = bookId;

    if (options.updateURL !== false) {
        updateBookURL(bookId);
    }

    resetZoom();
    destroyFlipbook();

    pageNumber.textContent = "Loading book...";

    try {
        /* LOAD THE PDF */

        const loadingTask = getDocument(pdfPath);
        const pdf = await loadingTask.promise;

        if (requestId !== openRequest) {
            pdf.destroy();
            return;
        }

        currentPDF = pdf;

        /* DETECT THE PDF PAGE SHAPE */

        const firstPage = await pdf.getPage(1);

        const originalViewport =
            firstPage.getViewport({ scale: 1 });

        const aspectRatio =
            originalViewport.width /
            originalViewport.height;

        /*
         * Fit the book into the available reading area.
         * PageFlip width and height refer to one page.
         */

        const availableHeight = Math.max(
            240,
            viewerStage.clientHeight - 30
        );

        const availableWidth = Math.max(
            180,
            Math.min(500, (viewerStage.clientWidth - 30) / 2)
        );

        let bookWidth;
        let bookHeight;

        if (aspectRatio >= 0.95 && aspectRatio <= 1.05) {
            /* SQUARE */

            bookWidth = Math.min(
                availableWidth,
                availableHeight
            );

            bookHeight = bookWidth;
        } else if (aspectRatio > 1) {
            /* LANDSCAPE */

            bookWidth = availableWidth;
            bookHeight = bookWidth / aspectRatio;

            if (bookHeight > availableHeight) {
                bookHeight = availableHeight;
                bookWidth = bookHeight * aspectRatio;
            }
        } else {
            /* PORTRAIT */

            bookHeight = availableHeight;
            bookWidth = bookHeight * aspectRatio;

            if (bookWidth > availableWidth) {
                bookWidth = availableWidth;
                bookHeight = bookWidth / aspectRatio;
            }
        }

        bookWidth = Math.max(100, Math.round(bookWidth));
        bookHeight = Math.max(100, Math.round(bookHeight));

        /* RENDER PDF PAGES AS IMAGES */

        const pages = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            if (requestId !== openRequest) {
                return;
            }

            const page = await pdf.getPage(i);

            /*
             * Render at a higher resolution for
             * clearer text when the reader zooms.
             */

            const renderScale = 1.6;

            const viewport = page.getViewport({
                scale: renderScale
            });

            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");

            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            pages.push(
                canvas.toDataURL("image/jpeg", 0.94)
            );
        }

        if (requestId !== openRequest) {
            return;
        }

        /* CREATE THE FLIPBOOK */

        const container =
            document.getElementById("book-container");

        pageFlip = new St.PageFlip(container, {
            width: bookWidth,
            height: bookHeight,

            size: "stretch",

            minWidth: 100,
            maxWidth: 650,

            minHeight: 100,
            maxHeight: 1000,

            showCover: true,
            usePortrait: true,
            drawShadow: true,
            flippingTime: 700,
            useMouseEvents: true,
            mobileScrollSupport: true,
            clickEventForward: true,
            maxShadowOpacity: 0.45
        });

        /* UPDATE PAGE NUMBER BEFORE LOADING */

        pageFlip.on("flip", function(event) {
            pageNumber.textContent =
                "Page " +
                (event.data + 1) +
                " of " +
                pdf.numPages;
        });

        pageFlip.on("init", function(event) {
            pageNumber.textContent =
                "Page " +
                (event.data.page + 1) +
                " of " +
                pdf.numPages;
        });

        pageFlip.loadFromImages(pages);

        pageNumber.textContent =
            "Page 1 of " + pdf.numPages;

    } catch (error) {
        console.error("Unable to open book:", error);

        if (requestId === openRequest) {
            pageNumber.textContent =
                "Unable to open this book. Check the PDF file path.";

            destroyFlipbook();
        }
    }
}


/* =========================================
   CLOSE THE BOOK
========================================= */

function closeBook(updateURL = true) {
    /*
     * Invalidate any PDF still loading.
     */

    openRequest++;

    destroyFlipbook();

    currentPDF = null;
    currentBookId = null;

    resetZoom();

    viewer.classList.add("hidden");
    viewer.setAttribute("aria-hidden", "true");

    pageNumber.textContent = "";

    if (updateURL) {
        updateBookURL(null);
    }
}


/* =========================================
   ZOOM BUTTON
========================================= */

function toggleZoom() {
    if (viewer.classList.contains("hidden")) {
        return;
    }

    isZoomed = !isZoomed;

    viewerStage.classList.toggle("zoomed", isZoomed);

    zoomButton.textContent =
        isZoomed ? "ZOOM OUT" : "ZOOM +";

    zoomButton.setAttribute(
        "aria-pressed",
        String(isZoomed)
    );
}


/* =========================================
   PAGE NAVIGATION
========================================= */

function nextPage() {
    if (pageFlip) {
        pageFlip.flipNext();
    }
}


function previousPage() {
    if (pageFlip) {
        pageFlip.flipPrev();
    }
}


/* =========================================
   BOOK CARD BUTTONS
========================================= */

document.querySelectorAll("[data-open-book]").forEach(
    function(button) {
        button.addEventListener("click", function() {
            openBook(button.dataset.openBook);
        });
    }
);


/* =========================================
   READER BUTTONS
========================================= */

closeButton.addEventListener("click", function() {
    closeBook();
});

zoomButton.addEventListener("click", toggleZoom);


/* =========================================
   KEYBOARD CONTROLS
========================================= */

document.addEventListener("keydown", function(event) {
    if (viewer.classList.contains("hidden")) {
        return;
    }

    if (event.key === "Escape") {
        closeBook();
        return;
    }

    if (event.key === "ArrowRight") {
        nextPage();
    }

    if (event.key === "ArrowLeft") {
        previousPage();
    }
});


/* =========================================
   DIRECT BOOK URL SUPPORT
========================================= */

function openBookFromURL() {
    const bookId = getBookIdFromURL();

    if (!bookId) {
        if (!viewer.classList.contains("hidden")) {
            closeBook(false);
        }
        return;
    }

    if (bookId === currentBookId &&
        !viewer.classList.contains("hidden")) {
        return;
    }

    openBook(bookId, { updateURL: false });
}


/*
 * Handle direct links, browser back/forward,
 * and changes to the URL fragment.
 */

window.addEventListener("hashchange", openBookFromURL);
window.addEventListener("popstate", openBookFromURL);


/* =========================================
   STARTUP
========================================= */

openBookFromURL();
