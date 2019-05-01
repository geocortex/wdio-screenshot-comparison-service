import logger from "@wdio/logger";
import { parse as parsePlatform } from "platform";
import { Browser } from "webdriverio";
import * as fs from "fs-extra";
import * as compareImages from "resemblejs/compareImages";
import { Test } from "mocha";

const log = logger("wdio-screenshot-comparison-service");

type Options = {
  referenceName: (options: any) => string;
  screenshotName: (options: any) => string;
  diffName: (options: any) => string;
  misMatchTolerance: number;
};

type CheckElementOptions = {
  screenshotNumber: Number;
  misMatchTolerance: Number;
};

export default class ScreenShotCompareService {
  currentSuite: Mocha.Suite = null;
  currentTest: Mocha.Test = null;
  config: Options = null;

  constructor() {
    this.currentSuite = null;
    this.currentTest = null;
    this.config = null;
  }

  onPrepare(config: any, capabilities: WebDriver.Capabilities): void {
    this.config = config.ScreenShotCompareService;
  }

  onComplete(
    exitCode: any,
    config: any,
    capabilities: WebDriver.Capabilities
  ): void {
    //
  }

  beforeSession(config, capabilities) {
    this.config = config.ScreenShotCompareService;
  }

  before(capabilities, specs) {
    browser.addCommand("checkElement", this.checkElement(browser, this.config));
  }

  checkElement(browser: Browser, config: Options) {
    const getCurrentTest = () => this.currentTest;

    return async (elementSelector: string, options: CheckElementOptions) => {
      const test: Test = getCurrentTest();

      const userAgent: any = await browser.execute(
        // @ts-ignore
        () => (window as any).navigator.userAgent
      );
      const browserContext: any = { ...browser, ...parsePlatform(userAgent) };

      const context: any = {
        test,
        browser: browserContext,
        options
      };

      const screenshotPath: string = config.screenshotName(context);
      const referencePath: string = config.referenceName(context);
      const diffPath: string = config.diffName(context);

      // @ts-ignore
      await (await $(elementSelector)).saveScreenshot(screenshotPath);
      const referenceExists: boolean = await fs.exists(referencePath);

      if (referenceExists) {
        const compareData: any = await compareImages(
          screenshotPath,
          referencePath,
          {
            outputDiff: true
          }
        );

        const { isSameDimensions } = compareData;
        const misMatchPercentage: Number = Number(
          compareData.misMatchPercentage
        );
        const misMatchTolerance: Number = Number(
          options.misMatchTolerance || config.misMatchTolerance
        );

        if (misMatchPercentage > misMatchTolerance) {
          log.info(`Image is different! ${misMatchPercentage}%`);
          await fs.writeFile(diffPath, compareData.getBuffer());
          return this.createResultReport(
            misMatchPercentage,
            false,
            isSameDimensions
          );
        } else {
          log.info(`Image is within tolerance or the same`);
          await fs.remove(diffPath);

          return this.createResultReport(
            misMatchPercentage,
            true,
            isSameDimensions
          );
        }
      } else {
        log.info("first run - create reference file");
        await fs.copyFile(screenshotPath, referencePath);
        return this.createResultReport(0, true, true);
      }
    };
  }

  /**
   * Hook that gets executed before the suite starts
   * @param {Object} suite suite details
   */
  beforeSuite(suite: Mocha.Suite) {
    this.currentSuite = suite;
  }

  /**
   * Hook that gets executed after the suite has ended
   * @param {Object} suite suite details
   */
  afterSuite(suite) {
    this.currentSuite = null;
  }

  /**
   * Function to be executed before a test (in Mocha/Jasmine) or a step (in Cucumber) starts.
   * @param {Object} test test details
   */
  beforeTest(test) {
    this.currentTest = test;
  }

  /**
   * Function to be executed after a test (in Mocha/Jasmine) or a step (in Cucumber) ends.
   * @param {Object} test test details
   */
  afterTest(test) {
    this.currentTest = null;
  }

  createResultReport(
    misMatchPercentage,
    isWithinMisMatchTolerance,
    isSameDimensions
  ) {
    return {
      misMatchPercentage,
      isWithinMisMatchTolerance,
      isSameDimensions,
      isExactSameImage: misMatchPercentage === 0
    };
  }
}
