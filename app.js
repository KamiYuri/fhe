const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');

const SEAL = require('node-seal');
const { MongoClient } = require('mongodb');


const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');

const app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Khởi tạo SEAL và MongoDB
let seal;  // SEAL context
let db;    // MongoDB connection

async function initialize() {
    console.log('Initializing SEAL and MongoDB...');
    // Khởi tạo SEAL
    seal = await SEAL();

    // Kết nối MongoDB
    const client = await MongoClient.connect('mongodb://localhost:27017');
    db = client.db('fhe_poc');
}

initialize().catch(console.error);

app.use('/', indexRouter);
app.use('/users', usersRouter);

module.exports = app;
