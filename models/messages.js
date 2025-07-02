import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    body: String,
    response: String,
    timestamp: String,
    user: String
})

const Message = mongoose.model('Message', messageSchema);

export default Message;