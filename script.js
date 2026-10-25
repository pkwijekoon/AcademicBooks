
import * as pdfjsLib from
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.54/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.54/pdf.worker.min.mjs";

/* BOOK INFORMATION
   Add further books here when you are ready.
*/
const books = {
    "introduction-to-r": {
        title: "Introduction to R",
        pdf: "books/introduction-to-r.pdf"
    }
};

/* PAGE ELEMENTS */

const homePage = document.getElementById("home-page");
const reader = document.getElementById("reader");
const readingArea = document.getElementById("reading-area");
const canvas = document.getElementById("pdf-canvas");
const context = canvas.getContext("2d");

const pageNumber = document.getElementById("page-number");
const loadingMessage = document.getElementById("loading-message");
const errorMessage = document.getElementById("error-message");
const errorText = document.getElementById("error-text");

const closeButton = document.getElementById("close-button");
const previousButton = document.getElementById("previous-button");
const nextButton = document.getElementById("next-button");
const retryButton = document.getElementById("retry-button");
const openRButton = document.getElementById("open-introduction-to-r");

/* READER STATE */

let pdfDocument = null;
let currentPage = 1;
let activeBookId = null;
let currentPdfPath = null;
let loadingTask = null;
let renderTask = null;
let requestNumber = 0;
let resizeTimer = null;
let touchStartX = null;
let touchStartY = null;

/* SHOW AND HIDE MESSAGES */

function showLoading(message = "Loading book...") {
    loadingMessage.textContent = message;
    loadingMessage.classList.remove("hidden");
    errorMessage.classList.add("hidden");
    canvas.classList.add("hidden");
}

function showError(message) {
    loadingMessage.classList.add("hidden");
    errorMessage.classList.remove("hidden");
    errorText.textContent = message;
    canvas.classList.add("hidden");
}

function updateNavigation() {
    const totalPages = pdfDocument ? pdfDocument.numPages : 1;

    pageNumber.textContent = `Page ${currentPage} of ${totalPages}`;
    previousButton.disabled = !pdfDocument || currentPage <= 1;
    nextButton.disabled = !pdfDocument || currentPage >= totalPages;
}

/* OPEN A BOOK */

async function openBook(bookId) {
    const book = books[bookId];

    if (!book) {
        showError("This book could not be found.");
        reader.classList.remove("hidden");
        homePage.classList.add("hidden");
        return;
    }

    const thisRequest = ++requestNumber;

    activeBookId = bookId;
    currentPage = 1;
    pdfDocument = null;
    currentPdfPath = book.pdf;

    homePage.classList.add("hidden");
    reader.classList.remove("hidden");

    document.title = `${book.title} | AcademicBooks`;

    showLoading("Loading book...");
    updateNavigation();

    // Keep the current book in the URL.
    const newHash = `#book=${encodeURIComponent(bookId)}`;

    if (window.location.hash !== newHash) {
        history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search + newHash
        );
    }

    // Stop any previous PDF loading task.
    if (loadingTask) {
        try {
            await loadingTask.destroy();
        } catch (error) {
            // The previous task may already have stopped.
        }
    }

    if (thisRequest !== requestNumber) {
        return;
    }

    try {
        // Wait until the reader has its visible dimensions.
        await new Promise(resolve => requestAnimationFrame(resolve));

        if (thisRequest !== requestNumber) {
            return;
        }

        loadingTask = pdfjsLib.getDocument(book.pdf);
        const loadedDocument = await loadingTask.promise;

        if (thisRequest !== requestNumber) {
            return;
        }

        pdfDocument = loadedDocument;
        currentPage = 1;

        await renderCurrentPage();
    } catch (error) {
        if (thisRequest !== requestNumber) {
            return;
        }

        console.error("Could not open PDF:", error);

        showError(
            "The book could not be loaded. Please check that " +
            "books/introduction-to-r.pdf exists in your repository, " +
            "then refresh the page."
        );

        updateNavigation();
    }
}

/* DISPLAY THE CURRENT PDF PAGE */

