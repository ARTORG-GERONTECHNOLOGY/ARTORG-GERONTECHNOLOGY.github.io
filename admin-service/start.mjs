import { configuration, readAccess } from './config.mjs';
import { createAdministration } from './service.mjs';
try {
  const config = configuration();
  await readAccess(config.accessFile);
  const server = createAdministration(config, {log: event => process.stdout.write(JSON.stringify(event) + '\n')});
  server.listen(config.port, config.host, () => console.log('Administration service started on loopback.'));
  server.on('error', () => { console.error('Administration service could not start.'); process.exitCode = 1; });
} catch {
  console.error('Administration configuration is unavailable or invalid. Check the private service settings.');
  process.exitCode = 1;
}
