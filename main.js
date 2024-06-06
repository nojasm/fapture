const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const { JSDOM } = require("jsdom");
const readlineSync = require("readline-sync");
const { LuaFactory } = require("wasmoon");

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

/*class DomainCache {
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
}*/

class DNS {
    constructor(url, refreshSeconds) {
        this.url = url;
        this.lastRefresh = null;
        this.refreshMS = refreshSeconds * 1000;
        this.domains = [];

        this.getDomains((domains) => {
            this.domains = domains;
        });
    }

    getDomains(callback) {
        let now = Date.now();
        if (this.lastRefresh == null || (now - this.lastRefresh) > this.refreshMS) {
            this.lastRefresh = now;
            if (fs.existsSync(this.url)) {
                this.domains = JSON.parse(fs.readFileSync(this.url));
                callback(this.domains);
            } else {
                fetchFile(this.url, (content) => {
                    this.domains = JSON.parse(content);
                    console.log("Refreshed " + this.domains.length + " domains");
                    callback(this.domains);
                });
            }
        } else {
            callback(this.domains);
        }
    }

    getDomainFromURL(name, tld, callback) {
        let domain = null;
        this.domains.forEach((dom) => {
            if (dom.name == name && dom.tld == tld) {
                domain = new FaptureDomain(dom.ip, dom.name, dom.tld);
            }
        });

        //console.log(this.domains, "could not find", name, tld);

        if (domain == null) console.log("Could not resolve " + name + "." + tld);
        else console.log("Resolved", name + "." + tld, "to", domain.ip);

        callback(domain);
    }
}

/*class RawFileCache {
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
}*/

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
        }).catch((err) => {
            callback(err);
        });
    }).catch((err) => {
        callback(err);
    });
}

function getNewestRepoCommit(username, repo, callback) {
    callback("main");
    return;

    fetch("https://api.github.com/repos/" + username + "/" + repo + "/commits").then((res) => {
        res.json().then((json) => {
            callback(json[0].sha);
        });
    });

    //console.log("JUST USE COMMIT main WTF");
    //callback("main");
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
    
        if (mode == "ignore_till_semicolon") {
            if (char == ";") mode = "read_selector";
            return;
        }
        
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
            } else if (char == "@") {
                mode = "ignore_till_semicolon";
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
    } else if (key == "wrap") {
        // Ignore, just always wrap for now
    } else if (["underline", "underline-color", "overline", "overline-color", "strikethrough", "strikethrough-color"].includes(key)) {
        // Just take this property 1:1, converted to CSS properties afterwards
        converted = {[key]: value};

    } else if (["width", "height", "border-radius", "line-height", "color", "background-color",
        "font-family", "font-weight", "underline", "margin-top", "margin-bottom", "margin-left",
        "margin-right", "padding", "opacity", "gap", "font-size", "font-style", "border-style",
        "border-color", "border-width", "line-height"].includes(key)) {
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
        // TODO: This
        if (line.startsWith("<script href=") && line.endsWith(" />"))
            line = line.replace(" />", " ></script>");
    
        htmlppCleared += line + "\n";
    });

    htmlpp = htmlpp.replaceAll(" />", "  /></script>");

    const dom = new JSDOM(htmlpp);
    let meta = {};

    let cssDataToAppend = "";
    let luaScriptsToRun = [];
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
            } else if (href.endsWith(".png") || href.endsWith(".jpg") || href.endsWith(".jpeg") || href.endsWith(".gif") || href.endsWith(".webp")) {
                //let ext = href.substr(0, href.lastIndexOf(href));
                //let iconPath = config.cacheDir + "/icons/" + crypto.randomUUID() + "." + ext;
                meta.icon = href;
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
            console.log("Including script");
            let href = node.getAttribute("src");
            if (href.endsWith(".lua")) {
                fileGetterCallback(href, (content) => {
                    luaScriptsToRun.push(content);
                });
            }
        }
    });

    // please help we have to wait for links and scripts to be included
    setTimeout(() => {
        let stylesEl = dom.window.document.createElement("style");
        stylesEl.innerHTML = cssDataToAppend;
        dom.window.document.body.appendChild(stylesEl);

        // TODO: ADD LUA-TO-JS STUFF HERE

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

var config = {};
if (fs.existsSync("config.json")) {
    config = JSON.parse(fs.readFileSync("config.json"));
} else {
    console.log("Hi! This seems to be the first time you use the FAPTURE-Server software.\nLets set some things up for you.");
    console.log("Answer the questions or just press ENTER to use the default option inside of the brackets.\n");
    console.log("[1] Where do you want your cached files to be stored?");

    let cache = readlineSync.question("  (cache): ");
    if (cache == "") config.cacheDir = __dirname + "/" + "cache";
    else config.cacheDir = __dirname + "/" + cache;
    if (!fs.existsSync(config.cacheDir)) fs.mkdirSync(config.cacheDir);
    if (!fs.existsSync(config.cacheDir + "/icons")) fs.mkdirSync(config.cacheDir + "/icons");

    console.log("[2] What DNS do you want to use? (You can also enter a local json file here)");
    let dnsUrl = readlineSync.question("  (https://api.buss.lol/domains): ");
    if (dnsUrl == "") config.dnsUrl = "https://api.buss.lol/domains";
    else config.dnsUrl = dnsUrl;

    console.log("[3] How often do you want the DNS to refresh its database? (Seconds)");
    let dnsRefresh = readlineSync.question("  (60): ");
    if (dnsRefresh == "") config.dnsRefresh = 60;
    else config.dnsRefresh = parseInt(dnsRefresh);

    console.log("\nEverything is ready. We will save your configuration in 'config.json'\n");

    fs.writeFileSync("config.json", JSON.stringify(config));
}

console.log("Starting the server...");

var dns = new DNS(config.dnsUrl, config.dnsRefresh);  // https://api.buss.lol/domains
var bundleCache = new BundleCache(config.cacheDir + "/bundles.json");

console.log("Loaded", dns.domains.length, "domains");

var errorPage = (message) => {
    let b = new Bundle();
    b.meta = {
        title: "Error :("
    };

    b.html = "<h1>An error occured :(</h1><p>" + message + "</p><style>p {color: #bba} h1 {color: #eed} body {font-family: monospace; margin: 50px; background-color: #603030}</style>";
    return b;
}


app.get("/", (req, res) => {
    let randomDomain = dns.domains[Math.floor(Math.random() * dns.domains.length)];
    let index = fs.readFileSync(root + "/index.html").toString().replaceAll("{RANDOMDOMAIN}", randomDomain.name + "." + randomDomain.tld);
    res.send(index);
});

app.post("/search", (req, res) => {
    let _url = req.body.query;

	console.log("Query: " + _url);

	if (_url.startsWith("buss://")) _url = _url.substring(7);

	let name = _url.split(".")[0];
	let tld = _url.split(".")[1];

    let url = name + "." + tld;

    dns.getDomainFromURL(name, tld, (faptureDomain) => {
        if (faptureDomain == null) {
            // Failed to locate domain
            res.send(errorPage("Could not locate " + name + "." + tld));
        } else {
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
                        res.send(errorPage("Could not load files from IP " + faptureDomain.ip) + ". At this moment, only GitHub repos are supported");
                    }
                }
            });
        }
    });
});

app.get(/^.*\.(html|css|js|png|jpg|jpeg|svg|ico|ttf)/, (req, res) => {
	res.sendFile(root + req.url.split("?")[0]);
});

app.listen(3000, () => {
    console.log("Running on port 3000.");
    console.log("http://localhost:3000/");
});