var request = require('request');
var watson = require('watson-developer-cloud');

var graph_id = '/graphs/wikipedia/en-latest';

// concept insights credentials
var ciCredentials = {
 	username: '2872d620-4cc4-4ce0-9bb9-309a5db1b465',
 	password: 'AbLQ1BSVP9n2',
  	version: 'v2'
};

// Create the service wrapper
var concept_insights = watson.concept_insights(ciCredentials);

var wiki = {
	
	search: function(input, callback) {
		var url = "https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch="+input+"&utf8=";
		var options = {
		  url: url,
		  headers: {
		    'Content-Type': 'application/json'
		  }
		};
		request(options, function(err, res, body) {
			var wiki = JSON.parse(body).query.search;
			var results = [];
			for (i in wiki) {
				results.push(wiki[i].title);
			}
			var res = {
				"query": input,
				"results": results
			}
			callback(res);
		});
	},

	// Get wiki article and build doc
	getArticle: function(title, callback) {
		var url = 'https://en.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&exintro=&explaintext=&titles='+title+'&format=json&redirects';

		var options = {
		  url: url,
		  headers: {
		    'Content-Type': 'application/json'
		  }
		};
		request(options, function (error, response, body) {
			if (!error && response.statusCode == 200) {
			  	var wiki = JSON.parse(body).query.pages;
			  	var redirects = JSON.parse(body).query.redirects;
			  	// check for title redirect
			  	if (redirects != null) {
			  		var title = redirects.to;
					var url = 'https://en.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&exintro=&explaintext=&titles='+title+'&format=json&redirects';
					var options = {
					  url: url,
					  headers: {
					    'Content-Type': 'application/json'
					  }
					};
			  		request(options, function (error, response, body) {
			  			wiki = JSON.parse(body).query.pages;
			  		});
			  	}
			  	// only one key
			  	for (var key in wiki) {
			  		if (key === "-1") {
			  			callback("Article does not exist");
			  			//res.write("Article does not exist");
			  			//res.end();
			  			return;
			  		}
			  		var article = wiki[key];
			  		// TODO: Handle article disambiguation
			  		var intro = article.extract.split('.')[0] + ".";
			  		if (article.extract.split('.')[1] != null) {
			  			intro += article.extract.split('.')[1] + ".";
			  		}
			  		var sections = [];
			  		var split = article.extract.split("\n");
			  		var sectionsLeft = split.length;
			  		var i = 0;
			  		// loop through sections to get their concept insights
			  		while (i < split.length) {
			  			if (split[i].charAt(0) != '^' && split[i] != "") {
							(function(index, section) {
								var params = { 
									graph: graph_id,
									text: section
								};
								// get concepts for section
								concept_insights.graphs.annotateText(params, function(err, results) {
									sectionsLeft -= 1;
									if (err) {
										console.log("error with concept insights");
										console.log(err);
										//return next(err);
									}
									else {
										sections.splice(index, 0, {
										//sections.push({
											"text": section,
											"concepts": results.annotations
										});
										// callback hell // done getting all concepts asynchronously
										if (sectionsLeft === 0) {
									  		//console.log(sections);
									  		var response = {
									  			"_id": article.pageid,
									  			"title": article.title,
									  			"intro": intro,
									  			"sections": sections
									  		};
										    callback(response);
										}
									}
								});
							})(i, split[i]);
							i++;
			  			}
			  			else {
			  				i++;
			  				sectionsLeft--;
			  			}
			  		}
			  	}
			}
		});
	}
}

module.exports = wiki;