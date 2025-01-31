import React, { useState, useEffect } from 'react'
import { usePublicClient } from 'wagmi'
import { hederaTestnetChain } from './hederaTestnetChain'
import { myContract } from './contract'

import { secp256k1 } from '@noble/curves/secp256k1'
import { keccak_256 } from '@noble/hashes/sha3'
import * as rlp from 'rlp'

const envPK = import.meta.env.VITE_PRIVATE_KEY
const envEvmAddr = import.meta.env.VITE_HEDERA_EVM_ADDRESS

export default function App() {
  const publicClient = usePublicClient({ chainId: hederaTestnetChain.id })
  const [message, setMessage] = useState('')

  async function handleDeploy() {
    try {
      // 1) get nonce
      const nonceBn = await publicClient.getTransactionCount({ address: envEvmAddr })
      // 2) build fields
      const gasPrice = 1_000_000_000n 
      const gasLimit = 2_000_000n
      const chainId = BigInt(hederaTestnetChain.id)
      const initCode = myContract.bytecode // no constructor args appended

      // RLP array for a legacy TX
      const rawRlpNoSig = [
        toHex(nonceBn),
        toHex(gasPrice),
        toHex(gasLimit),
        '',
        '0x0',
        initCode,
        toHex(chainId),
        '0x',
        '0x',
      ]
      const encodedNoSig = rlp.encode(rawRlpNoSig)
      const msgHash = keccak_256(encodedNoSig)

      const privKey = strip0x(envPK)
      const sig = secp256k1.sign(msgHash, privKey, { lowS: true })
      const [r, s] = [sig.r, sig.s]
      const vBig = chainId * 2n + 35n + BigInt(sig.recovery)

      const finalTx = [
        toHex(nonceBn),
        toHex(gasPrice),
        toHex(gasLimit),
        '',
        '0x0',
        initCode,
        toHex(vBig),
        '0x' + r.toString(16),
        '0x' + s.toString(16),
      ]
      const serialized = rlp.encode(finalTx)
      const signedTx = '0x' + Buffer.from(serialized).toString('hex')

      // 3) direct JSON-RPC call to eth_sendRawTransaction
      const txHash = await publicClient.request({
        method: 'eth_sendRawTransaction',
        params: [signedTx],
      })
      console.log('Deploy TX hash:', txHash)

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      console.log('Deployment receipt:', receipt)
      if (receipt.status === 'success') {
        alert('Deployed at: ' + receipt.contractAddress)
      } else {
        alert('Deployment failed, status: ' + receipt.status)
      }
    } catch (err) {
      console.error('Deploy error:', err)
      alert('Deploy failed: ' + err.message)
    }
  }

  async function readContractMessage() {
    try {
      // example read call with a known contract address
      // e.g. if you have "0xabc..." that is your deployed contract
      const addr = '0xYourContractAddress'
      const result = await publicClient.readContract({
        address: addr,
        abi: myContract.abi,
        functionName: 'get_message',
      })
      setMessage(result)
    } catch (err) {
      console.error(err)
      alert('Read error: ' + err.message)
    }
  }

  useEffect(() => {
    // maybe automatically read after mount, or do nothing
  }, [])

  return (
    <div style={{ padding: 20 }}>
      <h1>Hedera + Wagmi Demo</h1>
      <p>Deployed Contract Message: {message}</p>
      <button onClick={readContractMessage}>Read Contract Message</button>
      <button onClick={handleDeploy}>Deploy Contract (Raw TX)</button>
    </div>
  )
}

function strip0x(hexStr) {
  return hexStr.startsWith('0x') ? hexStr.slice(2) : hexStr
}

function toHex(value) {
  if (typeof value === 'number') value = BigInt(value)
  if (typeof value === 'bigint') {
    if (value === 0n) return '0x'
    return '0x' + value.toString(16)
  }
  if (!value) return '0x'
  if (value.startsWith('0x')) return value
  return '0x' + value
}
