// Sample use --> getBinanceDeposits('binance','Test','USDT',1685111342000);
/* Payload for getBinanceDeposits
[
  {
    info: {
      id: '3518535030710844160',
      amount: '10.27',
      coin: 'ETH',
      network: 'ETH',
      status: '1',
      address: '0x36d8ce1ac81b43730986c9e6a0607ecf55f1b1da',
      addressTag: '',
      txId: '0xd8b886282c148a9506f6fe069d4e17b4b8db404a04b71659042962716ab8d63e',
      insertTime: '1687679431000',
      transferType: '0',
      confirmTimes: '64/6',
      unlockConfirm: '64',
      walletType: '0',
      type: 'deposit'
    },
    id: '3518535030710844160',
    txid: '0xd8b886282c148a9506f6fe069d4e17b4b8db404a04b71659042962716ab8d63e',
    timestamp: 1687679431000,
    datetime: '2023-06-25T07:50:31.000Z',
    network: 'ETH',
    address: '0x36d8ce1ac81b43730986c9e6a0607ecf55f1b1da',
    addressTo: '0x36d8ce1ac81b43730986c9e6a0607ecf55f1b1da',
    addressFrom: undefined,
    tag: undefined,
    tagTo: undefined,
    tagFrom: undefined,
    type: 'deposit',
    amount: 10.27,
    currency: 'ETH',
    status: 'ok',
    updated: undefined,
    internal: false,
    fee: undefined
  }
]
*/


// Sample object for liveStrategiesObj
/*
{
  '1.1': {
    _id: new ObjectId("66068f9c3fd30b09cab3aeb8"),
    strategy: 1.1,
    name: 'BTC_Jun24',
    symbolSpot: 'BTC/USDT',
    symbolFuture: 'BTC/USDT_240628',
    poolAddress: 'Fzmx2KMMPzquog3Wta75Wd2HPdpCVECLCRWLymNP6VK1',
    maturityDate: 2024-06-28T00:00:00.000Z
  },
  '1.2': {
    _id: new ObjectId("66068fb83fd30b09cab3aeb9"),
    strategy: 1.2,
    name: 'BTC_Sep24',
    symbolSpot: 'BTC/USDT',
    symbolFuture: 'BTC/USDT_240927',
    poolAddress: 'FZy11c27J2zZJb7eqBxieqH7hYKnKgre6KJ45rywo3PY',
    maturityDate: 2024-09-27T00:00:00.000Z
  },
  '1.3': {
    _id: new ObjectId("66068fce3fd30b09cab3aeba"),
    strategy: 1.3,
    name: 'ETH_Jun24',
    symbolSpot: 'ETH/USDT',
    symbolFuture: 'ETH/USDT_240628',
    poolAddress: 'B8RfXyG2mioEU8BwHLjAhKaPuL36tzSRajTUGqdkGJ3u',
    maturityDate: 2024-06-28T00:00:00.000Z
  },
  '1.4': {
    _id: new ObjectId("66068fe63fd30b09cab3aebb"),
    strategy: 1.4,
    name: 'ETH_Sep24',
    symbolSpot: 'ETH/USDT',
    symbolFuture: 'ETH/USDT_240927',
    poolAddress: '9pPDUBLEhtDEcqzSETHEihhbj64n3dRBn2sdjMQt9Fry',
    maturityDate: 2024-09-27T00:00:00.000Z
  }
}
*/