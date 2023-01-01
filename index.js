const express = require('express');
const body_parser = require("body-parser");

// Initialize app
const app = express().use(body_parser.json());

app.listen(5500, ()=>{
    console.log("App is listening");
})

app.get('/webhook', (req, res) => {
    let mode = req.query["hub.mode"];
    let challenge = req.query["hub.challenge"];
    let token = req.query["hub.verify_token"];
    
    console.log(req.query, mode, token, challenge);

    if(mode && token) {
        console.log(mode, token);
        if(mode==="subscribe" && token==="testFaiz") {
            res.status(200).send(challenge);
        } else {
            res.status(403);
        }
    }
})

app.post('/webhook', (req, res) => {

    let body_param=req.body;

    console.log(JSON.stringify(body_param,null,2));

    if(body_param.object){
        console.log("inside body param");
        if(body_param.entry && body_param.entry[0].changes && 
            body_param.entry[0].changes[0].value.messages && 
            body_param.entry[0].changes[0].value.messages[0]  
            ) {
               let phone_id=body_param.entry[0].changes[0].value.metadata.phone_number_id;
               let from = body_param.entry[0].changes[0].value.messages[0].from; 
               let msg_body = body_param.entry[0].changes[0].value.messages[0].text.body;

               console.log("phone number "+phone_id);
               console.log("from "+from);
               console.log("boady param "+msg_body);

               axios({
                   method:"POST",
                   url:"https://graph.facebook.com/v13.0/"+phone_id+"/messages?access_token="+token,
                   data:{
                       messaging_product:"whatsapp",
                       to:from,
                       text:{
                           body:"Hi.. I'm Prasath, your message is "+msg_body
                       }
                   },
                   headers:{
                       "Content-Type":"application/json"
                   }
               });

               res.sendStatus(200);

            } else {
                res.sendStatus(404);
            }

    }

});

app.get('/', (req, res) => {
    res.send('Hi This is webhook test!');
})

module.exports = app;