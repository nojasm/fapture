const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const { JSDOM } = require("jsdom");

const app = express();

app.use(bodyParser.json());

var root = __dirname + "/public";

class FaptureDomain {
    constructor(ip, name, tld) {
        this.ip = ip;
        this.name = name;
        this.tld = tld;

        if (this.ip.startsWith("https://github.com/")) {
            this.host = "github";
            this.github_username = this.ip.split("/")[3];
            this.github_repo = this.ip.split("/")[4];
        }
    }
}

class DomainCache {
    constructor() {
        this.domains = {};  // "name.tld": <FaptureDomain>

        let data = JSON.parse(fs.readFileSync("cache/domains.json"));
        data.forEach((d) => {
            this.domains[d.name + "." + d.tld] = new FaptureDomain(d.ip, d.name, d.tld);
            //console.log("Registered {" + d.name + "." + d.tld + "}");
        });
    }

    getDomainFromURL(name, tld, callback) {
        callback(this.domains[name + "." + tld]);
    }
}

class RawFileCache {
    constructor(storageFile) {
        this.storageFile = storageFile;

        if (fs.existsSync(this.storageFile)) {
            this.webfiles = JSON.parse(fs.readFileSync(this.storageFile));
        } else {
            this.webfiles = {};  // "url": "content"
            this.save();
        }
    }

    getFileFromURL(url, callback) {
        if (url in this.webfiles) {
            callback(this.webfiles[url]);
        } else {
            fetch(url).then((res) => {
                res.text().then((text) => {
                    this.webfiles[url] = text;
                    
                    this.save();
                    callback(this.webfiles[url]);
                });
            });
        }
    }

    save() {
        fs.writeFileSync(this.storageFile, JSON.stringify(this.webfiles));
    }
}

// A Collection is a collection of files
class Collection {

}

// A bundle is a compiled collection of all files from a page into a single
// HTML file including CSS and JavaScript code
class Bundle {
    constructor() {
        this.html = "<h1>nice!</h1>";
        this.meta = {
            title: "the page wow!"
        };
    }
}

class BundleCache {
    constructor(storageFile) {
        this.storageFile = storageFile;

        if (fs.existsSync(this.storageFile)) {
            this.bundles = JSON.parse(fs.readFileSync(this.storageFile));
        } else {
            this.bundles = {};  // "name.tld": <Bundle>
            this.save();
        }
    }

    save() {
        fs.writeFileSync(this.storageFile, JSON.stringify(this.bundles));
    }

    isCached(url, callback) {
        callback(url in this.bundles);
    }
    
    cache(url, bundle) {
        this.bundles[url] = bundle;
        this.save();
    }
}

function fetchFile(url, callback) {
    fetch(url).then((res) => {
        res.text().then((text) => {
            callback(text);
        });
    });
}

function getNewestRepoCommit(username, repo, callback) {
    /*
    fetch("https://api.github.com/repos/" + username + "/" + repo + "/commits").then((res) => {
        res.json().then((json) => {
            callback(json[0].sha);
        });
    });*/

    console.log("JUST USE COMMIT main WTF");
    callback("main");
}

function selectorIsTag(sel) {
    return [
        "body", "head", "p", "h1", "h2", "h3", "h4", "h5", "h6", "input"
    ].includes(sel);
}

