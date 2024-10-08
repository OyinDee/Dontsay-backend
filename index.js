require("dotenv").config()
const {login, getMessages, sendMessage, create, sendForgotPasswordMail, resetPassword}=require('./Controllers/User.controller')
const PORT = process.env.PORT
const express= require('express') 
const app = express();
const bodyParser=require('body-parser')
const mongoose = require('mongoose')
const { MongoClient, ServerApiVersion } = require('mongodb')
const url=process.env.URI
const bcryptjs= require('bcryptjs')
const jwt = require('jsonwebtoken')
const cors = require('cors')

app.use(bodyParser.json({limit: '50mb', extended: true}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(cors())
app.use(express.urlencoded({limit: '50mb', extended: true}))
mongoose.Query.prototype.timeout = 20000
mongoose.connect(url)
    .then(()=>{
        console.log("MONGODB has connected");  
    })
    .catch((err)=>{
        console.log(err);
        console.log("Error in mongodb connection");
    })



app.post("/user/create", create);
app.post("/user/login", login);
app.post("/get", getMessages)
app.post("/send", sendMessage)
app.post("/user/forgot-password", sendForgotPasswordMail)
app.post("/user/reset-password", resetPassword)


app.listen(PORT,( )=>{
    console.log(`app listening on PORT ${PORT}`)
})
