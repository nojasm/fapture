let tabs = [];  // List of pages
let currentTab = 0;

let search = document.getElementById("search");
let searchButton = document.getElementById("search__icon");

var emptyPage = {
    meta: {
        title: "New Tab",
    },
    body: "<p>Enter something to search</p>"
};

function closeTab(index) {
    // Remove from page registry thing
    tabs = tabs.slice(0, index) + tabs.slice(index + 1, tabs.length);
    if (tabs == "") tabs = [];

    // Remove iframe and such
    document.getElementsByClassName("content")[index].remove();

    // Close tab
    document.getElementsByClassName("tab")[index].remove();

    // Recalculate indices
    [...document.getElementsByClassName("tab")].forEach((el, i) => {
        el.setAttribute("tab-index", i);
    });

    if (currentTab >= tabs.length && tabs.length > 0)
        switchTab(tabs.length - 1);

    if (tabs.length == 0) {
        startLoadingAnimation();
        let lastTab = createNewTab();
        doSearch("dingle.it", (page) => {
            reloadPage(lastTab, page);
            switchTab(lastTab);
            stopLoadingAnimation();
        });
    }
}

function populateTab(page, tabIndex) {
    tabs[tabIndex] = page;

    let tabEl = document.getElementsByClassName("tab")[tabIndex];
    let tabIconEl = tabEl.childNodes[0];
    let tabTextEl = tabEl.childNodes[1];
    let tabCloseEl = tabEl.childNodes[2];

    tabEl.onclick = (event) => {
        if (!event.target.classList.contains("tab"))
            return;
        
        switchTab(parseInt(event.target.getAttribute("tab-index")));
    }

    console.log(page.meta);

    tabIconEl.style.display = page.meta.icon == undefined ? "none" : "initial";
    tabIconEl.src = page.meta.icon || "";

    tabTextEl.onclick = (event) => {
        tabEl.onclick(event);
    }

    tabCloseEl.onclick = (event) => {
        closeTab(parseInt(event.target.parentElement.getAttribute("tab-index")));
    }

    tabTextEl.innerText = page.meta.title || "";

    document.getElementsByClassName("frame")[tabIndex].contentDocument.body.innerHTML = page.html;
    document.getElementsByClassName("content")[tabIndex].style.backgroundColor = tabs[tabIndex].meta.themeColor || "white";
}

function createNewTab() {
    let index = tabs.length;

    tabs.push({});

    let tabEl = document.createElement("div");
    tabEl.classList.add("tab");
    tabEl.setAttribute("tab-index", index);

    let tabIconEl = document.createElement("img");
    let tabTextEl = document.createElement("p");
    let tabCloseEl = document.createElement("img");
    tabCloseEl.src = "/res/x-lg.svg";

    tabIconEl.classList.add("tab-icon");
    tabCloseEl.classList.add("tab-x");

    tabEl.appendChild(tabIconEl);
    tabEl.appendChild(tabTextEl);
    tabEl.appendChild(tabCloseEl);

    document.getElementById("tabs").insertBefore(tabEl, document.getElementById("tab-new"));

    // Create page
    let pageEl = document.createElement("div");
    let frameEl = document.createElement("iframe");

    pageEl.classList.add("content");
    frameEl.classList.add("frame");

    pageEl.appendChild(frameEl);
    document.getElementById("main").appendChild(pageEl);

    
    let injectedCSS = document.createElement("link");
    injectedCSS.rel = "stylesheet";
    injectedCSS.href = "/css/injected.css";
    document.getElementsByClassName("frame")[index].contentDocument.head.appendChild(injectedCSS);

    return index;
}

function doSearch(str, callback) {
    fetch("/search", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            query: str
        })
    }).then(res => {
        res.json().then(page => {
            callback(page);
        }).catch((err) => {
            console.warn(err);
        });
    });
}

function reloadPage(index, page) {
    populateTab(page, index);
}

function switchTab(index) {
    document.getElementsByClassName("content")[currentTab].style.display = "none";
    document.getElementsByClassName("content")[index].style.display = "initial";

    document.getElementsByClassName("tab")[currentTab].classList.remove("tab-selected");
    document.getElementsByClassName("tab")[index].classList.add("tab-selected");

    document.title = tabs[index].meta.title || "";

    currentTab = tabs.length - 1;
}

function startLoadingAnimation() {
    let icon = document.getElementById("search__icon");
    icon.src = "/res/arrow-clockwise.svg";
    icon.classList.add("loading-rotation-animation");
}

function stopLoadingAnimation() {
    let icon = document.getElementById("search__icon");
    icon.src = "/res/search.svg";
    icon.classList.remove("loading-rotation-animation");
}

searchButton.onclick = () => {
    if (searchButton.classList.contains("loading-rotation-animation"))
        return;

    startLoadingAnimation();
    doSearch(search.value, (page) => {
        reloadPage(currentTab, page);
        stopLoadingAnimation();
    });
}

search.addEventListener("keydown", (event) => {
    if (event.key == "Enter") {
        startLoadingAnimation();
        doSearch(event.target.value, (page) => {
            reloadPage(currentTab, page);
            stopLoadingAnimation();
        });
    }
});

document.getElementById("tab-new").onclick = () => {
    currentTab = createNewTab();
    doSearch("dingle.it", (page) => {
        reloadPage(lastTab, page);
        switchTab(lastTab);
        stopLoadingAnimation();
    });
};

startLoadingAnimation();
let lastTab = createNewTab();
doSearch("dingle.it", (page) => {
    reloadPage(lastTab, page);
    switchTab(lastTab);
    stopLoadingAnimation();
});
