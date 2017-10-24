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
		if (!questionTitle || typeof questionTitle !== 'string' || questionTitle.length < 15 || questionTitle.length > 100) {
			err[0] = 'question title must be between 15 to 100 characters';
			return false;
		}
		return true;
	},

	validateQuestionContent: function (questionContent, err) {
		if (!questionContent || typeof questionContent !== 'string' || questionContent.length < 15 || questionContent.length > 2000) {
			err[0] = 'question title must be between 15 to 2000 characters';
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
		timeAfter72Hr.setHours(timeAfter72Hr.getHours() + 72);
		for (var i = 0; i < questionSlots.length; i ++) {
			//check if each slot is a time and then if any time is over now + 72 hour
			if (!questionSlots[i] || isNaN(questionSlots[i]) || new Date(questionSlots[i]).getTime() >= timeAfter72Hr.getTime()) {
				err[0] = 'at least one time slot is invalid';
				return false;
			}
		}
		return true;
	},

	validateTimeNumeric: function(time, err) {
		var timeAfter72Hr = new Date();
		timeAfter72Hr.setHours(timeAfter72Hr.getHours() + 72);
		if (!time || isNaN(time) || new Date(time).getTime() >= timeAfter72Hr.getTime()) {
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