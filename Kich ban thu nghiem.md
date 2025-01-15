# Kịch bản thử nghiệm
Kết quả được đánh giá với script trong file: ```performance-test.js```
## Kết quả của hệ thống ban đầu khi chưa chỉnh sửa
```
    === Performance Test Report ===
    Timestamp: 2025-01-15T09:34:15.430Z
    Total Operations: 65
    
    Store Operations:
    Count: 50
    Success Rate: 100.00%
    Avg Time: 125.96ms
    Avg Memory: 129.03KB
    
    Retrieve Operations:
    Count: 10
    Success Rate: 100.00%
    Avg Time: 72.76ms
    Avg Memory: 85.85KB
    
    Search Operations:
    Count: 5
    Success Rate: 100.00%
    Avg Time: 52922.03ms
    Avg Memory: 79.58KB
```

   # Kịch bản sửa đổi đầu tiên
   Here’s an optimized implementation of the `/search` route using **batch processing** and **parallel execution** with `Promise.all`. This approach divides the dataset into smaller batches and processes them in parallel, significantly reducing overall latency.

### **Optimized `/search` Route Code**

```javascript
app.get('/search/:value', async (req, res) => {
    try {
        const searchValue = parseInt(req.params.value);
        const batchSize = 100; // Number of documents to process in each batch
        const matches = [];

        // Get all encrypted records
        const cursor = await db.collection('encrypted_data').find({});
        const documents = await cursor.toArray();

        // Divide documents into batches
        const batches = [];
        for (let i = 0; i < documents.length; i += batchSize) {
            batches.push(documents.slice(i, i + batchSize));
        }

        console.log(`Processing ${batches.length} batches...`);

        // Process each batch in parallel
        await Promise.all(
            batches.map(async (batch) => {
                for (const doc of batch) {
                    const isMatch = await fheHelper.compareEqual(doc.encryptedValue, searchValue);
                    if (isMatch) {
                        matches.push({
                            id: doc._id,
                            value: searchValue,
                        });
                    }
                }
            })
        );

        res.json({
            success: true,
            matches: matches,
            count: matches.length,
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: error.message });
    }
});

```

----------

### **Explanation**

1.  **Batching**:
    
    -   The documents retrieved from MongoDB are divided into batches of size `batchSize` (set to `100` in this example). This helps in distributing the workload across multiple parallel tasks.
2.  **Parallel Execution**:
    
    -   Each batch is processed in parallel using `Promise.all`. This leverages JavaScript’s asynchronous capabilities to improve performance.
3.  **Batch Processing**:
    
    -   For each document in a batch, the `compareEqual` function is called to perform the homomorphic comparison.
    -   If a match is found, the document’s ID and value are added to the `matches` array.
4.  **Response**:
    
    -   Once all batches are processed, the results are returned as a JSON response with:
        -   `matches`: Array of matching records.
        -   `count`: Total number of matches found.
### Kết quả:
```
    === Performance Test Report ===
    Timestamp: 2025-01-15T08:55:30.731Z
    Total Operations: 65
    
    Store Operations:
    Count: 50
    Success Rate: 100.00%
    Avg Time: 172.99ms
    Avg Memory: 29.01KB
    
    Retrieve Operations:
    Count: 10
    Success Rate: 100.00%
    Avg Time: 85.36ms
    Avg Memory: 85.74KB
    
    Search Operations:
    Count: 5
    Success Rate: 100.00%
    Avg Time: 41374.52ms
    Avg Memory: 80.53KB
```    
## Kịch bản thứ 2
1. **Search Performance (Critical)**
- Current average time: 17,466.20ms (17.5 seconds) per search
- This is extremely slow and needs immediate optimization
- Main improvement suggestions:
  ```javascript
  // 1. Add indexing for encrypted fields
  await db.collection('encrypted_data').createIndex({ encryptedValue: 1 });
  
  // 2. Implement batch processing for search
  async function batchSearchProcess(documents, searchValue, batchSize = 10) {
    const results = [];
    const batches = [];
    for (let i = 0; i < documents.length; i += batchSize) {
      batches.push(documents.slice(i, i + batchSize));
    }
    
    for (const batch of batches) {
      const batchPromises = batch.map(doc => 
        fheHelper.compareEqual(doc.encryptedValue, searchValue)
      );
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    return results;
  }
  ```

