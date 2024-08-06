module.exports = {
  development: {
    thegraph: {
      // retry options as per https://formidable.com/open-source/urql/docs/advanced/retry-operations/
      retry: {
        initialDelayMs: 500,
        maxDelayMs: 1500,
        randomDelay: true,
        maxNumberAttempts: 2,
        retryIf: (err) => err && err.networkError,
      },
    },
  },
  production: {
    thegraph: {
      // retry options as per https://formidable.com/open-source/urql/docs/advanced/retry-operations/
      retry: {
        initialDelayMs: 500,
        maxDelayMs: 1500,
        randomDelay: true,
        maxNumberAttempts: 2,
        retryIf: (err) => err && err.networkError,
      },
    },
  },
};
