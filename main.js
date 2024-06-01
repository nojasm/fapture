const express = require('express')

const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const bodyParser = require('body-parser')
const fs = require('fs')
const app = express()

app.use(bodyParser.json());

var root = __dirname + "/public"

var domains = JSON.parse(fs.readFileSync("cache/domains.json"));

console.log(domains.length + " domains loaded");

class Page {
	constructor(ip, meta, rawFiles) {
		this.ip = ip || null;
		this.meta = meta || {};
		this.rawFiles = rawFiles || {};
		this.processedFiles = {};
	}
}

class Storage {
	constructor(path) {
		this.path = path;

		if (fs.existsSync(this.path)) {
			this.data = JSON.parse(fs.readFileSync(this.path));
		} else {
			fs.writeFileSync(this.path, "{}");
			this.data = {};
		}
	}

	storePage(page) {
		this.data.pages[page.ip] = page;
		this.save();
	}

	hasPageStored(ip) {
		return ip in this.data.pages;
	}

	getPage(ip) {
		return this.data.pages[ip];
	}

	save() {
		fs.writeFileSync(this.path, JSON.stringify(this.data, undefined, 4));
	}
}

class MultiCallback {
	constructor(list, forEachFunc, onDone) {
		this.list = list;
		this.forEachFunc = forEachFunc;
		this.values = [];
		this.onDone = onDone;

		for (var i = 0; i < this.list.length; i++)
			this.values.push(null);

		this.list.forEach((el, index) => {
			this.forEachFunc(this, index);
		});
	}
	
	setResult(index, value) {
		this.values[index] = value;

		// Check if all done
		let allDone = true;
		this.values.forEach((el) => {
			if (el == null) allDone = false;
		});
		
		// If all done, run final callback
		if (allDone)
			this.onDone(this.values);
	}
}

class WebFileCacher {
	constructor(storage) {
		this.storage = storage;
		this.storage.data.webFiles = {};  // {"url": "content", ...}
	}

	loadFileToCache(url, doneCallback) {
		fetch(url, {
			method: "GET",
		}).then((res) => {
			res.text().then((text) => {
				this.storage.data.webFiles[url] = text;
				this.storage.save();
				doneCallback();
			}).catch((err) => {
				console.error("Error: Could not convert WebFile to .text(): " + url);
			});
		}).catch((err) => {
			console.error("Error: Could not loadFileToCache(): " + url);
		});
	}

	getFile(url, cb) {
		if (!(url in this.storage.data.webFiles)) {
			console.log("{WebFileCacher} Downloading file:", url);
			this.loadFileToCache(url, () => {
				cb(this.storage.data.webFiles[url]);
			})
		} else {
			console.log("{WebFileCacher} Getting from cache:", url);
			cb(this.storage.data.webFiles[url]);
		}
	}
}

class PageCacher {
	constructor(storage) {
		this.storage = storage;
		this.storage.pages = {};
		this.pages = {};  // "ip": {page}
		this.cachedDefaultBranches = {};  // "username/repo": "branch"
	}

	getNewestRepoCommit(username, repo, cb) {
		//console.log("https://api.github.com/repos/" + username + "/" + repo + "/commits");
		if (username + "/" + repo in this.cachedDefaultBranches) {
			console.log("Getting default branch of", username + "/" + repo, "from cache");
			cb(this.cachedDefaultBranches[username + "/" + repo]);
		} else {
			console.log("Getting default branch of", username + "/" + repo, "from GitHub API");
			fetch("https://api.github.com/repos/" + username + "/" + repo + "/commits").then(res => {
				res.json().then(json => {
					this.cachedDefaultBranches[username + "/" + repo] = json[0].sha;
					console.log("  =>", json[0].sha);
					cb(json[0].sha);
				}).catch((err) => {
					console.log("  => failed");
					cb(null);
				});
			}).catch((err) => {
				console.log("  => failed");
				cb(null);
			});
		}
	}
	
