const { getCexInfo } = require('./libraries/ccxtFunctions.js');
const { getSubaccountsCex } = require('./libraries/mainFunctions.js');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const getMarginRatios = async (monitorInput) => {
  const cexSubaccounts = getSubaccountsCex(monitorInput);
  const result = {};

  for (const cex in cexSubaccounts) {
    const subaccounts = cexSubaccounts[cex];
    for (const subaccount of subaccounts) {
      for (const symbol of subaccount.symbols) {
        let account = subaccount.subaccount;
        let info = await getCexInfo(cex, symbol, account);
        if (!result[cex]) {
          result[cex] = {};
        }
        if (!result[cex][account]) {
          result[cex][account] = {};
        }
        result[cex][account][symbol] = info.info[0].marginRatio;
        await sleep(1000);
      }
    }
  }
  return result;
}

module.exports = {
  getMarginRatios,
};

