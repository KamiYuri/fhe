"use strict";

const axios = require('axios');
const { performance } = require('perf_hooks');

const BASE_URL = 'http://localhost:3000';
const TEST_VALUE = 42; // Example test value
const NUM_REQUESTS = 10; // Number of requests for each route

async function storeAndRetrieveId() {
    console.log("Storing a test value to verify document existence...");
    try {
        const response = await axios.post(`${BASE_URL}/store`, { value: TEST_VALUE });
        const insertedId = response.data.id;
        console.log(`Document stored successfully with ID: ${insertedId}`);
        return insertedId;
    } catch (error) {
        console.error("Error storing document:", error.message);
        process.exit(1); // Exit if storing fails
    }
}

async function measurePerformance(route, method, payload = {}) {
    let totalTime = 0;
    let memoryUsageBefore = process.memoryUsage().heapUsed / 1024 / 1024;
    let cpuUsageBefore = process.cpuUsage();

    for (let i = 0; i < NUM_REQUESTS; i++) {
        const startTime = performance.now();
        try {
            if (method === 'POST') {
                await axios.post(`${BASE_URL}${route}`, payload);
            } else if (method === 'GET') {
                await axios.get(`${BASE_URL}${route}`);
            }
        } catch (error) {
            console.error(`Error during ${method} request to ${route}:`, error.message);
        }
        const endTime = performance.now();
        totalTime += endTime - startTime;
    }

    let memoryUsageAfter = process.memoryUsage().heapUsed / 1024 / 1024;
    let cpuUsageAfter = process.cpuUsage(cpuUsageBefore);

    console.log(`Performance for ${method} ${route}:`);
    console.log(`  Average response time: ${(totalTime / NUM_REQUESTS).toFixed(3)} ms`);
    console.log(`  Memory usage increase: ${(memoryUsageAfter - memoryUsageBefore).toFixed(3)} MB`);
    console.log(`  CPU time: ${cpuUsageAfter.user / 1000} ms (user), ${cpuUsageAfter.system / 1000} ms (system)\n`);
}

async function runPerformanceTests() {
    console.log("Starting performance evaluation...\n");

    // Store a document and retrieve its ID
    const documentId = await storeAndRetrieveId();

    // Test the /store route
    console.log("Testing /store route...");
    await measurePerformance('/store', 'POST', { value: TEST_VALUE });

    // Test the /retrieve route with the retrieved document ID
    console.log("Testing /retrieve route...");
    await measurePerformance(`/retrieve/${documentId}`, 'GET');

    // Test the /search route
    console.log("Testing /search route...");
    await measurePerformance(`/search/${TEST_VALUE}`, 'GET');

    console.log("Performance evaluation completed.");
}

runPerformanceTests().catch(console.error);
