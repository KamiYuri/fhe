"use strict";

const express = require('express');
const SEAL = require('node-seal');
const {MongoClient, ServerApiVersion} = require('mongodb');

const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(express.json());

class FHEConfig {
    constructor(configPath = 'config/fhe-params.json') {
        this.configPath = configPath;
        // Đảm bảo thư mục config tồn tại
        this.ensureConfigDirectory().then(r => r);
    }

    async ensureConfigDirectory() {
        const directory = path.dirname(this.configPath);
        try {
            await fs.mkdir(directory, {recursive: true});
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    async saveParams(fheHelper) {
        // Chuyển đổi các tham số thành dạng có thể lưu trữ
        const configData = {
            publicKey: Buffer.from(fheHelper.publicKey.save()).toString('base64'),
            secretKey: Buffer.from(fheHelper.secretKey.save()).toString('base64'),
            params: Buffer.from(fheHelper.parms.save()).toString('base64'),
            // Thêm timestamp để theo dõi
            timestamp: new Date().toISOString(),
            version: '1.0'
        };

        // Lưu vào file với định dạng đẹp
        await fs.writeFile(
            this.configPath,
            JSON.stringify(configData, null, 2)
        );

        console.log(`FHE parameters saved to ${this.configPath}`);
    }

    async loadParams(fheHelper) {
        try {
            // Đọc file config
            const configContent = await fs.readFile(this.configPath, 'utf8');
            const configData = JSON.parse(configContent);

            // Khôi phục các tham số
            fheHelper.parms = fheHelper.seal.EncryptionParameters();
            fheHelper.parms.load(Buffer.from(configData.params, 'base64'));

            // Tạo context từ tham số
            fheHelper.context = fheHelper.seal.Context(
                fheHelper.parms,
                true,
                fheHelper.seal.SecurityLevel.tc128
            );

            // Khôi phục các khóa
            fheHelper.publicKey = fheHelper.seal.PublicKey();
            fheHelper.publicKey.load(
                fheHelper.context,
                Buffer.from(configData.publicKey, 'base64')
            );

            fheHelper.secretKey = fheHelper.seal.SecretKey();
            fheHelper.secretKey.load(
                fheHelper.context,
                Buffer.from(configData.secretKey, 'base64')
            );

            // Khởi tạo lại các công cụ mã hóa
            fheHelper.encryptor = fheHelper.seal.Encryptor(
                fheHelper.context,
                fheHelper.publicKey
            );
            fheHelper.decryptor = fheHelper.seal.Decryptor(
                fheHelper.context,
                fheHelper.secretKey
            );
            fheHelper.evaluator = fheHelper.seal.Evaluator(fheHelper.context);

            console.log(
                `FHE parameters loaded successfully from ${this.configPath}`,
                `(saved on ${configData.timestamp})`
            );

            return true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('No existing config file found, will create new parameters');
                return false;
            }
            throw error;
        }
    }
}

class FHEHelper {

    constructor(sealInstance) {
        this.seal = sealInstance;
        this.config = new FHEConfig();
    }

    async initialize() {
        // Thử tải tham số từ config
        const paramsLoaded = await this.config.loadParams(this);

        if (!paramsLoaded) {
            // Nếu không có config, tạo mới các tham số
            this.schemeType = this.seal.SchemeType.bfv;
            this.securityLevel = this.seal.SecurityLevel.tc128;
            this.polyModulusDegree = 4096;

            this.parms = this.seal.EncryptionParameters(this.schemeType);
            this.parms.setPolyModulusDegree(this.polyModulusDegree);

            const bitSizes = new Int32Array([36, 36, 37]);
            const coeffModulus = this.seal.CoeffModulus.Create(
                this.polyModulusDegree,
                bitSizes
            );
            this.parms.setCoeffModulus(coeffModulus);

            const plainModulus = this.seal.PlainModulus.Batching(
                this.polyModulusDegree,
                20
            );
            this.parms.setPlainModulus(plainModulus);

            this.context = this.seal.Context(
                this.parms,
                true,
                this.securityLevel
            );

            this.keyGenerator = this.seal.KeyGenerator(this.context);
            this.publicKey = this.keyGenerator.createPublicKey();
            this.secretKey = this.keyGenerator.secretKey();

            this.encryptor = this.seal.Encryptor(
                this.context,
                this.publicKey
            );
            this.decryptor = this.seal.Decryptor(
                this.context,
                this.secretKey
            );
            this.evaluator = this.seal.Evaluator(this.context);

            // Lưu các tham số mới vào config
            await this.config.saveParams(this);
        }
    }

    async encrypt(value) {
        try {
            // Tạo encoder để chuyển đổi số thành plaintext
            const encoder = this.seal.BatchEncoder(this.context);

            // Tạo plaintext từ giá trị số
            const plaintext = this.seal.PlainText();
            const int32Array = new Int32Array([parseInt(value)]);
            encoder.encode(int32Array, plaintext);

            // Tạo ciphertext và mã hóa
            const ciphertext = this.seal.CipherText();
            this.encryptor.encrypt(plaintext, ciphertext);

            // Chuyển thành buffer để lưu vào MongoDB
            return Buffer.from(ciphertext.save());
        } catch (error) {
            console.error('Encryption error:', error);
            throw error;
        }
    }

