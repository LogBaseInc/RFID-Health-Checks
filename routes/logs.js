var express = require('express');
var router = express.Router();

var utils = require("./utils.js");

var RFID_LOGS_TABLE_NAME = "RFID-HEALTH-CHECK-LOGS";

/* GET home page. */
router.post('/:accountid', function(req, res, next) {
    var accountId = req.params.accountid;
    var items = req.body;

    if (items.length == 0) {
        res.status(400).send({"error" : "No logs found"});
        return;
    }

    processItems(items, res, accountId);
    return;
});

module.exports = router;

function processItems(items, res, accountId) {

    var item_list = [];
    for (var idx in items) {
        //Device,Datetime,UPC,EPC URI,TID,Tag Type,EPC,Extracted UPC,Math,Cycle Count,Exception Tag1,Exception Tag2
        var tokens = items[idx].split(",");
        if (tokens.length < 10) {
            res.status(400).send({"error" : "Missing fields", "content" : items[idx]});
            return;
        }

        var device = tokens[0];
        var date = tokens[1];
        var upc = tokens[2];
        var epcUri = tokens[3];
        var tid = tokens[4];
        var tagType = tokens[5];
        var epc = tokens[6];
        var extractedUpc = tokens[7];
        var status = tokens[8];
        var inCycleCount = tokens[9];
        var exceptionI = tokens[10] || "nil";
        var exceptionII = tokens[11] || "nil";

        /*
         * Fill in the customer details to update
         */
        var item_details = {
            device: { 'S': device },
            date: { 'S': date },
            upc: { 'S': upc },
            epcUri: { 'S': epcUri },
            tid: { 'S': tid},
            tagType: {'S': tagType},
            epc: { 'S': epc},
            extractedUpc: { 'S': extractedUpc},
            status: { 'S': status},
            inCycleCount: { 'S': inCycleCount},
            exceptionI: { 'S': exceptionI},
            exceptionII: { 'S': exceptionII},
            partitionKey: { 'S': accountId },
            sortKey: {'S': date }
        };

        var put_request = {
            Item: item_details
        };

        var list_items = {
            PutRequest: put_request
        };

        item_list.push(list_items);

        if (idx == items.length - 1) {
            utils.batchWrite(item_list, true, res, RFID_LOGS_TABLE_NAME);
            item_list = [];
        }

        if (item_list.length == utils.getDynamoDBBatchWriteLimit) {
            utils.batchWrite(item_list, false, res, RFID_LOGS_TABLE_NAME);
            item_list = [];
        }
    }
}