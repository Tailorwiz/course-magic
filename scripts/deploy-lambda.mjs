/**
 * scripts/deploy-lambda.mjs — (re)deploy the Remotion Lambda render function
 * with a long timeout so multi-minute videos can finish. One-off helper.
 */
import 'dotenv/config';
import { deployFunction, getFunctions } from '@remotion/lambda';

const region = process.env.REMOTION_LAMBDA_REGION || 'us-east-1';

const run = async () => {
  console.log(`Deploying Remotion Lambda function in ${region} — timeout 900s, memory 3008MB, disk 2048MB…`);
  const { functionName, alreadyExisted } = await deployFunction({
    region,
    timeoutInSeconds: 900,
    memorySizeInMb: 3008,
    diskSizeInMb: 2048,
    createCloudWatchLogGroup: true,
  });
  console.log(`${alreadyExisted ? 'Already existed' : 'Deployed'}: ${functionName}`);

  const fns = await getFunctions({ region, compatibleOnly: true });
  console.log(`\nCompatible functions now deployed (${fns.length}):`);
  for (const f of fns) {
    console.log(`  - ${f.functionName}  timeout=${f.timeoutInSeconds}s  mem=${f.memorySizeInMb}MB`);
  }
};

run()
  .then(() => console.log('\nDONE'))
  .catch((e) => { console.error('\nFAILED:', e?.message || e); process.exit(1); });
