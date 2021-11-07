//? |-----------------------------------------------------------------------------------------------|
//? |  /libs.js                                                                                     |
//? |                                                                                               |
//? |  Copyright (c) 2021 Belikhun. All right reserved                                              |
//? |  Licensed under the MIT License. See LICENSE in the project root for license information.     |
//? |-----------------------------------------------------------------------------------------------|

const HTTP = require("http");
const URL = require("url");
const { performance } = require("perf_hooks");

/**
 * Some functions borrowed from my library
 * Not much to see here.
 * 
 * @version	1.0
 * @author	Belikhun
 */
module.exports = {
	/**
	 * Custom API handler. Make to replicate API behaviour
	 * on php version of middleware.
	 * 
	 * @author	Belikhun
	 * @version	1.0
	 */
	 API: class {
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
		}
	
		/**
		 * Function to parse error data and send it back
		 * @param	{Error|Object}	error	Error Object
		 */
		errored(error) {
			let e = module.exports.parseException(error);
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
	},

	/**
	 * Parse error stack
	 * @param {Error|Object} error
	 */
	parseException(error, inStack = false) {
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
	},

	/**
	 * Get standardized UNIX timestamp
	 * @param	{Date}		date
	 * @returns {Number}
	 */
	time(date = new Date()) {
		return date.getTime() / 1000;
	}
}