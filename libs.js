//? |-----------------------------------------------------------------------------------------------|
//? |  /libs.js                                                                                     |
//? |                                                                                               |
//? |  Copyright (c) 2021 Belikhun. All right reserved                                              |
//? |  Licensed under the MIT License. See LICENSE in the project root for license information.     |
//? |-----------------------------------------------------------------------------------------------|

const HTTP = require("http");
const URL = require("url");
const { performance } = require("perf_hooks");
const chalk = require("chalk");
const path = require("path");

/**
 * Custom API handler. Make to replicate API behaviour
 * on the php version of middleware.
 * 
 * @author	Belikhun
 * @version	1.0
 */
class API {
	/**
	 * Construct a new API handler
	 * 
	 * @param {URL.UrlWithParsedQuery}	url
	 * @param {HTTP.ServerResponse}		response
	 * @param {Number}					start
	 */
	constructor(url, response, start = performance.now()) {
		this.sent = false;
		this.url = url;
		this.responseObject = response;
		this.start = start;
	}

	/**
	 * Complete the request by sending back a response.
	 * This function is a port from `belibrary.php`
	 * 
	 * @param	{Number}		code			Response code
	 * @param	{String}		description		Response description
	 * @param	{Number}		status			HTTP Status Code
	 * @param	{String|Object}	data			Response additional data
	 * 
	 */
	stop(code = 0, description = "Success!", status = 200, data = null) {
		if (this.sent)
			return;

		this.constructor.__stop(
			this.responseObject,
			code,
			description,
			status,
			data,
			(performance.now() - this.start) / 1000
		);

		this.sent = true;

		// Throw an not-error message to stop execution
		throw { code: 0, description: "API Stop Signal. This is not an error." }
	}

	/**
	 * Complete the request by sending back a response.
	 * This function is a port from `belibrary.php`
	 * 
	 * @param	{HTTP.ServerResponse}		response
	 * @param	{Number}					code			Response code
	 * @param	{String}					description		Response description
	 * @param	{Number}					status			HTTP Status Code
	 * @param	{String|Object}				data			Response additional data
	 * @param	{Number}					runtime			Processing time in second
	 * 
	 */
	static __stop(response, code = 0, description = "Success!", status = 200, data = null, runtime = 0) {
		let output = {
			code,
			status,
			description,
			data,
			hash: null,
			user: null,
			runtime
		}

		response.setHeader("Content-Type", "application/json");
		if (!response.hasHeader("Access-Control-Allow-Origin"))
			response.setHeader("Access-Control-Allow-Origin", "*");

		response.writeHead(status);
		response.end(JSON.stringify(output, null, 4));

		clog(code === 0 ? "OKAY" : "ERRR", "⥭", {
			text: code + "",
			color: (code === 0)
				? "cyanBright"
				: "redBright",
			padding: 14
		}, {
			text: status,
			color: (status === 200)
				? "greenBright"
				: "redBright",
			padding: 3,
		}, {
			text: runtime.toFixed(3) + "s",
			color: "gray",
			padding: 8
		}, {
			text: description,
			color: "whiteBright"
		});
	}

	/**
	 * Function to parse error data and send it back
	 * @param	{Error|Object}	error	Error Object
	 */
	errored(error) {
		let e = parseException(error);
		this.stop(e.code, e.description, 500, { stacktrace: e.stack });
	}

	/**
	 * Get a required query param
	 * @param	{String}	key 
	 * @returns	{String}
	 */
	reqQuery(key) {
		if (typeof this.url.query[key] !== "string")
			this.stop(1, `Undefined query: ${key}`, 400);

		return this.url.query[key];
	}

	/**
	 * Get a optional query param
	 * @param {String}	key
	 * @param {*}		isNull
	 * @returns {String|*}
	 */
	getQuery(key, isNull = null) {
		return (typeof this.url.query[key] !== "string")
			? this.url.query[key]
			: isNull;
	}
}

/**
 * Add padding to the left of input
 * 
 * Example:
 * 
 * + 21 with length 3: 021
 * + "sample" with length 8: "  sample"
 *
 * @param	{String|Number}		input	Input String
 * @param	{Number}			length	Length
 * @param	{Boolean}			right	Align right???
 */
function pleft(input, length = 0, right = false) {
	let type = typeof input;
	let padd = "";

	input = (type === "number") ? input.toString() : input;

	switch (type) {
		case "number":
			padd = "0";
			break;

		case "string":
			padd = " ";
			break;

		default:
			console.error(`error: pleft() first arg is ${type}`);
			return false;
	}

	padd = padd.repeat(Math.max(0, length - input.length));
	return (right) ? input + padd : padd + input;
}

/**
 * Log into console, with sparkles!
 * @param	{String}				level	Log level
 * @param	{...String|Object}		args	Log info
 */
