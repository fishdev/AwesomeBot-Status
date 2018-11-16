const incidents = require("./data/incidents.json");
const writeFile = require("write-file-atomic");

module.exports = {
	create: (name, type, callback) => {
		if(!["outage", "maintenance", "performance"].includes(type)) {
			callback(new Error("Invalid incident type"));
		} else {
			incidents.push({
				name,
				type,
				updates: []
			});
			writeFile(`${__dirname}/data/incidents.json`, JSON.stringify(incidents, null, 4), callback);
		}
	},
	get: () => {
		return incidents;
	},
	find: (id, callback) => {
		process.nextTick(function() {
			if(incidents[id]) {
				callback(null, incidents[id]);
			} else {
				callback(new Error(`Incident ${id} does not exist`));
			}
		});
	},
	update: (id, type, message, author, callback) => {
		module.exports.find(id, (err, incident) => {
			if(err || !incident) {
				callback(err);
			} else {
				if(!["investigating", "identified", "monitoring", "resolved"].includes(type)) {
					callback(new Error("Invalid incident update type"));
				} else {
					incident.updates.push({
						type,
						timestamp: Date.now(),
						message,
						author
					});
					writeFile(`${__dirname}/data/incidents.json`, JSON.stringify(incidents, null, 4), callback);
				}
			}
		});
	},
	delete: (id, callback) => {
		if(!incidents[id]) {
			callback(new Error("`Incident ${id} does not exist`"));
		} else {
			incidents.splice(id, 1);
			writeFile(`${__dirname}/data/incidents.json`, JSON.stringify(incidents, null, 4), callback);
		}
	},
	deleteUpdate: (id, updateId, callback) => {
		if(!incidents[id]) {
			callback(new Error("`Incident ${id} does not exist`"));
		} else {
			if(!incidents[id].updates[updateId]) {
				callback(new Error("`Update ${updateId} does not exist for incident ${id}`"));
			} else {
				incidents[id].updates.splice(updateId, 1);
				writeFile(`${__dirname}/data/incidents.json`, JSON.stringify(incidents, null, 4), callback);
			}
		}
	}
};
