require("dotenv").config()
const express= require('express') 
const app = express();
const bodyParser=require('body-parser')
const mongoose = require('mongoose')
const { MongoClient, ServerApiVersion } = require('mongodb')
const url=process.env.URI
const bcryptjs= require('bcryptjs')
const jwt = require('jsonwebtoken')
const cors = require('cors')
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const PORT = process.env.PORT
const {login, getMessages, sendMessage, create, sendForgotPasswordMail, resetPassword, setRecoveryEmail, authenticate}=require('./Controllers/User.controller')

/**
 * @swagger
 * /user/set-recovery-email:
 *   post:
 *     summary: Set or update recovery email for a user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - recoveryEmail
 *             properties:
 *               username:
 *                 type: string
 *               recoveryEmail:
 *                 type: string
 *     responses:
 *       200:
 *         description: Recovery email set
 *       400:
 *         description: Missing username or recoveryEmail
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */

// Ensure body parsing middleware is loaded before any routes
app.use(bodyParser.json({limit: '50mb', extended: true}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(cors())
app.use(express.urlencoded({limit: '50mb', extended: true}))

app.post("/user/set-recovery-email", authenticate, setRecoveryEmail);

// Swagger definition
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'DontSay Backend API',
    version: '1.0.0',
    description: 'API documentation for DontSay backend',
  },
  servers: [
    {
      url: 'http://localhost:' + PORT,
      description: 'Local server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
};

const options = {
  swaggerDefinition,
  apis: ['./index.js'],
};
const swaggerSpec = swaggerJsdoc(options);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
/**
 * @swagger
 * /user/create:
 *   post:
 *     summary: Create a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: User created successfully
 *       500:
 *         description: Server error
 */
/**
 * @swagger
 * /user/login:
 *   post:
 *     summary: Login a user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       500:
 *         description: Server error
 */
/**
 * @swagger
 * /get:
 *   post:
 *     summary: Get user messages
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Messages retrieved
 *       400:
 *         description: Session expired
 *       500:
 *         description: Server error
 */
/**
 * @swagger
 * /send:
 *   post:
 *     summary: Send a message
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *               - username
 *               - time
 *             properties:
 *               img:
 *                 type: string
 *                 description: base64 image (optional)
 *               message:
 *                 type: string
 *               username:
 *                 type: string
 *               time:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message sent
 *       400:
 *         description: Error
 */
/**
 * @swagger
 * /user/forgot-password:
 *   post:
 *     summary: Send forgot password code
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - username
 *             properties:
 *               email:
 *                 type: string
 *               username:
 *                 type: string
 *     responses:
 *       200:
 *         description: Code sent
 *       400:
 *         description: Code already sent
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
/**
 * @swagger
 * /user/reset-password:
 *   post:
 *     summary: Reset user password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - newPassword
 *               - username
 *             properties:
 *               code:
 *                 type: string
 *               newPassword:
 *                 type: string
 *               username:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password updated
 *       400:
 *         description: Invalid code
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */



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
