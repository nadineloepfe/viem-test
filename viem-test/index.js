import React from 'react'
import ReactDOM from 'react-dom/client'
import { configureChains, createClient, WagmiConfig } from 'wagmi'
import { publicProvider } from 'wagmi/providers/public'
import { hederaTestnet } from './chains/hederaTestnet'
import App from './App'

const { chains, publicClient } = configureChains(
  [hederaTestnet],
  [publicProvider()]
)

const client = createClient({
  autoConnect: true,
  // For EVM-based wallets:
  connectors: [
    /* e.g. MetaMaskConnector, etc. 
       But for Hedera, you need a specialized connector that can handle 
       raw transaction signing or that transforms eth_sendTransaction 
       into eth_sendRawTransaction behind the scenes.
    */
  ],
  publicClient,
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WagmiConfig client={client}>
      <App />
    </WagmiConfig>
  </React.StrictMode>,
)
