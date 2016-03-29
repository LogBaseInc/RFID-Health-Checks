var express = require('express');
var router = express.Router();

/* GET users listing. */
router.get('/:orgname/:username/:deviceid', function(req, res, next) {
    res.status(200).send();
    return;
});

module.exports = router;
