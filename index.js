let express = require("express");
let bodyParser = require("body-parser");
let app = express();
const port = 8080;
let jsonParser = bodyParser.json();

app.post("/filter/:pagenumber/:pagesize", jsonParser, (req, res, next) => {
	console.log(JSON.stringify(`BODY: ${req.body}`));
	res.setHeader("Cache-Control", "no-cache");
	res.send({
		status: "You're connected!!",
		params: req.params,
		body: req.body
	});
});

app.listen(port, () => {
	console.log(`Server running on port ${port}`);
});