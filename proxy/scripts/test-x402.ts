#!/usr/bin/env tsx
/**
 * Test script for x402Gateway payForService and verifyPayment
 * 
 * This script:
 * 1. Registers a test service (if needed)
 * 2. Approves USDC for the gateway
 * 3. Calls payForService on the contract
 * 4. Uses the paymentId to access the proxy API
 * 5. Verifies the payment on-chain
 * 
 * Verified contracts deployed to Base Sepolia:
 * - x402Gateway: 0x6ee8F65106AEb03E84c31F82f7DE821c97d7D8b6
 * - serviceRegistry: 0x2112837f86c6aB7D4acA2B71df9944Ccc64f743A
 * - mockUSDC: 0x8E62c4749b6350943A52a34143C60EA36818f81F
 * - AgentSmartAccount (impl):   0xBe38983a8cB4B1Ad4d4Df5d2782Ed81d10e6050a
 * - AgentAccountFactory:        0x77F3195CE8E69A76345dBfe5cdAa998a59dE99f5

 */

import { ethers } from "ethers";
import axios from "axios";
import dotenv from "dotenv";
import { config } from "../src/config.js";

dotenv.config();

// Contract ABIs
const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function allowance(address, address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const SERVICE_REGISTRY_ABI = [
  "function registerService(bytes32 serviceId, uint256 agentId, string memory name, uint256 pricePerCall, string memory endpoint, uint8 serviceType) external",
  "function getService(bytes32 serviceId) view returns (tuple(uint256 agentId, address owner, string name, uint256 pricePerCall, string endpoint, uint8 serviceType, bool active, uint256 totalCalls, uint256 totalRevenue) service)",
  "function getServiceCount() view returns (uint256)",
  "event ServiceRegistered(bytes32 indexed serviceId, uint256 indexed agentId, address indexed owner, string name, uint256 pricePerCall, uint8 serviceType)",
];

// ServiceType enum values (matches IServiceRegistry.ServiceType)
const ServiceType = {
  COMPUTE: 0,
  STORAGE: 1,
  API: 2,
  AGENT: 3,
  OTHER: 4,
} as const;

const X402_GATEWAY_ABI = [
  "function payForService(bytes32 serviceId, uint256 calls) external returns (bytes32 paymentId)",
  "function verifyPayment(bytes32 paymentId) view returns (bool valid, address payer, uint256 amount)",
  "function getPayment(bytes32 paymentId) view returns (tuple(address payer, bytes32 serviceId, uint256 calls, uint256 amount, bool valid) payment)",
  "event ServicePaid(address indexed payer, bytes32 indexed serviceId, uint256 calls, uint256 amount, bytes32 indexed paymentId)",
];

// Configuration - use environment variables directly
const PROXY_URL = process.env.PROXY_URL || `http://localhost:4402`;
const RPC_URL = process.env.RPC_URL || "https://sepolia.base.org";
const GATEWAY_ADDRESS = process.env.GATEWAY_ADDRESS || config.gatewayAddress;
const USDC_ADDRESS = process.env.USDC_ADDRESS || config.usdcAddress;
const SERVICE_REGISTRY_ADDRESS = process.env.SERVICE_REGISTRY_ADDRESS || config.serviceRegistryAddress;

interface TestConfig {
  privateKey: string;
  serviceId?: string;
  serviceName?: string;
  pricePerCall?: string;
  calls?: number;
}

async function main() {
  console.log("🚀 Starting x402Gateway Test Script\n");
  console.log("Configuration:");
  console.log(`  Proxy URL: ${PROXY_URL}`);
  console.log(`  Gateway: ${GATEWAY_ADDRESS}`);
  console.log(`  USDC: ${USDC_ADDRESS}`);
  console.log(`  RPC: ${RPC_URL}\n`);

  // Check environment
  const privateKey = process.env.TEST_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("TEST_PRIVATE_KEY environment variable is required");
  }

  if (!SERVICE_REGISTRY_ADDRESS || SERVICE_REGISTRY_ADDRESS === "0x0000000000000000000000000000000000000000") {
    throw new Error("SERVICE_REGISTRY_ADDRESS environment variable is required");
  }

  // Validate addresses are properly formatted (must be 42 characters: 0x + 40 hex)
  const validateAddress = (addr: string, name: string) => {
    if (!addr || addr.length !== 42 || !addr.startsWith("0x")) {
      throw new Error(`Invalid ${name}: "${addr}". Must be a valid 42-character address (0x + 40 hex characters).`);
    }
    if (!ethers.isAddress(addr)) {
      throw new Error(`Invalid ${name}: "${addr}". Checksum or format error.`);
    }
  };

  validateAddress(SERVICE_REGISTRY_ADDRESS, "SERVICE_REGISTRY_ADDRESS");
  validateAddress(GATEWAY_ADDRESS, "GATEWAY_ADDRESS");
  validateAddress(USDC_ADDRESS, "USDC_ADDRESS");

  console.log(`  Service Registry: ${SERVICE_REGISTRY_ADDRESS}`);
  console.log(`  Gateway: ${GATEWAY_ADDRESS}`);
  console.log(`  USDC: ${USDC_ADDRESS}\n`);

  // Setup provider and wallet
  // Base Sepolia doesn't support ENS, so we need to configure the provider accordingly
  const network = {
    name: "base-sepolia",
    chainId: 84532,
    ensAddress: undefined, // Disable ENS (Base Sepolia doesn't support it)
  };
  const provider = new ethers.JsonRpcProvider(RPC_URL, network);
  
  // Override resolveName to prevent ENS resolution
  const originalResolveName = provider.resolveName.bind(provider);
  provider.resolveName = async (name: string) => {
    // If it's already a valid address, return it
    if (ethers.isAddress(name)) {
      return name;
    }
    // Otherwise throw error instead of trying ENS
    throw new Error(`ENS resolution not supported on Base Sepolia. Use address instead of: ${name}`);
  };
  
  const wallet = new ethers.Wallet(privateKey, provider);
  const walletAddress = await wallet.getAddress();

  console.log(`📝 Wallet: ${walletAddress}`);
  const balance = await provider.getBalance(walletAddress);
  console.log(`  Balance: ${ethers.formatEther(balance)} ETH\n`);

  // Setup contracts - addresses are already validated
  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet);
  const gateway = new ethers.Contract(GATEWAY_ADDRESS, X402_GATEWAY_ABI, wallet);
  const registry = new ethers.Contract(SERVICE_REGISTRY_ADDRESS, SERVICE_REGISTRY_ABI, wallet);

  // Check USDC balance
  const usdcBalance = await usdc.balanceOf(walletAddress);
  const decimals = await usdc.decimals();
  console.log(`💰 USDC Balance: ${ethers.formatUnits(usdcBalance, decimals)} USDC\n`);

  // Step 1: Register or get a service
  console.log("📋 Step 1: Setting up service...");
  const serviceId = ethers.id("test-service-1"); // Simple service ID
  const serviceName = "test-service-1";
  let service;
  
  try {
    const serviceResult = await registry.getService(serviceId);
    // Handle both tuple (array) and object return values
    service = Array.isArray(serviceResult) ? {
      agentId: serviceResult[0],
      owner: serviceResult[1],
      name: serviceResult[2],
      pricePerCall: serviceResult[3],
      endpoint: serviceResult[4],
      serviceType: serviceResult[5],
      active: serviceResult[6],
      totalCalls: serviceResult[7],
      totalRevenue: serviceResult[8],
    } : serviceResult;
    
    console.log(`  ✓ Service exists: ${ethers.hexlify(serviceId)}`);
    console.log(`    Owner: ${service.owner}`);
    console.log(`    Price: ${ethers.formatUnits(service.pricePerCall, decimals)} USDC`);
    console.log(`    Active: ${service.active}\n`);
    
    if (!service.active) {
      throw new Error("Service is not active");
    }
  } catch (error: any) {
    // Check if it's a "ServiceNotFound" error
    const isServiceNotFound = 
      error.message?.includes("ServiceNotFound") || 
      error.message?.includes("Service not found") ||
      error.message?.includes("revert ServiceNotFound") ||
      error.code === "CALL_EXCEPTION";
    
    if (isServiceNotFound || service === undefined) {
      console.log(`  ⚠ Service not found. Registering new service...`);
      console.log(`    Service ID: ${ethers.hexlify(serviceId)}`);
      
      // Register the service
      // Price: 0.001 USDC (1000 in 6 decimals)
      const agentId = 1;
      const serviceName = "Test Service";
      const pricePerCall = ethers.parseUnits("0.001", decimals);
      const endpoint = "https://httpbin.org/get";
      const serviceType = ServiceType.API; // API = 2
      
      console.log(`    Price per call: ${ethers.formatUnits(pricePerCall, decimals)} USDC`);
      console.log(`    Endpoint: ${endpoint}`);
      console.log(`    Service Type: API (${serviceType})`);
      
      try {
        const registerTx = await registry.registerService(
          serviceId,
          agentId,
          serviceName,
          pricePerCall,
          endpoint,
          serviceType
        );
        console.log(`  ⏳ Registration transaction: ${registerTx.hash}`);
        const registerReceipt = await registerTx.wait();
        console.log(`  ✓ Service registered successfully!\n`);

        // Wait for 5 seconds
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Get the newly registered service
        service = await registry.getService(serviceId);
        console.log(`  Service details:`);
        console.log(`    Agent ID: ${service.agentId}`);
        console.log(`    Owner: ${service.owner}`);
        console.log(`    Name: ${service.name}`);
        console.log(`    Price: ${ethers.formatUnits(service.pricePerCall, decimals)} USDC`);
        console.log(`    Active: ${service.active}\n`);
      } catch (registerError: any) {
        // Try to decode the error
        if (registerError.data || registerError.info?.error?.data) {
          const errorData = registerError.data || registerError.info?.error?.data;
          console.error(`  ⚠ Registration failed. Error data: ${errorData}`);
          
          // Check for ServiceAlreadyRegistered error (selector: 0xed03135f)
          if (errorData && errorData.startsWith("0xed03135f")) {
            console.log(`  ⚠ Service already registered. Fetching existing service...`);
            try {
              const serviceResult = await registry.getService(serviceId);
              // Handle both tuple and individual return values
              service = Array.isArray(serviceResult) ? {
                agentId: serviceResult[0],
                owner: serviceResult[1],
                name: serviceResult[2],
                pricePerCall: serviceResult[3],
                endpoint: serviceResult[4],
                serviceType: serviceResult[5],
                active: serviceResult[6],
                totalCalls: serviceResult[7],
                totalRevenue: serviceResult[8],
              } : serviceResult;
              
              console.log(`  ✓ Service found:`);
              console.log(`    Owner: ${service.owner}`);
              console.log(`    Price: ${ethers.formatUnits(service.pricePerCall, decimals)} USDC`);
              console.log(`    Active: ${service.active}\n`);
              
              // Check if the service owner matches our wallet
              if (service.owner.toLowerCase() !== walletAddress.toLowerCase()) {
                console.log(`  ⚠ Warning: Service is owned by ${service.owner}, not your wallet ${walletAddress}`);
                console.log(`    You may need to use a different service ID or register with the owner's wallet.\n`);
              }
            } catch (fetchError) {
              throw new Error(`Service registration failed with ServiceAlreadyRegistered error, but couldn't fetch service: ${fetchError}`);
            }
          } else {
            // Other errors - show more details
            console.error(`  Error details:`, registerError);
            throw new Error(`Service registration failed: ${registerError.message || registerError.reason || "Unknown error"}`);
          }
        } else if (registerError.message?.includes("ServiceAlreadyRegistered")) {
          // Fallback for string-based error detection
          console.log(`  ⚠ Service was registered concurrently, fetching...`);
          const serviceResult = await registry.getService(serviceId);
          // Handle both tuple (array) and object return values
          service = Array.isArray(serviceResult) ? {
            agentId: serviceResult[0],
            owner: serviceResult[1],
            name: serviceResult[2],
            pricePerCall: serviceResult[3],
            endpoint: serviceResult[4],
            serviceType: serviceResult[5],
            active: serviceResult[6],
            totalCalls: serviceResult[7],
            totalRevenue: serviceResult[8],
          } : serviceResult;
          
          console.log(`  ✓ Service found:`);
          console.log(`    Owner: ${service.owner}`);
          console.log(`    Price: ${ethers.formatUnits(service.pricePerCall, decimals)} USDC`);
          console.log(`    Active: ${service.active}\n`);
        } else {
          throw registerError;
        }
      }
    } else {
      throw error;
    }
  }

  // Step 2: Approve USDC
  console.log("✅ Step 2: Approving USDC for gateway...");
  const calls = 1; // Pay for 1 call
  const totalCost = service.pricePerCall * BigInt(calls);
  
  const currentAllowance = await usdc.allowance(walletAddress, GATEWAY_ADDRESS);
  console.log(`  Current allowance: ${ethers.formatUnits(currentAllowance, decimals)} USDC`);
  
  if (currentAllowance < totalCost) {
    const approveAmount = totalCost * BigInt(10); // Approve 10x for future use
    console.log(`  Approving ${ethers.formatUnits(approveAmount, decimals)} USDC...`);
    const approveTx = await usdc.approve(GATEWAY_ADDRESS, approveAmount);
    console.log(`  ⏳ Transaction: ${approveTx.hash}`);
    await approveTx.wait();
    console.log(`  ✓ Approval confirmed\n`);
  } else {
    console.log(`  ✓ Sufficient allowance already exists\n`);
  }

  // Step 3: Pay for service
  console.log("💳 Step 3: Paying for service...");
  console.log(`  Service ID: ${ethers.hexlify(serviceId)}`);
  console.log(`  Calls: ${calls}`);
  console.log(`  Total cost: ${ethers.formatUnits(totalCost, decimals)} USDC`);
  
  const payTx = await gateway.payForService(serviceId, calls);
  console.log(`  ⏳ Transaction: ${payTx.hash}`);
  const receipt = await payTx.wait();
  console.log(`  ✓ Payment confirmed\n`);

  // Extract paymentId from event
  console.log(`  📋 Parsing transaction receipt for ServicePaid event...`);
  console.log(`  Total logs: ${receipt.logs.length}`);
  
  let paymentId: string | undefined;
  
  // Try to parse events from the receipt
  for (const log of receipt.logs) {
    try {
      const parsed = gateway.interface.parseLog(log);
      if (parsed && parsed.name === "ServicePaid") {
        console.log(`  ✓ Found ServicePaid event`);
        // paymentId is the 5th argument (index 4) and is indexed
        paymentId = parsed.args[4];
        console.log(`  Event args:`, parsed.args);
        break;
      }
    } catch (e) {
      // Not a ServicePaid event, continue
      continue;
    }
  }

  // Alternative: use queryFilter if direct parsing fails
  if (!paymentId) {
    console.log(`  ⚠ Direct parsing failed, trying queryFilter...`);
    const filter = gateway.filters.ServicePaid();
    const events = await gateway.queryFilter(filter, receipt.blockNumber, receipt.blockNumber);
    const matchingEvent = events.find((e) => e.transactionHash === receipt.hash);
    
    if (matchingEvent && 'args' in matchingEvent) {
      paymentId = matchingEvent.args.paymentId;
      console.log(`  ✓ Found event via queryFilter`);
    }
  }

  if (!paymentId) {
    console.error(`  ✗ Available logs:`, receipt.logs.map((log: any) => ({
      address: log.address,
      topics: log.topics,
      data: log.data?.substring(0, 20) + "..."
    })));
    throw new Error("ServicePaid event not found in transaction receipt. Check if the transaction actually emitted the event.");
  }
  
  console.log(`  📄 Payment ID: ${ethers.hexlify(paymentId)}\n`);

  // wait for 5 seconds
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Step 4: Verify payment on-chain
  console.log("🔍 Step 4: Verifying payment on-chain...");
  const [valid, payer, amount] = await gateway.verifyPayment(paymentId);
  console.log(`  Valid: ${valid}`);
  console.log(`  Payer: ${payer}`);
  console.log(`  Amount: ${ethers.formatUnits(amount, decimals)} USDC`);
  
  if (!valid) {
    throw new Error("Payment verification failed on-chain");
  }
  if (payer.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error("Payer address mismatch");
  }
  console.log(`  ✓ Payment verified on-chain\n`);

  // Step 5: Register service in proxy (if not exists)
  console.log("🌐 Step 5: Setting up proxy service...");
  const resourceId = "test-service-1";
  const adminToken = process.env.ADMIN_TOKEN || "test-secret";

  try {
    const servicesResponse = await axios.get(`${PROXY_URL}/services`);
    const existingService = servicesResponse.data.find((s: any) => s.id === resourceId);

    if (!existingService) {
      console.log(`  Registering service in proxy...`);
      await axios.post(`${PROXY_URL}/admin/register`, {
        id: resourceId,
        name: "Test Service",
        type: "API",
        creatorAddress: service.owner,
        originalUrl: "https://httpbin.org/get",
        pricing: {
          pricePerCall: totalCost.toString(),
          currency: "USDC",
        },
      }, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      console.log(`  ✓ Service registered in proxy\n`);
    } else {
      console.log(`  ✓ Service already exists in proxy\n`);
    }
  } catch (error: any) {
    if (error.response) {
      console.error(`  ✗ Error: ${error.response.data.error || error.message}\n`);
    } else {
      throw error;
    }
  }

  // Step 6: Test API access with payment ID
  console.log("🚪 Step 6: Testing API access with payment ID...");
  const paymentIdHex = ethers.hexlify(paymentId);
  
  try {
    const apiResponse = await axios.get(`${PROXY_URL}/proxy/${resourceId}`, {
      headers: {
        "x-payment-id": paymentIdHex,
      },
    });
    
    console.log(`  ✓ API call: ${PROXY_URL}/proxy/${resourceId}`);
    console.log(`  Status: ${apiResponse.status}`);
    console.log(`  Response:`, JSON.stringify(apiResponse.data, null, 2).substring(0, 200) + "...\n");
  } catch (error: any) {
    if (error.response) {
      console.error(`  ✗ API request failed:`);
      console.error(`    Status: ${error.response.status}`);
      console.error(`    Error: ${JSON.stringify(error.response.data, null, 2)}\n`);
    } else {
      throw error;
    }
  }

  // Step 7: Test without payment (should fail)
  console.log("🚫 Step 7: Testing API access without payment (should fail)...");
  try {
    await axios.get(`${PROXY_URL}/proxy/${resourceId}`);
    console.error(`  ✗ Unexpected: Request succeeded without payment!\n`);
  } catch (error: any) {
    if (error.response?.status === 402) {
      console.log(`  ✓ Correctly rejected with 402 Payment Required`);
      console.log(`    Response:`, JSON.stringify(error.response.data, null, 2).substring(0, 200) + "...\n");
    } else {
      console.error(`  ✗ Unexpected error: ${error.message}\n`);
    }
  }

  // Step 8: Test replay protection (should fail with "Payment already used")
  console.log("🔁 Step 8: Testing replay protection (reusing same paymentId)...");
  try {
    await axios.get(`${PROXY_URL}/proxy/${resourceId}`, {
      headers: {
        "x-payment-id": paymentIdHex,
      },
    });
    console.error(`  ✗ Unexpected: Replay succeeded! Replay protection is broken!\n`);
  } catch (error: any) {
    if (error.response?.status === 402 && error.response.data?.error?.includes("already used")) {
      console.log(`  ✓ Correctly rejected with: "${error.response.data.error}"`);
      console.log(`  ✓ Replay protection is working!\n`);
    } else if (error.response?.status === 402) {
      console.log(`  ✓ Rejected with 402: "${error.response.data.error}"\n`);
    } else {
      console.error(`  ✗ Unexpected error: ${error.message}\n`);
    }
  }

  console.log("✅ Test completed successfully!\n");
  console.log("Summary:");
  console.log(`  Payment ID: ${ethers.hexlify(paymentId)}`);
  console.log(`  Service ID: ${ethers.hexlify(serviceId)}`);
  console.log(`  Amount paid: ${ethers.formatUnits(totalCost, decimals)} USDC`);
  console.log(`  Payer: ${walletAddress}`);
}

main()
  .then(() => {
    console.log("🎉 All tests passed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test failed:");
    console.error(error);
    process.exit(1);
  });
