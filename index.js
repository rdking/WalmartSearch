let express = require("express");
let bodyParser = require("body-parser");
let client = require("https");
let app = express();
const port = 8080;
let jsonParser = bodyParser.json();

/**
 * A single product record from the catalog.
 * @typedef CatalogProduct
 * @prop {string} productId : Unique Id of the product
 * @prop {string} productName : Product Name
 * @prop {string} shortDescription : Short Description of the product
 * @prop {string} longDescription : Long Description of the product
 * @prop {string} price : Product price
 * @prop {string} productImage : Image url for the product
 * @prop {number} reviewRating : Average review rating for the product
 * @prop {number} reviewCount : Number of reviews
 * @prop {boolean} inStock : Returns true if item in stock
 */

/**
 * The response record from the catalog service.
 * @typedef CatalogResponse
 * @prop {CatalogProduct[]} products - List of Product Objects
 * @prop {number} totalProducts - Total number of products available
 * @prop {number} pageNumber - Current page number
 * @prop {number} pageSize - Number of items per page
 * @prop {number} statusCode - HTTP Status
 */

/**
 * Retrieves catalog data from Walmart's catalog service
 * @param {number} pageno - 1-based page number to retrieve from the catalog
 * @param {number} pagesz - number of records per page (min: 0, max: 30)
 * @returns {Promise(CatalogResponse)} - the catalog page results
 */
async function getCatalog(pageno, pagesz) {
	let url = `https://mobile-tha-server.firebaseapp.com/walmartproducts/${pageno}/${pagesz}`;
	let retval = new Promise((resolve, reject) => {
		console.debug(`Fetching Walmart Catalog Data: page ${pageno}, size ${pagesz}...`);
		let req = client.get(url, (res) => {
			console.debug(`Received Response. Status Code: ${res.statusCode}`);
			let result = "";
			res.on("end", () => {
				try {
					resolve(JSON.parse(result));
				}
				catch (e) {
					console.error(e);
					reject(e);
				}
			});
			res.on("data", (d) => {
				result += d.toString();
			});
			res.on("error", (e) => {
				reject(e);
			});
		});
		req.end();
	});

	return await retval;
}


/**
 * Per-filtered page information
 * @typedef FilterPageData
 * @prop {string} nextProductId - Id of the next product to search from, or the top if not present
 * @prop {number} startPage - Catalog page to continue from for the next page full.
 * @prop {number} filterPage - Catalog page of the filtered result.
 * @prop {number} pageSize - Size of the previous fetch
 */

/**
 * Structure used to provide fast filtered-page navigation
 * @typedef FilterData
 * @prop {FilterPageData[]} pageData - Array of objects with info about the start of each filtered page.
 * @prop {number} knownProducts - Count of filtered products so far
 * @prop {boolean} allDone - True if all pageData has been calcualted.
 */

/**
 * The caller-provided catalog filtering parameters.
 * @typedef FilterParameters
 * @prop {string?} search - Text to search for in the product name and descriptions
 * @prop {number?} minPrice - Lowest acceptable price
 * @prop {number?} maxPrice - Highest acceptable price
 * @prop {number?} minReviewRating - Lowest acceptable rating
 * @prop {number?} maxReviewRating - Highest acceptable rating
 * @prop {number?} minReviewCount - Lowest acceptable # of reviews
 * @prop {number?} maxReviewCount - Highest acceptable # of reviews
 * @prop {boolean?} inStock - True if product must be in stock
 * @prop {FilterData} filterData - data used to continue filtered search
 */

/**
 * Finds catalog entries matching the given optional parameters
 * @param {CatalogProduct[]} data - Array of product entries to filter through
 * @param {FilterParameters} params - Object with properties used to filter the data
 * @param {boolean} waiting - True if we need to wait until the productId is pId
 * @param {string} pId - The productId to wait for.
 * @returns {CatalogProduct[]} the filtered result set
 */
function filter(data, params, waiting, pId) {
	return data.filter((product) => {
		let retval = true;
		
		//Waiting doesn't make sense if there's no pId to wait for...
		if (!(waiting && pId) || (product.productId == pId)) {
			waiting = false;
			
			if (params.search) {
				let search = params.search.toUpperCase();
				let { productName: name = "", shortDescription: sDesc = "", longDescription: lDesc = ""} = product;
				let partial = name.toUpperCase().includes(search);
				partial |= sDesc.toUpperCase().includes(search);
				partial |= lDesc.toUpperCase().includes(search);
				retval &= partial;
			}
			
			let price = parseFloat(isNaN(product.price[0]) ? product.price.substring(1) : product.price);
			
			retval &= !(price < params.minPrice);
			retval &= !(price > params.maxPrice);
			retval &= !(product.reviewRating < params.minReviewRating);
			retval &= !(product.reviewRating > params.maxReviewRating);
			retval &= !(product.reviewCount < params.minReviewCount);
			retval &= !(product.reviewCount > params.maxReviewCount);
			retval &= (!params.inStock || product.inStock);
		}
		else {
			retval = false;
		}
			
		return retval;
	});
}

/**
 * Catalog filter endpoint.
 * @param {number} pagenumber - Current page number
 * @param {number} pagesize - Number of items per page
 */
app.post("/filter/:pagenumber/:pagesize", jsonParser, async (req, res, next) => {
	console.log("Processing Catalog Filter");

	try {
		let filterData = req.body.filterData || { pageData:[], knownProducts: 0 };
		let data = [];
		let {pagenumber: pageno, pagesize: pagesz} = req.params;
		let result = {};
		let products;
		let page1 = {
			nextProductId: undefined,
			startPage: 1,
			filterPage: 1,
			pageSize: pagesz
		};
		let starter = (filterData)? filterData.pageData[pageno - 1] || page1 : page1;
		let cPage = starter.startPage - 1;
		let prevPage;
		let { nextProductId } = starter;

		if (!filterData.length)
			filterData.pageData[0] = page1;

		//find your way from the last page to the next one
		for (let page=starter.filterPage; page<=pageno && !filterData.allDone; ++page) {
			let firstLoop = true;
			let lastPage;
			data = [];

			do {
				++cPage;
				//Go fetch the catalog data.
				if (prevPage && (prevPage.number === cPage)) {
					result = prevPage.data;
				}
				else {
					result = await getCatalog(cPage, pagesz);
					prevPage = {
						number: cPage,
						data: result
					};
				}
				lastPage = result.pageNumber * pagesz >= result.totalProducts;
				//Now filter the results and send
				products = filter(result.products, req.body, firstLoop, nextProductId);
				data = data.concat(products);
				firstLoop = false;
			} while ((data.length < pagesz) && !lastPage);
			
			//Create a FilterPageData record for this page data.
			if (!(filterData.allDone || filterData.pageData[page])) {
				if (data.length > pagesz) {
					//If the Filtered page ended in the middle of catalog page
					nextProductId = data[pagesz].productId;
					filterData.pageData.push({
						nextProductId,
						startPage: cPage--,
						filterPage: page + 1,
						pageSize: pagesz
					});
					
					data.length = pagesz;
				}
				else {
					//If the Filtered page ended on a catalog page edge.
					filterData.pageData.push({
						nextProductId: undefined,
						startPage: cPage,
						filterPage: page + 1,
						pageSize: pagesz
					});
				}
				filterData.allDone = lastPage;
				filterData.knownProducts += data.length;
			}
		}

		res.send({
			products: data,
			totalProducts: filterData.knownProducts,
			pageNumber: req.params.pageNumber,
			pageSize: pagesz,
			statusCode: 200,
			filterData
		});

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

module.exports = { getCatalog, filter };
