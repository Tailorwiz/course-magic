/**
 * scripts/deploy-site.mjs — (re)bundle the Remotion motion composition and
 * deploy it to the Lambda render site (S3). Run after changing anything under
 * motion/src so the Lambda renderer picks up the new bundle.
 *
 *   npx tsx scripts/deploy-site.mjs
 */
import 'dotenv/config';
import path from 'node:path';
import { deploySite, getOrCreateBucket } from '@remotion/lambda';

const region = process.env.REMOTION_LAMBDA_REGION || 'us-east-1';
const entryPoint = path.resolve('motion/src/index.ts');

const run = async () => {
  console.log(`Region ${region} — entry ${entryPoint}`);
  const { bucketName } = await getOrCreateBucket({ region });
  console.log(`Bucket: ${bucketName}`);

  console.log('Bundling + deploying the motion site (siteName "motion")…');
  const { serveUrl } = await deploySite({
    region,
    bucketName,
    entryPoint,
    siteName: 'motion',
  });
  console.log(`\nDeployed. serveUrl:\n  ${serveUrl}`);
};

run()
  .then(() => console.log('\nDONE'))
  .catch((e) => { console.error('\nFAILED:', e?.message || e); process.exit(1); });
