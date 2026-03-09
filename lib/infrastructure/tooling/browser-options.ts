export function resolvePlaywrightHeadless(environment: NodeJS.ProcessEnv): boolean {
  const configured = environment.TESSERACT_HEADLESS?.trim().toLowerCase();
  if (configured === '0' || configured === 'false') {
    return false;
  }
  if (configured === '1' || configured === 'true') {
    return true;
  }
  return environment.PWDEBUG === '1' ? false : true;
}

export function resolvePreferredPlaywrightChannel(environment: NodeJS.ProcessEnv): 'msedge' | undefined {
  const isCheckRun = environment.TESSERACT_CHECK === '1';
  const isCi = environment.CI === 'true' || environment.CI === '1';
  return isCheckRun || isCi ? undefined : 'msedge';
}
