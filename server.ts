import express from "express";
import idl from "./game_multisig_vault.json"
import { AnchorProvider, BN, Program, Provider, Wallet } from "@coral-xyz/anchor";
import { AccountMeta, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import dotenv from "dotenv";
import cors from "cors";
import { GameMultisigVault } from "./game_multisig_vault";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json())
const PORT = process.env.PORT || 3000;
let program: Program<GameMultisigVault>;
let provider: Provider;
let connection: Connection;
let signers: Keypair[];
let payer: Keypair;
let ID: number;
async function main() {
    connection = new Connection(process.env.RPC_URL!);
    payer = Keypair.fromSecretKey(bs58.decode(process.env.PAYER!));
    console.log(payer.publicKey.toString());
    const wallet = new Wallet(payer);
    signers = Array.from(({ length: 4 })).map((_) => Keypair.generate());
    provider = new AnchorProvider(connection, wallet);
    program = new Program(idl, provider);
}
app.post("/switch", async (req, res) => {
    try {
        // add some sort of verification for the switch
        let { id } = req.body;
        id = Number(id);
        if (ID) {
            const remainingAccounts: AccountMeta[] = signers.map((signer) => {
                return {
                    pubkey: signer.publicKey,
                    isSigner: true,
                    isWritable: false,
                }
            });
            await program.methods.closeVault(new BN(ID)).accounts({
                payer: payer.publicKey,
            }).remainingAccounts(remainingAccounts).signers(signers).rpc();
            await program.methods.closeVault(new BN(ID + 1)).accounts({
                payer: payer.publicKey
            }).remainingAccounts(remainingAccounts).signers(signers).rpc();
        }
        ID = id;
        const remainingAccounts: AccountMeta[] = signers.map((signer) => {
            return {
                pubkey: signer.publicKey,
                isSigner: false,
                isWritable: false,
            }
        })
        const sig1 = await program.methods.createVault(new BN(ID), new BN(4)).accounts({
            payer: payer.publicKey,
        }).remainingAccounts(remainingAccounts).rpc();
        const sig2 = await program.methods.createVault(new BN(ID + 1), new BN(4)).accounts({
            payer: payer.publicKey
        }).remainingAccounts(remainingAccounts).rpc();
        console.log(sig1, sig2);
        res.status(200).json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Internal server error", success: false });
    }
})
app.get("/transaction/left", async (req, res) => {
    try {
        const { publicKey, amount } = req.query as { [key: string]: string };
        const transaction = await program.methods.deposit(new BN(ID), new BN(amount)).accounts({
            signer: publicKey
        }).transaction();
        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
        transaction.feePayer = new PublicKey(publicKey)
        const base64 = transaction.serialize({ requireAllSignatures: false }).toString("base64");
        res.status(200).json({ transaction: base64 });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Internal server error" });
    }
})
app.get("/transaction/right", async (req, res) => {
    try {
        const { publicKey, amount } = req.query as { [key: string]: string };
        const transaction = await program.methods.deposit(new BN(ID + 1), new BN(amount)).accounts({
            signer: publicKey
        }).transaction();
        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
        transaction.feePayer = new PublicKey(publicKey)
        const base64 = transaction.serialize({ requireAllSignatures: false }).toString("base64");
        res.status(200).json({ transaction: base64 });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Internal server error" });
    }
})
app.get("/bid-info", async (req, res) => {
    try {
        const [leftAddress] = PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), new BN(ID).toArrayLike(Buffer, "le", 8)],
            program.programId
        );
        const [rightAddress] = PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), new BN(ID + 1).toArrayLike(Buffer, "le", 8)],
            program.programId
        )
        const left = await program.account.vault.fetch(leftAddress);
        const right = await program.account.vault.fetch(rightAddress);
        res.status(200).json({
            left: left.balance.toString(),
            right: right.balance.toString(),
            leftId: ID,
            rightId: ID + 1
        })
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

app.listen(PORT, () => {
    console.log(`App listening on ${PORT}`);
})