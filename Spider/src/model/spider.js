module.exports = class extends think.Model {
  async getStationAction(params) {
    const station = think.model('tb_station', 'mysql2');
    const data = await station.select();
    return data;
  }

  async addStationInfoAction(params) {
    if (params) {
      const stationInfo = this.model('station_puppeteer');
      await stationInfo.addMany(params);
      return '添加成功';
    }
  }
};
