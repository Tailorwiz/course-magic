/**
 * Remotion CLI configuration.
 * https://www.remotion.dev/docs/config
 */
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setEntryPoint('./src/index.ts');
