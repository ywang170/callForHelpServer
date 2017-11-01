//outter sources import
var express = require('express');
var app = express();
var cassandra = require('cassandra-driver');
var crypto = require('crypto');
var bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
var cookieParser = require('cookie-parser');
app.use(cookieParser());
//inner sources import
var inputFormatValidation = require('./inputFormatValidation.js');
//enable access control allow origin
app.use(function(req, res, next){
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	next();
});

/*
Start: database connection and other setup====================================================================
*/
//setup cassandra driver
const authProvider = new cassandra.auth.PlainTextAuthProvider('callforhelpmanager', 'IneedmorePOWER999');

const client = new cassandra.Client({contactPoints:['127.0.0.1:9042'], keyspace:'callforhelp', authProvider: authProvider});

const Nexmo = require('nexmo');
const nexmo = new Nexmo({
	apiKey: 78668869,
	apiSecret: '1e2820d7a0e982a7'
});

//cassandra driver log event
//client.on('log', function(level, className, message, furtherInfo){
//	console.log('***cassandra driver log event: %s -- %s', level, message);
//});
/*
End: database connection======================================================================================
*/


/*
Start: API=====================================================================================================
*/
/*
basic rule:
for all APIs, return must be in this format:
{
	error: string - only shows if request fails. error message,
	whateverdata: whatever type - useful data,
}
*/


/*
Descriptions:
	Get most recent questions that the user hasn't respond and doesn't belong to the user
Parameters:
	latestQuestionId - the id of the question that is set to load newer questions
	oldestQuestionId - the id of the question that is set to load more older questions
	amount - how many questions to load (upper limit). If not set, default to 20
Response:
	a list of questions
*/
app.get('/getQuestions/:latestQuestionId?/:oldestQuestionId?/:amount?', function(req, res){

	//get user info from cookie
	var sessionKey = req.cookies.sessionKey;
	//get parameters
	var latestQuestionId = req.params.latestQuestionId;
	var oldestQuestionId = req.params.oldestQuestionId;
	var amount = req.params.amount;


	//validate format
	var err = [];
	if (latestQuestionId !== '0' && !inputFormatValidation.validateTimeuuid(latestQuestionId, err)) {
		res.status(400).send({error: err[0]});
		return;
	}
	if (oldestQuestionId !== '0' && !inputFormatValidation.validateTimeuuid(oldestQuestionId, err)) {
		res.status(400).send({error: err[0]});
		return;
	}
	if (!amount || isNaN(amount)) {
		amount = 20;
	}

	//validate user identity
	validateUserSession(sessionKey, res, function(username){
		//on success query for questions from question queue
		var query = 'SELECT questionid FROM questionqueue WHERE idlekey = 1';
		if (latestQuestionId && latestQuestionId !== '0') {
			query = query + ' AND questionid > ' + latestQuestionId;	
		} else if (oldestQuestionId && oldestQuestionId !== '0') {
			query = query + ' AND questionid < ' + oldestQuestionId;
		}
		query += ' ORDER BY questionid DESC LIMIT ' + amount;

		//execute query now
		client.execute(query, {prepare: true}, function(err, result) {
			if (err) {
				//error
				console.error('error happened at ' + Date.now() + ' when querying for general questions in question queue table. More details below: \n' +err);
				res.status(500).send({error: err});
			} else if (result.rows.length == 0){
				//if not questions found
				res.status(200).send({questions: [], username: username});
			} else {
				//now query the content of questions
				var query = 'SELECT * FROM question WHERE questionid IN ?';
				var questionIds = [];
				for (var i = 0; i < result.rows.length; i++) {
					questionIds.push(result.rows[i].questionid);
				}
				client.execute(query, [questionIds], {prepare:true}, function(err, result) {
					if (err) {
						//error
						console.error('error happened at ' + Date.now() + ' when querying for general questions in question table. More details below: \n' +err);
						res.status(500).send({error: err});
					} else if (result.rows.length == 0){
						//if no questions found
						console.error('error happened at '+ Date.now() +'. weird behavior, question ids retrieved from question queue table but not found in question table');
						res.status(404).send({error: 'question ids retrieved from question queue table but not found in question table'});
					} else {
						res.status(200).send({questions: result.rows, username: username});
					}
				});
			}
		});
	});


});