async function renderCurrentPage() {
    if (!pdfDocument) {
        return;
    }

    const thisDocument = pdfDocument;
    const thisPageNumber = currentPage;

    if (renderTask) {
        try {
            renderTask.cancel();
        } catch (error) {
            // Ignore a render task that has already finished.
        }
        renderTask = null;
    }

    try {
        const page = await thisDocument.getPage(thisPageNumber);

        if (
            pdfDocument !== thisDocument ||
            currentPage !== thisPageNumber
        ) {
            return;
        }

        const originalViewport = page.getViewport({ scale: 1 });

        // Leave room around the page inside the reading area.
        const availableWidth = Math.max(50, readingArea.clientWidth - 16);
        const availableHeight = Math.max(50, readingArea.clientHeight - 16);

        // Fit the whole page between the top and bottom bars.
        const fitScale = Math.min(
            availableWidth / originalViewport.width,
            availableHeight / originalViewport.height
        );

        const scale = Math.max(0.05, fitScale);
        const viewport = page.getViewport({ scale });

        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.round(viewport.width * pixelRatio);
        canvas.height = Math.round(viewport.height * pixelRatio);

        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);

        renderTask = page.render({
            canvasContext: context,
            viewport: page.getViewport({ scale: scale * pixelRatio })
        });

        await renderTask.promise;

        if (
            pdfDocument !== thisDocument ||
            currentPage !== thisPageNumber
        ) {
            return;
        }

        loadingMessage.classList.add("hidden");
        errorMessage.classList.add("hidden");
        canvas.classList.remove("hidden");

        updateNavigation();
    } catch (error) {
        if (error && error.name === "RenderingCancelledException") {
            return;
        }

        console.error("Page rendering failed:", error);
        showError("This page could not be displayed. Please try again.");
    } finally {
        renderTask = null;
    }
}

/* PREVIOUS AND NEXT */

function previousPage() {
    if (!pdfDocument || currentPage <= 1) {
        return;
    }

    currentPage -= 1;
    updateNavigation();
    renderCurrentPage();
}

function nextPage() {
    if (!pdfDocument || currentPage >= pdfDocument.numPages) {
        return;
    }

    currentPage += 1;
    updateNavigation();
    renderCurrentPage();
}

/* CLOSE THE READER */

async function closeBook() {
    ++requestNumber;

    if (renderTask) {
        try {
            renderTask.cancel();
        } catch (error) {
            // Ignore an already completed render.
        }
        renderTask = null;
    }

    if (loadingTask) {
        try {
            await loadingTask.destroy();
        } catch (error) {
            // Ignore an already stopped loading task.
        }
        loadingTask = null;
    }

    pdfDocument = null;
    activeBookId = null;
    currentPdfPath = null;
    currentPage = 1;

    reader.classList.add("hidden");
    homePage.classList.remove("hidden");

    canvas.classList.add("hidden");
    loadingMessage.classList.remove("hidden");
    errorMessage.classList.add("hidden");

    pageNumber.textContent = "Page 1 of 1";
    document.title = "AcademicBooks";

    // Remove the book identifier from the URL.
    history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
    );
}

/* BUTTON EVENTS */

openRButton.addEventListener("click", function () {
    openBook("introduction-to-r");
});

closeButton.addEventListener("click", closeBook);
previousButton.addEventListener("click", previousPage);
nextButton.addEventListener("click", nextPage);

retryButton.addEventListener("click", function () {
    if (activeBookId) {
        openBook(activeBookId);
    } else {
        openBook("introduction-to-r");
    }
});

/* KEYBOARD NAVIGATION */

document.addEventListener("keydown", function (event) {
    if (reader.classList.contains("hidden")) {
        return;
    }

    if (event.key === "ArrowLeft") {
        previousPage();
    } else if (event.key === "ArrowRight") {
        nextPage();
    } else if (event.key === "Escape") {
        closeBook();
    }
});

/* SWIPE LEFT OR RIGHT ON TOUCHSCREENS */

readingArea.addEventListener("touchstart", function (event) {
    if (!event.changedTouches.length) {
        return;
    }

    touchStartX = event.changedTouches[0].clientX;
    touchStartY = event.changedTouches[0].clientY;
}, { passive: true });

readingArea.addEventListener("touchend", function (event) {
    if (
        touchStartX === null ||
        touchStartY === null ||
        !event.changedTouches.length
    ) {
        return;
    }

    const touchEndX = event.changedTouches[0].clientX;
    const touchEndY = event.changedTouches[0].clientY;

    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    // Only treat a clear horizontal swipe as a page-turn gesture.
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX < 0) {
            nextPage();
        } else {
            previousPage();
        }
    }

    touchStartX = null;
    touchStartY = null;
}, { passive: true });

/* RESIZE THE PAGE TO FIT THE READER */

window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);

    resizeTimer = setTimeout(function () {
        if (pdfDocument && !reader.classList.contains("hidden")) {
            renderCurrentPage();
        }
    }, 150);
});

/* OPEN A BOOK WHEN ITS UNIQUE URL IS USED */

function openBookFromURL() {
    const hash = window.location.hash;

    if (!hash.startsWith("#book=")) {
        return;
    }

    const bookId = decodeURIComponent(hash.slice("#book=".length));

    if (!books[bookId]) {
        return;
    }

    if (activeBookId === bookId && pdfDocument) {
        return;
    }

    openBook(bookId);
}

window.addEventListener("hashchange", openBookFromURL);

// Support opening a book directly from its URL.
openBookFromURL();

