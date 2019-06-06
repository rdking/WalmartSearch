let express = require("express");
let bodyParser = require("body-parser");
let client = require("https");
let app = express();
const port = 8080;
let jsonParser = bodyParser.json();

/**
 * 
 * @param {number} pageno - 1-based page number to retrieve from the catalog
 * @param {number} pagesz - number of records per page (min: 0, max: 30)
 */
async function getCatalog(pageno, pagesz) {
	let url = `https://mobile-tha-server.firebaseapp.com/walmartproducts/${pageno}/${pagesz}`;
	let retval = new Promise((resolve, reject) => {
		console.debug(`Fetching Walmart Catalog Data...`)
		let req = client.get(url, (res) => {
			console.debug(`Received Response. Status Code: ${res.statusCode}`);
			let result = "";
			res.on('end', () => {
				try {
					resolve(JSON.parse(result));
				}
				catch (e) {
					console.error(e);
					reject(e);
				}
			});
			res.on('data', (d) => {
				result += d.toString();
			});
			res.on('error', (e) => {
				reject(e);
			});
		});
		req.end();
	});

	return await retval;
}

function filter(data, params) {
	return data.filter((product) => {
		let retval = true;

		if (params.search) {
			let search = params.search.toUpperCase();
			let { productName: name = "", shortDescription: sDesc = "", longDescription: lDesc = ""} = product;
			let partial = name.toUpperCase().includes(search);
			partial |= sDesc.toUpperCase().includes(search);
			partial |= lDesc.toUpperCase().includes(search);
			retval &= partial;
		}


		retval &= !(product.price < params.minPrice);
		retval &= !(product.price > params.maxPrice);
		retval &= !(product.reviewRating < params.minReviewRating);
		retval &= !(product.reviewRating > params.maxReviewRating);
		retval &= !(product.reviewCount < params.minReviewCount);
		retval &= !(product.reviewCount > params.maxReviewCount);
		retval &= (!params.inStock || product.inStock);

		return retval;

	});
	return data;
}

app.post("/filter/:pagenumber/:pagesize", jsonParser, async (req, res, next) => {
	console.log("Processing Catalog Filter");

	//First, go fetch the walmart data
	try {
		let data = await getCatalog(req.params.pagenumber, req.params.pagesize);

		res.send(filter(data.products, req.body));

		if (typeof(next) == "function")
			next();
	}
	catch(e) {
		console.error("An error occurred while processing your request", e);
	}
});

app.listen(port, () => {
	console.log(`Server running on port ${port}`);
});