/*
Descriptions:
	Create a question based on info provided
Parameters:
	questionTitle - title of the question
	questionContent - content of the question
	questionSlots - available slots of the question in time instant
Response:
	success or not
*/
app.post('/setQuestions/create', function(req, res){
	console.log("creating question request received");
	//get user info from cookie
	var sessionKey = req.cookies.sessionKey;
	//get parameters
	var questionTitle = req.body.questionTitle;
	var questionContent = req.body.questionContent;
	var questionSlots = req.body.questionSlots; 

	//validate format
	var err = [];
	if (!inputFormatValidation.validateQuestionTitle(questionTitle, err)) {
		res.status(400).send({error: err[0]});
		return;
	}
	if (!inputFormatValidation.validateQuestionContent(questionContent, err)) {
		res.status(400).send({error: err[0]});
		return;
	}
	if (!inputFormatValidation.validateQuestionSlots(questionSlots, err)) {
		res.status(400).send({error: err[0]});
		return;
	}

	var questionSlotsInDate = [];
	for (var i = 0; i < questionSlots.length; i++) {
		questionSlotsInDate.push(new Date(questionSlots[i]));
	}
	
	//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

	//validate user identity. We create a function called checkUserLockAndCreateQuestion to repeat getting user lock for several times
	validateUserSession(sessionKey, res, function(username, phone){
		checkUserLockAndCreateQuestion(username, phone, questionTitle, questionContent, questionSlotsInDate, 0, res);
	});
});


/*
Description: 
	Given a QID, remove a question
Parameters:
	questionId - Id of the question to remove
Response:
	success or not
*/
app.delete('/setQuestions/delete', function(req, res){

});

/*
Description: 
	given a username, get all slots that are behind current time (info minimum)
	This function is special that it can take a second username
Parameters:
	secondUsername - we need this because sometimes we want to get slots for both user
Response:
	a list of slot objects in Json, contains only Time
*/
app.get('/getSlots/simple/:secondUsername?', function(req, res){
	//get user info from cookie
	var sessionKey = req.cookies.sessionKey;
	//get second user name
	var secondUsername = req.params.secondUsername;

	//input validation
	var err = [];
	if (secondUsername && !inputFormatValidation.validateUsernameFormat(secondUsername, err)){
		res.status(400).send({error: err[0]});
		return;
	}

	if (secondUsername) {
		validateUserSession(sessionKey, res, function(username){
			var query = 'SELECT time FROM slot WHERE user1username IN (?,?) AND time > ?';
			client.execute(query, [username,secondUsername, new Date()], {prepare: true},function (err, result) {
				if (err) {
					//error
					console.error('error happened at ' + Date.now() + ' when querying for user slots. More details below: \n' +err);
					res.status(500).send({error: err});
				} else {
					res.status(200).send({slots: result.rows});
				}
			});
		});
	} else {
		validateUserSession(sessionKey, res, function(username){
			var query = 'SELECT time FROM slot WHERE user1username=? AND time > ?';
			client.execute(query, [username, new Date()], {prepare: true},function (err, result) {
				if (err) {
					//error
					console.error('error happened at ' + Date.now() + ' when querying for user slots. More details below: \n' +err);
					res.status(500).send({error: err});
				} else {
					res.status(200).send({slots: result.rows});
				}
			});
		});
	}

});

/*
Description: 
	given a username, get all slots that are behind current time (all info)
Response:
	a list of slot objects in Json, contains every column of a slot
*/
app.get('/getSlots/detail/', function(req, res){
	//get user info from cookie
	var sessionKey = req.cookies.sessionKey;

	//validate user identity
	validateUserSession(sessionKey, res, function(username){
		var query = 'SELECT * FROM slot WHERE user1username=? AND time > ?';
		client.execute(query, [username, new Date()], {prepare: true},function (err, result) {
			if (err) {
				//error
				console.error('error happened at ' + Date.now() + ' when querying for user slots. More details below: \n' +err);
				res.status(500).send({error: err, username: username});
			} else {
				res.status(200).send({slots: result.rows, username:username});
			}
		});
	});
});

