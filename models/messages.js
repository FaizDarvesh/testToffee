const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    body: String,
    response: String,
    timestamp: String,
    user: String
})

module.exports = mongoose.model("Message", messageSchema);