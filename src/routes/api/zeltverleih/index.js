// src/routes/api/zeltverleih/index.js
// Bündelt layouts.js und objekte.js zu einem Router, der in server.js EINMAL
// mit dem Guard gemountet wird (siehe server.js.snippet.txt).

const express = require('express');
const router = express.Router();

router.use('/layouts', require('./layouts'));
router.use('/objekte', require('./objekte'));

module.exports = router;