/*
Description:
	decide on answering a question at a slot. Also create notifications for asker. Also add asker to question's "answerersId" property	
Parameters:
	time - the time to answer the question in instant form
	questionId - ID of the question
	comment - whatever comment the answerer left
Response:
	success or not
*/
app.post('/setSlots/confirm', function(req, res){
	//get user info from cookie
	var sessionKey = req.cookies.sessionKey;
	//get parameters
	var time = req.body.time;//this is supposed to be a "time" numeric casted from Date by date.getTime() then sent from client
	var questionId = req.body.questionId;
	var comment = req.body.comment;

	//input validation
	var err = [];
	if (!inputFormatValidation.validateTimeNumeric(time, err)) {
		res.status(400).send({error: err[0]});
		return;
	}
	if (!inputFormatValidation.validateTimeuuid(questionId, err)) {
		res.status(400).send({error: err[0]});
		return;
	}
	if (!inputFormatValidation.validateNotificationComment(comment, err)) {
		res.status(400).send({error: err[0]});
		return;
	}

	//validate user identity
	validateUserSession(sessionKey, res, function(username, phone){
		//first check if the question support to such an appointment
		var query = 'SELECT slots, askerusername, title, answererusernames, askerphone FROM question WHERE questionid = ?';
		client.execute(query, [questionId], {prepare: true}, function(err, result){
			if (err) {
				//error
				console.error('error happened at ' + Date.now() + ' when try to find a question to create slots. More details below: \n' +err);
				res.status(500).send({error: err});
			} else {
				if(result.rows.length <= 0) {
					//question not found
					res.status(404).send({error: 'a question matches the ID is not found'});
				}
				var askerUsername = result.rows[0].askerusername;//get username of asker
				//check answerer and asker identity, you can not answer your own question
				if (askerUsername === username) {
					res.status(400).send({error: 'asker and answerer can not be the same user'});
					return;
				}
				//check if answerer already in the set
				var answererusernames = result.rows[0].answererusernames;
				if (answererusernames && answererusernames.indexOf(username) !== -1) {
					res.status(400).send({error: 'asker already answered this question'});
					return;
				}

				//see if the time exist in time slot
				var timeFound = false;
				var availableTimes = result.rows[0].slots;//time slot available in this question
				for (var i = 0; i < availableTimes.length; i++) {
					if (new Date(availableTimes[i]).getTime() === time) {
						timeFound = true;
						break;
					}
				}
				if (!timeFound) {
					//slot time passed in not matching available time in question
					res.status(400).send({error: 'the time slot given is not available for this question'});
					return;
				} 
				var askerPhone = result.rows[0].askerphone;
				var questionTitle = result.rows[0].title;//get title of the question
				//since cassandra doesn't support IF of queries from different tables or clusters... we have to do them one by one!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
				//try add questions to asker time slot
				var query = 'INSERT INTO slot (user1username, user2username, time, questionid, questiontitle, comment, user1isasker, user2phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?) IF NOT EXISTS';//create slot for answerer
				client.execute(query, [askerUsername, username, new Date(time), questionId, questionTitle, comment, true, phone], {prepare: true}, function(err, result) {
					if (err) {
						console.error('error happended at ' + Date.now() + ' when tried to create slot for asker. More details: \n' + err);
						res.status(500).send({error:err});
					} else if (!result.rows[0]['[applied]']) {
						res.status(409).send({error: 'confliction. the slot of asker is already taken'});
					} else {
						//make call to create slot for answerer
						var query = 'INSERT INTO slot (user1username, user2username, time, questionid, questiontitle, comment, user1isasker, user2phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?) IF NOT EXISTS';
						client.execute(query, [username, askerUsername, time, questionId, questionTitle, comment, false, askerPhone], {prepare: true}, function(err, result){
							if (err) {
								console.error('error happended at ' + Date.now() + ' when tried to create slot for answerer. More details: \n' + err);
								res.status(500).send({error:err});
								//delete previous slot
								var query = 'DELETE FROM slot where user1username=? AND time=?';
								client.execute(query, [askerUsername, time], {prepare: true}, function(err, result){

								});
							} else if (!result.rows[0]['[applied]']) {
								res.status(409).send({error: 'confliction. the slot of answerer is already taken'});
								//delete previous slot
								var query = 'DELETE FROM slot where user1username=? AND time=?';
								client.execute(query, [askerUsername, time], {prepare: true}, function(err, result){

								});
							} else {
								//create notification and update question answerer list
								res.status(200).send({askerUsername: askerUsername, askerPhone: askerPhone, time: time});
								var queryAddAnswerer = "UPDATE question SET answererusernames = answererusernames + {'"+ username+ "'} WHERE questionid = ?";
								var queryCreateNotification = 'INSERT INTO notification (receiverusername, senderusername, slottime, questionid, questiontitle, type, notificationid, questionaskerphone, slotcomment) VALUES (?, ?, ?, ?, ?, 1, now(),?,?)';
								client.execute(queryAddAnswerer, [questionId], {prepare: true});
								client.execute(queryCreateNotification, [askerUsername, username, time, questionId, questionTitle, phone, comment], {prepare: true});
								//send message
								if (askerPhone) {
									askerPhone = '' + askerPhone;
									if (askerPhone.length ==10) {
										askerPhone = '1' + askerPhone;
									}
									var textMessage = 'From: JustCallForHelp--' +username+ ' has scheduled a phone call with you at ' + new Date(time)+ ' on your question "' + questionTitle + 
									'". Please make phone call to: "' + phone + '" by then :). ';
									if(comment) {
										textMessage += ('His/Her message: "' + comment+'"');
									}
									nexmo.message.sendSms(
										'12015799261', askerPhone,  textMessage , (errInfo, responseData) => {
											if (errInfo) {
												console.log("error when sending message");
											}
										}
									);
								}
								//send message to answerer
								if (phone) {
									phone = '' + phone;
									if (phone.length ==10) {
										phone = '1' + phone;
									}
									var textMessage = 'From: JustCallForHelp--you have scheduled a phone call with ' + askerUsername + ' at ' + new Date(time)+ ' on his/her question "' + questionTitle + 
									'". He/She might call from: "' + askerPhone + '" by then :). ';
									nexmo.message.sendSms(
										'12015799261', phone,  textMessage , (errInfo, responseData) => {
											if (errInfo) {
												console.log("error when sending message");
											}
										}
									);
								}
							}
						});
					}
				});
			}
		});
	});
});


