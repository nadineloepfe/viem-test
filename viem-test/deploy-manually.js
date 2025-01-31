import dotenv from 'dotenv'
dotenv.config()

import { createPublicClient, http } from 'viem'
import { hederaTestnetChain } from './hederaTestnet.js'
import { myContract } from './contract.js'
import { secp256k1 } from '@noble/curves/secp256k1'
import { keccak_256 } from '@noble/hashes/sha3'
import * as rlp from 'rlp'


const { RPC_URL, PRIVATE_KEY, ACCOUNT_ADDRESS } = process.env
if (!RPC_URL || !PRIVATE_KEY || !ACCOUNT_ADDRESS) {
  throw new Error('Missing RPC_URL, PRIVATE_KEY, or ACCOUNT_ADDRESS in .env')
}

const publicClient = createPublicClient({
  chain: hederaTestnetChain,
  transport: http(RPC_URL),
})

async function main() {
  try {
    const nonceBn = await publicClient.getTransactionCount({ address: ACCOUNT_ADDRESS })
    console.log('Nonce:', nonceBn.toString())

    const gasLimit = 2_000_000n
    const gasPrice = 1_000_000_000n
    const chainId = BigInt(hederaTestnetChain.id)
    const initCode = myContract.bytecode

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

    const privKeyHex = strip0x(PRIVATE_KEY)
    const sig = secp256k1.sign(msgHash, privKeyHex, { lowS: true })
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
    console.log('Signed TX (start):', signedTx.slice(0, 80), '...')

    // Directly call eth_sendRawTransaction
    const txHash = await publicClient.request({
      method: 'eth_sendRawTransaction',
      params: [signedTx],
    })
    console.log('Deployment tx hash:', txHash)

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
    console.log('Receipt:', receipt)
    if (receipt.status === 'success') {
      console.log('Contract deployed at:', receipt.contractAddress)
    } else {
      console.log('Deployment failed, status:', receipt.status)
    }
  } catch (err) {
    console.error('Deployment error:', err)
  }
}

function strip0x(str) {
  return str.startsWith('0x') ? str.slice(2) : str
}

function toHex(v) {
  if (typeof v === 'number') v = BigInt(v)
  if (typeof v === 'bigint') {
    if (v === 0n) return '0x'
    return '0x' + v.toString(16)
  }
  if (!v) return '0x'
  if (v.startsWith('0x')) return v
  return '0x' + v
}

main().catch(err => {
  console.error('Script Error:', err)
  process.exit(1)
})
