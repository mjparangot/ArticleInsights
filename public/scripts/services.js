angular.module('main.services', [])

.factory('API', function() {
	
	var getArticle = function(input, callback) {
		var url = "api/search/" + input;
		var options = {
		  url: url,
		  headers: {
		    'Content-Type': 'application/json'
		  }
		};
		var title;
		xhrGet(url, function(data) {
			alert(data.results[0]);
			callback(data.results[0]);
		}, function(error) {
			console.log(error);
		});
	}

	return {
		getArticle: getArticle
	};
});
