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
    },

    fetchItems: function(accountId, prevResult, resp_data, res, brief, tableName, startDate, endDate, metric) {

        var attributes = [];
        if (brief) {
            attributes = ['device', 'date', 'upc', 'epcUri', 'tid', 'tagType', 'epc',
                'extractedUpc', 'status', 'inCycleCount', 'exceptionI', 'exceptionII']
        } else {
            attributes = ['device', 'date', 'upc', 'epcUri', 'tid', 'tagType', 'epc',
                'extractedUpc', 'status', 'inCycleCount', 'exceptionI', 'exceptionII'];
        }

        var params = {
            TableName: tableName,
            AttributesToGet: attributes,
            KeyConditions: {
                'partitionKey': {
                    ComparisonOperator: 'EQ',
                    AttributeValueList: [
                        {
                            S: accountId
                        }
                    ]
                },
                'sortKey' : {
                    ComparisonOperator: 'BETWEEN',
                    AttributeValueList: [
                        {
                            S: startDate
                        },
                        {
                            S: endDate
                        }
                    ]
                }
            },
            ScanIndexForward: true,
            Select: 'SPECIFIC_ATTRIBUTES'
        };

        if (prevResult != null && prevResult['LastEvaluatedKey'] != null) {
            params['ExclusiveStartKey'] = prevResult['LastEvaluatedKey'];
        }

        dynamodb.query(params, function(err, data) {
            if (err) {
                console.log(err);
                res.status(400).send(err);
                return;
            }
            else {
                if (data != null && data.Items != null) {
                    for (var idx in data.Items) {

                        // Parse the json. It will be in aws format
                        var DDBJson = data.Items[idx];
                        var parsedJson = {};
                        for (var keys in DDBJson) {
                            var DDBValue = DDBJson[keys];
                            var value = null;
                            var name = Object.keys(DDBValue)[0]
                            switch(name) {
                                case 'S':
                                    value = DDBValue[name];
                                    break;
                                case 'N':
                                    value = parseInt(DDBValue[name]);
                                    break;
                                default:
                                    value = DDBValue[name];
                            }
                            parsedJson[keys] = value;
                        }
                        resp_data.push(parsedJson);

                        // Metric calculation
                        metric.count++;
                        for (var keys in parsedJson) {
                            if (keys == 'inCycleCount' || keys == 'exceptionI' ||
                                keys == 'exceptionII' || keys == 'status') {
                                var value = parsedJson[keys];
                                if (metric[keys][value] != null && metric[keys][value] != undefined) {
                                    metric[keys][value]++;
                                } else {
                                    metric[keys][value] = 1;
                                }
                            }
                        }
                    }
                }

                if (data.LastEvaluatedKey == null) {
                    res.status(200).send(metric);
                    return;
                } else {
                    this.fetchItems(accountId, data, resp_data, res, brief, tableName, startDate, endDate, metric)
                }
            }
        });
    },

};