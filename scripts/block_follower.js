import sqlite3 from 'sqlite3';
import algosdk from 'algosdk';
import { algod } from '../include/algod.js';
import minimist from 'minimist';

const args = minimist(process.argv.slice(2));
let filename = (args.f)??='proposers.db';

const db = new sqlite3.Database(filename);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function createBlocksTableIfNotExists() {
    return new Promise((resolve, reject) => {
        db.run(`
            CREATE TABLE IF NOT EXISTS blocks (
                block INTEGER PRIMARY KEY,
                proposer VARCHAR(58),
				timestamp DATETIME DEFAULT '0000-00-00 00:00:00'
            )
        `, err => {
            if (err) return reject(err);
            resolve();
        });
    });
}

function storeBlockInDb(block, proposer, timestamp) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            const stmt = db.prepare("INSERT OR REPLACE INTO blocks (block, proposer, timestamp) VALUES (?, ?, ?)");
            stmt.run(block, proposer, timestamp, err => {
                if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                }
                db.run('COMMIT');
                resolve();
            });
            stmt.finalize();
        });
    });
}
async function getHighestStoredBlock() {
    return new Promise((resolve, reject) => {
        db.get("SELECT MAX(block) as highestBlock FROM blocks", [], (err, row) => {
            if (err) return reject(err);
            resolve(row ? row.highestBlock : 0);
        });
    });
}

(async () => {
	// Ensure the blocks table exists
	await createBlocksTableIfNotExists();

    const highestStoredBlock = await getHighestStoredBlock();
    console.log(`Highest stored block in the database: ${highestStoredBlock}`);

    // get highest block from algod
    let end_block = (await algod.status().do())['last-round'];

    let last_block = highestStoredBlock;
    while(true) {
        if (last_block >= end_block) {
            console.log(`Reached end of chain, sleeping for 10 seconds...`);
            await sleep(10000);
            try {
                end_block = (await algod.status().do())['last-round'];
            }
            catch (error) {
                console.log(`Error retrieving end block from API: ${error.message}, retrying.`);
                await sleep(10000); // wait 10 seconds before trying again
            }
            continue;
        }
		let i = last_block + 1;

        let logInterval = 3;
        if ((end_block - i) >= 1000) {
            logInterval = 1000;
        } else if ((end_block - i) < 100 && (end_block - i) >= 10) {
            logInterval = 10;
        }

        if ((end_block - i) % logInterval === 0 || (end_block - i) < logInterval) {
            const toBlock = i + logInterval > end_block ? end_block : i + logInterval - 1;
            console.log(`Retrieving block ${i} to ${toBlock} (${end_block - i} behind)`);
        }
        
        try {
            const timeoutPromise = new Promise((resolve, reject) => {
                setTimeout(() => {
                    reject(new Error('Request timed out'));
                }, 5000); // 5 second timeout
            });

            const blk = await Promise.race([algod.block(i).do(), timeoutPromise]);
            const addr = algosdk.encodeAddress(blk["cert"]["prop"]["oprop"]);
            const timestamp = new Date(blk.block.ts*1000).toISOString();

            // store this block and its proposer in the database
            await storeBlockInDb(i, addr, timestamp);
        } catch (error) {
            if (error.message === 'Request timed out') {
                console.log(`Error retrieving block ${i} from API: request timed out, retrying.`);
            } else {
                console.log(`Error retrieving block ${i} from API: ${error.message}, retrying.`);
            }
            await sleep(10000); // wait 10 seconds before trying again
            continue;
        }
	
        last_block = i;
	}

})();