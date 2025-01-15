const axios = require('axios');
const { performance } = require('perf_hooks');
const fs = require('fs').promises;

class PerformanceTest {
    constructor(baseUrl = 'http://localhost:3000') {
        this.baseUrl = baseUrl;
        this.results = [];
        // Add manual GC trigger between operations
        if (global.gc) {
            this.gc = global.gc;
        } else {
            console.warn('Garbage collection unavailable. Run with --expose-gc flag');
            this.gc = () => {};
        }
    }

    async measureOperation(name, operation) {
        // Trigger GC before measurement
        this.gc();
        
        const startMemory = process.memoryUsage().heapUsed;
        const startTime = performance.now();
        
        try {
            const result = await operation();
            const endTime = performance.now();
            const endMemory = process.memoryUsage().heapUsed;
            
            // Trigger GC after operation
            this.gc();
            
            const metrics = {
                name,
                success: true,
                timeMs: endTime - startTime,
                memoryKB: (endMemory - startMemory) / 1024,
                timestamp: new Date().toISOString(),
                result
            };
            
            this.results.push(metrics);
            return metrics;
        } catch (error) {
            this.gc();  // Cleanup on error
            const metrics = {
                name,
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
            
            this.results.push(metrics);
            return metrics;
        }
    }

    async storeValue(value) {
        return this.measureOperation(`Store Value: ${value}`, async () => {
            const response = await axios.post(`${this.baseUrl}/store`, { value });
            return response.data;
        });
    }

    async retrieveValue(id) {
        return this.measureOperation(`Retrieve Value (ID: ${id})`, async () => {
            const response = await axios.get(`${this.baseUrl}/retrieve/${id}`);
            return response.data;
        });
    }

    async searchValue(value) {
        return this.measureOperation(`Search Value: ${value}`, async () => {
            const response = await axios.get(`${this.baseUrl}/search/${value}`);
            return response.data;
        });
    }

    async runBatchTest(testSize = 100) {
        console.log(`Starting batch test with size ${testSize}`);
        
        // Store Operation Tests
        console.log('\nRunning storage tests...');
        const storedIds = [];
        for (let i = 0; i < testSize; i++) {
            const value = Math.floor(Math.random() * 1000);
            const result = await this.storeValue(value);
            if (result.success && result.result.id) {
                storedIds.push({
                    id: result.result.id,
                    value
                });
            }
        }

        // Retrieval Operation Tests
        console.log('\nRunning retrieval tests...');
        for (const stored of storedIds.slice(0, Math.min(10, storedIds.length))) {
            await this.retrieveValue(stored.id);
        }

        // Search Operation Tests
        console.log('\nRunning search tests...');
        for (const stored of storedIds.slice(0, Math.min(5, storedIds.length))) {
            await this.searchValue(stored.value);
        }

        return this.generateReport();
    }

    calculateStats(operations) {
        const times = operations.map(op => op.timeMs);
        const memories = operations.map(op => op.memoryKB);
        
        return {
            count: operations.length,
            time: {
                avg: times.reduce((a, b) => a + b, 0) / operations.length,
                min: Math.min(...times),
                max: Math.max(...times)
            },
            memory: {
                avg: memories.reduce((a, b) => a + b, 0) / operations.length,
                min: Math.min(...memories),
                max: Math.max(...memories)
            },
            successRate: (operations.filter(op => op.success).length / operations.length) * 100
        };
    }

    async generateReport() {
        const storeOps = this.results.filter(r => r.name.startsWith('Store'));
        const retrieveOps = this.results.filter(r => r.name.startsWith('Retrieve'));
        const searchOps = this.results.filter(r => r.name.startsWith('Search'));

        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalOperations: this.results.length,
                store: this.calculateStats(storeOps),
                retrieve: this.calculateStats(retrieveOps),
                search: this.calculateStats(searchOps)
            },
            detailedResults: this.results
        };

        // Save report to file
        const filename = `performance-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        await fs.writeFile(filename, JSON.stringify(report, null, 2));
        
        return report;
    }

    printReport(report) {
        console.log('\n=== Performance Test Report ===');
        console.log(`Timestamp: ${report.timestamp}`);
        console.log(`Total Operations: ${report.summary.totalOperations}`);
        
        console.log('\nStore Operations:');
        console.log(`Count: ${report.summary.store.count}`);
        console.log(`Success Rate: ${report.summary.store.successRate.toFixed(2)}%`);
        console.log(`Avg Time: ${report.summary.store.time.avg.toFixed(2)}ms`);
        console.log(`Avg Memory: ${report.summary.store.memory.avg.toFixed(2)}KB`);
        
        console.log('\nRetrieve Operations:');
        console.log(`Count: ${report.summary.retrieve.count}`);
        console.log(`Success Rate: ${report.summary.retrieve.successRate.toFixed(2)}%`);
        console.log(`Avg Time: ${report.summary.retrieve.time.avg.toFixed(2)}ms`);
        console.log(`Avg Memory: ${report.summary.retrieve.memory.avg.toFixed(2)}KB`);
        
        console.log('\nSearch Operations:');
        console.log(`Count: ${report.summary.search.count}`);
        console.log(`Success Rate: ${report.summary.search.successRate.toFixed(2)}%`);
        console.log(`Avg Time: ${report.summary.search.time.avg.toFixed(2)}ms`);
        console.log(`Avg Memory: ${report.summary.search.memory.avg.toFixed(2)}KB`);
    }
    async printReportToFile(report, filename = 'performance-report.txt') {
        const reportContent = `
    === Performance Test Report ===
    Timestamp: ${report.timestamp}
    Total Operations: ${report.summary.totalOperations}
    
    Store Operations:
    Count: ${report.summary.store.count}
    Success Rate: ${report.summary.store.successRate.toFixed(2)}%
    Avg Time: ${report.summary.store.time.avg.toFixed(2)}ms
    Avg Memory: ${report.summary.store.memory.avg.toFixed(2)}KB
    
    Retrieve Operations:
    Count: ${report.summary.retrieve.count}
    Success Rate: ${report.summary.retrieve.successRate.toFixed(2)}%
    Avg Time: ${report.summary.retrieve.time.avg.toFixed(2)}ms
    Avg Memory: ${report.summary.retrieve.memory.avg.toFixed(2)}KB
    
    Search Operations:
    Count: ${report.summary.search.count}
    Success Rate: ${report.summary.search.successRate.toFixed(2)}%
    Avg Time: ${report.summary.search.time.avg.toFixed(2)}ms
    Avg Memory: ${report.summary.search.memory.avg.toFixed(2)}KB
    `;
    
        await fs.writeFile(filename, reportContent, 'utf8');
        console.log(`Report saved to ${filename}`);
    }
    
}

// Example usage
async function runPerformanceTest() {
    const tester = new PerformanceTest();
    console.log('Starting performance test...');
    const report = await tester.runBatchTest(50); // Test with 50 operations
    tester.printReport(report);
    await tester.printReportToFile(report, 'performance-report.txt'); // Save to txt file
}

// Run the test
runPerformanceTest().catch(console.error);