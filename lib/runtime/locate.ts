// Re-export from playwright layer — locator resolution is a Playwright concern
export {
  resolveLocator,
  describeLocatorStrategy,
  locate,
  locatorStrategies,
  type ResolvedLocator,
} from '../playwright/locate';