/*
Description:
	cancel an appointment and create a notification for the answerer. Also remove answerer from the "answererId" property from the question	
Parameters:
	time - the slot time
Response:
	success or not
*/
app.delete('/setSlots/cancel', function(req, res){

});

/*
Description:
	get notifications for the user	
Parameters:
	latestNotificationId - latest notification Id, used to find latest notification
Response:
	list of notifications
	
*/
app.get('/getNotifications/:latestNotificationId?', function(req, res){
	//get user info from cookie
	var sessionKey = req.cookies.sessionKey;
	//get data
	var latestNotificationId = req.body.latestNotificationId;
	
	//input validation
	var err = [];
	if (latestNotificationId && !inputFormatValidation.validateTimeuuid(latestNotificationId, err)) {
		res.status(400).send({error:err});
	}

	//user validation
	validateUserSession(sessionKey, res, function(username){
		//ask db to mark as review
		var query = 'SELECT * FROM notification WHERE receiverusername=?';
		if (latestNotificationId) {
			query += ' AND notificationid > ' + latestNotificationId;
		}
		client.execute(query, [username], {prepare: true}, function(err, result){
			if (err) {
				res.status(500).send({error: err});
			} else {
				res.status(200).send({notifications: result.rows});
			}
		});
	});
});

/*
Description:
	mark a set of notification as reviewed	
Parameters:
	username - user Id
	latestNotificationId - same as above
Response:
	success or not
*/
app.post('/setNotifications/removeReviewed', function(req, res){
	//get user info from cookie
	var sessionKey = req.cookies.sessionKey;
	//get data from post
	var latestNotificationId = req.body.latestNotificationId;
	//input format validation
	var err = [];
	if(!inputFormatValidation.validateTimeuuid(latestNotificationId, err)) {
		res.status(400).send({error:err[0]});
	}
	//user validation
	validateUserSession(sessionKey, res, function(username){
		//ask db to mark as review
		var query = 'DELETE FROM notification WHERE receiverusername = ? AND notificationid <= ?';
		client.execute(query, [username, latestNotificationId], function(err, result){
			if (err) {
				//error
				console.error('error happened at ' + Date.now()+ ' when try to mark remove reviewed notifications. More details below: \n' +err);
				res.status(500).send({error: err});
			} else {
				res.status(200).end();
			}
		});
	});
});

