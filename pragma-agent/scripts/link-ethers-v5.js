const fs = require("node:fs");
const path = require("node:path");

const workspaceRoot = path.resolve(__dirname, "..");
const v4SdkDir = path.join(workspaceRoot, "node_modules", "@uniswap", "v4-sdk");
const urSdkDir = path.join(
  workspaceRoot,
  "node_modules",
  "@uniswap",
  "universal-router-sdk"
);

const source = path.join(urSdkDir, "node_modules", "ethers");
const targetDir = path.join(v4SdkDir, "node_modules");
const target = path.join(targetDir, "ethers");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function linkEthers() {
  if (!fs.existsSync(source)) {
    console.warn(
      "[link-ethers-v5] Skipping: source ethers v5 not found at",
      source
    );
    return;
  }

  ensureDir(targetDir);

  try {
    if (fs.existsSync(target)) {
      return;
    }
    fs.symlinkSync(source, target, "junction");
    console.log("[link-ethers-v5] Linked ethers v5 for @uniswap/v4-sdk");
  } catch (err) {
    console.warn("[link-ethers-v5] Failed to link ethers v5:", err);
  }
}

linkEthers();
