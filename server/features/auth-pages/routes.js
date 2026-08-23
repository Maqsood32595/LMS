const path = require('path');

// GET /login — standalone login form (posts to /api/method/login)
module.exports = function (req, res) {
    res.sendFile(path.join(__dirname, 'login.html'));
};
