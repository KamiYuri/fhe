"use strict";

const axios = require('axios');
const { performance } = require('perf_hooks');

const BASE_URL = 'http://localhost:3000';
const TEST_VALUE = 42; // Example test value
const NUM_REQUESTS = 10; // Number of requests for each route

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

    // Test the /store route
    console.log("Testing /store route...");
    await measurePerformance('/store', 'POST', { value: TEST_VALUE });

    // Test the /retrieve route (Assuming ID 1 exists)
    console.log("Testing /retrieve route...");
    const dummyId = "000000000000000000000001"; // Replace with a real ID in your database
    await measurePerformance(`/retrieve/${dummyId}`, 'GET');

    // Test the /search route
    console.log("Testing /search route...");
    await measurePerformance(`/search/${TEST_VALUE}`, 'GET');

    console.log("Performance evaluation completed.");
}

runPerformanceTests().catch(console.error);
