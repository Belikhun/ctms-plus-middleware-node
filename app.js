//? |-----------------------------------------------------------------------------------------------|
//? |  /app.js                                                                                      |
//? |                                                                                               |
//? |  Copyright (c) 2021 Belikhun. All right reserved                                              |
//? |  Licensed under the MIT License. See LICENSE in the project root for license information.     |
//? |-----------------------------------------------------------------------------------------------|

const HTTP = require("http");
const URL = require("url");
const FS = require("fs");
const { API } = require("./libs");
const fetch = require("node-fetch");
const { performance } = require("perf_hooks");

// HTTP Server Config
const HOSTNAME = "localhost";
const PORT = process.env.PORT || 80;

// Set up some constants
const IGNORE_HEADERS = ["content-length", "location", "pragma", "access-control-allow-origin", "access-control-allow-headers"]

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
	
	try {
		switch (requestURL.pathname) {
			case "/api/middleware": {
				response.setHeader("Access-Control-Allow-Origin", headers.origin || "*");
				response.setHeader("Access-Control-Allow-Credentials", "true");
				response.setHeader("Access-Control-Allow-Headers", "Accept, Session-Cookie-Key, Session-Cookie-Value, Set-Host, Upgrade-Insecure-Requests, Set-Origin, Set-Referer");

				if (request.method === "OPTIONS")
					api.stop(0, "Options Request", 200);

				let url = api.reqQuery("url");

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
				let m2sStart = performance.now();
				let m2sResponse;

				try {
					m2sResponse = await fetch(url, {
						method: request.method,
						headers,
						body: data
					});
				} catch(e) {
					api.errored(e);
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
		
			default: {
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
	console.log(`Server running at http://${HOSTNAME}:${PORT}/`);
});
