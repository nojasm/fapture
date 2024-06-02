const express = require('express')

const Nutter = require("./nutter").Nutter;
const nut = new Nutter();

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
	
	getFileFromGitHub(username, repo, path, cb) {
		console.log("{GITHUB} Downloading file from", username, repo, path);
		this.getNewestRepoCommit(username, repo, (commit) => {
			fetch("https://raw.githubusercontent.com/" + username + "/" + repo + "/" + commit + "/" + path).then(res => {
				res.text().then(data => {
					cb(data);
				}).catch((err) => {
					cb(null);
				});
			}).catch((err) => {
				cb(null);
			});
		});
	}

	// Returns the unprocessed .html file of a github repository
	getHTMLPPFileFromGitHub(username, repo, cb) {
		console.log("Receiving HTML++ file...");
		this.getFileFromGitHub(username, repo, "index.html", (file) => {
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

	convertCSSPPKeyValue(key, value) {
		
	}

	async getWebImagePathSync(domain, img) {
		await this.getWebImagePathPromise(domain, img);
	}

	createPageFromHTMLPP(domain, htmlpp, finalCallback) {
		let page = new Page();
		page.domain = domain;  // Object containing domain, ip and hosting data
		page.meta = {};
		
		page.rawFiles["index.html"] = "<p>nothing in here</p>";

		

		return;
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
				if (htmlpp == null) {
					cb(null);
				}

				
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

class FaptureDomain {
	constructor(ip, name, tld) {
		this.ip = ip;
		this.name = name;
		this.tld = tld;

		/*
		if (ip.startsWith("https://github.com/")) {
			this.host = "github";
			this.github_username = ip.substr("https://github.com/".length).split("/")[0];
			this.github_repo = ip.substr("https://github.com/".length).split("/")[1];
			
			this.githubGetLatestCommit((commit) => {
				if (commit == null) console.error("Unable to get latest commit for IP: " + this.ip);
				else this.github_latest_commit = commit;
			});
		} else {
			console.error("Invalid IP host: " + ip);
		}
		*/
	}

	githubGetLatestCommit(cb) {
		if (this.host == "github") {
			//console.log("Getting default branch of", username + "/" + repo, "from GitHub API");
			fetch("https://api.github.com/repos/" + this.github_username + "/" + this.github_repo + "/commits").then(res => {
				res.json().then(json => {
					//console.log("  =>", json[0].sha);
					cb(json[0].sha || null);
				}).catch((err) => {
					//console.log("  => failed");
					cb(null);
				});
			}).catch((err) => {
				//console.log("  => failed");
				cb(null);
			});
		} else {
			console.error("Unable to get latest commit as this domain (" + this.ip + ") is not hosted in a GitHub Repository");
		}
	}
}

// A FapturePage object represents an entire registered domain, including
// all files like index.html and lua scripts
class FapturePage {
	constructor(domain, fileGetterCallback) {
		this.domain = domain;  // FaptureDomain
		this.fileGetter = fileGetter;  // For retreiving files like styles.css and lua scripts
		this.files = {};  // Converted files (eg. HTML)
		this.rawFiles = {};  // Unconverted files (eg. HTML++)
	}
	
	getProcessedIndexHTML(cb) {
		cb("<h1>works!</h1>");
	}
}

// A helper class that represents a collection of files, like those downloaded
// from a GitHub repository for example
class FaptureCollection {
	constructor(domain) {
		this.files = {};  // path: content
	}

	addFile(path, content) {
		this.files[path] = content;
	}

	getFile(path) {
		return this.files[path];
	}
}

class FapturePageCache {
	constructor(storageFile) {
		this.storageFile = storageFile;
		if (fs.existsSync(this.storageFile))
			this.pages = JSON.parse(fs.readFileSync(this.storageFile));
		else {
			this.pages = {};  // {"name.tld": <FaptureCollection>}
			this.save();
		}
	}

	// If not cached yet, this method downloads all files from a host (like GitHub) and caches them.
	// This returns raw, unprocessed HTML++, CSS and Lua files as a FaptureCollection.
	getFilesFromDomain(domain, callback) {
		let url = domain.name + "." + domain.tld;

		if (url in this.pages) {
			// Page is cached already
			callback(this.pages[url]);
		} else {
			// Cache page first
			let collection = this.collectFilesFromDomain(domain);
			this.pages[url] = collection;	

			callback(this.pages[url]);
		}
	}

	// Collects all files from a domain like https://www.github.com/xyz/xyz and returns
	// them as a FaptureCollection
	collectFilesFromDomain(domain, callback) {
		let collection = new FaptureCollection(domain);
		collection.addFile("index.html", "<p>wtf?!</p>");
		callback(collection);
	}

	save() {
		fs.writeFileSync(this.storageFile, JSON.stringify(this.pages));
	}
}

// Helper class to keep track of all domains
class FaptureDomainCache {
	constructor(storageFile) {
		this.storageFile = storageFile;
		if (fs.existsSync(this.storageFile)) {
			this.domains = JSON.parse(fs.readFileSync(this.storageFile));
		} else {
			this.domains = {};  // {"ip": <FaptureDomain>, ...}
		}
	}
	
	loadFromFile(path) {
		let data = JSON.parse(fs.readFileSync(path));
		data.forEach((entry) => {
			console.log("Registered", entry.ip, entry.name, entry.tld);
			this.domains[entry.ip] = new FaptureDomain(entry.ip, entry.name, entry.tld);
			if (entry.host == "github") console.log(" =>", entry.github_username, entry.github_repo);
		});
	}

	// Returns a FapturePage or null if not cached
	getDomain(ip) {
		if (ip in this.domains) return this.domains[ip];
		else return null;
	}

	getFaptureDomain(name, tld) {
		let domain = null;
		Object.keys(this.domains).forEach((ip) => {
			if (this.domains[ip].name == name && this.domains[ip].tld == tld) {
				domain = this.domains[ip];
			}
		});

		return domain;
	}

	// Caches and creates a new FaptureDomain in the storage based on the IP, Name and TLD
	registerDomain(ip, name, tld) {
		let domain = new FaptureDomain(ip, name, tld);
		this.domains[ip] = domain;

		this.save();
	}

	// Saves all cached domains to the storage file (Happens automatically in registerDomain())
	save() {
		fs.writeFileSync(this.storageFile, JSON.stringify(this.domains));
	}
}

class Fapture {
	constructor() {
		
	}

	// Takes in a FaptureCollection and uses its "index.html" as well as other files from there
	// to render a browser HTML index.html including style and javascript
	renderHTMLFromFileCollection(collection, callback) {
		let htmlpp = collection.getFile("index.html");
	}
}

var fapture = new Fapture();

var faptureDomainCache = new FaptureDomainCache("cache/fapture-domains.json");
faptureDomainCache.loadFromFile("cache/domains.json");

var fapturePageCache = new FapturePageCache("cache/fapture-pages.json");

//var pages = new PageCacher(new Storage("cache/pages.json"));
//var webFileCacher = new WebFileCacher(new Storage("cache/webfiles.json"));

app.get("/", (req, res) => {
	res.sendFile(root + "/index.html")
});

app.post("/search", (req, res) => {
	let url = req.body.query;

	console.log("Query: " + url);

	if (url.startsWith("buss://")) url = url.substring(7);

	let name = url.split(".")[0];
	let tld = url.split(".")[1];

	let domain = faptureDomainCache.getFaptureDomain(name, tld);
	if (domain != null) {
		fapturePageCache.getFilesFromDomain(domain, (fileCollection) => {
			fapture.renderHTMLFromFileCollection(fileCollection, (processedFiles) => {
				res.send(processedFiles.getFile("index.html"));
			});
		});
	} else {
		res.send(fapture.errorPage());
	}

	/*
	domains.forEach((domain) => {
		if (domain.name == name && domain.tld == tld) {
			if (faptureDomainCache.hasPageStored(domaini))

			console.log("Loading buss://" + domain.name + "." + domain.tld);
			pages.getPageFromIP(domain.ip, (page) => {
				res.send({
					meta: page.meta,
					body: page.processedFiles["index.html"]
				});
			});
		}
	});
	*/
});

app.get(/^.*\.(html|css|js|png|jpg|jpeg|svg|ico|ttf)/, (req, res) => {
	res.sendFile(root + req.url.split("?")[0]);
});

app.listen(3000, () => {
	console.log(`Example app listening on port 3000`)
});