	getFileFromGitHub(username, repo, path, cb) {
		console.log("{GITHUB} Downloading file from", username, repo, path);
		this.getNewestRepoCommit(username, repo, (commit) => {
			fetch("https://raw.githubusercontent.com/" + username + "/" + repo + "/" + commit + "/" + path).then(res => {
				res.text().then(data => {
					cb(data);
				});
			});
		});
	}

	// Returns the unprocessed .html file of a github repository
	getHTMLPPFileFromGitHub(username, repo, cb) {
		console.log("Receiving HTML++ file...");
		this.getFileFromGitHub(username, repo, (file) => {
			cb(file);
		});
	}

	getWebImagePathPromise(domain, img) {
		return new Promise(resolve => {
			this.getWebImagePathCallback(domain, img, resolve);
		});
	}

	getWebImagePathCallback(domain, img, callback) {
		if (!img.startsWith("/")) img = "/" + img;

		if (domain.host == "github") {
			this.getNewestRepoCommit(domain.github_username, domain.github_repo, (commit) => {
				if (commit == null) callback(null);
				else callback("https://raw.githubusercontent.com/" + domain.github_username + "/" + domain.github_repo + "/" + commit + img);
			});
		} else {
			console.error("ERROR loading external image from domain " + JSON.stringify(domain) + ": " + img);
			callback(null);
		}
	}

	selectorIsTag(sel) {
		return [
			"body", "head", "p", "h1", "h2", "h3", "h4", "h5", "h6", "input"
		].includes(sel);
	}