/*
Description:
	get questions only for this user	
Parameters:
	username - id of this user
	oldestQuestionId - oldest id loaded last time
	amount - amount of question to load
Response:
	a list of questions asked by this user
*/
app.get('/getMyQuestions/:oldestQuestionId?/:amount?', function(req, res){
		//get user info from cookie
	var sessionKey = req.cookies.sessionKey;
	//get parameters
	var oldestQuestionId = req.params.oldestQuestionId;
	var amount = req.params.amount;


	//validate format
	var err = [];
	if (oldestQuestionId !== '0' && !inputFormatValidation.validateTimeuuid(oldestQuestionId, err)) {
		res.status(400).send({error: err[0]});
		return;
	}
	if (!amount || isNaN(amount)) {
		amount = 20;
	}

	//validate user identity
	validateUserSession(sessionKey, res, function(username){
		//on success query for questions from question queue
		var query = 'SELECT questionid FROM questionqueue WHERE username=?';
		if (oldestQuestionId && oldestQuestionId !== '0') {
			query = query + ' AND questionid < ' + oldestQuestionId;
		}
		query += ' LIMIT ' + amount + ' ALLOW FILTERING';

		//execute query now
		client.execute(query, [username], {prepare: true}, function(err, result) {
			if (err) {
				//error
				console.error('error happened at ' + Date.now() + ' when querying for general questions in question queue table. More details below: \n' +err);
				res.status(500).send({error: err});
			} else if (result.rows.length == 0){
				//if not questions found
				res.status(200).send({questions: [], username: username});
			} else {
				//now query the content of questions
				var query = 'SELECT * FROM question WHERE questionid IN ?';
				var questionIds = [];
				for (var i = 0; i < result.rows.length; i++) {
					questionIds.push(result.rows[i].questionid);
				}
				client.execute(query, [questionIds], {prepare:true}, function(err, result) {
					if (err) {
						//error
						console.error('error happened at ' + Date.now() + ' when querying for general questions in question table. More details below: \n' +err);
						res.status(500).send({error: err});
					} else if (result.rows.length == 0){
						//if no questions found
						console.error('error happened at '+ Date.now() +'. weird behavior, question ids retrieved from question queue table but not found in question table');
						res.status(404).send({error: 'question ids retrieved from question queue table but not found in question table'});
					} else {
						res.status(200).send({questions: result.rows, username: username});
					}
				});
			}
		});
	});
});

/*
Description:
	log user in	
	and if the user doesn't have a session key from cookie, create one for the user
	otherwise just update the current session key
Parameters:
	username - username
	password - password
Response:
	a session key
*/
app.post('/logIn', function(req, res){
	//get basic info
	var username = req.body.username;
	var password = req.body.password;
	var needSessionKey = req.body.needSessionKey;
	//input validation
	var err = [];
	if (!inputFormatValidation.validateUsernameFormat(username, err)){
		res.status(400).send({error: err[0]});
		return;
	}
	if (!inputFormatValidation.validatePasswordFormat(password, err)){
		res.status(400).send({error: err[0]});
		return;
	}
	//first valid session, if the username is sesson as username in cookie and session if valid then just extend existing cookie
	//generate query
	var query = 'SELECT password, phone FROM user WHERE username=?';
	//get password from db
	client.execute(query, [username], {prepare: true}, function(err, result){
		if (err) {
			res.status(500).send({error: err});
		} else if (result.rows.length == 0) {
			res.status(401).send({error: "no user found"});
		} else {
			//we found the user
			if (result.rows[0].password !== password) {
				res.status(401).send({error: "username/password not match"});
			} else {
				if (needSessionKey) {
					generateSessionKeyAndSendResponse(username, result.rows[0].phone, res, 0);
				} else {
					res.status(200).end()
				}
				
			}
		}
	});
});


