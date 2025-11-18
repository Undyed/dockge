#!/usr/bin/env tsx
/**
 * Test Docker connection and compatibility
 * This script tests the new Docker client implementation
 */

import { DockerClient } from "../backend/docker-client";

async function testDockerConnection() {
    console.log("🐋 Testing Docker Connection...\n");

    const dockerClient = DockerClient.getInstance();

    // Test 1: Check Docker availability
    console.log("1️⃣ Checking Docker availability...");
    const isAvailable = await dockerClient.isDockerAvailable();
    if (isAvailable) {
        console.log("✅ Docker is available\n");
    } else {
        console.log("❌ Docker is not available\n");
        process.exit(1);
    }

    // Test 2: Get Docker version
    console.log("2️⃣ Getting Docker version...");
    const versionInfo = await dockerClient.getVersion();
    console.log(`✅ Docker Version: ${versionInfo.version}`);
    console.log(`✅ API Version: ${versionInfo.apiVersion}\n`);

    // Test 3: Get network list
    console.log("3️⃣ Getting Docker networks...");
    const networks = await dockerClient.getNetworkList();
    console.log(`✅ Found ${networks.length} networks:`);
    networks.forEach((network) => {
        console.log(`   - ${network}`);
    });
    console.log();

    // Test 4: Test compose command
    console.log("4️⃣ Testing Docker Compose command...");
    try {
        const result = await dockerClient.composeExec([ "version" ], process.cwd());
        if (result.stdout) {
            console.log("✅ Docker Compose is working");
            console.log(`   Version output: ${result.stdout.toString().trim()}\n`);
        }
    } catch (e) {
        if (e instanceof Error) {
            console.log(`⚠️  Docker Compose test failed: ${e.message}\n`);
        }
    }

    console.log("🎉 All tests completed!");
}

testDockerConnection().catch((e) => {
    console.error("❌ Test failed:", e);
    process.exit(1);
});