function CSSPP2CSS(csspp, cb) {
    let cssData = [];  // [{selector: "...", rules: {"...": "..."}}]

    let mode = "read_selector";
    let currentSelector = "";
    let currentKey = "";
    let currentValue = "";

    csspp.split("").forEach((char) => {
        // Ignore whitespace if not currently in value
        if (mode != "read_rule_value" && (char == "" || char == "\n" || char == " " || char == "\t" || char == "\r"))
            return;
        
        if (mode == "read_selector") {
            if (char.match(/[a-zA-Z0-9\-_]/)) {
                currentSelector += char;
            } else if (char == "{") {
                if (!selectorIsTag(currentSelector))
                    currentSelector = "." + currentSelector;

                cssData.push({
                    selector: currentSelector,
                    rules: {}
                });
                currentSelector = "";
                mode = "read_rule_key";
            } else {
                console.error("ERROR when reading css data. Character >", char, "< in mode 'read_selector'");
            }
        } else if (mode == "read_rule_key") {
            if (char.match(/[a-zA-Z0-9\-_]/)) {
                currentKey += char;
            } else if (char == "}") {
                mode = "read_selector";
            } else if (char == ":") {
                mode = "read_rule_value";
            }
        } else if (mode == "read_rule_value") {
            if (char == ";" || char == "}") {
                currentValue = currentValue.trimStart();
                
                if (currentKey == "gap" && currentValue.match(/[0-9]+/))
                    currentValue += "px";
                
                // Add rules and overwrite old rule keys of that selector if needed
                let rules = convertCSSPPKeyValue(currentKey, currentValue);
                Object.entries(rules).forEach((rule) => {
                    cssData[cssData.length - 1].rules[rule[0]] = rule[1];
                });

                mode = "read_rule_key";
                currentKey = "";
                currentValue = "";
                
            } else {
                currentValue += char
            }
        }
    });

    let donecss = "";
    cssData.forEach((selector) => {
        donecss += selector.selector + " {" + "\n";
        Object.entries(selector.rules).forEach((rule) => {
            donecss += "\t" + rule[0] + ": " + rule[1] + ";" + "\n";
        });
        donecss += "}" + "\n\n";
    });

    cb(donecss);
}

function convertCSSPPKeyValue(key, value) {
    let converted = {};  // Rules in "key: value" format

    if (key == "direction") {
        converted = {
            "display": "flex",
            "flex-direction": value
        };
    } else if (key == "align-items") {
        converted = {
            "display": "flex",
            "align-items": value
        };
    } else if (key == "line-height") {
    } else if (key == "wrap") {
    } else if (key == "underline") {
    } else if (key == "underline-color") {
    } else if (key == "overline") {
    } else if (key == "overline-color") {
    } else if (key == "strikethrough") {
    } else if (key == "strikethrough-color") {
    } else if (["width", "height", "border-radius", "line-height", "color", "background-color",
        "font-family", "font-weight", "underline", "margin-top", "margin-bottom", "margin-left",
        "margin-right", "padding", "opacity", "gap", "font-size", "font-style", "border-style",
        "border-color", "border-width"].includes(key)) {
        converted = {[key]: value};
    } else {
        console.error("INVALID CSS KEY/VALUE PAIR:", key, value);
    }

    return converted;
}

function convertHTMLPP2HTML(domain, htmlpp, fileGetterCallback, cb) {
    let lines = htmlpp.split("\n");
    let htmlppCleared = "";
    lines.forEach((line) => {
        if (line.startsWith("<script href=") && line.endsWith(" />"))
            line = line.replace(" />", " ></script>");
    
        htmlppCleared += line + "\n";
    });

    htmlpp = htmlpp.replaceAll(" />", "  /></script>");

    const dom = new JSDOM(htmlpp);
    let meta = {};

    let cssDataToAppend = "";
    dom.window.document.head.childNodes.forEach((node) => {
        if (node.tagName == "TITLE") {
            meta.title = node.textContent;
        } else if (node.tagName == "LINK") {
            //meta.title = node.innerText;
            let href = node.getAttribute("href");
            if (href.endsWith(".css")) {
                fileGetterCallback(href, (content) => {
                    console.log("GOT:", content);
                    cssDataToAppend += content + "\n\n";
                });
            } else if (href.endsWith(".png") || href.endsWith(".jpg")) {
                console.log("PAGE LOGO", href);
            }
        } else if (node.tagName == "META") {
            //meta.title = node.innerText;
            let key = node.getAttribute("name");
            let value = node.getAttribute("content");
            
            if (key == "theme-color")
                meta.themeColor = value;
            else if (key == "description")
                meta.description = value;
        
        } else if (node.tagName == "SCRIPT") {
            //meta.title = node.innerText;
        }
    });

    setTimeout(() => {
        let stylesEl = dom.window.document.createElement("style");
        stylesEl.innerHTML = cssDataToAppend;
        dom.window.document.body.appendChild(stylesEl);

        cb(meta, dom.window.document.body.innerHTML);
    }, 300);

    /*let multi = new MultiCallback(cssFilesToLoad, (multi, i) => {
        webFileCacher.getFile(cssFilesToLoad[i], (content) => {
            this.cssppToCSS(content, (css) => {
                multi.setResult(i, css);
                console.log("RENDERED FILE", cssFilesToLoad[i], "AS", css);
            });
        });
    }, (values) => {
        // Add converted CSS to head as a style
        let style = dom.window.document.createElement("style");
        style.innerHTML = values.join("\n\n");
        dom.window.document.body.appendChild(style);

        page.processedFiles["index.html"] = dom.window.document.body.outerHTML;
        finalCallback(page);
    });*/
}

