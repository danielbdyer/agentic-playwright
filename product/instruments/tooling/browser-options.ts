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
  const explicit = environment.TESSERACT_CHANNEL?.trim().toLowerCase();
  if (explicit === 'msedge') return 'msedge';
  if (explicit === 'chromium' || explicit === 'default') return undefined;

  const isCheckRun = environment.TESSERACT_CHECK === '1';
  const isCi = environment.CI === 'true' || environment.CI === '1';
  if (isCheckRun || isCi) return undefined;

  return isMsedgeAvailable() ? 'msedge' : undefined;
}

let msedgeProbeResult: boolean | null = null;

function isMsedgeAvailable(): boolean {
  if (msedgeProbeResult !== null) return msedgeProbeResult;
  try {
    const { execSync } = require('child_process');
    execSync('which msedge || test -x /opt/microsoft/msedge/msedge', { stdio: 'ignore' });
    msedgeProbeResult = true;
  } catch {
    msedgeProbeResult = false;
  }
  return msedgeProbeResult;
}

/**
 * Launch a shared Chromium browser that can be reused across multiple
 * operations to avoid paying the ~2-5s Chromium startup cost repeatedly.
 */
export async function launchSharedBrowser(): Promise<import('@playwright/test').Browser> {
  const { chromium } = await import('@playwright/test');
  const environment = process.env;
  const channel = resolvePreferredPlaywrightChannel(environment);
  return chromium.launch({
    headless: resolvePlaywrightHeadless(environment),
    ...(channel ? { channel } : {}),
  });
}
