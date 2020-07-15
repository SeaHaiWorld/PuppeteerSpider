const Base = require('./base.js');
const puppeteer = require('puppeteer');
const axios = require('axios');

module.exports = class extends Base {
  /**
   *spiderAction
   */
  async spiderAction() {
    // status:爬虫状态，0关闭，1通过高德api爬虫，2通过puppeteer请求拦截器爬虫
    const status = this.ctx.post('status');
    if (Number(status) === 0) {
      return this.success('关闭成功');
    } else {
      const arr = await this.model('index').getStationAction();
      const stationArr = []; // 存储车站信息数组
      const promiseArr = []; // 存储并发的promise队列
      const max = 6; // 所允许的promise最大并行数
      const DB = this.model('spider'); // 定义model
      // console.log(arr);
      let i = 0;
      // 清空存储并发的promise数组
      await asyncContorl().then(() => {
        promiseArr.length = 0;
      });

      /**
       * 爬虫种类控制
       * @param item
       * @returns {Promise<void>}
       */
      async function spider(item) {
        switch (Number(status)) {
          case 1:
            return amapSpider(item.name, item.type); // 高德API爬虫
          case 2:
            return interceptSpider(item.name); // puppeteer请求拦截爬虫
        }
      }

      /**
       * 异步并发控制,可以通过max控制最大并行数量
       * @returns {Promise<void>}
       */
      async function asyncContorl() {
        if (i === arr.length) { // 所有的都处理完了， 返回一个resolve
          return Promise.resolve();
        }
        const temp = spider(arr[i++]); // 取出第i++个车站，放入spider()里面，
        promiseArr.push(temp);
        temp.then(res => {
          if (res) {// 如果promise是resolve状态，则将结果加入到stationArr，并队列promiseArr中删除
            stationArr.push(res);
          };
          promiseArr.splice(promiseArr.indexOf(temp), 1);
        });
        let p = Promise.resolve();
        if (stationArr.length >= 30) { // 车站信息条数每达到30条，存储一次数据库
          await DB.addStationInfoAction(stationArr);
          stationArr.length = 0;
        }
        if (promiseArr.length >= max) { // 当并行数量达到最大后，用Promise.race获得最先完成promise状态，然后再调用一下函数自身，直到再次到达并行数量最大
          p = Promise.race(promiseArr);
        }
        // console.log(stationArr.length);
        return p.then(() => {
        // stationArr.length = 0;
          asyncContorl();
        });
      }

      /**
       * 高德API爬虫
       * @param name
       * @param type
       * @returns {Promise<void>}
       */
      async function amapSpider(name, type) {
        let stationInfo;
        let types;
        if (type === 0) types = 150200;
        else types = 150104;
        await axios.get(`https://restapi.amap.com/v3/place/text?keywords=${encodeURI(`${name}站`)}&types=${types}'&key=f2a90753708b9cbf8b70817295eaceb4`)
          .then(async response => {
          // console.log(response.data.pois[0]);
            const {type, location} = await response.data.pois[0];
            const localArr = await location.split(',');
            stationInfo = {
              station: `${name}站`, classes: type, pointx: localArr[0], pointy: localArr[1] };
          }).catch(() => {
          });
        return stationInfo;
      }

      /**
       * puppeteer请求拦截器爬虫（最开始的想法）
       * @param name
       * @returns {Promise<void>}
       */
      async function interceptSpider(name) {
        let stationInfo;
        // 实例配置
        const browser = await puppeteer.launch({
          ignoreHTTPSErrors: true,
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        }).catch(() => browser.close);
        const page = await browser.newPage();
        await page.goto('http://www.gpsspg.com/maps.htm');
        // 开启拦截器
        await page.setRequestInterception(true);
        await page.on('request', async request => {
        // 请求定位
          if (request.url().search('qt=poi') !== -1) {
            page.on('response', async response => {
              if (response.url().search('qt=poi') !== -1) {
                if (response) {
                  let res = await response.text();
                  res = res.substring(res.indexOf('(') + 1, res.length);
                  res = res.substring(0, res.lastIndexOf(')'));
                  res = JSON.parse(res);
                  const {name, classes, pointx, pointy} = res.detail.pois[0];
                  stationInfo = {
                    station: name, classes, pointx, pointy
                  };
                }
              // console.log(stationInfo);
              }
            });
            request.continue();
          } else {
            request.continue();
          }
        });

        await page.waitFor(2500);
        await page.waitForSelector('body #s_t');
        await page.click('body #s_t');
        await page.type('body #s_t', `${name}站` || '');
        await page.hover('body #s_btn');
        await page.waitFor(1000);
        await page.waitForSelector('body #s_btn');
        await page.click('body #s_btn');
        await page.waitFor(2500);
        await browser.close();
        return stationInfo;
      }
    }
  }
};
