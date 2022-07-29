const { userInfoModel } = require("../Models/User.model");
const bcryptjs=require('bcryptjs')
const jwt =require('jsonwebtoken')
require('dotenv').config()
const register = (request, response) => {
    const userLog = request.body;
    userInfoModel.findOne({email: userLog.email}, (err, result) => {
        if(err) {
            internalServerError(res);
        } 
        else if(result) {
                response.send({status: false, message: "Email already exist"});
            }
        else{
    userInfoModel.findOne({phoneNumber: userLog.phoneNumber}, (err, result) => {
        if(err) {
           response.send(err.message)
           console.log(err.message)
        } 
        else if(result) {
                response.send({status: false, message: "Phone number already exist"});
            }
        else{
            const myPlaintextPassword = userLog.password
            const salt = bcryptjs.genSaltSync(10);
            const hash = bcryptjs.hashSync(myPlaintextPassword, salt);
            const newForm={
                email:userLog.email, 
                username:userLog.username,          
                password:hash,
                phoneNumber:userLog.phoneNumber
            }
            console.log(newForm)
            const form = new userInfoModel(newForm);
            form.save((err) => {
                response.send({status: true, message: "Registration successful"});
            })
        }
    })

        }
    })

 }
 const login = (req, res) => {
    const userLog = req.body;
    const emailorphone=userLog.emailorphone
    console.log(userLog)
        userInfoModel.findOne({email: emailorphone}, (err,result) => {
        if (err) {
            console.log(err.message)
            response.send({status:false, message: err.message})
        }
        else if (!result) {
        userInfoModel.findOne({phoneNumber: emailorphone}, (err,result) => {
            if (err) {
                console.log(err.message)
                response.send({status:false, message: err.message})
            }
            else if (!result) {
                console.log("Phone number and email does not exist")
                res.send({status: false, message: `Phone number and email does not exist`});
            }
            else {
                console.log(result)
                const receivedPassword=result.password;
                const myPlaintextPassword =userLog.password;
                bcryptjs.hash(myPlaintextPassword,10).then((hash) => {
                    return bcryptjs.compare(myPlaintextPassword, receivedPassword)
                }).then((result) => {
                    if(result==true){
                        jwt.sign({emailorphone},  process.env.JWT_SECRET, (err, token)=> {
                            if(err){
                               console.log(err.message) 
                            }
                            else{
                                console.log(token);
                            }
                            console.log("Successful login")
                            res.send({message:"Your login is successful!",token})
                        })
                        }
                        else {
                            res.send({status: false, message: `Invalid email or password`});
                            console.log("Wrong password")
                        }
                        });
            }
        })

        }
        else {
            const receivedPassword=result.password;
            const myPlaintextPassword =userLog.password;
            bcryptjs.hash(myPlaintextPassword,10).then((hash) => {
                return bcryptjs.compare(myPlaintextPassword, receivedPassword)
            }).then((result) => {
                if(result==true){
                    jwt.sign({emailorphone},  process.env.JWT_SECRET, function(err, token) {
                        console.log(token);
                        console.log("Successful login")
                        res.send({message:"Your login is successful!",token})
                    })
                    }
                    else {
                        res.send({status: false, message: `Invalid email or password`});
                        console.log("Wrong password")
                    }
                    });
        }
    })
}
 module.exports={register,login}