function createBundle(domain, fileGetterCallback, callback) {
    let bundle = new Bundle();

    fileGetterCallback("index.html", (content) => {
        convertHTMLPP2HTML(domain, content, fileGetterCallback, (meta, html) => {
            bundle.meta = meta;
            bundle.html = html;
            callback(bundle);
        });
    });
}

var domainCache = new DomainCache();
var rawFileCache = new RawFileCache("cache/rawfiles.json");
var bundleCache = new BundleCache("cache/bundles.json");

app.get("/", (req, res) => {
    res.sendFile(root + "/index.html");
});

app.post("/search", (req, res) => {
    let _url = req.body.query;

	console.log("Query: " + _url);

	if (_url.startsWith("buss://")) _url = _url.substring(7);

	let name = _url.split(".")[0];
	let tld = _url.split(".")[1];

    let url = name + "." + tld;

    domainCache.getDomainFromURL(name, tld, (faptureDomain) => {
        bundleCache.isCached(url, (is) => {
            if (false && is) {
                // Page is already bundled, so just send that
                res.send(bundleCache.bundles[url]);
            } else {
                // Page needs to be retrieved and bundled first
                if (faptureDomain.host == "github") {
                    getNewestRepoCommit(faptureDomain.github_username, faptureDomain.github_repo, (commit) => {
                        let baseURL = "https://raw.githubusercontent.com/" + faptureDomain.github_username + "/" + faptureDomain.github_repo + "/" + commit;

                        console.log("Loading from", baseURL);

                        createBundle(faptureDomain, (path, callback) => {
                            //console.log("{BUNDLE} Bundler asks for: " + path);
                            /*if (path == "index.html") {
                                fetchFile(baseURL + "/index.html", (content) => {
                                    callback(content);
                                });
                            } else if (path == "styles.css") {
                                callback("* { background-color: pink }");
                            }*/
                            
                            console.log("  Bundler is loading", path);

                            if (path.endsWith(".css")) {
                                fetchFile(baseURL + "/" + path, (csspp) => {
                                    CSSPP2CSS(csspp, (css) => {
                                        callback(css);
                                    });
                                });
                            } else {
                                fetchFile(baseURL + "/" + path, callback);
                            }
                        }, (bundle) => {
                            console.log("Bundled", url);
                            bundleCache.cache(url, bundle);
                            res.send(bundle);
                        });
                    });
                } else {
                    console.log("Cannot load from host '" + faptureDomain.ip + "' yet");
                }
            }
        });
    });
});

app.get(/^.*\.(html|css|js|png|jpg|jpeg|svg|ico|ttf)/, (req, res) => {
	res.sendFile(root + req.url.split("?")[0]);
});

app.listen(3000, () => {
    console.log("Running on port 3000.");
});