function clog(level, ...args) {
	level = level.toUpperCase();
	let date = new Date();

	let tokens = [{
			color: "green",
			text: `${pleft(date.getHours(), 2)}:${pleft(date.getMinutes(), 2)}:${pleft(date.getSeconds(), 2)}`,
			padding: 8,
			separate: true
		}, {
			color: "blue",
			text: (executionClock.tick()).toFixed(3),
			padding: 8,
			separate: true
		}, {
			color: "red",
			text: path.basename(getCallerFile()),
			padding: 16,
			separate: true
		}, {
			color: {
				DEBG: "blue",
				OKAY: "green",
				INFO: "magenta",
				WARN: "yellow",
				ERRR: "red",
				CRIT: "gray"
			}[level],
			text: level,
			padding: 6,
			separate: true
		},
		...args
	]

	let text = "";
	for (let token of tokens) {
		if (typeof token === "string" || typeof token === "number") {
			text += `${token} `;
		} else if (typeof token === "object") {
			let t;

			if (token === null || token === undefined) {
				text += "null ";
				continue;
			}

			if (typeof token.text === "undefined") {
				if (token && token.code && token.description)
					text += `[${token.code}] ${token.description} `;
				else if (token && token.name && token.message)
					text += `${token.name} >>> ${token.message} `;
				else
					text += JSON.stringify(token) + " ";

				continue;
			}

			let space = "";
			if (token.padding) {
				if (typeof token.text === "number")
					token.text = pleft(token.text, token.padding);
				else
					space = " ".repeat(Math.max(0, token.padding - token.text.length));
			}

			if (token.color) {
				if (token.color[0] === "#") {
					t = chalk.hex(token.color)(token.text);
	
					if (token.separate)
						t += chalk.hex(token.color).bold("|");
				} else {
					t = chalk[token.color](token.text);
	
					if (token.separate)
						t += chalk[token.color].bold("|");
				}
			} else {
				t = token.text;

				if (token.separate)
					t += "|";
			}

			if (token.space === false)
				text += `${space}${t}`;
			else
				text += `${space}${t} `;
		} else
			console.error(`clog(): unknown type ${typeof item}`, item);
	}

	switch (level) {
		case "DEBG":
			console.debug.apply(this, [ text ]);
			break;

		case "WARN":
			console.warn.apply(this, [ text ]);
			break;

		case "ERRR":
			console.error.apply(this, [ text ]);
			break;

		case "CRIT":
			console.error.apply(this, [ text ]);
			break;

		default:
			console.log.apply(this, [ text ]);
			break;
	}
}

/**
 * Color template from OSC package
 * 
 * Return color in HEX string
 *
 * @param	{string}	color
 * @returns	{String}
 */
 function oscColor(color) {
	const clist = {
		pink:			"#ff66aa",
		green:			"#88b400",
		blue:			"#44aadd",
		yellow:			"#f6c21c",
		orange:			"#ffa502",
		red:			"#dd2d44",
		brown:			"#3f313d",
		gray:			"#485e74",
		dark:			"#1E1E1E",
		purple:			"#593790",
		darkGreen:		"#0c4207",
		darkBlue:		"#053242",
		darkYellow:		"#444304",
		darkRed:		"#440505",
		navyBlue:		"#333D79",
	}

	return (clist[color]) ? clist[color] : clist.dark;
}

/**
 * Parse error stack
 * @param {Error|Object} error
 */
function parseException(error, inStack = false) {
	/** @type {Number|String} */
	let code = (typeof error === "object")
		? (typeof error.code === "number")
			? (typeof error.status === "number")
				? `${error.code} ${error.status}`
				: error.code
			: (typeof error.name === "string")
				? error.name
				: "ERRR"
		: "ERRR";

	/** @type {String} */
	let description = (typeof error === "object")
		? (typeof error.description === "string")
			? error.description
			: (typeof error.message === "string")
				? error.message
				: "Unknown"
		: "Unknown";

	// File location parser specifically for
	// Error object and my custom api error
	// format (see BLibException)
	let file = undefined;
	if (error instanceof Error) {
		let stack = error.stack;
		file = stack.split("\n")[1];
		file = file.slice(file.indexOf("at ") + 3, file.length);
	} else if (typeof error.data === "object" && typeof error.data.file === "string" && typeof error.data.line === "number")
		file = `${error.data.file}:${error.data.line}`;

	if (file)
		description += ` tại ${file}`;

	// Create a copy of error object without
	// referencing to it
	let _e = { ...error };

	/** @type {Array} */
	let stack = []

	if (!inStack) {
		while (typeof _e.data === "object") {
			let err = parseException(_e.data, true);

			// If no error detail found in the end of the
			// stack, we can stop executing now
			if (!err || err.description === "Unknown")
				break;

			stack.push(`\t[${err.code}] >>> ${err.description}`);
			_e = _e.data;
		}
	}

	return {
		code,
		description,
		stack
	}
}

/**
 * Get standardized UNIX timestamp
 * @param	{Date}		date
 * @returns {Number}
 */
function time(date = new Date()) {
	return date.getTime() / 1000;
}

class StopClock {
	/**
	 * Create a new StopClock instance
	 * @param {Date} date 
	 */
	constructor(date) {
		this.start = this.__time(date);
	}

	__time(date) {
		return (typeof date !== "undefined")
			? date.getTime()
			: performance.now();
	}

	get stop() {
		return (this.__time() - this.start) / 1000;
	}

	tick() {
		return this.stop;
	}
}

function getCallerFile() {
    let originalFunc = Error.prepareStackTrace;

    let callerfile;
    try {
        let err = new Error();
        let currentfile;

        Error.prepareStackTrace = function (err, stack) { return stack; };

        currentfile = err.stack.shift().getFileName();

        while (err.stack.length) {
            callerfile = err.stack.shift().getFileName();

            if(currentfile !== callerfile) break;
        }
    } catch (e) {}

    Error.prepareStackTrace = originalFunc; 
    return callerfile;
}

/**
 * Some functions borrowed from my library
 * Not much to see here.
 * 
 * @version	1.0
 * @author	Belikhun
 */
module.exports = {
	API,
	clog,
	time,
	parseException,
	StopClock
}

// Time library included
let executionClock = new StopClock();
clog("INFO", "Log started at:", {
	color: "greenBright",
	text: (new Date()).toString()
});