2. **Memory Management Issues**
- Negative memory usage (-481.61KB) in search operations indicates memory management problems
- Improvements needed:
  ```javascript
  // Add garbage collection triggers
  class FHEHelper {
    async compareEqual(encryptedValue, searchValue) {
      try {
        const result = // existing comparison code
        global.gc(); // Force garbage collection after heavy operations
        return result;
      } catch (error) {
        throw error;
      }
    }
  }
  
  // Enable garbage collection when running Node
  // node --expose-gc your-script.js
  ```

3. **Storage Operation Optimization**
- Current average time: 110.35ms
- Can be improved with:
  ```javascript
  // 1. Implement bulk operations
  class FHEHelper {
    async bulkEncrypt(values) {
      const encryptedValues = await Promise.all(
        values.map(value => this.encrypt(value))
      );
      return encryptedValues;
    }
  }
  
  // 2. Add caching layer
  const NodeCache = require('node-cache');
  const cache = new NodeCache({ stdTTL: 600 }); // 10 minutes TTL
  
  app.post('/store', async (req, res) => {
    const cacheKey = `value_${req.body.value}`;
    if (cache.has(cacheKey)) {
      return res.json(cache.get(cacheKey));
    }
    // ... existing store logic
  });
  ```

4. **Retrieval Operation Enhancements**
- Current average time: 77.20ms
- Optimization suggestions:
  ```javascript
  // 1. Implement caching for frequently accessed values
  const cache = new NodeCache({ stdTTL: 600 });
  
  app.get('/retrieve/:id', async (req, res) => {
    const cacheKey = `doc_${req.params.id}`;
    
    // Check cache first
    const cachedValue = cache.get(cacheKey);
    if (cachedValue) {
      return res.json(cachedValue);
    }
    
    // Existing retrieval logic
    const doc = await db.collection('encrypted_data').findOne({
      _id: new ObjectId(req.params.id)
    });
    
    const decryptedValue = await fheHelper.decrypt(doc.encryptedValue);
    
    // Cache the result
    cache.set(cacheKey, { value: decryptedValue });
    
    res.json({ value: decryptedValue });
  });
  ```

5. **System-wide Improvements**
```javascript
// 1. Add connection pooling for MongoDB
const mongoOptions = {
  maxPoolSize: 50,
  minPoolSize: 10,
  maxIdleTimeMS: 30000
};

// 2. Implement request rate limiting
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use(limiter);

// 3. Add performance monitoring
const prometheus = require('prom-client');
const searchDuration = new prometheus.Histogram({
  name: 'fhe_search_duration_seconds',
  help: 'Duration of FHE search operations'
});
```

6. **Configuration Optimizations**
```javascript
// Optimize SEAL parameters for better performance
class FHEHelper {
  constructor(seal) {
    // Adjust parameters for better performance
    const polyModulusDegree = 8192; // Increased from 4096
    const bitSizes = [40, 40, 40]; // Adjusted bit sizes
    
    this.parms.setPolyModulusDegree(polyModulusDegree);
    this.parms.setCoeffModulus(
      seal.CoeffModulus.Create(polyModulusDegree, bitSizes)
    );
  }
}
```

Implementation Priority:
1. Fix search performance (highest priority due to 17.5s average time)
2. Resolve memory management issues
3. Implement caching system
4. Add MongoDB indexing
5. Optimize SEAL parameters
6. Add monitoring and rate limiting

## Kết quả
```
    === Performance Test Report ===
    Timestamp: 2025-01-15T09:28:16.073Z
    Total Operations: 65
    
    Store Operations:
    Count: 50
    Success Rate: 100.00%
    Avg Time: 115.19ms
    Avg Memory: 129.03KB
    
    Retrieve Operations:
    Count: 10
    Success Rate: 100.00%
    Avg Time: 73.64ms
    Avg Memory: 85.83KB
    
    Search Operations:
    Count: 5
    Success Rate: 100.00%
    Avg Time: 43151.66ms
    Avg Memory: 80.40KB
    
```