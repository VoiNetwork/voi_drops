import algosdk from 'algosdk';
import 'dotenv/config';

// destruct from env vars, with default values to nodely
const {
    ALGOD_TOKEN = "",
    ALGOD_HOST = "https://testnet-api.voi.nodely.dev",
    ALGOD_PORT = "443",

    INDEXER_TOKEN = "",
    INDEXER_HOST = "https://testnet-idx.voi.nodely.dev",
    INDEXER_PORT = "443",
} = process.env;


export const algod = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_HOST, ALGOD_PORT);

export const indexer = new algosdk.Indexer(INDEXER_TOKEN, INDEXER_HOST, INDEXER_PORT);