/*
Description:
	create a new user	
Parameters:
	username - username
	password - password
	email - email of user
	phone - phone number of user
Response:
	a session key
*/
app.post('/register', function(req, res){
	//first get all basic user info
	var username = req.body.username;
	var password = req.body.password;
	var email = req.body.email;
	var phone = req.body.phone;
	//check validation
	var err = [];
	if (!inputFormatValidation.validateUsernameFormat(username, err)){
		res.status(400).send({error: err[0]});
		return;
	}
	if (!inputFormatValidation.validatePasswordFormat(password, err)){
		res.status(400).send({error: err[0]});
		return;
	}
	if (!inputFormatValidation.validateEmailFormat(email, err)) {
		res.status(400).send({error: err[0]});
		return;
	}
	if (!inputFormatValidation.validatePhoneFormat(phone, err)) {
		res.status(400).send({error: err[0]});
		return;
	}
	//generate query
	var query = 'INSERT INTO user (username, password, email, phone, readytoask) VALUES (?, ?, ?, ?, true) IF NOT EXISTS';
	//then to database to see if there is a duplicate username
	client.execute(query, [username, password, email, phone], {prepare: true}, function(err, result){
		if (err) {
			//on call back if there is duplicate then return error
			res.status(500).send({error: err});
		} else {
			if (result.rows[0]['[applied]']) {
				//on successful, generate session key and added to session table
				generateSessionKeyAndSendResponse(username, phone, res, 0);
			} else {
				res.status(409).send({error: "username is already taken!"});
			}
			
		}
	});

});


/*
Description:
	change user password	
Parameters:
	username - name of the user

	password - new password
Response:
	success or not
*/
app.post('/changePassword', function(req, res){
});


/*
testing function
*/
app.get('/test', function(req, res){
	res.status(200).send({id:1, dd:2});
});

app.get('/cookieTestGet', function(req, res){
	//get user info from cookie
	var sessionKey = req.cookies.sessionKey;
	if (!sessionKey) {
		res.status(400).send({error: 'session key missing Get'});
		return;
	}

	res.status(200).send({info: 'Get nice!'});
});

app.post('/cookieTestPost', function(req, res){
	//get user info from cookie
	var sessionKey = req.cookies.sessionKey;
	if (!sessionKey) {
		res.status(400).send({error: 'session key missing Post'});
		return;
	}

	res.status(200).send({info: 'Post nice!'});
});

app.get('/dangerous/dbtest', function(req, res){
	client.execute("SELECT * FROM notification", {prepare: true}, function(err, result){
		if (err) {
			//on call back if there is duplicate then return error
			res.status(500).send({error: err});
		} else {
			res.send(result);
			
		}
	});
});

/*
End: API================================================================================
*/


/*
Start: helper functions========================================================================================
Some of these could really be moved to other files
*/


/*
Keep checking user lock for some times then create question
*/
function checkUserLockAndCreateQuestion(username, phone, questionTitle, questionContent, questionSlots, tries, res){
	//first check if user is not locked by try to lock user
	var query = 'UPDATE user SET readytoask = false WHERE username = ? IF readytoask = true';//be carefull, IF has to be in upper case
	client.execute(query, [username], {prepare:true}, function(err, result){
		if (err) {
			res.status(500).send({error: err});
		} else if (!result.rows[0]['[applied]']) {
			//if the user is already locked
			if (tries > 5) {
				res.status(423).send({error: 'user is asking a question now in another environment. Please try again later!'});
			} else {
				//wait 200 ms before next try
				setTimeout(checkUserLockAndCreateQuestion(username, phone, questionTitle, questionContent, questionSlots, tries+1, res), 200);
			}
			
		} else {
			console.log("lock aquired!");
			//now adding questions to questionqueue table
			var query = 'INSERT INTO questionqueue (idlekey, questionid, username) VALUES (?, now(), ?)';
			client.execute(query, [1, username], {prepare:true}, function(err, result){
				if (err) {
					//on error
					res.status(500).send({error: err});
					//unlock user directly
					var query = 'UPDATE user SET readytoask = true WHERE username = ?';
					client.execute(query, [username], {prepare:true});
				} else {
					//retrieve question id
					var query = 'SELECT questionid FROM questionqueue WHERE username = ? LIMIT 1';
					client.execute(query, [username], {prepare:true}, function(err, result){
						var queryUnlockUser = 'UPDATE user SET readytoask = true WHERE username = ?';
						if (err) {
							res.status(500).send({error: err});
						} else if (result.rows.length <= 0) {
							res.status(500).send({error: 'weird behavior. Question just created in question queue table is gone'});
						} else {
							//insert into question table and unlock user
							var questionId = result.rows[0].questionid;
							var queryInsertToQuestionTable = 'INSERT INTO question (questionid, askerusername, slots, title, content, createdtime, answererusernames, askerphone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
							
							//simultanously unlock user and insert question
							client.execute(queryInsertToQuestionTable, [questionId, username, questionSlots, questionTitle, questionContent, new Date(), [], phone], {prepare:true}, function(err, result){
								if (err) {
									res.status(500).send({error: err});
								} else {
									res.status(200).send({success: true});
								}
							});

						}
						client.execute(queryUnlockUser, [username], {prepare:true});
					});
				}
			});

		}
	});
}


