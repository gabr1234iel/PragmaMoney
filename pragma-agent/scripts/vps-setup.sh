#!/bin/bash
# =============================================================================
# PragmaMoney VPS Setup Script (Ubuntu 24.04 / Contabo)
#
# Run as root on a fresh VPS:
#   curl -fsSL <url>/vps-setup.sh | bash
#   or: bash vps-setup.sh
#
# What it does:
#   1. Installs Node.js 22 via fnm
#   2. Clones PragmaMoney
#   3. Installs proxy + pragma-agent dependencies
#   4. Builds both projects
#   5. Prints next steps
# =============================================================================

set -euo pipefail

echo "=== PragmaMoney VPS Setup ==="
echo ""

# ── 1. System packages ──────────────────────────────────────────────────────

echo "--- Installing system packages ---"
apt-get update -qq
apt-get install -y -qq git curl build-essential

# ── 2. Node.js 22 via fnm ──────────────────────────────────────────────────

if command -v node &>/dev/null && [[ "$(node -v)" == v22* ]]; then
  echo "--- Node.js $(node -v) already installed ---"
else
  echo "--- Installing Node.js 22 via fnm ---"
  curl -fsSL https://fnm.vercel.app/install | bash

  # Source fnm into current shell
  export FNM_DIR="$HOME/.local/share/fnm"
  export PATH="$FNM_DIR:$PATH"
  eval "$(fnm env)"

  fnm install 22
  fnm use 22
  fnm default 22

  echo "--- Node.js $(node -v) installed ---"
fi

# Make sure fnm is in shell profile for future sessions
if ! grep -q "fnm env" ~/.bashrc 2>/dev/null; then
  echo '' >> ~/.bashrc
  echo '# fnm (Node.js version manager)' >> ~/.bashrc
  echo 'export FNM_DIR="$HOME/.local/share/fnm"' >> ~/.bashrc
  echo 'export PATH="$FNM_DIR:$PATH"' >> ~/.bashrc
  echo 'eval "$(fnm env)"' >> ~/.bashrc
fi

# ── 3. Clone PragmaMoney ───────────────────────────────────────────────────

REPO_DIR="$HOME/PragmaMoney"

if [ -d "$REPO_DIR" ]; then
  echo "--- PragmaMoney already cloned, pulling latest ---"
  cd "$REPO_DIR" && git pull
else
  echo "--- Cloning PragmaMoney ---"
  cd "$HOME"
  git clone https://github.com/prag-money/PragmaMoney.git
  cd "$REPO_DIR"
fi

# ── 4. Install & build proxy ───────────────────────────────────────────────

echo ""
echo "--- Setting up proxy server ---"
cd "$REPO_DIR/proxy"
npm install
npm run build

# ── 5. Install & build pragma-agent ────────────────────────────────────────

echo ""
echo "--- Setting up pragma-agent ---"
cd "$REPO_DIR/pragma-agent"
npm install
npm run build

# ── 6. Create .env templates ──────────────────────────────────────────────

if [ ! -f "$REPO_DIR/proxy/.env" ]; then
  cat > "$REPO_DIR/proxy/.env" <<'ENVEOF'
# Required: deployer private key (funds agent EOAs, deploys smart accounts)
PROXY_SIGNER_KEY=

# Required: admin token for /admin/register endpoint
ADMIN_TOKEN=changeme

# Optional: override defaults
# GATEWAY_RPC_URL=https://sepolia.base.org
# PORT=4402
# FUND_AMOUNT_EOA=0.0005
ENVEOF
  echo "--- Created proxy/.env template (EDIT THIS!) ---"
fi

if [ ! -f "$REPO_DIR/pragma-agent/.env" ]; then
  cat > "$REPO_DIR/pragma-agent/.env" <<'ENVEOF'
# Required for UserOps (pay, pool pull, call)
PIMLICO_API_KEY=

# Proxy relayer URL
RELAYER_URL=http://localhost:4402
ENVEOF
  echo "--- Created pragma-agent/.env template (EDIT THIS!) ---"
fi

# ── 7. Done ────────────────────────────────────────────────────────────────

echo ""
echo "============================================="
echo "  Setup complete!"
echo "============================================="
echo ""
echo "Next steps:"
echo ""
echo "  1. Edit proxy env:"
echo "     nano $REPO_DIR/proxy/.env"
echo "     → Set PROXY_SIGNER_KEY (deployer private key)"
echo "     → Set ADMIN_TOKEN"
echo ""
echo "  2. Edit pragma-agent env:"
echo "     nano $REPO_DIR/pragma-agent/.env"
echo "     → Set PIMLICO_API_KEY"
echo ""
echo "  3. Start proxy (in tmux/screen):"
echo "     cd $REPO_DIR/proxy && npm run dev"
echo ""
echo "  4. Run test registration:"
echo "     cd $REPO_DIR/pragma-agent && npx tsx scripts/test-register.ts"
echo ""
echo "  5. Or install OpenClaw and use interactively:"
echo "     npm install -g openclaw"
echo "     openclaw plugin install $REPO_DIR/pragma-agent"
echo "     openclaw"
echo ""
