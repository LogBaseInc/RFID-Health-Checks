var express = require('express');
var router = express.Router();

var utils = require("./utils.js");
require('datejs');
var multer  = require('multer');
var fs = require('fs');
var readline = require('readline');
var upload = multer({dest: 'uploads/'});
var Excel = require('exceljs');

//Authenticate Firebase
var firebase_ref = new Firebase(process.env.FIREBASE_URL);
var firebase_secret = process.env.FIREBASE_SECRET;
firebase_ref.authWithCustomToken(firebase_secret, function(error, authData) {
    if (error) {
        console.log("Login Failed!", error);
    } else {
        console.log("Firebase authenticated successfully with payload.");
    }
});

/* Cycle count file from app. */
router.post('/cyclecount/:accountid', upload.single('file'), function(req, res) {
    var accountid = req.params.accountid || " ";
   
    var rd = readline.createInterface({
        input: fs.createReadStream(req.file.path),
        output: process.stdout,
        terminal: false
    });

    var values=[];
    rd.on('line', function(line) {
        values.push(line);
    });

    rd.on('close', function(data) {
        console.log(values.length);
    });

    res.status(200).send();
    return;
});


/* Upload item ref file */
router.post('/itemref/:accountid', upload.single('file'), function(req, res) {
    var accountid = req.params.accountid || " ";
    console.log(req.file.path);
    var values= {};

    var workbook = new Excel.Workbook();
    workbook.xlsx.readFile(req.file.path).then(function() {
        // use workbook
        console.log(workbook);
        var worksheet = workbook.getWorksheet(1);
        if(worksheet != null) {
            // Iterate over all rows that have values in a worksheet
            worksheet.eachRow(function(row, rowNumber) {
                /*                values.push({
                 storeId : worksheet.getCell('A'+rowNumber).value,
                 storeName : worksheet.getCell('B'+rowNumber).value,
                 category : worksheet.getCell('C'+rowNumber).value,
                 itemNumber : worksheet.getCell('D'+rowNumber).value,
                 itemFlags : worksheet.getCell('E'+rowNumber).value,
                 itemDesc : worksheet.getCell('F'+rowNumber).value,
                 sizeDesc : worksheet.getCell('G'+rowNumber).value,
                 itemStatus : worksheet.getCell('H'+rowNumber).value,
                 upc : worksheet.getCell('I'+rowNumber).value,
                 posQty : worksheet.getCell('J'+rowNumber).value,
                 posSales : worksheet.getCell('K'+rowNumber).value,
                 currStrOnHandQty : worksheet.getCell('L'+rowNumber).value,
                 }); */
                var upc = worksheet.getCell('I'+rowNumber).value;
                values[upc] = {
                    category : worksheet.getCell('C'+rowNumber).value,
                    itemDesc : worksheet.getCell('F'+rowNumber).value,
                    itemNumber : worksheet.getCell('D'+rowNumber).value
                };
            });
        }
        var itemFileDescRef = firebase_ref.child('/accounts/' + accountid + '/itemfiledetails');
        itemFileDescRef.update({ upc : values});
    });

    res.status(200).send();

    return;
});

module.exports = router;