require("dotenv").config()
const {register,login}=require('./Controllers/User.controller')
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
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended: true}))

mongoose.connect(url, (err)=>{
    if (err) {
        console.log(err.message);
        console.log("Error in mongodb connection");
    }
    else{
        console.log("MONGODB has connected");
    }
})
app.post("/user/signup", register);
app.post("/user/login", login);

app.listen(PORT,( )=>{
    console.log(`app listening on PORT ${PORT}`)
})