    async decrypt(encryptedData) {
        try {
            const ciphertext = this.seal.CipherText();
            ciphertext.load(this.context, encryptedData.toString());

            const plaintext = this.seal.PlainText();
            this.decryptor.decrypt(ciphertext, plaintext);

            const decodedArray = new Int32Array(this.seal.BatchEncoder(this.context).decode(plaintext));
            return decodedArray[0];
        } catch (error) {
            console.error('Decryption error:', error);
            throw error;
        }
    }

    async compareEqual(encryptedValue, searchValue) {
        try {
            // Create encoder for the search value
            const encoder = this.seal.BatchEncoder(this.context);

            // Encode the search value
            const searchPlaintext = this.seal.PlainText();
            const searchInt32Array = new Int32Array([parseInt(searchValue)]);
            encoder.encode(searchInt32Array, searchPlaintext);

            // Load the encrypted value from buffer
            const ciphertext = this.seal.CipherText();
            ciphertext.load(this.context, encryptedValue.toString());

            // Create ciphertext for the search value
            const searchCiphertext = this.seal.CipherText();
            this.encryptor.encrypt(searchPlaintext, searchCiphertext);

            // Perform subtraction: encryptedValue - searchValue
            // If result is 0, they are equal
            const resultCiphertext = this.seal.CipherText();
            this.evaluator.sub(ciphertext, searchCiphertext, resultCiphertext);

            // Decrypt the result
            const resultPlaintext = this.seal.PlainText();
            this.decryptor.decrypt(resultCiphertext, resultPlaintext);

            // Decode the result
            const resultArray = new Int32Array(encoder.decode(resultPlaintext));

            console.log('Comparison result:', resultArray);

            // If the difference is 0, the values are equal
            return resultArray[0] === 0;
        } catch (error) {
            console.error('Comparison error:', error);
            throw error;
        }
    }

    async findEqual(value) {
        try {
            // First encrypt the search value to ensure it's in the same format
            const searchEncrypted = await this.encrypt(value);

            return {
                searchValue: value,
                searchEncrypted: searchEncrypted
            };
        } catch (error) {
            console.error('Find equal preparation error:', error);
            throw error;
        }
    }
}

async function initialize() {
    try {
        const seal = await SEAL();
        console.log('SEAL initialized successfully');

        const fheHelper = new FHEHelper(seal);
        await fheHelper.initialize();
        console.log('FHE Helper initialized successfully');

        const uri = "mongodb+srv://vietdunghoanghust:123Qaz@cluster0.osxrt.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

        const client = await MongoClient.connect(uri, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true,
            }
        });
        const db = client.db('fhe_poc');
        console.log('MongoDB connected successfully');

        return {fheHelper, db};
    } catch (error) {
        console.error('Initialization error:', error);
        throw error;
    }
}

// Khởi tạo và setup routes
initialize().then(({fheHelper, db}) => {
    // Middleware to measure time and memory usage
    app.use((req, res, next) => {
        const startHrTime = process.hrtime();
        const startMemoryUsage = process.memoryUsage().heapUsed;

        res.on('finish', () => {
            const elapsedHrTime = process.hrtime(startHrTime);
            const elapsedTimeInMs = elapsedHrTime[0] * 1000 + elapsedHrTime[1] / 1e6;
            const endMemoryUsage = process.memoryUsage().heapUsed;
            const memoryUsageInKB = (endMemoryUsage - startMemoryUsage) / 1024;

            console.log(`${req.method} ${req.originalUrl} - ${elapsedTimeInMs.toFixed(3)} ms, ${memoryUsageInKB.toFixed(3)} KB`);
        });

        next();
    });

    // Route để lưu dữ liệu
    app.post('/store', async (req, res) => {
        try {
            const {value} = req.body;
            const encryptedValue = await fheHelper.encrypt(value);

            const result = await db.collection('encrypted_data').insertOne({
                // originalValue: value,  // Chỉ để demo
                encryptedValue: encryptedValue
            });

            res.json({
                success: true,
                id: result.insertedId
            });
        } catch (error) {
            console.error('Store error:', error);
            res.status(500).json({error: error.message});
        }
    });

    // Route để đọc dữ liệu
    app.get('/retrieve/:id', async (req, res) => {
        try {
            const {ObjectId} = require('mongodb');
            const doc = await db.collection('encrypted_data')
                .findOne({_id: new ObjectId(req.params.id)});

            if (!doc) {
                return res.status(404).json({error: 'Document not found'});
            }

            const decryptedValue = await fheHelper.decrypt(doc.encryptedValue);
            res.json({value: decryptedValue});
        } catch (error) {
            console.error('Retrieve error:', error);
            res.status(500).json({error: error.message});
        }
    });

    app.listen(3000, () => {
        console.log('FHE PoC server running on port 3000');
    });

    app.get('/search/:value', async (req, res) => {
        try {
            const searchValue = parseInt(req.params.value);
            const matches = [];

            // Get all encrypted records
            const cursor = await db.collection('encrypted_data').find({});
            const documents = await cursor.toArray();

            // Check each record
            for (const doc of documents) {
                const isMatch = await fheHelper.compareEqual(doc.encryptedValue, searchValue);
                if (isMatch) {
                    matches.push({
                        id: doc._id,
                        value: searchValue
                    });
                }
            }

            res.json({
                success: true,
                matches: matches,
                count: matches.length
            });
        } catch (error) {
            console.error('Search error:', error);
            res.status(500).json({error: error.message});
        }
    });
}).catch(console.error);