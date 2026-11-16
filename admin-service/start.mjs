import { configuration, readAccess } from './config.mjs';
import { createAdministration } from './service.mjs';
import { githubConfiguration, GitHubContent } from './github.mjs';
import { ContentStore } from './content.mjs';
try {
  const config = configuration();
  await readAccess(config.accessFile);
  const github = githubConfiguration();
  const content = github ? new ContentStore(new GitHubContent(github)) : null;
  const server = createAdministration(config, {content, log: event => process.stdout.write(JSON.stringify(event) + '\n')});
  server.listen(config.port, config.host, () => console.log('Administration service started on loopback.'));
  server.on('error', () => { console.error('Administration service could not start.'); process.exitCode = 1; });
} catch {
  console.error('Administration configuration is unavailable or invalid. Check the private service settings.');
  process.exitCode = 1;
}
