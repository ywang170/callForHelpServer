var express = require('express');
var app = express();
var cassandra = require('cassandra-driver');
var crypto = require('crypto');
var bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
var emailValidator = require('email-validator');

var d = new Date(Date.UTC(1994,3,15,5,03,04));//be carefull month is always range from (0~11)
d.setSeconds(0);//clear second and minute
d.setMinutes(0);
//d.setDate(d.getDate()+ 100);//simpley adding days or time 

console.log(d);