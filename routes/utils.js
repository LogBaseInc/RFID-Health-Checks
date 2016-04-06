var express = require('express');
var router = express.Router();

var math = require('./math.js');

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

    batchWrite: function (productList, complete, res, tableName) {
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

    getDynamoDBBatchWriteLimit: function () {
        return DYNAMODB_BATCH_WRITE_LIMIT;
    },

    fetchItems: function (accountId, prevResult, resp_data, res, brief, tableName, startDate, endDate, metric) {

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
                'sortKey': {
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

        dynamodb.query(params, function (err, data) {
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
                            switch (name) {
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
                    res.status(200).send( { metrics : metric, logs : resp_data });
                    return;
                } else {
                    this.fetchItems(accountId, data, resp_data, res, brief, tableName, startDate, endDate, metric)
                }
            }
        });
    },

    epc2upc: function (epcValue) {
        var headerValue = "";
        var filterValue = "";
        var partitionValue = "";
        var companyLength = [40, 37, 34, 30, 27, 24, 20, 20];
        var companyPrefix = "";
        var itemRef = "";
        var serialNumber = "";
        var EPCbinary = "";
        var oddSum = 0;
        var evenSum = 0;
        var UPCvalue = "";
        var checkDigit = 0;

        for (var idx = 0; idx < epcValue.length; idx++) {
            EPCbinary = EPCbinary + math.pad(math.Hex2Bin(epcValue[idx]), 4);
        }

        //Split Binary EPC into Sections;
        headerValue = EPCbinary.substr(0, 8);
        filterValue = EPCbinary.substr(8, 3);
        partitionValue = EPCbinary.substr(11, 3);
        companyPrefix = EPCbinary.substr(14, companyLength[math.Bin2Dec(partitionValue)]);
        itemRef = EPCbinary.substr(14 + companyPrefix.length, 44 - companyPrefix.length);
        UPCvalue = EPCbinary.substr(15, 44);
        serialNumber = EPCbinary.substr(59, 38);

        //Convert Company Prefix && Item Reference into Decimal and Add Leading Zeros;
        companyPrefix = math.Bin2Dec(companyPrefix);
        companyPrefix = math.pad(companyPrefix, 6);

        itemRef = math.Bin2Dec(itemRef);
        itemRef = math.pad(itemRef, 5);

        UPCvalue = companyPrefix + itemRef;

        //Add UPC check digit;
        for (var idx = 0; idx < UPCvalue.length; idx++) {
            if (idx % 2 == 0) {
                evenSum = evenSum + parseInt(UPCvalue.substr(idx, 1));
            } else {
                oddSum = oddSum + parseInt(UPCvalue.substr(idx, 1));
            }
        }
        checkDigit = 10 - (((3 * evenSum) + oddSum) % 10);

        if (checkDigit > 9) {
            checkDigit = checkDigit - 10;
        }

        UPCvalue = UPCvalue + checkDigit;
        return UPCvalue;
    },

    epc2upcV1: function (epcValue) {
        var EPCbinary = "";
        var tagType;
        var upc = null;

        for (var idx = 0; idx < epcValue.length; idx++) {
            EPCbinary = EPCbinary + math.pad(math.Hex2Bin(epcValue[idx]), 4);
        }

        var headerValue = EPCbinary.substr(0, 8);

        if (headerValue == "00101100") {
            tagType = "GDTI-96";
        }
        else if (headerValue == "00101101") {
            tagType = "GSRN-96";
            upc = this.gsrn96Decode(EPCbinary);
        }
        else if (headerValue == "00101101") {
            tagType = "DoD-96";
        }
        else if (headerValue == "00110000") {
            tagType = "SGTIN-96";
            upc = this.sgtin96Decode(EPCbinary);
        }
        else if (headerValue == "00111011") {
            tagType = "VueSerAuth";
            upc = this.VueSerAuthDecode(EPCbinary);
        }
        else if (headerValue == "00110001") {
            tagType = "SSCC-96";
        }
        else if (headerValue == "00110010") {
            tagType = "SGLN-96";
        }
        else if (headerValue == "00110011") {
            tagType = "GRAI-96";
        }
        else if (headerValue == "00110100") {
            tagType = "GIAI-96";
        }
        else if (headerValue == "00110101") {
            tagType = "GID-96";
            upc = this.gid96Decode(EPCbinary);
        }
        else if (headerValue == "00110110") {
            tagType = "SGTIN-198";
        }
        else if (headerValue == "00110111") {
            tagType = "GRAI-170";
        }
        else if (headerValue == "00111000") {
            tagType = "GIAI-202";
        }
        else if (headerValue == "00111001") {
            tagType = "SGLN-195";
        }
        else if (headerValue == "00111010") {
            tagType = "GDTI-113";
        }
        else {
            tagType = "Unknown";
        }

        console.log(tagType, headerValue);
        return upc;
    },


    gsrn96Decode: function (epcBinary) {

        /* Partition | GS1 Company Prefix  | ItemReference
         *  Value    |                     |Indicator/Pad Digit
         * __________|_____________________|___________________
         *    (P)    |  Bits(M) | Digits(L)| Bits (N) | Digits
         * __________|__________|__________|__________|________
         *     0         40         12         18         5
         *     1         37         11         21         6
         *     2         34         10         24         7
         *     3         30         9          28         8
         *     4         27         8          31         9
         *     5         24         7          34         10
         *     6         20         6          38         11
         * _____________________________________________________
         *     Table 32. GSRN Partition Table EPC TDS 1.5
         */

        // [P][{M,N}] represented below by the 2 dimentional array
        // L = 12 - P
        // Digits = P + 5


        var partitionTableArray = [
            [40, 18],
            [37, 21],
            [34, 24],
            [30, 28],
            [27, 31],
            [24, 34],
            [20, 38]
        ];

        var partitionTable = partitionTableArray;

        var partitionValue = math.Bin2Dec(epcBinary.substr(11, 3));
        console.log("Partition Value " + partitionValue);

        var companyPrefix = math.Bin2Dec(epcBinary.substr(14, partitionTable[partitionValue][0]));
        companyPrefix = math.pad(companyPrefix, 12 - partitionValue);
        console.log("Company Prefix " + companyPrefix);

        var serviceReference = math.Bin2Dec(epcBinary.substr(14 + partitionTable[partitionValue][0], partitionTable[partitionValue][1]));
        serviceReference = math.pad(serviceReference, 5 + partitionValue);

        var upc = companyPrefix.toString() + serviceReference.toString();
        upc = upc + this.calculateCheckDigit(upc);
        console.log("UPC " + upc);
        return upc;
    },


    calculateCheckDigit: function (input) {

        console.log(input);
        input = input.toString();
        //Calculate the check digit dn =(–3(d1 + d(1+2) + ... + d(L))–(d2 + d(2+2) + ... + d(L-1))) mod 10
        var oddArray = [];
        var evenArray = [];

        for (var i = 0; i < ((input.length / 2) + 1); i++) {
            oddArray[i] = 0;
        }

        for (var i = 0; i < ((input.length / 2)); i++) {
            evenArray[i] = 0;
        }

        var checkDigit = 0;

        for (var i = 0; i < input.length; i++) {
            var index = parseInt((i - 1) / 2);
            if ((i + 1) % 2 == 0) { //even
                evenArray[index] = parseInt(input.substr(i, 1));
            } else {
                if (i != 0)
                    oddArray[index] = parseInt(input.substr(i, 1));
                else
                    oddArray[0] = parseInt(input.substr(i, 1));
            }
        }


        for (var i = 0; i < ((input.length / 2) + 1); i++) {
            checkDigit += (-3 * oddArray[i]);
        }
        console.log(checkDigit, oddArray, evenArray);

        for (var i = 0; i < (input.length / 2); i++) {
            checkDigit -= evenArray[i];
        }
        console.log(checkDigit);

        console.log(checkDigit, Math.abs(checkDigit));
        checkDigit = (Math.abs(checkDigit * 10) + checkDigit) % 10;

        return checkDigit.toString();
    },

    VueSerAuthDecode : function(epcBinary) {
        var upc = math.Bin2Dec(epcBinary.substr(16,48));
        console.log("UPC " + upc);
        return upc;
    },

    gid96Decode : function(epcBinary){
        var companyPrefix = math.Bin2Dec(epcBinary.substr(8,28));
        var itemRef = math.Bin2Dec(epcBinary.substr(36,24));

        itemRef = math.pad(itemRef, 6);
        var upc = companyPrefix.toString() + itemRef.toString();
        console.log("UPC " + upc);
        return upc;
    },

    sgtin96Decode : function(epcBinary) {

        /* Partition | GS1 Company Prefix  | ItemReference
         *  Value    |                     |Indicator/Pad Digit
         * __________|_____________________|___________________
         *    (P)    |  Bits(M) | Digits(L)| Bits (N) | Digits
         * __________|__________|__________|__________|________
         *     0         40         12         4          1
         *     1         37         11         7          2
         *     2         34         10         10         3
         *     3         30         9          14         4
         *     4         27         8          17         5
         *     5         24         7          20         6
         *     6         20         6          24         7
         * _____________________________________________________
         *     Table 17. SGTIN Partition Table EPC TDS 1.5
         */

        // [P][{M,N}] represented below by the 2 dimentional array
        // L = 12 - P
        // Digits = P + 1

        var partitionTableArray = [
            [40, 4],
            [37, 7],
            [34, 10],
            [30, 14],
            [27, 7],
            [24, 20],
            [20, 24]
        ];
        var partitionTable =partitionTableArray;
        var upc = "";

        var partitionValue = parseInt(math.Bin2Dec(epcBinary.substr(11, 3)));
        console.log("Partition Value " + partitionValue);

        var companyPrefix = math.Bin2Dec(epcBinary.substr(14, partitionTable[partitionValue][0]));
        companyPrefix = math.pad(companyPrefix.toString(), 12 - partitionValue);
        console.log("Company Prefix " + companyPrefix);

        var itemReference = math.Bin2Dec(epcBinary.substr(14 + partitionTable[partitionValue][0], partitionTable[partitionValue][1]));
        itemReference = math.pad(itemReference.toString(), 1 + partitionValue);
        console.log("Item Reference " + itemReference);

        try {
            var itemRefStr = itemReference.toString();
            upc = itemRefStr.substr(0,1) + companyPrefix.toString() + itemRefStr.substr(1, itemRefStr.length);
        } catch (ex) {
            if (itemReference.length == 1)
            {
                upc = itemReference.toString() +  companyPrefix.toString() + this.calculateCheckDigit(upc);
            }
        }

        //To calculate the check digit for GTIN 14 (GTIN 8, GTIN 12, & GTIN 13 need to be padded with 0s)
        upc = math.pad(upc, 13);
        upc = upc + this.calculateCheckDigit(upc);
        console.log("UPC " + upc);
        return upc;
    }
};
