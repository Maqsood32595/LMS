const path = require('path');

// GET /signup — standalone signup form (posts to /api/v1/auth/register then login)
module.exports = function (req, res) {
    res.sendFile(path.join(__dirname, 'signup.html'));
};
