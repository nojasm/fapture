const { JSDOM } = require("jsdom");

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

class NutFetchMiddleware {
    constructor() {}

    getFile(url, cb) {
        fetch(url).then((res) => {
            res.text().then((text) => {
                cb(text)
            });
        });
    }
}

class linkMiddleware {
    constructor() {}

    // Converts a link or image source like "/images/cat.png" to a web link like
    // raw.githubusercontent.com/me/repo/main/images/cat.png
    getWebLinkFromLocal(localLink, cb) {
        cb("missing.png");
    }
}

class NutterDomain {
    constructor(ip, name, tld) {
        this.ip = ip;
        this.name = name;
        this.tld = tld;
    }
}

class Nutter {
    constructor() {
        this.fetchMiddleware = new NutFetchMiddleware();
        this.linkMiddleware = new NutFetchMiddleware();
    }

    CSSPP2CSS(csspp, cb) {
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
					if (!this._selectorIsTag(currentSelector))
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
					let rules = this._convertCSSPPKeyValue(currentKey, currentValue);
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

    _convertCSSPPKeyValue() {
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

	_selectorIsTag(sel) {
		return [
			"body", "head", "p", "h1", "h2", "h3", "h4", "h5", "h6", "input"
		].includes(sel);
	}

    convertHTMLPP2HTML(domain, htmlpp, cb) {
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
    }
}

exports.Nutter = Nutter;