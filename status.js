const config = require("./config.json");
const status = require("./data/status.json");
const unirest = require("unirest");
const writeFile = require("write-file-atomic");

module.exports = {
	get: () => {
		return status;
	},
	set: (state, callback) => {
		if(!["online", "outage", "maintenance", "performance"].includes(state)) {
			callback(new Error("Invalid current status"));
		} else {
			status.current = state;
			writeFile(`${__dirname}/data/status.json`, JSON.stringify(status, null, 4), callback);
		}
	},
	init: () => {
		setInterval(module.exports.poll, config.poll_interval);
	},
	poll: () => {
		const reqStartTime = Date.now();
		unirest.get(config.poll_url).header("Accept", "application/json").end(res => {
			const data = {
				timestamp: Date.now(),
				response: res.status,
				delay: Date.now() - reqStartTime
			};
			if(res.status==200) {
				data.servers = res.body.server_count;
				data.users = res.body.user_count;
			} else if(config.auto_status) {
				status.current = "outage";
			}
			status.log.push(data);
			writeFile(`${__dirname}/data/status.json`, JSON.stringify(status, null, 4), () => {});
		});
	}
};
