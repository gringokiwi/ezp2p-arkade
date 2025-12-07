import express from 'express';
import cors from 'cors';
import path from 'path';
import axios from 'axios'
import { SingleKey, Wallet } from '@arkade-os/sdk'
import 'dotenv/config';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json())
app.use(express.static(path.join(__dirname, '../public')));

const identity = SingleKey.fromHex(process.env.ARKADE_PRIVATE_KEY!)
const paymentIdCache = new Map<string, string>()

app.post('/api/validate', async (req, res) => {
  const data = req.body as {
    address: string,
    proof: {
      amount: number,
      paymentId: string
    }
  };
  const { address, proof: { amount: amountGbpCents, paymentId } } = data;
  if (paymentIdCache.has(paymentId)) {
    const match = paymentIdCache.get(paymentId)!
    return res.json({
      success: false,
      message: `Payment ID already used in transaction ${match}`,
    })
  }
  const price = await axios.get('https://mempool.space/api/v1/prices').then(res => res.data as {
    GBP: number
  })
  const amountSats = Math.round(Math.abs(amountGbpCents) * (100_000_000 / 100) / price.GBP)
  const amountGbp = amountGbpCents / 100
  const wallet = await Wallet.create({
    identity,
    arkServerUrl: 'https://arkade.computer',
  })
  const txid = await wallet.sendBitcoin({
    address,
    amount: amountSats,
  })
  paymentIdCache.set(paymentId, txid)
  res.json({
    success: true,
    message: `Sent ${amountSats} sats (${amountGbp} GBP) to ${address} in transaction ${txid}`,
  });
});

export async function startServer() {
  return new Promise<void>((resolve) => {
    app.listen(PORT, () => {
      console.log(`✅ Express server listening on port ${PORT}`);
      resolve();
    });
  });
}