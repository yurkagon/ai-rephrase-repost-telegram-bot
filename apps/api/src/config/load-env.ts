import { config } from '@dotenvx/dotenvx';

config({
  path: ['.env', '../../.env'],
  convention: 'flow',
  ignore: ['MISSING_ENV_FILE'],
});
