#!/usr/bin/env node
/**
 * Polygram Setup Test Script
 * 
 * Tests the Supabase setup and API endpoints to ensure everything works correctly.
 * 
 * Usage:
 *   node test-setup.js
 * 
 * Requires environment variables:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_KEY
 *   - ENCRYPTION_KEY (optional for wallet tests)
 */

const https = require('https');
const http = require('http');

// Configuration
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const TEST_USER_ID = `test_user_${Date.now()}`;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ ${message}`, 'blue');
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
}

// HTTP request helper
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    const req = client.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: json, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

// Test functions
async function testHealthCheck() {
  logInfo('\n1. Testing Health Check...');
  try {
    const response = await makeRequest(`${BASE_URL}/api/test`);
    if (response.status === 200 && response.data.ok) {
      logSuccess('Health check passed');
      return true;
    } else {
      logError(`Health check failed: ${response.status}`);
      return false;
    }
  } catch (error) {
    logError(`Health check error: ${error.message}`);
    return false;
  }
}

async function testMarkets() {
  logInfo('\n2. Testing Markets API...');
  try {
    const response = await makeRequest(`${BASE_URL}/api/markets?kind=trending&limit=5`);
    if (response.status === 200 && Array.isArray(response.data.markets)) {
      logSuccess(`Markets API works (returned ${response.data.markets.length} markets)`);
      return true;
    } else {
      logError(`Markets API failed: ${response.status}`);
      return false;
    }
  } catch (error) {
    logError(`Markets API error: ${error.message}`);
    return false;
  }
}

async function testWalletCreation() {
  logInfo('\n3. Testing Wallet Creation...');
  try {
    const response = await makeRequest(`${BASE_URL}/api/wallet?telegram_id=${TEST_USER_ID}`);
    
    if (response.status === 200 && response.data.success) {
      const wallet = response.data.wallet;
      if (wallet.polygon && wallet.solana) {
        logSuccess(`Wallet created successfully`);
        logInfo(`  Polygon: ${wallet.polygon.substring(0, 10)}...`);
        logInfo(`  Solana: ${wallet.solana.substring(0, 10)}...`);
        logInfo(`  Is New: ${response.data.isNew}`);
        return { success: true, wallet };
      } else {
        logError('Wallet missing addresses');
        return { success: false };
      }
    } else {
      logError(`Wallet creation failed: ${response.status}`);
      if (response.data.message) {
        logError(`  Error: ${response.data.message}`);
      }
      return { success: false };
    }
  } catch (error) {
    logError(`Wallet creation error: ${error.message}`);
    return { success: false };
  }
}

async function testWalletRetrieval() {
  logInfo('\n4. Testing Wallet Retrieval (should return existing wallet)...');
  try {
    const response = await makeRequest(`${BASE_URL}/api/wallet?telegram_id=${TEST_USER_ID}`);
    
    if (response.status === 200 && response.data.success) {
      if (!response.data.isNew) {
        logSuccess('Wallet retrieved successfully (existing wallet found)');
        return true;
      } else {
        logWarning('Wallet was created again instead of retrieved');
        return false;
      }
    } else {
      logError(`Wallet retrieval failed: ${response.status}`);
      return false;
    }
  } catch (error) {
    logError(`Wallet retrieval error: ${error.message}`);
    return false;
  }
}

async function testBalances() {
  logInfo('\n5. Testing Balances API...');
  try {
    const response = await makeRequest(`${BASE_URL}/api/balances?telegram_id=${TEST_USER_ID}`);
    
    if (response.status === 200 && response.data.success) {
      logSuccess('Balances API works');
      logInfo(`  USDC: $${response.data.usdc.toFixed(2)}`);
      logInfo(`  SOL: ${response.data.sol || 0}`);
      logInfo(`  Positions: $${response.data.positions.toFixed(2)}`);
      logInfo(`  Total: $${response.data.total.toFixed(2)}`);
      if (response.data.walletStatus) {
        logInfo(`  Wallet exists: ${response.data.walletStatus.exists}`);
      }
      return true;
    } else {
      logError(`Balances API failed: ${response.status}`);
      if (response.data.error) {
        logError(`  Error: ${response.data.error}`);
      }
      return false;
    }
  } catch (error) {
    logError(`Balances API error: ${error.message}`);
    return false;
  }
}

async function testEnvironmentVariables() {
  logInfo('\n6. Checking Environment Variables...');
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
  const optional = ['ENCRYPTION_KEY', 'POLYGON_RPC'];
  
  let allGood = true;
  
  for (const varName of required) {
    if (process.env[varName]) {
      logSuccess(`${varName} is set`);
    } else {
      logError(`${varName} is NOT set (required)`);
      allGood = false;
    }
  }
  
  for (const varName of optional) {
    if (process.env[varName]) {
      logSuccess(`${varName} is set`);
    } else {
      logWarning(`${varName} is not set (optional)`);
    }
  }
  
  if (!process.env.ENCRYPTION_KEY) {
    logWarning('ENCRYPTION_KEY not set - wallet encryption will fail');
    allGood = false;
  }
  
  return allGood;
}

async function testSupabaseConnection() {
  logInfo('\n7. Testing Supabase Connection...');
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    logError('Supabase credentials not found in environment');
    logInfo('  Set SUPABASE_URL and SUPABASE_SERVICE_KEY to test connection');
    return false;
  }
  
  try {
    // Try to create a wallet - this will test Supabase connection
    const testUserId = `connection_test_${Date.now()}`;
    const response = await makeRequest(`${BASE_URL}/api/wallet?telegram_id=${testUserId}`);
    
    if (response.status === 200 && response.data.success) {
      logSuccess('Supabase connection works');
      return true;
    } else if (response.data.error === 'database_not_configured') {
      logError('Supabase not configured in API');
      return false;
    } else if (response.data.message && response.data.message.includes('ENCRYPTION_KEY')) {
      logWarning('Supabase connected but ENCRYPTION_KEY missing');
      return true; // Connection works, just missing key
    } else {
      logError(`Supabase connection test failed: ${response.status}`);
      if (response.data.message) {
        logError(`  Error: ${response.data.message}`);
      }
      return false;
    }
  } catch (error) {
    logError(`Supabase connection error: ${error.message}`);
    return false;
  }
}

// Main test runner
async function runTests() {
  log('\n' + '='.repeat(60), 'cyan');
  log('Polygram Setup Test Suite', 'cyan');
  log('='.repeat(60), 'cyan');
  
  const results = {
    healthCheck: false,
    markets: false,
    walletCreation: false,
    walletRetrieval: false,
    balances: false,
    environment: false,
    supabase: false,
  };
  
  // Test environment first
  results.environment = await testEnvironmentVariables();
  
  // Test basic APIs
  results.healthCheck = await testHealthCheck();
  results.markets = await testMarkets();
  
  // Test Supabase connection
  results.supabase = await testSupabaseConnection();
  
  // Test wallet operations (requires Supabase)
  if (results.supabase) {
    const walletResult = await testWalletCreation();
    results.walletCreation = walletResult.success;
    
    if (results.walletCreation) {
      results.walletRetrieval = await testWalletRetrieval();
      results.balances = await testBalances();
    }
  } else {
    logWarning('Skipping wallet tests - Supabase not connected');
  }
  
  // Summary
  log('\n' + '='.repeat(60), 'cyan');
  log('Test Results Summary', 'cyan');
  log('='.repeat(60), 'cyan');
  
  const tests = [
    ['Environment Variables', results.environment],
    ['Health Check', results.healthCheck],
    ['Markets API', results.markets],
    ['Supabase Connection', results.supabase],
    ['Wallet Creation', results.walletCreation],
    ['Wallet Retrieval', results.walletRetrieval],
    ['Balances API', results.balances],
  ];
  
  let passed = 0;
  let total = tests.length;
  
  tests.forEach(([name, result]) => {
    if (result) {
      logSuccess(`${name}: PASSED`);
      passed++;
    } else {
      logError(`${name}: FAILED`);
    }
  });
  
  log('\n' + '='.repeat(60), 'cyan');
  log(`Results: ${passed}/${total} tests passed`, passed === total ? 'green' : 'yellow');
  log('='.repeat(60), 'cyan');
  
  if (passed === total) {
    log('\n🎉 All tests passed! Your setup is ready for production.', 'green');
    process.exit(0);
  } else {
    log('\n⚠️  Some tests failed. Please review the errors above.', 'yellow');
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  runTests().catch((error) => {
    logError(`\nFatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runTests, testHealthCheck, testMarkets, testWalletCreation, testBalances };

