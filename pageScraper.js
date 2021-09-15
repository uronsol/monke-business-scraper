const request = require("request");
const fs = require("fs");
const camelCase = require("camelcase");

function delay(time) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

async function download(url, dest) {
  /* Create an empty file where we can save data */
  const file = fs.createWriteStream(dest);

  /* Using Promises so that we can use the ASYNC AWAIT syntax */
  await new Promise((resolve, reject) => {
    request({
      /* Here you should specify the exact link to the file you are trying to download */
      uri: url,
      gzip: true,
    })
      .pipe(file)
      .on("finish", async () => {
        console.log(`The file is finished downloading.`);
        resolve();
      })
      .on("error", (error) => {
        reject(error);
      });
  }).catch((error) => {
    console.log(`Something happened: ${error}`);
  });
}

const scraperObject = {
  url: "https://howrare.is/smb",
  async scraper(browser) {
    let page = await browser.newPage();
    console.log(`Navigating to ${this.url}...`);
    // Navigate to the selected page
    await page.goto(this.url);
    await delay(1000);
    // Wait for the required DOM to be rendered
    async function scrapeCurrentPage() {
      await page.waitForSelector(".main");
      // Get pages for pagination
      let paginationUrls = await page.$$eval(
        "body > div > div > div.col-md-10 > nav:nth-child(4) > ul > li",
        (links) => {
          return links.map(
            (_, index) =>
              `https://howrare.is/smb/?page=${index}&ids=&sort_by=rank`
          );
        }
      );
      // Create promise to get individual item urls
      let paginationPromise = (link) =>
        new Promise(async (resolve, reject) => {
          try {
            let paginationPage = await browser.newPage();
            console.log(`Navigating to ${link}`);
            await paginationPage.goto(link);
            await delay(1000);
            let itemLinks = await paginationPage.$$eval(
              "body > div > div > div.col-md-10 > div.nft-listing > a",
              (links) => {
                return links.map((link) => link.href);
              }
            );
            await delay(1000);
            resolve(itemLinks);
            await paginationPage.close();
          } catch (err) {
            console.log(err);
            reject([]);
          }
        });
      let itemDetailUrls = [];
      // Get link for the item detail page
      for (let paginationUrl in paginationUrls) {
        let currentPageData = await paginationPromise(
          paginationUrls[paginationUrl]
        );
        itemDetailUrls = itemDetailUrls.concat(currentPageData);
      }
      // Create promise to get individual item attributes
      let detailPromise = (link) =>
        new Promise(async (resolve, reject) => {
          try {
            let detailPage = await browser.newPage();
            console.log(`Navigating to ${link}`);
            await detailPage.goto(link);
            await delay(1000);
            const imageSrc = await detailPage.$$eval(
              "body > div > div > div.col-md-4 > img",
              (images) => {
                return images[0].src;
              }
            );
            const smbId = await detailPage.$$eval(
              "body > div > div > div.col-md-4 > h3 > strong",
              (ids) => {
                return ids[0].innerText.replace("#", "");
              }
            );
            let attributeNames = await detailPage.$$eval(
              "body > div > div > div.col-md-8 > ul > li > span:first-child",
              (attributes) => {
                return attributes.map((attributeName) => {
                  return attributeName.innerText;
                });
              }
            );
            attributeNames = attributeNames.map((attrName) =>
              camelCase(attrName.replace(":", ""))
            );
            let attributeValues = await detailPage.$$eval(
              "body > div > div > div.col-md-8 > ul > li > div",
              (attributes) => {
                return attributes.map((attributeValue) => {
                  return attributeValue.innerText;
                });
              }
            );
            attributeValues = attributeValues.reduce(
              (attrs, attrValue) => attrs.concat(attrValue.split("s")),
              []
            );
            const attributes = attributeNames.reduce(
              (attrObj, attributeName, index) => {
                const attributeValue = attributeValues[index];
                const attributeValuesNormalized = attributeValue
                  .split("(")
                  .map((v) => {
                    const normV = v.replace("%)", "");
                    try {
                      const percentValue = parseFloat(normV);
                      return percentValue;
                    } catch (err) {
                      return normV;
                    }
                  });
                attrObj[attributeName] = {
                  value: attributeValuesNormalized[0] || null,
                  percentile: attributeValuesNormalized[1] || null,
                };
                return attrObj;
              },
              {}
            );
            await delay(1000);
            resolve({
              smbId,
              imageSrc,
              attributes,
            });
            await detailPage.close();
          } catch (err) {
            console.log(err);
            reject([]);
          }
        });
      let data = [];
      // Get data from the detail pages
      for (let i = 0; i < itemDetailUrls.length; i++) {
        let currentPageData = await detailPromise(itemDetailUrls[i]);
        data.push(currentPageData);
      }
      return data;
    }
    let data = await scrapeCurrentPage();
    fs.rmdirSync("output", { recursive: true });
    fs.mkdirSync("output", { recursive: true }, (err) => {
      if (err) throw err;
    });
    fs.mkdirSync("output/images", { recursive: true }, (err) => {
      if (err) throw err;
    });
    for (let i = 0; i < data.length; i++) {
      const dataItem = data[i];
      const fileName = dataItem.imageSrc.substring(
        dataItem.imageSrc.lastIndexOf("/") + 1
      );
      await download(dataItem.imageSrc, `output/images/${fileName}`);
      const smbId = dataItem.smbId;
      delete data[i].smbId;
      data[i] = {
        smbId,
        imagePath: `output/images/${fileName}`,
        ...data[i],
      };
      await delay(1000);
    }
    const dataWritten = fs.writeFileSync(
      "./output/monkes.json",
      JSON.stringify(data, null, 2)
    );
    console.log(dataWritten);
    return dataWritten;
  },
};

module.exports = scraperObject;
