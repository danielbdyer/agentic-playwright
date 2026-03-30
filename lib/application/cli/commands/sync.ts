import { syncSnapshots } from '../../sync';
import { createAdoId } from '../../../domain/identity';
import { createCommandSpec } from '../shared';
import { withDefinedValues } from '../shared';

export const syncCommand = createCommandSpec({
  flags: ['--all', '--ado-id', '--ado-source', '--ado-org-url', '--ado-project', '--ado-pat', '--ado-suite-path', '--ado-area-path', '--ado-iteration-path', '--ado-tag-filter'],
  parse: ({ flags }) => ({
    command: 'sync',
    strictExitOnUnbound: false,
    environment: withDefinedValues({
      TESSERACT_ADO_SOURCE: flags.adoSource,
      TESSERACT_ADO_ORG_URL: flags.adoOrgUrl,
      TESSERACT_ADO_PROJECT: flags.adoProject,
      TESSERACT_ADO_PAT: flags.adoPat,
      TESSERACT_ADO_SUITE_PATH: flags.adoSuitePath,
      TESSERACT_ADO_AREA_PATH: flags.adoAreaPath,
      TESSERACT_ADO_ITERATION_PATH: flags.adoIterationPath,
      TESSERACT_ADO_TAG: flags.adoTagFilter,
    }),
    postureInput: {},
    execute: (paths) => syncSnapshots({
      paths,
      ...(flags.adoId ? { adoId: createAdoId(flags.adoId) } : {}),
      ...(flags.all ? { all: true } : {}),
    }),
  }),
});
