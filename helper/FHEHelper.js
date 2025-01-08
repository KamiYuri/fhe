class FHEHelper {
    constructor(seal) {
        // Khởi tạo các tham số cho FHE
        const schemeType = seal.SchemeType.bfv;
        const securityLevel = seal.SecurityLevel.tc128;
        const polyModulusDegree = 4096;
        const bitSizes = [36, 36, 37];

        this.parms = seal.EncryptionParameters(schemeType);
        this.parms.setPolyModulusDegree(polyModulusDegree);
        this.parms.setCoeffModulus(
            seal.CoeffModulus.Create(polyModulusDegree, bitSizes)
        );
        this.parms.setPlainModulus(seal.PlainModulus.Batching(polyModulusDegree, 20));

        this.context = seal.Context(this.parms);

        // Tạo keys
        this.keyGenerator = seal.KeyGenerator(this.context);
        this.publicKey = this.keyGenerator.createPublicKey();
        this.secretKey = this.keyGenerator.secretKey();

        this.encryptor = seal.Encryptor(this.context, this.publicKey);
        this.decryptor = seal.Decryptor(this.context, this.secretKey);
    }

    // Mã hóa một số
    async encrypt(value) {
        const plaintext = this.seal.PlainText();
        plaintext.setText(value.toString());
        const ciphertext = this.seal.CipherText();
        this.encryptor.encrypt(plaintext, ciphertext);
        return ciphertext.save();  // Chuyển thành buffer để lưu vào MongoDB
    }

    // Giải mã một số
    async decrypt(encryptedBuffer) {
        const ciphertext = this.seal.CipherText();
        ciphertext.load(this.context, encryptedBuffer);
        const plaintext = this.seal.PlainText();
        this.decryptor.decrypt(ciphertext, plaintext);
        return parseInt(plaintext.getText());
    }
}