/*
Descriptions:
	called by many functions to validate user identity
Parameters:
	username - name of user
	sessionKey - session key of user
	res - response used to send result to browser
	callback - callback function to perform once validation is done
Reponse:
	if the user validation is not passed, send user to log in page
*/
function validateUserSession(sessionKey, res, callback){
	//check input. Only check if null since the rest should be checked at front end
	if (!sessionKey) {
		res.status(401).send({error: 'invalid username and session key'});
		return;
	}
	console.log("validating user");
	//query line
	var query = "SELECT * FROM session WHERE sessionkey=?";

	//execute query
	client.execute(query,[sessionKey],  {prepare: true},  function(err, result){
		if (err) {
			//redirect to log in page if no user session found or session has already outdated
			console.error('error happened at '+ new Date()+' when checking session with user: %s, session key: %s, err: %s',username, sessionKey, err);
			res.status(500).send({error: err});
		} else  if (result.rows.length == 0) {
			res.status(401).send({error: 'user with the session not found'});
		} else if (result.rows[0].validuntil < Date.now()) {
			res.status(401).send({error: 'user session key has expired'});
		} else {
			console.log("validation passed");
			//if validation is passed, we start to request real data
			callback(result.rows[0].username, result.rows[0].userphone);
		}
	});

}

/*
Descriptions:
	generate a session key randomly
Parameters:
Reponse:
	a string 
*/
function generateSessionKey(){
	var sha = crypto.createHash('sha256');
	sha.update(Math.random().toString());
	return sha.digest('hex');
}

/*
Descriptions:
	generate user session key then try several times to store
Parameters:
	username - name of user
	res - response
	triesMade - how many tries have been made so far
Reponse:
	if the user validation is not passed, send user to log in page
*/
function generateSessionKeyAndSendResponse(username, phone,res, triesMade) {
	//if tried too many times
	if (triesMade >= 10) {
		console.error('session key generation failure (confliction) at '+ new Date() +' for user: %s more than 10 times!', username );
		if (res) {
			res.status(500).send({error: 'session key generation has failed for 10 times'});
		}
	}
	//generate session key
	var sessionKey = generateSessionKey();
	var query = "INSERT INTO session (username, sessionkey, validuntil, userphone) VALUES (?, ?, ?, ?) IF NOT EXISTS USING TTL ?";
	//set expire time to 1 year from now
	var validUntilTime = new Date();
	validUntilTime.setYear(validUntilTime.getFullYear()+1);
	client.execute(query, [username, sessionKey, validUntilTime, phone, 365*24*60*60], {prepare: true}, function (err, result) {
		if (err) {
			//on call back if there is duplicate then return error
			if (res) {
				res.status(500).send({error: err});
			}
			console.error('session key generation failure (database reason) at '+ Date.now() +' for user: ' + username +'. More details: \n ' + err);
		} else {
			if (result.rows[0]['[applied]']) {
				//on successful, return session key
				if (res) {
					res.cookie('sessionKey', sessionKey);
					res.status(200).send({sessionKey: sessionKey});	
				}				
			} else {
				//try agin since we have a duplication
				generateSessionKeyAndSendResponse(username, phone,res, triesMade+1);
			}
			
		}
	});
}


/*
End: helper functions==========================================================================================
*/

/*
Start: running==========================================================================
*/

var server = app.listen(8081, function(){
	var host = server.address().address;
	var port = server.address().port;

	console.log("listening at http://%s:%s", host, port)
});

/*
End: running============================================================================
*/
