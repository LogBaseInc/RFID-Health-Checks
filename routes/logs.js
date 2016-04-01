var express = require('express');
var router = express.Router();

var utils = require("./utils.js");
require('datejs');
var multer  = require('multer');
var upload = multer({dest: 'uploads/'});
var azure = require('azure-storage');

var azure_account = process.env.AZURE_STORAGE_ACCOUNT;
var azure_key = process.env.AZURE_STORAGE_ACCESS_KEY;
var azure_connection_string = process.env.AZURE_STORAGE_CONNECTION_STRING;

var RFID_LOGS_TABLE_NAME = "RFID-HEALTH-CHECK-LOGS";

/* Upload file. */
router.post('/upload/:accountid', upload.single('file'), function(req, res) {
    var accountid = req.params.accountid || " ";
    console.log(accountid, req.file.path);
    try
    {
        var blobService = azure.createBlobService();

        blobService.createBlockBlobFromLocalFile('rfid', accountid+'_cyclecount.txt', req.file.path, function(error, result, response) {
          if (!error) {
            res.status(200).send();
          }
          else{
            console.log(error);
            res.status(400).send({"error" : error});
          }

        });
    }
    catch(ex){
        console.log(ex);
        res.status(400).send({"error" : error});
    }
    return;
});

/* post logs */
router.post('/:accountid/:deviceid', function(req, res, next) {
    var accountId = req.params.accountid;
    var deviceId = req.params.deviceid;
    var items = req.body;

    if (items.length == 0) {
        res.status(400).send({"error" : "No logs found"});
        return;
    }

    processItems(items, res, accountId, deviceId);
    return;
});

/* Fetch logs based on date window */
router.get('/:accountid/:start/:end', function(req, res) {
    var accountId = req.params.accountid;
    var startDate = Date.parse(req.params.start);
    var endDate = Date.parse(req.params.end);

    if (accountId == null || accountId == undefined || startDate == null || startDate == undefined || endDate == null || endDate == undefined) {
        console.log(accountId, startDate, endDate);
        res.status(400).send({"error" : "Invalid/Missing fields - accountId, startDate and endDate are required"});
        return;
    }

    var responseList = [];

    utils.fetchItems(accountId + "#" + startDate.toString("yyyy-MM-dd"),
            accountId + "#" + endDate.toString("yyyy-MM-dd"), null, responseList, res, false, RFID_LOGS_TABLE_NAME);
});

module.exports = router;

function processItems(items, res, accountId, deviceId) {

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

        var dateInt = Date.parse(date);
        var dateString = "";

        if (dateInt != null && dateInt != undefined) {
            dateString = dateInt.toString("yyyy-MM-dd");
            console.log(dateString);
        }

        /*
         * Fill in the item details to update
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
            partitionKey: { 'S': accountId + "#" + dateString },
            sortKey: {'S': date },
            deviceID: {'S': deviceId}
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