	convertCSSPPKeyValue(key, value) {
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

	cssppToCSS(css, cb) {
		let cssData = [];  // [{selector: "...", rules: {"...": "..."}}]

		let mode = "read_selector";
		let currentSelector = "";
		let currentKey = "";
		let currentValue = "";

		css.split("").forEach((char) => {
			// Ignore whitespace if not currently in value
			if (mode != "read_rule_value" && (char == "" || char == "\n" || char == " " || char == "\t" || char == "\r"))
				return;
			
			if (mode == "read_selector") {
				if (char.match(/[a-zA-Z0-9\-_]/)) {
					currentSelector += char;
				} else if (char == "{") {
					if (!this.selectorIsTag(currentSelector))
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
					let rules = this.convertCSSPPKeyValue(currentKey, currentValue);
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

		//fs.writeFileSync("cumverted.css", donecss);
	}

	async getWebImagePathSync(domain, img) {
		await this.getWebImagePathPromise(domain, img);
	}

	createPageFromHTMLPP(domain, htmlpp, finalCallback) {
		let page = new Page();
		page.domain = domain;  // Object containing domain, ip and hosting data
		page.meta = {};
		
		page.rawFiles["index.html"] = "<p>nothing in here</p>";

		let lines = htmlpp.split("\n");
		let htmlppCleared = "";
		lines.forEach((line) => {
			if (line.startsWith("<script href=") && line.endsWith(" />"))
				line = line.replace(" />", " ></script>");
		
			htmlppCleared += line + "\n";
		});

		htmlpp = htmlpp.replaceAll(" />", "  /></script>");

		const dom = new JSDOM(htmlpp);

		let cssFilesToLoad = [];
		dom.window.document.head.childNodes.forEach((node) => {
			if (node.tagName == "TITLE") {
				page.meta.title = node.textContent;
			} else if (node.tagName == "LINK") {
				//page.meta.title = node.innerText;
				let href = node.getAttribute("href")
				if (href.endsWith(".css")) {
					// Load corresponding CSS file
					if (domain.host == "github") {
						let url = "https://raw.githubusercontent.com/" + domain.github_username + "/" + domain.github_repo + "/main/styles.css";
						//webFileCacher.getFile("")
						cssFilesToLoad.push(url);
					}
				} else if (href.endsWith(".png") || href.endsWith(".jpg")) {
					console.log("PAGE LOGO", href);
				}
			} else if (node.tagName == "META") {
				//page.meta.title = node.innerText;
				let key = node.getAttribute("name");
				let value = node.getAttribute("content");
				
				if (key == "theme-color")
					page.meta.themeColor = value;
				else if (key == "description")
					page.meta.description = value;
			
			} else if (node.tagName == "SCRIPT") {
				//page.meta.title = node.innerText;
			}
		});

		let multi = new MultiCallback(cssFilesToLoad, (multi, i) => {
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
		});
		
		return;
	}

	resolveIP(ip) {
		let data = {};
		if (ip.startsWith("https://github.com/")) {
			data.host = "github";
			data.github_username = ip.substr("https://github.com/".length).split("/")[0];
			data.github_repo = ip.substr("https://github.com/".length).split("/")[1];
		} else {
			console.error("Invalid IP host: " + ip);
		}

		return data;
	}

	// Executes callback with a <Page>-Object and loads and caches
	// the queried page
	loadToCacheFromIP(ip, cb) {
		let domain = this.resolveIP(ip);
		if (domain.host == "github") {
			let username = domain.github_username;
			let repo = domain.github_repo;
			
			console.log("  Loading index.html from github @ " + username + "/" + repo);

			this.getHTMLPPFileFromGitHub(username, repo, (htmlpp) => {
				console.log("=> Converting to standard HTML");
				this.createPageFromHTMLPP(domain, htmlpp, (page) => {
					page.rawbody = htmlpp;
					console.log("=> Converted.");
					this.pages[domain.ip] = page;
					cb(this.pages[domain.ip]);
				});
			});
		} else {
			cb(this.errorPage());
		}
	}

	errorPage() {
		return new Page("", {title: "boowomp"}, "<h1>something went wrong</h1>");
	}

	// Executes the callback with a <Page>-Object that contains metadata
	// as well as the prepared and rendered html of the page. Also caches
	// that page for later use
	getPageFromIP(ip, cb) {
		let htmlpp;
		if (this.storage.hasPageStored(ip)) {
			htmlpp = this.storage.getPage(ip).rawFiles["index.html"];
			this.createPageFromHTMLPP(this.resolveIP(ip), htmlpp, (page) => {
				page.ip = ip;
				cb(page);
			});
		} else {
			let domain = this.resolveIP(ip);
			this.getHTMLPPFileFromGitHub(domain.username, domain.repo, (htmlpp) => {
				this.createPageFromHTMLPP(domain, htmlpp, (page) => {
					page.domain = domain;
					page.ip = ip;
					storage.storePage(page);
					cb(page);
				});
			});
		}


		/*
		if (!storage.hasPageStored(ip)) {
			console.log("  (Loading and caching)");
			this.loadToCacheFromIP(ip, (page) => {
				page.ip = ip;
				storage.storePage(page);
				cb(page);
			});
		} else {
			console.log("  (Loading from cache)");
			cb(storage.getPage(ip));
		}
		*/

		/*let apage = this.storage.getPage(ip);
		this.createPageFromHTMLPP(apage.domain, apage.rawbody, (page) => {
			page.rawbody = apage.rawbody;
			console.log("=> Converted.");
			this.pages[apage.domain.ip] = page;
			cb(this.pages[apage.domain.ip]);
		});*/
	}
};

var pages = new PageCacher(new Storage("cache/pages.json"));
var webFileCacher = new WebFileCacher(new Storage("cache/webfiles.json"));

app.get("/", (req, res) => {
	res.sendFile(root + "/index.html")
});

app.post("/search", (req, res) => {
	let url = req.body.query;

	console.log("Query: " + url);

	if (url.startsWith("buss://")) url = url.substring(7);

	let name = url.split(".")[0];
	let tld = url.split(".")[1];

	domains.forEach((domain) => {
		if (domain.name == name && domain.tld == tld) {
			console.log("Loading buss://" + domain.name + "." + domain.tld);
			pages.getPageFromIP(domain.ip, (page) => {
				res.send({
					meta: page.meta,
					body: page.processedFiles["index.html"]
				});
			});
		}
	});
});

app.get(/^.*\.(html|css|js|png|jpg|jpeg|svg|ico|ttf)/, (req, res) => {
	res.sendFile(root + req.url.split("?")[0]);
});

app.listen(3000, () => {
	console.log(`Example app listening on port 3000`)
});
