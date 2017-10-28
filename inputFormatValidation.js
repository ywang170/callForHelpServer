var emailValidator = require('email-validator');
var uuidValidator = require('uuid-validate');

/*
only used to validate the input format
parameter 'err' is always an array
err[0] contains error info (if any)
*/

module.exports = {

	validateUsernameFormat: function(username, err) {
		if (!username || typeof username !== 'string' || username.length < 3 || username.length > 20){
			err[0] = 'username must be between 3 to 20 characters';
			return false;
		}
		return true;
	},

	validatePasswordFormat: function(password, err) {
		if (!password || typeof password !== 'string' || password.length < 6 || password.length > 20 || password.toUpperCase() === password || password.toLowerCase() === password) {
			err[0] = 'password must be between 6 to 20 characters and contains at leat 1 lower case letter and 1 upper case letter';
			return false;
		}
		return true;
	},

	validateEmailFormat: function(email, err) {
		if (!emailValidator.validate(email)){
			err[0] = 'email is in bad format';
			return false;
		}
		return true;
	},

	validatePhoneFormat: function(phone, err) {
		if (isNaN(phone)) {
			err[0] = 'phone is in bad format';
			return false;
		}
		return true;
	},

	validateUuid: function (uuid, err) {
		if (!uuid || !uuidValidator(uuid, 4)) {
			err[0] = 'at least one input of type uuid is not in correct format';
			return false;
		}
		return true;
	},

	validateTimeuuid: function(timeuuid, err) {
		if (!timeuuid || !uuidValidator(timeuuid, 1)) {
			err[0] = 'at least one input of type timeuuid is not in correct format';
			return false;
		}
		return true;
	},

	validateQuestionTitle: function (questionTitle, err) {
		if (!questionTitle || typeof questionTitle !== 'string' || questionTitle.length < 15 || questionTitle.length > 200) {
			err[0] = 'question title must be between 15 to 200 characters';
			return false;
		}
		return true;
	},

	validateQuestionContent: function (questionContent, err) {
		if (questionContent && (typeof questionContent !== 'string' || questionContent.length > 3000)) {
			err[0] = 'question content must be shorter than 3000 characters';
			return false;
		}
		return true;
	},

	validateQuestionSlots: function (questionSlots, err) {
		if (!questionSlots || !Array.isArray(questionSlots) || questionSlots.length < 1 || questionSlots.length > 72) {
			err[0] = 'number of time slots can not be 0 or over 72';
			return false;
		}
		var timeAfter72Hr = new Date();
		timeAfter72Hr.setHours(timeAfter72Hr.getHours() + 75);
		for (var i = 0; i < questionSlots.length; i ++) {
			//check if each slot is a time and then if any time is over now + 75 hour (72 is limit but we give some loose)
			if (!questionSlots[i] || questionSlots[i] >= timeAfter72Hr.getTime()) {
				console.log(new Date(questionSlots[i]));
				console.log(new Date(timeAfter72Hr));
				err[0] = 'at least one time slot is invalid';
				return false;
			}
		}
		return true;
	},

	validateTimeNumeric: function(time, err) {
		var timeAfter72Hr = new Date();
		timeAfter72Hr.setHours(timeAfter72Hr.getHours() + 72);
		if (!time || new Date(time).getTime() >= timeAfter72Hr.getTime()) {
			err[0] = 'invalid time';
			return false;
		}
		return true;
	},

	validateNotificationComment: function(comment, err) {
		if (comment && (typeof comment !== 'string' || comment.length > 100)) {
			err[0] = 'comment can not be more than 100 characters';
			return false;
		}
		return true;
	}

}