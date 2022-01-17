//? |-----------------------------------------------------------------------------------------------|
//? |  /app.js                                                                                      |
//? |                                                                                               |
//? |  Copyright (c) 2021 Belikhun. All right reserved                                              |
//? |  Licensed under the MIT License. See LICENSE in the project root for license information.     |
//? |-----------------------------------------------------------------------------------------------|

const HTTP = require("http");
const URL = require("url");
const FS = require("fs");
const { API, clog } = require("./libs");
const fetch = require("node-fetch");
const { performance } = require("perf_hooks");
const { AbortController } = require("node-abort-controller");

// HTTP Server Config
const HOSTNAME = process.env.PORT ? "0.0.0.0" : "localhost";
const PORT = process.env.PORT || 21075;
const TIMEOUT = 120000

// Set up some constants
const IGNORE_HEADERS = [
	"content-length",
	"location",
	"pragma",
	"access-control-allow-origin",
	"access-control-allow-headers"
];

const VERB_COLORS = {
	"GET": "greenBright",
	"POST": "blueBright",
	"PUT": "magentaBright",
	"OPTIONS": "yellowBright",
	"DELETE": "redBright"
};

/**
 * Handle Request
 * @param {HTTP.IncomingMessage}	request
 * @param {String}					data
 * @param {HTTP.ServerResponse}		response
 */
const handleRequest = async (request, data, response) => {
	// Allow CORS so CTMS+ can freely request to this middleware
	// without restriction
	let requestURL = URL.parse(request.url, true);
	let headers = { ...request.headers };
	let api = new API(requestURL, response);

	response.setHeader("Access-Control-Allow-Origin", headers.origin || "*");
	response.setHeader("Access-Control-Allow-Credentials", "true");
	response.setHeader("Access-Control-Allow-Headers", "Accept, Session-Cookie-Key, Session-Cookie-Value, Set-Host, Upgrade-Insecure-Requests, Set-Origin, Set-Referer");
	
	try {
		switch (requestURL.pathname) {
			case "/api/middleware": {
				let url = api.reqQuery("url");

				clog("INFO", "⥪", {
					text: request.socket.remoteAddress,
					color: "cyanBright",
					padding: 18
				}, {
					text: request.method,
					color: VERB_COLORS[request.method],
					padding: 8
				}, {
					text: url,
					color: "white"
				});

				// Check for valid hostname
				let { hostname } = URL.parse(url, true);
				if (!hostname || !hostname.includes("fithou.net.vn"))
					api.stop(10, `Empty or invalid URL! Only *.fithou.net.vn are allowed.`, 400, { hostname });
				
				if (request.method === "OPTIONS")
					api.stop(0, "Options Request", 200);

				let sessionCookieKey;
				if (headers["session-cookie-key"]) {
					sessionCookieKey = headers["session-cookie-key"];
					delete headers["session-cookie-key"];
				} else
					sessionCookieKey = api.getQuery("sesskey");

				let sessionCookieValue;
				if (headers["session-cookie-value"]) {
					sessionCookieValue = headers["session-cookie-value"];
					delete headers["session-cookie-value"];
				} else
					sessionCookieValue = api.getQuery("sessval");

				if (headers["set-host"]) {
					headers["host"] = headers["set-host"];
					delete headers["set-host"];
				}

				if (headers["set-origin"]) {
					headers["origin"] = headers["set-origin"];
					delete headers["set-origin"];
				}

				if (headers["set-referer"]) {
					headers["referer"] = headers["set-referer"];
					delete headers["set-referer"];
				}

				if (sessionCookieKey && sessionCookieValue && sessionCookieValue !== "") {
					if (headers.cookie)
						headers.cookie += `; ${sessionCookieKey}=${sessionCookieValue}`;
					else
						headers.cookie = `${sessionCookieKey}=${sessionCookieValue}`;
				}

				// Filter out ignored headers
				for (let key of Object.keys(headers))
					if (IGNORE_HEADERS.includes(key))
						delete headers[key];

				// Start request
				const controller = new AbortController();
				let cancelTimer = setTimeout(() => {
					controller.abort();

					try {
						api.stop(-1, `Request to CTMS timed out after ${TIMEOUT}ms!`, 408, {
							timeout: TIMEOUT
						});
					} catch(e) {
						// Just to catch the stop signal.
					}
				}, TIMEOUT);

				let m2sStart = performance.now();
				let m2sResponse;

				try {
					m2sResponse = await fetch(url, {
						method: request.method,
						headers,
						body: data,
						signal: controller.signal
					});
				} catch(e) {
					api.errored(e);
				} finally {
					clearTimeout(cancelTimer);
				}

				let _h = [ ...m2sResponse.headers ];
				let responseHeaders = {}
				for (let header of _h) {
					if (IGNORE_HEADERS.includes(header[0]) || header[0] === "content-type")
						continue;

					if (header[0] === "set-cookie") {
						let v = header[1].split("; ");

						for (let i of v) {
							let t = i.split("=");
							
							if (t[0] === sessionCookieKey) {
								sessionCookieValue = t[1]
								break;
							}
						}
					}

					responseHeaders[header[0]] = header[1];
				}

				api.stop(0, "Completed", m2sResponse.status, {
					session: sessionCookieValue,
					headers: responseHeaders,
					sentHeaders: headers,
					response: await m2sResponse.text(),
					time: (performance.now() - m2sStart) / 1000
				});

				break;
			}

			case "/api/ping":
				clog("INFO", "⥪", {
					text: request.socket.remoteAddress,
					color: "cyanBright",
					padding: 18
				}, {
					text: request.method,
					color: VERB_COLORS[request.method],
					padding: 8
				}, {
					text: requestURL.pathname,
					color: "yellowBright"
				});

				api.stop(0, "Pong!", 200);
				break;
		
			default: {
				clog("WARN", {
					text: request.socket.remoteAddress,
					color: "cyanBright",
					padding: 20
				}, {
					text: request.method,
					color: VERB_COLORS[request.method],
					padding: 8
				}, {
					text: requestURL.pathname,
					color: "gray"
				});

				let html = FS.readFileSync("default.html", { encoding: "utf-8" });
				response.writeHead(200);
				response.end(html);
				break;
			}
		}
	} catch(e) {
		if (api.sent || e.code === 0)
			return;
		
		try {
			api.errored(e);
		} catch(e) {
			// Nothing needed to do here.
		}
	}
}

const server = HTTP.createServer((request, response) => {
	let data;

	if (request.method === "POST") {
		request.on("data", (incomeData) => {
			if (!data)
				data = "";

			data += incomeData;
	
			if (data.length > 1e6) {
				data = "";
				API.__stop(response, -1, "POST Data Too Large!", 413);
			}
		});
	
		request.on("end", () => handleRequest(request, data, response));
	} else
		handleRequest(request, data, response);
});

server.listen(PORT, HOSTNAME, () => {
	clog("OKAY", "Server running at", {
		color: "blueBright",
		text: `http://${HOSTNAME}:${PORT}/`
	});
});
