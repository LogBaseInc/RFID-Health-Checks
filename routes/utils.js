var express = require('express');
var router = express.Router();

var loggly = require('loggly');
var loggly_token = process.env.LOGGLY_TOKEN;
var loggly_sub_domain = process.env.LOGGLY_SUB_DOMAIN;

var client = loggly.createClient({
    token: loggly_token,
    subdomain: loggly_sub_domain,
    tags: ["rfid", "health-check"],
    json:true
});

var AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
var dynamodb = new AWS.DynamoDB({apiVersion: 'latest'});

var DYNAMODB_BATCH_WRITE_LIMIT = 20;

module.exports = {

    log: function (message, tags) {
        client.log(message, tags);
        return;
    },

    batchWrite: function(productList, complete, res, tableName) {
        var params = {};
        params['RequestItems'] = {};
        params.RequestItems[tableName] = productList;

        dynamodb.batchWriteItem(params, function (err, data) {
            if (err) {
                console.log(err);
                res.status(400).send(err.message);
                return;
            } else {
                if (complete) {
                    res.status(200).send();
                    return;
                }
            }
        });
    },

    getDynamoDBBatchWriteLimit : function() {
        return DYNAMODB_BATCH_WRITE_LIMIT;
    }
};