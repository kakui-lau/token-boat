import { type CreateConnectorFn, createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

const connectors: CreateConnectorFn[] = [injected()];
const walletConnectProjectId = import.meta.env.VITE_CONSOLE_WALLETCONNECT_PROJECT_ID?.trim();
if (walletConnectProjectId) {
  connectors.push(walletConnect({ projectId: walletConnectProjectId, showQrModal: true }));
}

export const wagmiConfig = createConfig({
  chains: [mainnet],
  connectors,
  multiInjectedProviderDiscovery: true,
  transports: {
    [mainnet.id]: http(),
  },
});
