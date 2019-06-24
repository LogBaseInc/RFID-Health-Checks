var express = require('express');
var router = express.Router();
var Multer = require('multer');
const multer = Multer({
storage: Multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // no larger than 10mb, you can change as needed.
    }
});
  
var utils = require("./utils.js");
require('datejs');
var firebase = require('firebase-admin');
var app = firebase.initializeApp({
    apiKey: "AIzaSyCVMhNe8GrrXhBStq1ANovFAZKG7V-OZVI",
    authDomain: "rfidapp.firebaseapp.com",
    databaseURL: "https://rfidapp.firebaseio.com",
    projectId: "firebase-rfidapp",
    storageBucket: "firebase-rfidapp.appspot.com",
    messagingSenderId: "443491623158",
    appId: "1:443491623158:web:57bbd31c2a22c63e"
});
const { Storage } = require('@google-cloud/storage');
var storage = new Storage({
    projectId: 'firebase-rfidapp'
});
var bucket = storage.bucket('firebase-rfidapp.appspot.com');

var dateFormt = "yyyy-MM-dd HH:mm:ss";

var RFID_LOGS_TABLE_NAME = "RFID-HEALTH-CHECK-LOGS";

/* Upload file. */
router.post('/upload/:accountid', multer.single('file'), (req, res) => {
    var accountid = req.params.accountid || " ";
    const file = bucket.file('webUploadedCyclecount/'+accountid+'_cyclecount.txt');
    const stream = file.createWriteStream({
        metadata: {
        contentType: req.file.mimetype
        },
        resumable: false
    });

    stream.on('error', (err) => {
        res.status(400).send(err);
    });

    stream.on('finish', () => {
        res.status(200).send();
    });

    stream.end(req.file.buffer);
    return;
});

const uploadImageToStorage = (file, newFileName) => {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject('No image file');
      }  
      let fileUpload = bucket.file(newFileName);
  
      const blobStream = fileUpload.createWriteStream({
        metadata: {
          contentType: file.mimetype
        }
      });
  
      blobStream.on('error', (error) => {
        reject('Something is wrong! Unable to upload at the moment.');
      });
  
      blobStream.on('finish', () => {
        // The public URL can be used to directly access the file via HTTP.
        const url = format(`https://storage.googleapis.com/${bucket.name}/${fileUpload.name}`);
        resolve(url);
      });
  
      blobStream.end(file.buffer);
    });
}

/* post logs */
router.post('/audit/:accountid/:deviceid/:version', function(req, res, next) {
    var accountId = req.params.accountid;
    var deviceId = req.params.deviceid;
    var version = req.params.version;

    var items = req.body;

    if (items.length == 0) {
        res.status(400).send({"error" : "No logs found"});
        return;
    }

    processItems(items, res, accountId, deviceId, version);
    return;
});

/* Fetch logs based on date window */
router.get('/:accountid/:start/:end', function(req, res) {
    var accountId = req.params.accountid;
    var startDate = Date.parse(req.params.start);
    var endDate = Date.parse(req.params.end);

    var metric = {
        count: 0,
        inCycleCount: {},
        exceptionI: {},
        exceptionII: {},
        status: {}
    };

    if (accountId == null || accountId == undefined || startDate == null || startDate == undefined || endDate == null || endDate == undefined) {
        console.log(accountId, startDate, endDate);
        res.status(400).send({"error" : "Invalid/Missing fields - accountId, startDate and endDate are required"});
        return;
    }

    var responseList = [];
    utils.fetchItems(accountId, null,
        responseList, res, false, RFID_LOGS_TABLE_NAME,
        startDate.toString(dateFormt), endDate.toString(dateFormt), metric
    );
});

module.exports = router;

function processItems(items, res, accountId, deviceId, version) {

    var item_list = [];
    for (var idx in items) {
        //V1: Device,Store Area,Datetime,UPC,EPC URI,TID,Tag Type,EPC,Extracted UPC,Math,Cycle Count,Exception Tag1,Exception Tag2
        var tokens = items[idx].split(",");
        if (tokens.length < 10) {
            res.status(400).send({"error" : "Missing fields", "content" : items[idx]});
            return;
        }

        var device = tokens[0] || "nil";
        var storeArea = tokens[1] || "nil";
        var date = tokens[2] || "nil";
        var upc = tokens[3] || "nil";
        var epcUri = tokens[4] || "nil";
        var tid = tokens[5] || "nil";
        var tagType = tokens[6] || "nil";
        var epc = tokens[7] || "nil";
        var extractedUpc = tokens[8] || "nil";
        var status = tokens[9] || "nil";
        var inCycleCount = tokens[10] || "nil";
        var exceptionI = tokens[11] || "nil";
        var exceptionII = tokens[12] || "nil";

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
            partitionKey: { 'S': accountId },
            sortKey: {'S': dateInt.toString(dateFormt) },
            deviceId: {'S': deviceId},
            accountId: {'S': accountId},
            storeArea : {'S': storeArea}
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

        if (item_list.length == utils.getDynamoDBBatchWriteLimit()) {
            utils.batchWrite(item_list, false, res, RFID_LOGS_TABLE_NAME);
            item_list = [];
        }
    }
}
