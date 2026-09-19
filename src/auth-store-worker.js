// Private pipe protocol. No credential material is accepted in argv or environment.
import { Entry } from '@napi-rs/keyring';
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; if (input.length > 40000) process.exit(1); });
process.stdin.on('end', () => {
  try {
    const { operation, account, data } = JSON.parse(input);
    const entry = new Entry('nansen-cli-api-auth-v1', account, { linux: { store: 'secret-service' } });
    let value;
    if (operation === 'set') { entry.setSecret(Buffer.from(data, 'base64')); value = true; }
    else if (operation === 'get') { const bytes = entry.getSecret(); value = bytes == null ? null : Buffer.from(bytes).toString('base64'); }
    else if (operation === 'delete') value = entry.deleteCredential();
    else throw new Error();
    process.stdout.write(JSON.stringify({ value }));
  } catch { process.stdout.write(JSON.stringify({ error: 'STORE_UNAVAILABLE' })); process.exitCode = 1; }
});
