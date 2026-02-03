
import '../src/polyfills';
import 'dotenv/config';
import { privateKeyToAccount } from 'viem/accounts';
import { recoverMessageAddress } from 'viem';

async function main() {
    console.log('Node:', process.version);
    console.log('ArrayBuffer.prototype.transfer:', typeof (ArrayBuffer.prototype as any).transfer);

    const pk = process.env.HYPERLIQUID_PRIVATE_KEY;
    if (!pk) throw new Error("No PK");

    const account = privateKeyToAccount(pk as `0x${string}`);
    console.log('Account Address:', account.address);

    const msg = 'hello world';
    const signature = await account.signMessage({ message: msg });
    console.log('Signature:', signature);

    const recovered = await recoverMessageAddress({ message: msg, signature });
    console.log('Recovered:', recovered);

    if (recovered.toLowerCase() === account.address.toLowerCase()) {
        console.log("Signature verification PASSED");
    } else {
        console.error("Signature verification FAILED");
    }
}
main().catch(console.error);
