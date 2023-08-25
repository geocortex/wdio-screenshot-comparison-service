import logger from "@wdio/logger";
import type { Services } from '@wdio/types'
import platform from "platform";
import { Browser } from "webdriverio";
import fs from "fs-extra";
import compareImages from "resemblejs/compareImages.js";
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
  ignoreOptions: string;
  scaleToSameSize: boolean;
};

export default class ScreenShotCompareService implements Services.ServiceInstance  {
  currentSuite: Mocha.Suite = null;
  currentTest: Mocha.Test = null;
  options: Options = null;

  constructor() {
    this.currentSuite = null;
    this.currentTest = null;
    this.options = null;
  }

  onPrepare(config, capabilities): void {
    this.options = config.ScreenShotCompareService;
  }

  onComplete(
    exitCode,
    config,
    capabilities
  ): void {
    //
  }

  beforeSession(config, capabilities) {
    this.options = config.ScreenShotCompareService;
  }

  before(capabilities, specs) {
    global.browser.addCommand("checkElement", this.checkElement(global.browser, this.options));
  }

  checkElement(browser: Browser, config: Options) {
    const getCurrentTest = () => this.currentTest;

    return async (elementSelector: string, options: CheckElementOptions) => {
      const test: Test = getCurrentTest();

      const userAgent: any = await browser.execute(
        // @ts-ignore
        () => (window as any).navigator.userAgent
      );
      const browserContext: any = { ...browser, ...platform.parse(userAgent) };

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
            outputDiff: true,
            ignore: options.ignoreOptions,
            scaleToSameSize: options.scaleToSameSize
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
            isSameDimensions,
            screenshotPath,
            referencePath
          );
        } else {
          log.info(`Image is within tolerance or the same`);
          await fs.remove(diffPath);

          return this.createResultReport(
            misMatchPercentage,
            true,
            isSameDimensions,
            screenshotPath,
            referencePath
          );
        }
      } else {
        log.info("first run - create reference file");
        await fs.copyFile(screenshotPath, referencePath);
        return this.createResultReport(
          0,
          true,
          true,
          screenshotPath,
          referencePath
        );
      }
    };
  }

  /**
   * Hook that gets executed before the suite starts
   * @param {Object} suite suite details
   */
  beforeSuite(suite) {
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
    isSameDimensions,
    screenshotPath,
    referencePath,
  ) {
    return {
      misMatchPercentage,
      isWithinMisMatchTolerance,
      isSameDimensions,
      isExactSameImage: misMatchPercentage === 0,
      screenshotPath,
      referencePath
    };
  }
}
