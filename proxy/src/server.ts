import { app } from "./app.js";
import { config } from "./config.js";

app.listen(config.port, () => {
  console.log(`
  ================================================
   PragmaMoney x402 Proxy Server
   Port:       ${config.port}
   Gateway:    ${config.gatewayAddress}
   RPC:        ${config.gatewayRpcUrl}
   Facilitator:${config.facilitatorUrl}
  ================================================
  `);
});
