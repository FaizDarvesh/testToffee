// All the requires
const express = require('express');
const path = require('path');
const axios = require('axios');
const body_parser=require("body-parser");

const dotenv = require('dotenv').config();

const mongoose = require('mongoose');
const Message = require('./models/messages');
const User = require('./models/user');
// const MongoStore = require("connect-mongo");
const mongoSanitize = require('express-mongo-sanitize');

const { Configuration, OpenAIApi } = require("openai");

// Initialize app
const app = express();

// Define environment variables
const port = process.env.PORT || 8500;
const whatsappToken = process.env.ACCESS_TOKEN;
// const whatsappToken = process.env.TEMP_ACCESS_TOKEN;
const webhook_token = process.env.WEBHOOK_TOKEN;

const dbUrl = process.env.DB_URL;

// Connect to Database
mongoose.connect(dbUrl, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const db = mongoose.connection; //to shorten the on and once statements below. This assignment not mandatory

db.on("error", console.error.bind(console, "connection error:"));
db.once("open", () => {
    console.log("Database connected");
})

let ai_response = '';
let trial_limit = Number(process.env.TRIAL_LIMIT) || 25;
const greetings = ["hello", "hey", "what's up", "who are you", "what is your name", "tell me about yourself", "hi", "hii", "ola"]
const filter = ["erotic", "dick", "porn", "blowjob", "cum ", "pussy", "cock"];
const thanks = ["thanks", "thank you", "thank", "great"];

console.log(trial_limit);

// Initialize API configuration
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
  
const openai = new OpenAIApi(configuration);

// Enable body parser
app.use(body_parser.json());

//Sanitize queries for security - Does not allow queries with $ sign. $ is a part of Mongo queries 
app.use(mongoSanitize());

app.listen(port, ()=> console.log(`Webhook server started on port ${port}. Webhook is listening`));

//  For validating token
app.get('/webhook', (req, res) => {
    let mode = req.query["hub.mode"];
    let challenge = req.query["hub.challenge"];
    let token = req.query["hub.verify_token"];
    
    console.log(req.query, mode, token, challenge);

    if(mode && token) {
        console.log(mode, token);
        if(mode==="subscribe" && token===webhook_token) {
            res.status(200).send(challenge);
        } else {
            res.status(403);
        }
    }
})

app.post('/webhook', async (req, res) => {

    let message_content = req.body;

    if(message_content.object){
        console.log(message_content.entry[0].changes[0])
        if(message_content.entry && message_content.entry[0].changes && message_content.entry[0].changes[0].value.messages && message_content.entry[0].changes[0].value.messages[0].text) {
            let phone_num_id = message_content.entry[0].changes[0].value.metadata.phone_number_id
            let from_number = message_content.entry[0].changes[0].value.messages[0].from;
            let message_body = message_content.entry[0].changes[0].value.messages[0].text.body;

            console.log(`Message from ${from_number} - ${message_body}`)
            let textResponse = '';
            let context = '';
            let userExists = 1;
            let messageCount = 0;
            let userStatus = "pending";
            let messageLength = message_body.length;
            let latestMessage = "";

            // Check if user exists.
            userExists = await User.countDocuments({ phone: from_number }).then((count) => {
                    return count;
            });
            
            // Fetch user plan by querying the database. Only for trial users we then check count
            if (userExists) {
                userPlan = await User.find({ phone: from_number }, function (err, data) {
                    if (err) console.log(err);
                }).clone().catch(function(err){ console.log(err)});

                userStatus = userPlan[0].PaymentStatus; 
            }

            // Only count messages for trial users
            if (userStatus === "trial") {
                messageCount = await Message.countDocuments({ user: from_number }).then((count) => {
                    return count;
                })
            }

            // Check if Context is needed
            if (message_body.includes("-continue")) {
                    // If so, bring back the record with highest ObjectID timestamp  
                    latestMessage = await Message.findOne({ user: from_number }, function (err, data) {
                        if (err) console.log(err);
                    }).sort({ _id: -1 }).clone().catch(function(err){ console.log(err)});
                
                    context = latestMessage.body;
                    context = context.replace('?', '.');
                    message_body = message_body.replace('-continue','');

            }

            console.log(">>>", messageCount, "from", userExists, "user(s). Latest Message is ", latestMessage)
                
            // If greeting, thanks or unacceptable content, pass prompt to open AI API if it's longer than 5 characters
            try {
                
                let message_body_LC = message_body.toLowerCase();

                if (userExists === 0) {
                    // User is not registered. UPCOMING FEATURE - REGISTER USERS DIRECTLY - ADD RECORD IN DB
                    await saveUser(from_number);
                    textResponse = `Thank you for trying Toffee AI! You can send ${trial_limit} requests as a part of your trial.\n\n What can I do for you?`
                } else if (greetings.some(string => message_body_LC.includes(string)) && messageLength<20) {
                    // Manage the 'who are you?' questions internally
                    textResponse = 'Hi! I am Toffee, your AI assistant. Nice to meet you!\n\nI can help you with writing emails, essays, poems and drafting documents, and answering general knowledge questions. I do not know of recent events.\n\nWhat can I do for you today?'; 
                } else if (thanks.some(string => message_body_LC.includes(string)) && messageLength<15) {
                    textResponse = "You're welcome! Have a nice day!"
                } else if (messageLength < 5) {
                    // Manage the super short prompts - ask for more detail
                    textResponse = 'I am sorry! Can you please provide more information?'
                } else if (filter.some(string => message_body_LC.includes(string))) {
                    textResponse = "Sorry, your request violates the usage policy for Toffee and Open AI. You are advised to adhere to the usage guidelines. Please consider this a warning.\n\nIf you feel this message was an error, please reach out to feedback@faizdarvesh.com."
                } else if (messageLength > 400) {
                    textResponse = 'Sorry, that is too lengthy for me to process right away. Can you please ask that more concisely?'
                } else if (messageCount > trial_limit) {
                    // Inform them that their trial has expired
                    textResponse = "Your trial has ended!\n\nThank you for trying Toffee! I hope you liked it. You can continue using Toffee by becoming a member at https://www.buymeacoffee.com/faizdarvesh."
                } else {
                    
                    console.log("Context is", context, ". message body is", message_body);

                    // Fetch AI response to your question
                    ai_response = await openai.createCompletion({
                        model: "text-davinci-003",
                        prompt: `Your name is Toffee, an intelligent AI assistant developed by Faiz Darvesh that helps with answering questions and writing. Help me complete this request. \n ${context}. \n ${message_body}.`,
                        max_tokens: 350,
                        temperature: 0.1,
                    });
                    
                    textResponse = ai_response.data.choices[0].text;
                }

                // Stringify the data to send in JSON format through Whatsapp
                const send_data = JSON.stringify({
                    "messaging_product": "whatsapp",
                    "preview_url": false,
                    "recipient_type": "individual",
                    "to": from_number,
                    "type": "text",
                    "text": {
                        "body": textResponse
                    }
                });
    
                // Send response using a POST request to Whatsapp API 
                await axios({
                    method:"POST",
                    url:`https://graph.facebook.com/v15.0/${phone_num_id}/messages`,
                    headers: {
                        "Authorization": `Bearer ${whatsappToken}`,
                        "Content-Type": "application/json"
                        },
                    data: send_data
                });

                // Save message to MongoDB Collection
                let message = new Message({
                    body: message_body,
                    response: textResponse,
                    timestamp: Date(),
                    user: from_number
                })

                await message.save();
                
                res.sendStatus(200);

            } catch (error) {
                if (error.response) {
                    console.log(error.response.status);
                    console.log(error.response.data);
                  } else {
                    console.log(error.message);
                }
                
                res.status(400).json({
                    success: false,
                    error
                });
            }
        } else if (message_content.entry && message_content.entry[0].changes && message_content.entry[0].changes[0].value.messages) {
            
            // For reactions, stickers, images and videos, just respond with an emoji
            console.log(message_content.entry[0].changes[0].value.messages)
            let phone_num_id = message_content.entry[0].changes[0].value.metadata.phone_number_id
            let from_number = message_content.entry[0].changes[0].value.messages[0].from;
            let textResponse = process.env.STANDARD_RESPONSE || ":)";

            // Stringify the data to send in JSON format through Whatsapp
            const send_data = JSON.stringify({
                "messaging_product": "whatsapp",
                "preview_url": false,
                "recipient_type": "individual",
                "to": from_number,
                "type": "text",
                "text": {
                    "body": textResponse
                }
            });

            try {
                // Send response using a POST request to Whatsapp API 
                await axios({
                    method:"POST",
                    url:`https://graph.facebook.com/v15.0/${phone_num_id}/messages`,
                    headers: {
                        "Authorization": `Bearer ${whatsappToken}`,
                        "Content-Type": "application/json"
                        },
                    data: send_data
                });

                // Save message to MongoDB Collection
                let message = new Message({
                    body: "",
                    response: textResponse,
                    timestamp: Date(),
                    user: from_number
                });

                await message.save();

            } catch (error) {
                if (error.response) {
                    console.log(error.response.status);
                    console.log(error.response.data);
                  } else {
                    console.log(error.message);
                }
                
                res.status(400).json({
                    success: false,
                    error
                });
            }
            
            res.sendStatus(200);

        } else if (message_content.entry[0].changes[0].value.statuses) {
            // Just acknowledge status reports that are sent
            res.sendStatus(200);
        } else {
            res.sendStatus(404);
        }
    }

});

app.get('/', (req, res) => {
    res.send('This is the test page for Toffee AI. Please visit asktoffee.com!');
})


//  FUNCTIONS FOR REFACTORING -->

// Save user to DB
async function saveUser(from_number) {
    let randomNum = Math.random().toString().substring(2, 10);

    let user = new User({
        name: `trialUser${randomNum}`,
        email: `trial${randomNum}@email.com`,
        phone: from_number,
        PaymentStatus: "trial"
    });

    await user.save();
}

// Fetch AI response

// Fetch image from unsplash and send through Whatsapp

// Send emails