const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: String,
    phone: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    PaymentStatus: String
});

module.exports = mongoose.model('User', UserSchema)