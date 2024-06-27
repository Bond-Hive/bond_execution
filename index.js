const app = require('./main/server/app.js');

app.listen(process.env.PORT || 3000, () => {
  console.log(`Monitoring server listening at port: ${process.env.PORT || 3000}`);
});

