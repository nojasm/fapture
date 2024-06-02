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
        createNewTab();
        populateTab(emptyPage, 0);
        switchTab(0);
    }
}

function populateTab(page, tabIndex) {
    tabs[tabIndex] = page;

    let tabEl = document.getElementsByClassName("tab")[tabIndex];
    let tabTextEl = tabEl.childNodes[0];
    let tabCloseEl = tabEl.childNodes[1];

    tabEl.onclick = (event) => {
        if (!event.target.classList.contains("tab"))
            return;
        
        switchTab(parseInt(event.target.getAttribute("tab-index")));
    }

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

    let tabTextEl = document.createElement("p");
    let tabCloseEl = document.createElement("img");
    tabCloseEl.src = "/res/x-lg.svg";

    tabEl.appendChild(tabTextEl);
    tabEl.appendChild(tabCloseEl);
    document.getElementById("tabs").appendChild(tabEl);

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

function doSearch(str) {
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
            reloadPage(currentTab, page);
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

searchButton.onclick = () => {
    doSearch(search.value);
}

search.addEventListener("keydown", (event) => {
    if (event.key == "Enter")
        doSearch(event.target.value);
});

doSearch("dingle.it");

let lastTab = createNewTab();
populateTab(emptyPage, lastTab);
switchTab(lastTab);
