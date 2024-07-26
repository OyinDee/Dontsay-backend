const { userInfoModel } = require("../Models/User.model");
const {messagesModel} = require("../Models/Messages.model")
const bcryptjs=require('bcryptjs')
var cloudinary = require('cloudinary').v2;
const jwt =require('jsonwebtoken')
require('dotenv').config()
cloudinary.config({ 
    cloud_name:  process.env.CLOUD_NAME, 
    api_key: process.env.API_KEY, 
    api_secret: process.env.API_SECRET
  });

 const create = (request, response) => {
    const username = request.body.username
        userInfoModel.find({username: username}, (err,result) => {
            if (err) {
                console.log(err.message)
                response.status(500).send({status:false, message: err.message})
            }
            else if(result.length != 0){
                console.log(result)
                console.log("username not available")
                response.status(400).send({message:"username not available",})
            }
            else{
                jwt.sign({username},  process.env.JWT_SECRET, (err, token)=> {
                    if(err){
                       console.log(err.message) 
                    }
                    else{
                        console.log(token);
                    }
                    console.log("new user added")
                    const form = new userInfoModel(request.body);
   
                    form.save((err, result) => {
                        if (err) {
                            return response.status(400).send({status: false, message: err.message});
                        }
                            response.status(200).send({message:"created successfully",token})
                            console.log(result)
                    })
                })
            }
        })
}

const login =(request, response)=>{
    const username = request.body.username
    userInfoModel.findOne({username: username}, (err,result) => {
        if (err) {
            console.log(err.message)
            response.status(500).send({status:false, message: err.message})
        }
        if (result) {
             if(request.body.password==result.password){
                   console.log(result)
                   console.log("yes")
                   jwt.sign({username},  process.env.JWT_SECRET, (err, token)=> {
                       if(err){
                          console.log(err.message) 
                       }
                       else{
                           console.log(token);
                       }
                       response.status(200).send({message:"logged in", token})
                   })
                   }
               else if(request.body.password!=result.password){
                   console.log(result)
                   console.log("no")
                   response.status(400).send({message:"incorrect password"})
               }
        }
        else{
            response.status(404).send({message:"user not found"})
        }
    })
}

 const getMessages = (request, response)=>{
    console.log(request.params[0])
    const username = request.params[0]
    messagesModel.find({username: username}, (err, result)=>{
        console.log("in")
        if (result) {
            console.log(result)
            response.status(200).send(result)
        }
        else{
            console.log(err.message)
            response.status(500).send("An error occured")
        }
    })
 }

 const sendMessage = (request, response)=>{

     if (request.body.img) {

        cloudinary.uploader
        .upload(`${request.body.img}`)
        .then(result=>{
            const everything ={
                message: request.body.message,
                username: request.body.username,
                imageURL: result.secure_url,
            }
            const form = new messagesModel(everything);
             form.save((err, result) => {
                if (err) {
                    console.log(err.message)
                    return response.status(400).send({status: false, message: err.message});
                }
                    response.status(200).send({status: true, message: "Sent"});
                    console.log(result)
            })
        })
        .catch((err)=>{
            console.log(err.message)
        });

     }
  else{
      const form = new messagesModel(request.body);
   
       form.save((err, result) => {
           if (err) {
               return response.status(400).send({status: false, message: err.message});
           }
               response.status(200).send({status: true, message: "Sent"});
               console.log(result)
       })

  }
 }

 module.exports={ getMessages, sendMessage, create, login}