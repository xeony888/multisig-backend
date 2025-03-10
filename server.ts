import express from "express";
import idl from "./game_multisig_vault.json"
import { AnchorProvider, BN, Program, Provider, Wallet } from "@coral-xyz/anchor";
import { AccountMeta, Connection, Keypair, LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import dotenv from "dotenv";
import { GameMultisigVault } from "./game_multisig_vault";

dotenv.config();
const app = express();

let program: Program<GameMultisigVault>;
let provider: Provider;
let connection: Connection;
let signers: Keypair[];
let payer: Keypair;
let ID: string;
async function main() {
    connection = new Connection(process.env.RPC_URL!);
    payer = Keypair.generate();
    const wallet = new Wallet(payer);
    await connection.requestAirdrop(payer.publicKey, LAMPORTS_PER_SOL);
    signers = Array.from(({ length: 4 })).map((_) => Keypair.generate());
    provider = new AnchorProvider(connection, wallet);
    program = new Program(idl, provider);
}
app.post("/switch", async (req, res) => {
    try {
        // add some sort of verification for the switch
        const { id } = req.body;
        if (ID) {
            const remainingAccounts: AccountMeta[] = signers.map((signer) => {
                return {
                    pubkey: signer.publicKey,
                    isSigner: true,
                    isWritable: false,
                }
            });
            await program.methods.closeVault(`${ID}_left`).accounts({
                payer: payer.publicKey,
            }).remainingAccounts(remainingAccounts).signers(signers).rpc();
            await program.methods.closeVault(`${ID}_right`).accounts({
                payer: payer.publicKey
            }).remainingAccounts(remainingAccounts).signers(signers).rpc();
        }
        ID = id as string;
        const remainingAccounts: AccountMeta[] = signers.map((signer) => {
            return {
                pubkey: signer.publicKey,
                isSigner: false,
                isWritable: false,
            }
        })
        await program.methods.createVault(`${ID}_left`, new BN(4)).accounts({
            payer: payer.publicKey,
        }).remainingAccounts(remainingAccounts).rpc();
        await program.methods.createVault(`${ID}_right`, new BN(4)).accounts({
            payer: payer.publicKey
        }).remainingAccounts(remainingAccounts).rpc();
    } catch (e) {
        console.error(e);
    }
})
app.get("/transaction/left", async (req, res) => {
    try {
        const { publicKey, amount } = req.query as { [key: string]: string };
        const transaction = await program.methods.deposit(`${ID}_left`, new BN(amount)).accounts({
            signer: publicKey
        }).transaction();
        const base64 = transaction.serialize().toString("base64");
        res.status(200).json({ transaction: base64 });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Internal server error" });
    }
})
app.get("/transaction/right", async (req, res) => {
    try {
        const { publicKey, amount } = req.query as { [key: string]: string };
        const transaction = await program.methods.deposit(`${ID}_right`, new BN(amount)).accounts({
            signer: publicKey
        }).transaction();
        const base64 = transaction.serialize().toString("base64");
        res.status(200).json({ transaction: base64 });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Internal server error" });
    }
})
app.post("/transaction/send", async (req, res) => {
    try {
        const { transaction } = req.body;
        const tx = Transaction.from(Buffer.from(transaction, "base64"));
        const txid = await provider.sendAndConfirm!(tx);
        res.status(200).json({ signature: txid });
    } catch (e) {

    }
})

main();