import { Account, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";
import {
  createRpcTxSubmitter,
  RateLimitError,
  TokenBucket,
} from "./tx-rpc";

describe("TokenBucket", () => {
  it("allows burst calls up to bucket size then rejects", () => {
    let now = 0;
    const bucket = new TokenBucket(3, 1 / 1000, () => now);

    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false);
  });

  it("refills tokens over time", () => {
    let now = 0;
    const bucket = new TokenBucket(2, 2 / 1000, () => now);

    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false);

    now = 500;
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false);
  });
});

describe("createRpcTxSubmitter", () => {
  it("rejects excess submissions before hitting the network", async () => {
    const sendTransaction = vi.fn();
    const submitter = createRpcTxSubmitter({
      rpcUrl: "https://rpc.test",
      networkPassphrase: Networks.TESTNET,
      rateLimit: { bucketSize: 0, refillRate: 0 },
      server: { sendTransaction } as never,
    });

    await expect(submitter.submitTransaction("AAAA")).rejects.toBeInstanceOf(RateLimitError);
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("decodes the signed XDR and submits it", async () => {
    const keypair = Keypair.random();
    const tx = new TransactionBuilder(new Account(keypair.publicKey(), "1"), {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.bumpSequence({ bumpTo: "2" }))
      .setTimeout(30)
      .build();
    tx.sign(keypair);
    const sendTransaction = vi.fn().mockResolvedValue({ status: "PENDING", hash: tx.hash().toString("hex") });
    const submitter = createRpcTxSubmitter({
      rpcUrl: "https://rpc.test",
      networkPassphrase: Networks.TESTNET,
      server: { sendTransaction } as never,
    });

    await expect(submitter.submitTransaction(tx.toXDR())).resolves.toEqual({
      hash: tx.hash().toString("hex"),
    });
    expect(sendTransaction).toHaveBeenCalledTimes(1);
    expect(sendTransaction.mock.calls[0]![0].toXDR()).toBe(tx.toXDR());
  });
});
