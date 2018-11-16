const users = require("./data/users.json");
const sha256 = require("sha256");
const writeFile = require("write-file-atomic");

module.exports = {
	create: (username, password, callback) => {
		if(username.includes(" ")) {
			callback(new Error("Username cannot contain spaces"));
		} else {
			module.exports.find(username, (err, user) => {
				if(err || !user) {
					users.push({
						username,
						password: sha256(password)
					});
					writeFile(`${__dirname}/data/users.json`, JSON.stringify(users, null, 4), callback);
				} else {
					callback(new Error("User ${username} already exists"));
				}
			});
		}
	},
	changePassword: (username, password, callback) => {
		module.exports.find(username, (err, user) => {
			if(err || !user) {
				callback(err);
			} else {
				user.password = sha256(password);
				writeFile(`${__dirname}/data/users.json`, JSON.stringify(users, null, 4), callback);
			}
		});
	},
	get: () => {
		return users.map(user => {
			return user.username;
		});
	},
	find: (username, callback) => {
		process.nextTick(function() {
			const match = users.find(user => {
				return user.username==username;
			});
			if(match) {
				callback(null, match);
			} else {
				callback(new Error(`User ${username} does not exist`));
			}
		});
	},
	delete: (username, callback) => {
		let match;
		users.some((user, i) => {
			if(user.username==username) {
				match = i;
				return true;
			}
			return false;
		});
		if(match==null) {
			callback(new Error("`User ${username} does not exist`"));
		} else {
			users.splice(match, 1);
			writeFile(`${__dirname}/data/users.json`, JSON.stringify(users, null, 4), callback);
		}
	}
};
