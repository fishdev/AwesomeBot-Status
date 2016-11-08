const config = require("./config.json");
const users = require("./users.js");
const incidents = require("./incidents.js");
const status = require("./status.js");

const moment = require("moment");
const showdown = require("showdown");
const md = new showdown.Converter({
	tables: true,
	simplifiedAutoLink: true,
	strikethrough: true,
	tasklists: true,
	smoothLivePreview: true,
	smartIndentationFix: true
});
const sha256 = require("sha256");

const passport = require("passport");
const Strategy = require("passport-local").Strategy;
passport.use(new Strategy((username, password, callback) => {
	users.find(username, (err, user) => {
		if(err) {
			return callback(err);
		}
		if(!user) {
			return callback(null, false);
		}
		if(user.password!==sha256(password)) {
			return callback(null, false);
		}
		return callback(null, user);
	});
}));
passport.serializeUser((user, callback) => {
	callback(null, user.username);
});
passport.deserializeUser((username, callback) => {
	users.find(username, (err, user) => {
		if(err) {
			return callback(err);
		}
		callback(null, user);
	});
});

const express = require("express");
const app = express();
app.set("views", `${__dirname}/views`);
app.set("view engine", "ejs");
app.use(express["static"](`${__dirname}/public`));
app.use(require("compression")());
app.use(require("cookie-parser")());
app.use(require("body-parser").urlencoded({
	extended: true
}));
app.use(require("express-session")({
	secret: "K4af601SdDta2emv9d3q3SdPy58J8Ep2",
	resave: false,
	saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

const serializeIncident = (incident, index) => {
	delete incident.index;

	let typeName, typeColor;
	switch(incident.type) {
		case "outage":
			typeName = "Major outage";
			typeColor = "is-danger";
			break;
		case "maintenance":
			typeName = "Scheduled maintenance";
			typeColor = "is-dark";
			break;
		case "performance":
			typeName = "Degraded performance";
			typeColor = "is-warning";
			break;
	}
	return {
		index,
		type: {
			name: typeName,
			color_class: typeColor
		},
		name: incident.name,
		updates: incident.updates.map(update => {
			let updateTypeIcon;
			switch(update.type) {
				case "investigating":
					updateTypeIcon = "fa-search";
					break;
				case "identified":
					updateTypeIcon = "fa-lightbulb-o";
					break;
				case "monitoring":
					updateTypeIcon = "fa-stethoscope";
					break;
				case "resolved":
					updateTypeIcon = "fa-check-square-o";
					break;
			}
			return {
				type: {
					name: update.type.charAt(0).toUpperCase() + update.type.slice(1),
					icon: updateTypeIcon
				},
				relativeTimestamp: moment(update.timestamp).fromNow(),
				rawTimestamp: moment(update.timestamp).format(config.date_format),
				message: md.makeHtml(update.message),
				author: update.author
			};
		})
	};
};

app.get("/", (req, res) => {
	let page = 1;
	if(req.query.page) {
		page = parseInt(req.query.page);
	}
	let count = 8;
	if(req.query.count) {
		count = parseInt(req.query.count);
	}

	const data = {
		authUser: req.user,
		status: {
			current: {}
		},
		incidents: [],
		pages: {}
	};

	const statusData = status.get();
	switch(statusData.current) {
		case "online":
			data.status.current.name = "All systems operational.";
			data.status.current.color_class = "is-success";
			data.status.current.icon = "fa-check-circle";
			break;
		case "outage":
			data.status.current.name = "Major outage.";
			data.status.current.color_class = "is-danger";
			data.status.current.icon = "fa-times-circle";
			break;
		case "maintenance":
			data.status.current.name = "Undergoing scheduled maintenance.";
			data.status.current.color_class = "is-dark";
			data.status.current.icon = "fa-circle";
			break;
		case "performance":
			data.status.current.name = "Experiencing degraded performance.";
			data.status.current.color_class = "is-warning";
			data.status.current.icon = "fa-exclamation-circle";
			break;
	}
	data.status.current.value = statusData.current;

	let incidentsData = incidents.get().map((incident, i) => {
		incident.index = i;
		return incident;
	});
	if(page==1) {
		data.unresolvedIncidents = incidentsData.filter(incident => {
			return incident.updates.length==0 || incident.updates[incident.updates.length-1].type!="resolved";
		}).map(incident => {
			return serializeIncident(incident, incident.index);
		});
		const currentTimestamp = Date.now();
		const lastDayStatusLog = statusData.log.filter(log => {
			return (currentTimestamp-log.timestamp)<=86400000;
		});
		const lastDayOnlineCount = lastDayStatusLog.reduce((count, log) => {
			return count + (log.response==200);
		}, 0);
		data.uptime_percent = Math.ceil((lastDayOnlineCount/lastDayStatusLog.length)*100);
		data.server_count = statusData.log[statusData.log.length-1].servers || "?";
		data.user_count = statusData.log[statusData.log.length-1].users || "?";
		data.last_response = statusData.log[statusData.log.length-1].response;
		data.poll_url = config.poll_url;
		data.last_delay = statusData.log[statusData.log.length-1].delay;
	}
	incidentsData = incidentsData.filter(incident => {
		return incident.updates.length>0 && incident.updates[incident.updates.length-1].type=="resolved";
	});
	const startIndex = Math.max(incidentsData.length-(page * count), 0);
	const endIndex = Math.min(incidentsData.length-(page * count)+count, incidentsData.length);
	for(let i=startIndex; i<endIndex; i++) {
		data.incidents.push(serializeIncident(incidentsData[i], incidentsData[i].index));
	}

	data.pages.current = page;
	const numPages = Math.ceil(incidentsData.length/8);
	data.pages.showPrevious = page<numPages;
	data.pages.showNext = page>1;

	res.render("pages/index.ejs", data);
});

app.get("/error", (req, res) => {
	res.status(500).render("pages/error.ejs");
});

app.get("/login", (req, res) => {
	res.render("pages/login.ejs");
});

app.get("/users", (req, res) => {
	if(req.isAuthenticated()) {
		res.render("pages/users.ejs", {
			authUser: req.user,
			users: users.get()
		});
	} else {
		res.redirect("/login");
	}
});

app.get("/logout", (req, res) => {
	req.logout();
	res.redirect("/");
});

app.get("/:id", (req, res) => {
	const i = parseInt(req.params.id) - 1;
	incidents.find(i, (err, incident) => {
		res.render("pages/incident.ejs", {
			authUser: req.user,
			incident: incident ? serializeIncident(incident, i) : null
		});
	});
});

app.get("/data/:type", (req, res) => {
	const dataAge = {
		"servers": 15778476000,
		"users": 31556952000,
		"delay": 86400000
	};
	if(["servers", "users", "delay"].includes(req.params.type)) {
		const statusData = status.get();
		const data = [];
		statusData.log.forEach(log => {
			if((Date.now() - log.timestamp)<dataAge[req.params.type] && log[req.params.type]) {
				data.push({
					timestamp: log.timestamp,
					value: log[req.params.type]
				});
			}
		});
		res.json(data);
	} else {
		res.sendStatus(400);
	}
});

app.post("/new/incident", (req, res) => {
	if(req.isAuthenticated()) {
		incidents.create(req.body.name, req.body.type, err => {
			if(err) {
				res.redirect("/error");
			} else {
				res.redirect("/");
			}
		});
	} else {
		res.redirect("/login");
	}
});

app.post("/new/update", (req, res) => {
	if(req.isAuthenticated()) {
		incidents.update(req.body.id, req.body.type, req.body.message, req.user.username, err => {
			if(err) {
				res.redirect("/error");
			} else {
				res.redirect(`/${req.body.id}`);
			}
		});
	} else {
		res.redirect("/login");
	}
});

app.post("/new/user", (req, res) => {
	if(req.isAuthenticated()) {
		users.create(req.body.username, req.body.password, err => {
			if(err) {
				res.redirect("/error");
			} else {
				res.redirect("/users");
			}
		});
	} else {
		res.redirect("/login");
	}
});

app.get("/edit/status", (req, res) => {
	if(req.isAuthenticated()) {
		status.set(req.query.state, err => {
			if(err) {
				res.redirect("/error");
			} else {
				res.redirect("/");
			}
		});
	} else {
		res.redirect("/login");
	}
});

app.post("/edit/password", (req, res) => {
	if(req.isAuthenticated()) {
		users.changePassword(req.user.username, req.body.password, err => {
			if(err) {
				res.redirect("/error");
			} else {
				res.redirect("/users");
			}
		});
	} else {
		res.redirect("/login");
	}
});

app.get("/delete/incident", (req, res) => {
	if(req.isAuthenticated()) {
		incidents["delete"](req.query.id, err => {
			if(err) {
				res.redirect("/error");
			} else {
				res.redirect("/");
			}
		});
	} else {
		res.redirect("/login");
	}
});

app.get("/delete/update", (req, res) => {
	if(req.isAuthenticated()) {
		incidents.deleteUpdate(req.query.id, req.query.update, err => {
			if(err) {
				res.redirect("/error");
			} else {
				res.redirect(`/${req.query.id}`);
			}
		});
	} else {
		res.redirect("/login");
	}
});

app.get("/delete/user", (req, res) => {
	if(req.isAuthenticated()) {
		users["delete"](req.query.username, err => {
			if(err) {
				res.redirect("/error");
			} else {
				res.redirect("/users");
			}
		});
	} else {
		res.redirect("/login");
	}
});

app.post("/login", passport.authenticate("local", {failureRedirect: "/error"}), (req, res) => {
	res.redirect("/");
});

status.init();
app.listen(process.env.OPENSHIFT_NODEJS_PORT || config.server_port, process.env.OPENSHIFT_NODEJS_IP || config.server_ip);
