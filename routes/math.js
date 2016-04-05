var express = require('express');
var router = express.Router();


module.exports = {
    //Useful Functions
    checkBin: function(n) {
        return/^[01]{1,64}$/.test(n);
    },

    checkDec: function(n) {
        return/^[0-9]{1,64}$/.test(n);
    },

    checkHex: function(n) {
        return/^[0-9A-Fa-f]{1,64}$/.test(n);
    },

    pad: function(s,z) {
        s=""+s;return s.length<z?this.pad("0"+s,z):s;
    },

    unpad: function(s) {
        s=""+s;return s.replace(/^0+/,'');
    },

    //Decimal operations
    Dec2Bin: function(n) {
        if(!this.checkDec(n) || n<0)
            return 0;
        return n.toString(2);
    },

    Dec2Hex: function(n) {
        if(!this.checkDec(n) || n<0)
            return 0;
        return n.toString(16);
    },

    //Binary Operations
    Bin2Dec: function(n) {
        if(!this.checkBin(n))
            return 0;
        return parseInt(n,2).toString(10);
    },

    Bin2Hex: function(n) {
        if(!this.checkBin(n))
            return 0;
        return parseInt(n,2).toString(16);
    },

    //Hexadecimal Operations
    Hex2Bin: function(n) {
        if(!this.checkHex(n))
            return 0;
        return parseInt(n,16).toString(2);
    },

    Hex2Dec: function(n) {
        if(!this.checkHex(n))
            return 0;
        return parseInt(n,16).toString(10);
    }
};