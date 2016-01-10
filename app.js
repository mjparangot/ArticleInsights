/**
 * Module dependencies.
 */

var express = require('express'), routes = require('./routes'), user = require('./routes/user'), http = require('http'), path = require('path'), fs = require('fs');

var app = express();

var db;

var cloudant;

var fileToUpload;

// cloudant db credentials
var dbCredentials = {
	dbName : 'my_sample_db',
	dbArticles : 'articles'
};

// concept insights credentials
var ciCredentials = {
 	username: '2872d620-4cc4-4ce0-9bb9-309a5db1b465',
 	password: 'AbLQ1BSVP9n2',
  	version: 'v2'
};

var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var logger = require('morgan');
var errorHandler = require('errorhandler');
var multipart = require('connect-multiparty')
var multipartMiddleware = multipart();

// My modules
var request = require('request');
var wiki = require('./public/scripts/wiki.js');

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/public/views');
app.set('view engine', 'ejs');
app.engine('html', require('ejs').renderFile);
app.use(logger('dev'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(methodOverride());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/style', express.static(path.join(__dirname, '/views/style')));

// development only
if ('development' == app.get('env')) {
	app.use(errorHandler());
}

function init() {
	initConceptInsights();
	initDBConnection();
}

function initConceptInsights() {
	if (process.env.VCAP_SERVICES) {
		var vcapServices = JSON.parse(process.env.VCAP_SERVICES);
		if (vcapServices.concept_insights) {
			ciCredentials.username = vcapServices.concept_insights[0].credentials.username;
			ciCredentials.password = vcapServices.concept_insights[0].credentials.password;
		}
	}
}

function initDBConnection() {
	
	if(process.env.VCAP_SERVICES) {
		var vcapServices = JSON.parse(process.env.VCAP_SERVICES);
		if(vcapServices.cloudantNoSQLDB) {
			dbCredentials.host = vcapServices.cloudantNoSQLDB[0].credentials.host;
			dbCredentials.port = vcapServices.cloudantNoSQLDB[0].credentials.port;
			dbCredentials.user = vcapServices.cloudantNoSQLDB[0].credentials.username;
			dbCredentials.password = vcapServices.cloudantNoSQLDB[0].credentials.password;
			dbCredentials.url = vcapServices.cloudantNoSQLDB[0].credentials.url;

			cloudant = require('cloudant')(dbCredentials.url);
			
			// check if DB exists if not create
			cloudant.db.create(dbCredentials.dbName, function (err, res) {
				if (err) { console.log('could not create db ', err); }
		    });
			
			db = cloudant.use(dbCredentials.dbName);
			
		} else {
			console.warn('Could not find Cloudant credentials in VCAP_SERVICES environment variable - data will be unavailable to the UI');
		}
	} else{
		//console.warn('VCAP_SERVICES environment variable not set - data will be unavailable to the UI');
		// For running this app locally you can get your Cloudant credentials 
		// from Bluemix (VCAP_SERVICES in "cf env" output or the Environment 
		// Variables section for an app in the Bluemix console dashboard).
		// Alternately you could point to a local database here instead of a 
		// Bluemix service.
		dbCredentials.host = "3697cd56-eee4-402c-811e-778ef76e00f3-bluemix.cloudant.com";
		dbCredentials.port = 443;
		dbCredentials.user = "3697cd56-eee4-402c-811e-778ef76e00f3-bluemix";
		dbCredentials.password = "d6f6bce364578e7b7d584b251e999b7da2a548c90a385b6c02c6265717aeecb1";
		dbCredentials.url = "https://3697cd56-eee4-402c-811e-778ef76e00f3-bluemix:d6f6bce364578e7b7d584b251e999b7da2a548c90a385b6c02c6265717aeecb1@3697cd56-eee4-402c-811e-778ef76e00f3-bluemix.cloudant.com";
	
		cloudant = require('cloudant')(dbCredentials.url);

		db = cloudant.use(dbCredentials.dbName);
	}
}

init();

app.get('/', routes.index);

function createResponseData(id, name, value, attachments) {

	var responseData = {
		id : id,
		name : name,
		value : value,
		attachements : []
	};
	
	 
	attachments.forEach (function(item, index) {
		var attachmentData = {
			content_type : item.type,
			key : item.key,
			url : 'http://' + dbCredentials.user + ":" + dbCredentials.password
					+ '@' + dbCredentials.host + '/' + dbCredentials.dbName
					+ "/" + id + '/' + item.key
		};
		responseData.attachements.push(attachmentData);
		
	});
	return responseData;
}

var saveDocument = function(id, name, value, response) {
	
	if(id === undefined) {
		// Generated random id
		id = '';
	}
	
	db.insert({
		name : name,
		value : value
	}, id, function(err, doc) {
		if(err) {
			console.log(err);
			response.sendStatus(500);
		} else
			response.sendStatus(200);
		response.end();
	});
}

app.post('/api/favorites/attach', multipartMiddleware, function(request, response) {

	console.log("Upload File Invoked..");
	console.log('Request: ' + JSON.stringify(request.headers));
	
	var id;
	
	db.get(request.query.id, function(err, existingdoc) {		
		
		var isExistingDoc = false;
		if (!existingdoc) {
			id = '-1';
		} else {
			id = existingdoc.id;
			isExistingDoc = true;
		}

		var name = request.query.name;
		var value = request.query.value;

		var file = request.files.file;
		var newPath = './public/uploads/' + file.name;		
		
		var insertAttachment = function(file, id, rev, name, value, response) {
			
			fs.readFile(file.path, function(err, data) {
				if (!err) {
				    
					if (file) {
						  
						db.attachment.insert(id, file.name, data, file.type, {rev: rev}, function(err, document) {
							if (!err) {
								console.log('Attachment saved successfully.. ');
	
								db.get(document.id, function(err, doc) {
									console.log('Attachements from server --> ' + JSON.stringify(doc._attachments));
										
									var attachements = [];
									var attachData;
									for(var attachment in doc._attachments) {
										if(attachment == value) {
											attachData = {"key": attachment, "type": file.type};
										} else {
											attachData = {"key": attachment, "type": doc._attachments[attachment]['content_type']};
										}
										attachements.push(attachData);
									}
									var responseData = createResponseData(
											id,
											name,
											value,
											attachements);
									console.log('Response after attachment: \n'+JSON.stringify(responseData));
									response.write(JSON.stringify(responseData));
									response.end();
									return;
								});
							} else {
								console.log(err);
							}
						});
					}
				}
			});
		}

		if (!isExistingDoc) {
			existingdoc = {
				name : name,
				value : value,
				create_date : new Date()
			};
			
			// save doc
			db.insert({
				name : name,
				value : value
			}, '', function(err, doc) {
				if(err) {
					console.log(err);
				} else {
					
					existingdoc = doc;
					console.log("New doc created ..");
					console.log(existingdoc);
					insertAttachment(file, existingdoc.id, existingdoc.rev, name, value, response);
					
				}
			});
			
		} else {
			console.log('Adding attachment to existing doc.');
			console.log(existingdoc);
			insertAttachment(file, existingdoc._id, existingdoc._rev, name, value, response);
		}
		
	});
});

app.post('/api/favorites', function(request, response) {

	console.log("Create Invoked..");
	console.log("Name: " + request.body.name);
	console.log("Value: " + request.body.value);
	
	// var id = request.body.id;
	var name = request.body.name;
	var value = request.body.value;
	
	saveDocument(null, name, value, response);
});

app.delete('/api/favorites', function(request, response) {

	console.log("Delete Invoked..");
	var id = request.query.id;
	// var rev = request.query.rev; // Rev can be fetched from request. if
	// needed, send the rev from client
	console.log("Removing document of ID: " + id);
	console.log('Request Query: '+JSON.stringify(request.query));
	
	db.get(id, { revs_info: true }, function(err, doc) {
		if (!err) {
			db.destroy(doc._id, doc._rev, function (err, res) {
			     // Handle response
				 if(err) {
					 console.log(err);
					 response.sendStatus(500);
				 } else {
					 response.sendStatus(200);
				 }
			});
		}
	});
});

app.put('/api/favorites', function(request, response) {

	console.log("Update Invoked..");
	
	var id = request.body.id;
	var name = request.body.name;
	var value = request.body.value;
	
	console.log("ID: " + id);
	
	db.get(id, { revs_info: true }, function(err, doc) {
		if (!err) {
			console.log(doc);
			doc.name = name;
			doc.value = value;
			db.insert(doc, doc.id, function(err, doc) {
				if(err) {
					console.log('Error inserting data\n'+err);
					return 500;
				}
				return 200;
			});
		}
	});
});

app.get('/api/favorites', function(request, response) {

	console.log("Get method invoked.. ")
	
	db = cloudant.use(dbCredentials.dbName);
	var docList = [];
	var i = 0;
	db.list(function(err, body) {
		if (!err) {
			var len = body.rows.length;
			console.log('total # of docs -> '+len);
			if(len == 0) {
				// push sample data
				// save doc
				var docName = 'sample_doc';
				var docDesc = 'A sample Document';
				db.insert({
					name : docName,
					value : 'A sample Document'
				}, '', function(err, doc) {
					if(err) {
						console.log(err);
					} else {
						
						console.log('Document : '+JSON.stringify(doc));
						var responseData = createResponseData(
							doc.id,
							docName,
							docDesc,
							[]);
						docList.push(responseData);
						response.write(JSON.stringify(docList));
						console.log(JSON.stringify(docList));
						console.log('ending response...');
						response.end();
					}
				});
			} else {

				body.rows.forEach(function(document) {
					
					db.get(document.id, { revs_info: true }, function(err, doc) {
						if (!err) {
							if(doc['_attachments']) {
							
								var attachments = [];
								for(var attribute in doc['_attachments']){
								
									if(doc['_attachments'][attribute] && doc['_attachments'][attribute]['content_type']) {
										attachments.push({"key": attribute, "type": doc['_attachments'][attribute]['content_type']});
									}
									console.log(attribute+": "+JSON.stringify(doc['_attachments'][attribute]));
								}
								var responseData = createResponseData(
										doc._id,
										doc.name,
										doc.value,
										attachments);
							
							} else {
								var responseData = createResponseData(
										doc._id,
										doc.name,
										doc.value,
										[]);
							}	
						
							docList.push(responseData);
							i++;
							if(i >= len) {
								response.write(JSON.stringify(docList));
								console.log('ending response...');
								response.end();
							}
						} else {
							console.log(err);
						}
					});
					
				});
			}
			
		} else {
			console.log(err);
		}
	});
});


///////// MY CODE /////////////

/*
-> wikipedia search api on title param
--> top result or redirect becomes new title param
---> cloudant query on title
	if (doc exists) and (doc-request-count < x):
----> send doc from cloudant as JSON response
	else:
----> wikipedia query api on title
-----> for each section in wiki response get concept insights
------> store/update doc and doc-request-count in cloudant and send as JSON response
 */

// TODO: 
// - refactor with encapsulation
// - fix intro: get first two sentences properly
// - Handle article disambiguation better
app.get('/api/wiki/:title', function(req, res) {

	db = cloudant.use(dbCredentials.dbArticles);
	
	wiki.getArticle(req.params.title, function(response) {
		res.json(response);
		res.end();
	});
});

app.get('/api/search/:title', function(req, res) {
	wiki.search(req.params.title, function(response) {
		res.json(response);
		res.end();
	});
});

app.get('/api/articles/:title', function(req, res) {

	console.log("Get method invoked.. ")
	
	db = cloudant.use(dbCredentials.dbArticles);

	var reqTitle = req.params.title;
	var query = {
		q: 'title:' + reqTitle, 
		include_docs: true, 
		limit: 1
	};

	db.search("articles", "titles", query, function(error, result) {
		if (!error) {
			if (result.total_rows > 0) {
				var doc = result.rows[0].doc;
				var responseData = {
					id : doc._id,
					title : doc.title,
					url : doc.url,
					sections : doc.sections
				};
				res.write(JSON.stringify(result));
			}
			else {
				var api = "http://ArticleInsights.mybluemix.net/api/wiki/" + reqTitle;
				var options = {
				  url: url,
				  headers: {
				    'Content-Type': 'application/json'
				  }
				};
				request(options, function(error, response, body) {
					var doc = body;
					res.json(response);
					res.end();
				});
				//var response = "Article does not exist";
			}
			console.log('ending res...');
			res.end();
		}
		else {
			res.write(JSON.stringify(error));
			console.log("ERROR: " + error);
			res.end();
		}
	});
});

app.post('/api/articles', function(req, res) {
	
	db = cloudant.use(dbCredentials.dbArticles);

	var title = req.body.title;
	var url = req.body.url;
	var sections = req.body.sections;

	var doc = {
		title: title,
		url: url,
		sections: sections
	};

	db.insert(doc, function(err, body) {
		if (!err) {
			console.log("Created a new document");
			res.write(body);
		}
		else {
			res.write("Error creating new document");
			console.log("ERROR: " + err);
		}
	});

	res.end();
});

http.createServer(app).listen(app.get('port'), '0.0.0.0', function() {
	console.log('Express server listening on port ' + app.get('port'));
});

// Helper functions

function buildArticleDoc(id, title, extract) {
	var doc = {
		"_id": id,
		"title": title
	};

	return doc;
}
