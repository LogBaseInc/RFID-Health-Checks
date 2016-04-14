var express = require('express');
var router = express.Router();
var sendgrid  = require('sendgrid')(process.env.SENDGRID_API_KEY);


/* GET users listing. */
router.get('/:orgname/:username/:deviceid', function(req, res, next) {
    res.status(200).send();
    return;
});

router.post('/verify', function(req, res) {
    var email = req.body.email;
    var account = req.body.account;

    //TODO Authenticate token

    var text = "Hello!\n\n" +
        "I am Kousik, Technology lead at LogBase. Thank you for signing up with RFID Scout. " +
        "RFID Scout, enables you do to RFID Inventory Checks, RFID Tag Identification & perform RFID Audits." +
        " If you need any help, please " +
        "feel free to email me.\n\n" +
        "Thank you once again!\n\n" +
        "Regards,\n\n" +
        "Kousik\n\n" +
        "Technology Lead,\n\n" +
        "LogBase\n\n";

    var sgEmail = new sendgrid.Email();
    sgEmail.to  = email;
    sgEmail.subject = "Hello, Thank you for signing up with RFID Scout!";
    sgEmail.from = 'kousik@logbase.io';
    sgEmail.fromname = "Kousik";
    sgEmail.text = text;
    sgEmail.bcc = ['kousik@logbase.io'];

    if (email != null) {
        sendgrid.send(sgEmail, function(err, json) {
            if (err) {
                console.error(err);
                res.status(520).end();
            }
            console.log(json);
            res.status(200).end();
        });
    } else
        res.status(400).end();

});

module.exports = router;
