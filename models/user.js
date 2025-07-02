import mongoose from 'mongoose';

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

const User = mongoose.model('User', UserSchema);

export default User;